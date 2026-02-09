import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { fetchSpeechFromLocalServer, TtsError } from '../services/localTtsService';
import { splitTextIntoChunks } from '../utils/textSplitter';
import { PlayIcon, StopIcon, ArrowLeftIcon, LoadingSpinner, PauseIcon, CheckCircleIcon, CogIcon, XMarkIcon, ArrowPathIcon } from './icons';
import BookSettingsModal from './BookSettingsModal';

interface ReaderPageProps {
    book: Book;
    onBack: () => void;
    onUpdatePosition: (chapterIndex: number, sentenceIndex: number) => void;
    onUpdateBook: (updatedBook: Book) => void;
}

type AudioInfo = {
    buffer?: AudioBuffer;
    duration?: number;
    blob?: Blob;
    state: 'idle' | 'loading' | 'loaded' | 'error';
};

type AudioRequest = {
    index: number;
    loaderId: number;
    text: string;
};

type ActiveTab = 'text' | 'audio';
type ChapterStatus = 'idle' | 'loading' | 'ready' | 'error';

const AUDIO_PRELOAD_COUNT = 10;
const INTER_SENTENCE_DELAY_MS = 500;

const ReaderPage: React.FC<ReaderPageProps> = ({ book, onBack, onUpdatePosition, onUpdateBook }) => {
    const [currentChapterIndex, setCurrentChapterIndex] = useState(book.lastPosition?.chapterIndex || 0);
    const [sentenceChunks, setSentenceChunks] = useState<string[]>([]);
    const [audioInfo, setAudioInfo] = useState<Map<number, AudioInfo>>(new Map());
    const [currentlyPlayingIndex, setCurrentlyPlayingIndex] = useState<number | null>(null);
    const [isGlobalPlayActive, setIsGlobalPlayActive] = useState(false);
    const [chapterStatus, setChapterStatus] = useState<ChapterStatus>('idle');
    const [activeTab, setActiveTab] = useState<ActiveTab>('text');
    const [resumeIndex, setResumeIndex] = useState<number | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [queueUpdated, setQueueUpdated] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const contentContainerRef = useRef<HTMLDivElement>(null);
    
    const audioLoaderIdRef = useRef(0);
    const audioRequestQueueRef = useRef<AudioRequest[]>([]);
    const activelyProcessingIndexRef = useRef<number | null>(null);
    const activelyProcessingControllerRef = useRef<AbortController | null>(null);
    const isChapterLoadCancelledRef = useRef(false);
    const isProcessingQueueRef = useRef(false);
    const initialLoadIndexRef = useRef(0);
    const nextTrackTimeoutRef = useRef<number | null>(null);

    const resumeIndexRef = useRef(resumeIndex);
    useEffect(() => { resumeIndexRef.current = resumeIndex; }, [resumeIndex]);

    const activeTabRef = useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    const audioInfoRef = useRef(audioInfo);
    useEffect(() => { audioInfoRef.current = audioInfo; }, [audioInfo]);
    
    const sentenceChunksRef = useRef<string[]>([]);
    useEffect(() => { sentenceChunksRef.current = sentenceChunks; }, [sentenceChunks]);

    const isGlobalPlayActiveRef = useRef(isGlobalPlayActive);
    useEffect(() => { isGlobalPlayActiveRef.current = isGlobalPlayActive; }, [isGlobalPlayActive]);

    const currentChapterIndexRef = useRef(currentChapterIndex);
    useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);

    const initializeAudioContext = useCallback(() => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    const interruptCurrentFetch = useCallback(() => {
        if (activelyProcessingControllerRef.current) {
            console.log(`[Interrupt] Cancelling active fetch for index ${activelyProcessingIndexRef.current}`);
            activelyProcessingControllerRef.current.abort();
        }
    }, []);

    const stopPlayback = useCallback(() => {
        if (nextTrackTimeoutRef.current) {
            clearTimeout(nextTrackTimeoutRef.current);
            nextTrackTimeoutRef.current = null;
        }
        if (currentSourceRef.current) {
            currentSourceRef.current.onended = null;
            try { currentSourceRef.current.stop(); } catch (e) {}
            currentSourceRef.current = null;
        }
        setCurrentlyPlayingIndex(null);
    }, []);

    const playAudio = useCallback((index: number, bufferOverride?: AudioBuffer) => {
        const audioContext = initializeAudioContext();
        audioContext.resume();

        if (index >= sentenceChunksRef.current.length) {
            if (isGlobalPlayActiveRef.current) {
                const nextChapterIndex = currentChapterIndexRef.current + 1;
                if (nextChapterIndex < book.chapters.length) {
                    setResumeIndex(0);
                    setCurrentChapterIndex(nextChapterIndex);
                } else {
                    setIsGlobalPlayActive(false);
                }
            }
            return;
        }
        
        const info = audioInfoRef.current.get(index);
        const bufferToPlay = bufferOverride || info?.buffer;

        if (!bufferToPlay) {
            if (info?.state === 'error') {
                setAudioError('Playback stopped: Could not generate audio. Check TTS server connection and settings.');
                setIsGlobalPlayActive(false);
            }
            // If audio is not ready, just return. The processor will call playAudio again when it's loaded.
            return;
        }

        const elementId = activeTabRef.current === 'text' ? `sentence-chunk-${index}` : `audio-item-${index}`;
        document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const source = audioContext.createBufferSource();
        source.buffer = bufferToPlay;
        source.connect(gainNodeRef.current!);
        
        source.onended = () => {
            if (currentSourceRef.current !== source) return;
            
            setCurrentlyPlayingIndex(null);
            currentSourceRef.current = null;

            if (isGlobalPlayActiveRef.current) {
                 if (nextTrackTimeoutRef.current) clearTimeout(nextTrackTimeoutRef.current);
                nextTrackTimeoutRef.current = window.setTimeout(() => {
                    if (isGlobalPlayActiveRef.current) {
                        const nextIndex = index + 1;
                        setResumeIndex(nextIndex);
                        playAudio(nextIndex);
                    }
                }, INTER_SENTENCE_DELAY_MS);
            }
        };

        source.start(0);
        currentSourceRef.current = source;
        setCurrentlyPlayingIndex(index);
    }, [book.chapters.length, initializeAudioContext]);

    const processQueue = useCallback(async () => {
        if (isProcessingQueueRef.current || audioRequestQueueRef.current.length === 0 || isChapterLoadCancelledRef.current) {
            return;
        }
        
        isProcessingQueueRef.current = true;
        
        const request = audioRequestQueueRef.current[0];
        if (!request) {
            isProcessingQueueRef.current = false;
            return;
        }
    
        if (request.loaderId !== audioLoaderIdRef.current) {
            console.log(`[Processor] Stale request discarded for index ${request.index} (Chapter changed)`);
            audioRequestQueueRef.current.shift();
            isProcessingQueueRef.current = false;
            setQueueUpdated(c => c + 1); // Trigger next in queue
            return;
        }
        
        const { index, loaderId, text } = request;
        
        const controller = new AbortController();
        activelyProcessingControllerRef.current = controller;
        activelyProcessingIndexRef.current = index;
        
        setAudioInfo(prev => {
            const current = prev.get(index);
            if (current?.state === 'loading') return prev;
            return new Map(prev).set(index, { state: 'loading' });
        });
        
        try {
            audioRequestQueueRef.current.shift();
            console.log(`[Processor] --> FETCH START for index ${index}`);
            const blob = await fetchSpeechFromLocalServer(text, controller.signal);
            console.log(`[Processor] <-- FETCH SUCCESS for index ${index}`);
            
            if (loaderId !== audioLoaderIdRef.current) throw new Error("Stale request after fetch");

            const audioContext = initializeAudioContext();
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);

            if (loaderId !== audioLoaderIdRef.current) throw new Error("Stale request after decode");
    
            setAudioInfo(prev => new Map(prev).set(index, { state: 'loaded', blob, buffer, duration: buffer.duration }));
    
            if (chapterStatus === 'loading' && index === initialLoadIndexRef.current) {
                setChapterStatus('ready');
            }
            
            if (isGlobalPlayActiveRef.current && resumeIndexRef.current === index) {
                stopPlayback();
                playAudio(index, buffer);
            }

        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.log(`[Processor] Aborted fetch for index ${index}.`);
                setAudioInfo(prev => {
                    const current = prev.get(index);
                    return (current && current.state === 'loading') ? new Map(prev).set(index, { state: 'idle' }) : prev;
                });
            } else if ((error as Error).message.startsWith("Stale request")) {
                console.log(`[Processor] ${ (error as Error).message } for index ${index}`);
            } else {
                console.error(`[Processor] XXX FETCH FAILED for index ${index}`, error);
                if (loaderId === audioLoaderIdRef.current) {
                    isChapterLoadCancelledRef.current = true;
                    audioRequestQueueRef.current = [];
                    
                    const errorMessage = error instanceof TtsError ? error.message : `Failed audio for chunk ${index}. See console.`;
                    setAudioInfo(prev => new Map(prev).set(index, { state: 'error' }));
                    setAudioError(errorMessage);
                }
            }
        } finally {
            if (activelyProcessingControllerRef.current === controller) {
                activelyProcessingControllerRef.current = null;
                activelyProcessingIndexRef.current = null;
            }
            isProcessingQueueRef.current = false;
            if (audioRequestQueueRef.current.length > 0 && !isChapterLoadCancelledRef.current) {
                setQueueUpdated(c => c + 1);
            }
        }
    }, [initializeAudioContext, playAudio, stopPlayback, chapterStatus]);
    
    const scheduleAudioLoading = useCallback((startIndex: number, isPriority: boolean, chunks: string[], isFreshLoad = false) => {
        console.log('[Scheduler] Called', { startIndex, isPriority, isFreshLoad });
        if (isChapterLoadCancelledRef.current) return;

        const currentLoaderId = audioLoaderIdRef.current;
        
        const newRequests: AudioRequest[] = [];
        const endIndex = Math.min(startIndex + AUDIO_PRELOAD_COUNT, chunks.length);

        for (let i = startIndex; i < endIndex; i++) {
            const info = audioInfoRef.current.get(i);
            const isAlreadyQueued = audioRequestQueueRef.current.some(r => r.index === i);
            const isBeingProcessed = activelyProcessingIndexRef.current === i;

            if ((isFreshLoad || !info || info.state === 'idle' || info.state === 'error') && !isAlreadyQueued && !isBeingProcessed) {
                newRequests.push({ index: i, loaderId: currentLoaderId, text: chunks[i] });
            }
        }
        
        if (newRequests.length > 0) {
            const queueBefore = audioRequestQueueRef.current.map(r => r.index);
            if (isPriority) {
                const newRequestIndexes = new Set(newRequests.map(r => r.index));
                const filteredOldQueue = audioRequestQueueRef.current.filter(r => !newRequestIndexes.has(r.index));
                audioRequestQueueRef.current = [...newRequests, ...filteredOldQueue];
            } else {
                audioRequestQueueRef.current.push(...newRequests);
            }
            console.log('[Scheduler] Queue state', { before: queueBefore, new: newRequests.map(r=>r.index), after: audioRequestQueueRef.current.map(r => r.index) });
            setQueueUpdated(c => c + 1);
        }
    }, []);

    useEffect(() => {
        if (audioRequestQueueRef.current.length > 0 && !isProcessingQueueRef.current && !isChapterLoadCancelledRef.current) {
            processQueue();
        }
    }, [queueUpdated, processQueue]);

    useEffect(() => {
        if (currentlyPlayingIndex === null || sentenceChunks.length === 0) return;
        const preloadStartIndex = currentlyPlayingIndex + 1;
        if (preloadStartIndex < sentenceChunks.length) {
            scheduleAudioLoading(preloadStartIndex, false, sentenceChunks);
        }
    }, [currentlyPlayingIndex, sentenceChunks, scheduleAudioLoading]);
    
    useEffect(() => {
        if (currentlyPlayingIndex !== null) {
            onUpdatePosition(currentChapterIndex, currentlyPlayingIndex);
        }
    }, [currentlyPlayingIndex, currentChapterIndex, onUpdatePosition]);

    useEffect(() => {
        if (currentChapterIndex >= book.chapters.length) {
            setCurrentChapterIndex(Math.max(0, book.chapters.length - 1));
            return;
        }
        const currentChapter = book.chapters[currentChapterIndex];
        if (!currentChapter) {
             setChapterStatus('ready');
             setSentenceChunks([]);
             return;
        };
        
        console.log(`--- LOADING CHAPTER ${currentChapterIndex} ---`);
        interruptCurrentFetch();
        stopPlayback();

        setActiveTab('text');
        setAudioError(null);
        if (contentContainerRef.current) contentContainerRef.current.scrollTop = 0;
        
        audioLoaderIdRef.current++; 
        isChapterLoadCancelledRef.current = false;
        audioRequestQueueRef.current = [];
        
        setChapterStatus('loading');
        
        const content = (currentChapter.content || "").trim();
        const chunks = splitTextIntoChunks(content);
        
        setSentenceChunks(chunks);
        setAudioInfo(new Map());

        let scheduleStartIndex = 0;
        const lastPos = book.lastPosition;
        if (lastPos && lastPos.chapterIndex === currentChapterIndex && lastPos.sentenceIndex > 0) {
            const resumeIdx = lastPos.sentenceIndex;
            setResumeIndex(resumeIdx);
            scheduleStartIndex = resumeIdx;
            setTimeout(() => {
                document.getElementById(`sentence-chunk-${resumeIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        } else {
            setResumeIndex(0);
        }
        initialLoadIndexRef.current = scheduleStartIndex;

        if (content.length < 15) {
             if (isGlobalPlayActiveRef.current && currentChapterIndex + 1 < book.chapters.length) {
                setResumeIndex(0);
                setCurrentChapterIndex(currentChapterIndex + 1);
            } else {
                setIsGlobalPlayActive(false);
                setSentenceChunks([]);
                setChapterStatus('ready');
            }
            return;
        }

        scheduleAudioLoading(scheduleStartIndex, true, chunks, true);

        return () => {
            console.log(`--- UNLOADING CHAPTER ${currentChapterIndexRef.current} ---`);
            interruptCurrentFetch();
            stopPlayback();
            audioLoaderIdRef.current++; 
            isChapterLoadCancelledRef.current = true;
            audioRequestQueueRef.current = [];
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, currentChapterIndex]);


    const handleSelectChapter = (index: number) => {
        interruptCurrentFetch();
        setCurrentChapterIndex(index);
        setActiveTab('text');
        setIsGlobalPlayActive(false);
        setResumeIndex(null);
    };

    const handleGlobalPlayPause = () => {
        const isPlaying = currentlyPlayingIndex !== null;
    
        if (isPlaying) { // PAUSE
            stopPlayback();
            const pauseIndex = currentlyPlayingIndex;
            setResumeIndex(pauseIndex);
            resumeIndexRef.current = pauseIndex;
            setIsGlobalPlayActive(false);
            isGlobalPlayActiveRef.current = false;
        } else { // PLAY
            const startSentence = resumeIndex ?? 0;
            
            stopPlayback();
            interruptCurrentFetch();
            audioRequestQueueRef.current = [];

            setResumeIndex(startSentence);
            resumeIndexRef.current = startSentence;
            setIsGlobalPlayActive(true);
            isGlobalPlayActiveRef.current = true;

            const info = audioInfoRef.current.get(startSentence);
            if (!info || info.state !== 'loaded') {
                setAudioInfo(prev => new Map(prev).set(startSentence, { state: 'loading' }));
            }
            scheduleAudioLoading(startSentence, true, sentenceChunksRef.current);
            playAudio(startSentence);
        }
    };
    
    const handlePlayPauseSentence = (index: number) => {
        if (currentlyPlayingIndex === index) { // PAUSE
            stopPlayback();
            setResumeIndex(index);
            resumeIndexRef.current = index;
            setIsGlobalPlayActive(false);
            isGlobalPlayActiveRef.current = false;
        } else { // PLAY A SPECIFIC TRACK
            stopPlayback();
            interruptCurrentFetch();
            audioRequestQueueRef.current = [];
            
            setResumeIndex(index); 
            resumeIndexRef.current = index;
            setIsGlobalPlayActive(true);
            isGlobalPlayActiveRef.current = true;
            
            const info = audioInfoRef.current.get(index);
            if (!info || info.state !== 'loaded') {
                setAudioInfo(prev => new Map(prev).set(index, { state: 'loading' }));
            }
            scheduleAudioLoading(index, true, sentenceChunksRef.current);
            playAudio(index);
        }
    };

    const handleSettingsSave = (updatedBook: Book) => {
        onUpdateBook(updatedBook);
        if (currentChapterIndex >= updatedBook.chapters.length) {
            setCurrentChapterIndex(Math.max(0, updatedBook.chapters.length - 1));
        }
    };

    const currentChapter = book.chapters[currentChapterIndex];
    const isEffectivelyPlaying = currentlyPlayingIndex !== null;
    const isDisabled = chapterStatus === 'loading' && !isEffectivelyPlaying;

    const renderTextTab = () => {
        return (
            <div className="p-6 sm:p-8">
                <h1 className="text-3xl font-bold text-cyan-400 mb-6">{currentChapter?.title}</h1>
                <div className="max-w-none text-slate-300 text-lg leading-relaxed">
                    {sentenceChunks.length > 0 ? (
                        <p>
                            {sentenceChunks.map((chunk, index) => {
                                const isPlaying = currentlyPlayingIndex === index;
                                const isPending = resumeIndex === index && currentlyPlayingIndex === null;
                                const isActive = isPlaying || isPending;
                                
                                let highlightClass = '';
                                if (isActive) {
                                    highlightClass = 'bg-red-900/60 text-red-300';
                                }

                                return (
                                    <span
                                        key={index}
                                        id={`sentence-chunk-${index}`}
                                        className={`p-1 rounded transition-colors duration-300 ${highlightClass}`}
                                    >
                                        {chunk}{' '}
                                    </span>
                                );
                            })}
                        </p>
                    ) : chapterStatus !== 'loading' ? (
                        <p className="text-slate-500">No content available for this chapter.</p>
                    ) : null}
                </div>
            </div>
        );
    };

    const renderAudioTab = () => {
        return (
            <div className="p-6 sm:p-8">
                 <h1 className="text-3xl font-bold text-cyan-400 mb-4">{currentChapter?.title} - Audio Tracks</h1>
                {sentenceChunks.length > 0 ? (
                    <ul className="space-y-2">
                        {sentenceChunks.map((chunk, index) => {
                            const info = audioInfo.get(index);
                            const isPlaying = currentlyPlayingIndex === index;
                            const isPending = resumeIndex === index && currentlyPlayingIndex === null;
                            const isActive = isPlaying || isPending;
                            
                            let rowClass = 'bg-slate-800';
                            if (isActive) {
                                rowClass = 'bg-red-900/40';
                            }

                            return (
                                <li key={index} id={`audio-item-${index}`} className={`flex items-center justify-between p-3 rounded-lg transition-colors duration-300 ${rowClass}`}>
                                    <p className="flex-grow pr-4 font-semibold text-slate-300">Track {index + 1}</p>
                                    <div className="flex items-center gap-4 shrink-0">
                                        <div className="w-5 h-5 flex items-center justify-center">
                                            {info?.state === 'loading' && <LoadingSpinner className="w-5 h-5 text-slate-400" />}
                                            {info?.state === 'loaded' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                                            {info?.state === 'error' && <span className="text-red-400 font-bold text-lg">!</span>}
                                        </div>

                                        {info?.duration && (
                                            <span className="text-slate-500 font-mono text-sm select-none w-12 text-right">
                                                {info.duration.toFixed(1)}s
                                            </span>
                                        )}
                                        
                                        {info?.state !== 'error' && (
                                            <button
                                                onClick={() => handlePlayPauseSentence(index)}
                                                className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-cyan-400 transition-colors"
                                                aria-label={isPlaying ? "Stop" : "Play sentence"}
                                            >
                                                {isPlaying ? <StopIcon className="w-6 h-6 text-cyan-400" /> : <PlayIcon className="w-6 h-6" />}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                     <p className="text-slate-500 text-center py-8">No audio content available.</p>
                )}
            </div>
        );
    };

    const tabButtonClasses = (tabName: ActiveTab) => 
        `px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors ${
        activeTab === tabName ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'
    }`;

    return (
        <>
            <div className="flex flex-col md:flex-row h-screen">
                <aside className="w-full md:w-1-4 lg:w-1-5 bg-slate-800 p-4 overflow-y-auto shrink-0 flex flex-col">
                    <button onClick={onBack} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 mb-4 transition-colors font-semibold">
                        <ArrowLeftIcon className="w-5 h-5" />
                        Back to Library
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                         <div className="relative w-10 h-10 flex-shrink-0">
                            <button 
                                onClick={handleGlobalPlayPause}
                                className="w-full h-full flex items-center justify-center rounded-full bg-slate-700 text-cyan-400 hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={isEffectivelyPlaying ? 'Pause Book' : 'Play Book'}
                                disabled={isDisabled}
                            >
                                {isEffectivelyPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                            </button>
                            {chapterStatus === 'loading' && !isEffectivelyPlaying && (
                                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin pointer-events-none" aria-hidden="true"></div>
                            )}
                        </div>
                        <h2 className="text-xl font-bold truncate text-slate-200 flex-1">{book.title}</h2>
                        <button 
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                            aria-label="Book Settings"
                        >
                            <CogIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <p className="text-sm text-slate-400 mb-4 truncate">{book.author}</p>
                    <div className="mt-4">
                        <label htmlFor="chapter-select" className="block text-sm font-medium text-slate-400 mb-2">Chapter</label>
                        <select
                            id="chapter-select"
                            value={currentChapterIndex}
                            onChange={(e) => handleSelectChapter(parseInt(e.target.value, 10))}
                            className="w-full p-2 rounded-md bg-slate-700 border border-slate-600 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                        >
                            {book.chapters.map((chapter, index) => (
                                <option key={chapter.id} value={index}>{chapter.title}</option>
                            ))}
                        </select>
                    </div>
                </aside>
                <main className="flex-grow flex flex-col bg-slate-900 overflow-hidden relative">
                    {audioError && (
                        <div className="absolute top-0 left-0 right-0 z-10 bg-red-800/90 backdrop-blur-sm text-white p-3 flex items-center justify-between shadow-lg">
                            <p className="text-sm font-medium">{audioError}</p>
                            <button onClick={() => setAudioError(null)} className="p-1 rounded-full hover:bg-red-700 transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    <div className="border-b border-slate-700 px-4 pt-2 shrink-0">
                        <div className="flex space-x-2">
                            <button className={tabButtonClasses('text')} onClick={() => setActiveTab('text')}>Text</button>
                            <button className={tabButtonClasses('audio')} onClick={() => setActiveTab('audio')}>Audio Playlist</button>
                        </div>
                    </div>
                    <div ref={contentContainerRef} className="flex-grow overflow-y-auto">
                        {activeTab === 'text' ? renderTextTab() : renderAudioTab()}
                    </div>
                </main>
            </div>
            <BookSettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                book={book}
                onSave={handleSettingsSave}
            />
        </>
    );
};

export default ReaderPage;
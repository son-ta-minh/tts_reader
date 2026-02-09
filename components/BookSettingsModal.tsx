
import React, { useState, useEffect } from 'react';
import { Book, Chapter } from '../types';
import { XMarkIcon, TrashIcon } from './icons';

interface PreviewChange {
    chapterId: string;
    chapterTitle: string;
    originalLine: string;
    toRemove: string;
    result: string;
}

interface BookSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    book: Book;
    onSave: (updatedBook: Book) => void;
}

// Escapes special characters in a string to make it safe for use in a RegExp.
const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const BookSettingsModal: React.FC<BookSettingsModalProps> = ({ isOpen, onClose, book, onSave }) => {
    const [editedChapters, setEditedChapters] = useState<Chapter[]>([]);
    const [prefixToRemove, setPrefixToRemove] = useState('');
    const [previewChanges, setPreviewChanges] = useState<PreviewChange[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
            setEditedChapters(book.chapters);
            setPrefixToRemove('');
            setPreviewChanges([]);
        }
    }, [isOpen, book.chapters]);
    
    // Effect to generate the live preview
    useEffect(() => {
        const trimmedPrefix = prefixToRemove.trim();
        if (!trimmedPrefix) {
            setPreviewChanges([]);
            return;
        }

        let removalRegex: RegExp | null = null;
        try {
            if (trimmedPrefix.includes('#')) {
                // User is using the number placeholder. Build a regex.
                // Replaces '#' with a pattern that matches numbers and optional punctuation.
                const pattern = `^${escapeRegExp(trimmedPrefix).replace(/#/, "\\s*\\d+[.:-]?\\s*")}`;
                removalRegex = new RegExp(pattern, 'i');
            }
        } catch (e) { /* Invalid regex, fallback to simple match */ }

        const changes = editedChapters.reduce((acc: PreviewChange[], chapter) => {
            const content = chapter.content.trimStart();
            
            let match: RegExpMatchArray | string[] | null = null;
            if (removalRegex) {
                match = content.match(removalRegex);
            } else if (content.toLowerCase().startsWith(trimmedPrefix.toLowerCase())) {
                // Case-insensitive simple prefix match
                match = [content.substring(0, trimmedPrefix.length)];
            }

            if (match && match[0]) {
                const partToRemove = match[0];
                const firstLineEnd = content.indexOf('\n');
                const originalLine = firstLineEnd === -1 ? content : content.substring(0, firstLineEnd);
                const result = content.substring(partToRemove.length);

                acc.push({
                    chapterId: chapter.id,
                    chapterTitle: chapter.title,
                    originalLine: originalLine,
                    toRemove: partToRemove,
                    result: result
                });
            }
            return acc;
        }, []);
        
        setPreviewChanges(changes);

    }, [prefixToRemove, editedChapters]);

    if (!isOpen) {
        return null;
    }

    const handleDeleteChapter = (chapterId: string) => {
        if (editedChapters.length <= 1) {
            alert("Cannot delete the last chapter of a book.");
            return;
        }
        setEditedChapters(prev => prev.filter(ch => ch.id !== chapterId));
    };

    const handleSaveChanges = () => {
        let finalChapters = [...editedChapters];
        
        const trimmedPrefix = prefixToRemove.trim();
        if (trimmedPrefix) {
            let removalRegex: RegExp | null = null;
            try {
                if (trimmedPrefix.includes('#')) {
                    const pattern = `^${escapeRegExp(trimmedPrefix).replace(/#/, "\\s*\\d+[.:-]?\\s*")}`;
                    removalRegex = new RegExp(pattern, 'i');
                }
            } catch (e) { /* Invalid regex, skip */ }

            finalChapters = finalChapters.map(chapter => {
                const originalContent = chapter.content;
                const trimmedContent = originalContent.trimStart();
                const leadingWhitespaceLength = originalContent.length - trimmedContent.length;
                const leadingWhitespace = originalContent.substring(0, leadingWhitespaceLength);

                let newContent = originalContent;

                if (removalRegex) {
                    const match = trimmedContent.match(removalRegex);
                    if (match && match[0]) {
                        newContent = leadingWhitespace + trimmedContent.substring(match[0].length);
                    }
                } else if (trimmedContent.toLowerCase().startsWith(trimmedPrefix.toLowerCase())) {
                    newContent = leadingWhitespace + trimmedContent.substring(trimmedPrefix.length);
                }

                return { ...chapter, content: newContent };
            });
        }

        const updatedBook = {
            ...book,
            chapters: finalChapters,
        };

        onSave(updatedBook);
        onClose();
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" 
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl m-4 transform transition-all flex flex-col max-h-[90vh]" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-slate-700 shrink-0">
                    <h2 className="text-xl font-bold text-cyan-400">Edit "{book.title}"</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white" aria-label="Close">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-8">
                    {/* Section for Removing Repeating Header */}
                    <div className="border border-slate-700 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-slate-200 mb-2">Clean Chapter Prefixes</h3>
                        <p className="text-sm text-slate-400 mb-3">
                            Remove unwanted repeating text from the beginning of a chapter's content.
                        </p>
                        <input
                            type="text"
                            value={prefixToRemove}
                            onChange={(e) => setPrefixToRemove(e.target.value)}
                            placeholder="e.g., Chapter #"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        />
                         <p className="mt-2 text-xs text-slate-500">
                            Tip: Use <code className="font-mono bg-slate-600 px-1 rounded">#</code> as a placeholder for any number.
                            Example: <code className="font-mono bg-slate-600 px-1 rounded">Chapter #</code> will match "Chapter 1", "Ch. 2:", etc.
                        </p>

                         {/* Live Preview Section */}
                        {previewChanges.length > 0 && (
                            <div className="mt-4 p-3 bg-slate-700/50 border border-slate-600 rounded-lg max-h-48 overflow-y-auto">
                                <h4 className="text-sm font-semibold text-cyan-400 mb-2">
                                    Preview: Will affect {previewChanges.length} chapter(s)
                                </h4>
                                <ul className="text-xs text-slate-400 space-y-3">
                                    {previewChanges.map(change => {
                                        let resultPreview = change.result.trimStart();
                                        if (resultPreview === '') {
                                            resultPreview = "[Content continues on next line]";
                                        }

                                        return (
                                            <li key={change.chapterId}>
                                                <strong className="text-slate-300">{change.chapterTitle}:</strong>
                                                <div className="pl-2 border-l-2 border-red-500/50 ml-1 mt-1 italic" title={change.originalLine}>
                                                    Will remove prefix: <span className="font-mono bg-red-900/50 px-1 rounded">"{change.toRemove}"</span>
                                                </div>
                                                <div className="pl-2 border-l-2 border-green-500/50 ml-1 mt-1" title={change.originalLine}>
                                                   Result will start with: <span className="font-mono bg-green-900/50 px-1 rounded break-all">"{resultPreview.substring(0, 70)}{resultPreview.length > 70 ? '...' : ''}"</span>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Section for Managing Chapters */}
                    <div className="border border-slate-700 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-slate-200 mb-3">Manage Chapters ({editedChapters.length})</h3>
                         <ul className="space-y-2 max-h-64 overflow-y-auto pr-2">{editedChapters.map((chapter, index) => (
                            <li key={chapter.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50">
                                <p className="flex-grow pr-4 text-slate-300 truncate" title={chapter.title}><span className="font-mono text-xs text-slate-500 mr-2">{index + 1}.</span>{chapter.title}</p>
                                <button
                                    onClick={() => handleDeleteChapter(chapter.id)}
                                    className="p-2 rounded-full text-slate-400 hover:bg-red-600 hover:text-white transition-colors"
                                    aria-label={`Delete chapter: ${chapter.title}`}
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </li>
                         ))}</ul>
                    </div>
                </div>

                <div className="flex justify-end items-center p-4 border-t border-slate-700 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 mr-2">
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveChanges}
                        className="px-6 py-2 text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BookSettingsModal;


import ePub from 'epubjs';
import { Book, Chapter } from '../types';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

// Matches junk prefixes like "Chưa xác định:", "Chưa xác định Chương 1:", etc.
// to clean up titles while preserving any actual title text that follows.
const JUNK_TITLE_REGEX = /^Chưa xác định( Chương \d+)?:?\s*/i;

const parseTxt = async (file: File): Promise<Book> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target?.result as string;
            if (!fileContent) {
                reject(new Error("File is empty or could not be read."));
                return;
            }

            const bookTitle = file.name.replace(/\.[^/.]+$/, "");
            const chapters: Chapter[] = [];
            const chapterRegex = /(?=^Chapter \d+|CHAPTER \d+)/im;
            const parts = fileContent.split(chapterRegex).filter(part => part.trim() !== '');
            
            if (parts.length <= 1) {
                // If no chapters found, treat the whole file as one chapter.
                const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                // Check for and remove book title from the start.
                if (lines.length > 0 && lines[0].toLowerCase() === bookTitle.toLowerCase()) {
                    lines.shift();
                }
                chapters.push({
                    id: generateId(),
                    title: "Full Text",
                    content: lines.join('\n').trim(),
                });
            } else {
                const rawChapters = parts.map((part) => {
                    const lines = part.split('\n');
                    const title = lines.shift()?.trim() || ``; // Title line is removed
                    return {
                        id: generateId(),
                        title: title,
                        content: lines.join('\n').trim(),
                    };
                });

                // Heuristic to detect a repeating header line (e.g., garbled book title)
                let repeatingHeader: string | null = null;
                if (rawChapters.length > 1) {
                    const getFirstContentLine = (content: string) => content.split('\n').find(line => line.trim().length > 0)?.trim();
                    const firstLine1 = getFirstContentLine(rawChapters[0].content);
                    const firstLine2 = getFirstContentLine(rawChapters[1].content);

                    if (firstLine1 && firstLine1.length > 5 && firstLine1 === firstLine2) {
                        repeatingHeader = firstLine1;
                    }
                }

                rawChapters.forEach((chapter, index) => {
                    // Clean up chapter title
                    let cleanedTitle = chapter.title.replace(JUNK_TITLE_REGEX, '').trim();
                    if (!cleanedTitle) {
                        cleanedTitle = `Chapter ${index + 1}`;
                    }
                    chapter.title = cleanedTitle;
                    
                    let lines = chapter.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                    // 1. Remove detected repeating header
                    if (repeatingHeader && lines.length > 0 && lines[0] === repeatingHeader) {
                        lines.shift();
                    }
                    // 2. Remove book title from filename as a fallback
                    if (lines.length > 0 && lines[0].toLowerCase() === bookTitle.toLowerCase()) {
                        lines.shift();
                    }
                    
                    if (lines.length > 0) {
                        chapters.push({
                            ...chapter,
                            content: lines.join('\n'),
                        });
                    }
                });
            }

            const book: Book = {
                id: generateId(),
                title: file.name.replace(/\.[^/.]+$/, ""),
                chapters: chapters,
            };
            resolve(book);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
};

const parseEpub = async (file: File): Promise<Book> => {
    console.log(`[Parser] Starting EPUB parsing for: "${file.name}"`);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    reject(new Error("File is empty or could not be read."));
                    return;
                }
                const bookInstance = ePub(arrayBuffer);
                const metadata = await bookInstance.loaded.metadata;
                const bookTitle = metadata.title || file.name.replace(/\.[^/.]+$/, "");
                const spine = await bookInstance.loaded.spine;
                
                console.log('[Parser] Book Metadata:', metadata);
                console.log(`[Parser] Found ${spine.items.length} sections in the book's spine.`);

                let coverImage: string | undefined = undefined;
                try {
                    const coverUrl = await bookInstance.coverUrl();
                    if (coverUrl) {
                        const coverBlob = await bookInstance.archive.getBlob(coverUrl);
                        if (coverBlob instanceof Blob) {
                             coverImage = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(coverBlob);
                            });
                            console.log('[Parser] Successfully extracted cover image.');
                        } else {
                            console.warn("[Parser] `archive.getBlob` did not return a valid Blob. Cover image might be missing.");
                        }
                    }
                } catch (coverError) {
                    console.warn("[Parser] Could not load cover image:", coverError);
                }

                const chapterPromises = spine.items.map(async (item: any, index: number) => {
                    const loadedContent = await bookInstance.load(item.href);
                    if (!loadedContent) throw new Error(`Failed to load content for chapter`);
                    
                    let htmlContent: string;
                    if (typeof loadedContent !== 'string' && loadedContent.documentElement) {
                        htmlContent = new XMLSerializer().serializeToString(loadedContent);
                    } else if (typeof loadedContent === 'string') {
                        htmlContent = loadedContent;
                    } else {
                        throw new Error(`Unsupported content type for chapter`);
                    }
                    
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlContent;
                    tempDiv.querySelectorAll('style, script').forEach(el => el.remove());
                    const textContent = (tempDiv.innerText || tempDiv.textContent || "").trim();
                    
                    const originalTitle = item.toc?.label?.trim() || '';
                    let finalTitle = originalTitle.replace(JUNK_TITLE_REGEX, '').trim();
                    if (!finalTitle) {
                        finalTitle = `Chapter ${index + 1}`;
                    }

                    return {
                        id: item.id || generateId(),
                        title: finalTitle,
                        content: textContent,
                    };
                });

                const results = await Promise.allSettled(chapterPromises);
                
                const rawChapters: Chapter[] = [];
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value.content) {
                        rawChapters.push(result.value);
                    } else if (result.status === 'rejected') {
                        console.error(`[Parser] Failed to process section ${index + 1}:`, result.reason);
                    }
                });

                // Heuristic to detect and remove a repeating header line (e.g., garbled book title)
                let repeatingHeader: string | null = null;
                if (rawChapters.length > 1) {
                    const getFirstContentLine = (content: string) => content.split('\n').find(line => line.trim().length > 0)?.trim();
                    const firstLine1 = getFirstContentLine(rawChapters[0].content);
                    const firstLine2 = getFirstContentLine(rawChapters[1].content);
                    if (firstLine1 && firstLine1.length > 5 && firstLine1 === firstLine2) {
                        repeatingHeader = firstLine1;
                    }
                }

                const chapters: Chapter[] = rawChapters.map(chapter => {
                    let lines = chapter.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    
                    // 1. Remove detected repeating header
                    if (repeatingHeader && lines.length > 0 && lines[0] === repeatingHeader) {
                        lines.shift();
                    }
                    // 2. Remove book title from metadata
                    if (lines.length > 0 && lines[0].toLowerCase() === bookTitle.toLowerCase()) {
                        lines.shift();
                    }
                    // 3. Remove repeated chapter title
                    if (lines.length > 0 && lines[0].toLowerCase() === chapter.title.toLowerCase()) {
                        lines.shift();
                    }
                
                    return { ...chapter, content: lines.join('\n') };
                }).filter(c => c.content);

                console.log(`[Parser] Successfully cleaned and finalized ${chapters.length} chapters.`);

                if (spine.items.length > 0 && chapters.length === 0) {
                    console.error("[Parser] CRITICAL: All chapters failed to parse. The book is likely corrupted or DRM-protected.");
                    reject(new Error("Failed to extract any content. The book may be corrupted or protected by DRM."));
                    return;
                }

                const book: Book = {
                    id: generateId(),
                    title: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
                    author: metadata.creator,
                    chapters: chapters,
                    coverImage: coverImage
                };

                console.log('[Parser] Successfully created book object.');
                resolve(book);

            } catch (error) {
                console.error("[Parser] A critical error occurred during EPUB setup:", error);
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

export const parseFile = async (file: File): Promise<Book> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'txt':
            return parseTxt(file);
        case 'epub':
            return parseEpub(file);
        case 'mobi':
            throw new Error(".mobi files are not supported due to their proprietary format.");
        default:
            throw new Error(`Unsupported file type: .${extension}`);
    }
};

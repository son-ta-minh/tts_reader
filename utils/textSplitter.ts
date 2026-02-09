
/**
 * Splits a long string of text into smaller, sentence-aware chunks.
 * This aims to create natural breakpoints for text-to-speech processing.
 * If sentence-based splitting fails, it falls back to character-based chunking.
 * @param text The full text content.
 * @param maxLength The desired maximum length of a chunk. Defaults to 400.
 * @returns An array of text chunks.
 */
export const splitTextIntoChunks = (text: string, maxLength: number = 400): string[] => {
    if (!text || text.trim().length === 0) return [];

    const trimmedText = text.trim();
    if (trimmedText.length <= maxLength) return [trimmedText];

    const chunks: string[] = [];
    
    // Attempt sentence-based splitting first for more natural breaks.
    const sentences = trimmedText.match(/[^.?!]+[.?!]+["]?\s*|[^.?!]+$/g) || [];

    // If sentence splitting results in more than one sentence, it's likely successful.
    if (sentences.length > 1) {
        let currentChunk = "";
        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            if (trimmedSentence.length === 0) continue;

            if (currentChunk.length > 0 && currentChunk.length + trimmedSentence.length > maxLength) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            
            // If a single sentence is longer than maxLength, it becomes its own chunk.
            currentChunk += trimmedSentence + " ";
        }
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }
    } else {
        // Fallback for text with no clear sentence breaks or just one very long sentence.
        console.warn("[textSplitter] Falling back to character-based chunking. The chapter might lack standard sentence-ending punctuation.");
        let startIndex = 0;
        while (startIndex < trimmedText.length) {
            let endIndex = startIndex + maxLength;
            
            // If we're not at the end of the text, try to find a better break point.
            if (endIndex < trimmedText.length) {
                let lastSpace = trimmedText.lastIndexOf(' ', endIndex);
                // Break at the last space if it's within a reasonable distance from the start of the chunk.
                if (lastSpace > startIndex) {
                    endIndex = lastSpace;
                }
            } else {
                endIndex = trimmedText.length;
            }

            const chunk = trimmedText.substring(startIndex, endIndex).trim();
            if (chunk) {
                chunks.push(chunk);
            }
            startIndex = endIndex + 1; // Move past the space
        }
    }

    // Final safety check: if for some reason chunks are empty but text exists, return the whole text.
    if (chunks.length === 0 && trimmedText.length > 0) {
        return [trimmedText];
    }

    return chunks;
};

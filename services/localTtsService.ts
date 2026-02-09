import { getServerUrl } from './settingsService';

/**
 * Custom error class for TTS-related failures.
 */
export class TtsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TtsError';
    }
}

/**
 * Fetches speech audio from the local TTS server.
 * @param text The text to synthesize.
 * @param signal An AbortSignal to allow for cancellation of the fetch request.
 * @returns A promise that resolves to an audio Blob.
 * @throws {TtsError} if an error occurs.
 */
export const fetchSpeechFromLocalServer = async (text: string, signal: AbortSignal): Promise<Blob> => {
    if (!text || text.trim().length === 0) {
        console.log("No text provided to generate speech.");
        throw new TtsError("Cannot generate audio from empty text.");
    }

    const serverUrl = getServerUrl();
    if (!serverUrl) {
        throw new TtsError("TTS Server URL is not configured. Please check your settings.");
    }

    // Sanitize text: Keep letters (including Vietnamese), numbers, and specified punctuation.
    // Replace unwanted characters with a space to avoid merging words.
    // \p{L} -> any unicode letter
    // \p{N} -> any unicode number
    // \s -> whitespace
    // .,!?:… -> specific punctuation (includes comma, period, ellipsis, etc.)
    let cleanedText = text.replace(/[^\p{L}\p{N}\s.,!?:…]/gu, ' ');
    // Consolidate multiple spaces into one and trim.
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

    if (!cleanedText) {
        console.log("Text is empty after cleaning.");
        throw new TtsError("Text became empty after sanitization.");
    }

    try {
        const response = await fetch(`${serverUrl}/speak`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: cleanedText,
                language: 'vi',
                accent: 'vi_VN',
                voice: ''
            }),
            signal, // Pass the AbortSignal to the fetch request
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
            throw new Error(`Server responded with ${response.status}: ${errorData.error || 'Failed to fetch audio'}`);
        }

        const audioBlob = await response.blob();
        return audioBlob;

    } catch (error) {
        // Allow AbortError to be propagated, so the caller can handle it.
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        console.error(`Error fetching speech from local server at ${serverUrl}:`, error);
        if (error instanceof TypeError) { // Often indicates a network error (CORS, DNS, offline)
            throw new TtsError(`Network error connecting to TTS server at ${serverUrl}. Ensure the server is running, the URL is correct, and there are no CORS issues. If using HTTPS, you may need to accept a self-signed certificate.`);
        }
        throw new TtsError(error instanceof Error ? error.message : "An unknown error occurred while fetching audio.");
    }
};

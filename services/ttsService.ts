
import { GoogleGenAI, Modality } from "@google/genai";
import { Book, Chapter } from '../types';

// FIX: Initialize with process.env.API_KEY directly and remove manual checks, as per coding guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSpeech = async (text: string): Promise<string | null> => {
    // Gemini can handle larger chunks, but for very long chapters,
    // you might want to split the text into smaller parts.
    if (!text || text.trim().length === 0) {
        console.log("No text provided to generate speech.");
        return null;
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (base64Audio) {
            return base64Audio;
        } else {
            console.error("No audio data in API response:", response);
            return null;
        }
    } catch (error) {
        console.error("Error generating speech with Gemini API:", error);
        // FIX: Removed user-facing alert for better UX and to comply with guidelines of not handling API key UI.
        console.error("Failed to generate audio. Please check the console for details.");
        return null;
    }
};

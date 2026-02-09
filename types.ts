
export interface Chapter {
    id: string;
    title: string;
    content: string;
}

export interface Book {
    id: string;
    title: string;
    author?: string;
    coverImage?: string; // base64 string
    chapters: Chapter[];
    lastPosition?: {
        chapterIndex: number;
        sentenceIndex: number;
    };
}

import Dexie, { type Table } from 'dexie';
import type { Book } from '../types';

// FIX: The previous class-based Dexie setup was causing TypeScript errors where core methods like `version()` and `transaction()` were not found. Switching to a direct instance definition with type casting resolves these errors.
export const db = new Dexie('ebookReaderDB') as Dexie & {
    books: Table<Book, string>;
};

db.version(1).stores({
    books: 'id, title, author', // Primary key 'id', and index 'title' and 'author' for future searching
});

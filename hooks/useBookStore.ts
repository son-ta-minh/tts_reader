
import { useState, useEffect, useCallback } from 'react';
import { Book } from '../types';
import { db } from '../services/db';

export const useBookStore = () => {
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBooks = useCallback(async () => {
        setLoading(true);
        try {
            const allBooks = await db.books.toArray();
            setBooks(allBooks);
        } catch (error) {
            console.error("Failed to load books from IndexedDB", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBooks();
    }, [loadBooks]);

    const addBook = async (newBook: Book) => {
        try {
            await db.books.add(newBook);
            setBooks(prevBooks => [...prevBooks, newBook]);
        } catch (error) {
            console.error("Failed to add book to IndexedDB", error);
        }
    };

    const deleteBook = async (bookId: string) => {
        try {
            await db.books.delete(bookId);
            setBooks(prevBooks => prevBooks.filter(book => book.id !== bookId));
        } catch (error) {
            console.error("Failed to delete book from IndexedDB", error);
        }
    };

    const updateBook = async (updatedBook: Book) => {
        try {
            await db.books.put(updatedBook);
            setBooks(prevBooks => 
                prevBooks.map(book => 
                    book.id === updatedBook.id 
                        ? updatedBook
                        : book
                )
            );
        } catch (error) {
            console.error("Failed to update book in IndexedDB", error);
        }
    };

    const updateBookPosition = async (bookId: string, lastPosition: { chapterIndex: number, sentenceIndex: number }) => {
        try {
            await db.books.update(bookId, { lastPosition });
            setBooks(prevBooks => 
                prevBooks.map(book => 
                    book.id === bookId 
                        ? { ...book, lastPosition } 
                        : book
                )
            );
        } catch (error) {
            console.error("Failed to update book position in IndexedDB", error);
        }
    };

    return { books, loading, addBook, deleteBook, updateBook, updateBookPosition, loadBooks };
};

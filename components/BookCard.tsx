
import React from 'react';
import { Book } from '../types';
import { BookOpenIcon, TrashIcon } from './icons';

interface BookCardProps {
    book: Book;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}

const BookCard: React.FC<BookCardProps> = ({ book, onSelect, onDelete }) => {
    
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering onSelect
        if (window.confirm(`Are you sure you want to delete "${book.title}"?`)) {
            onDelete(book.id);
        }
    };

    return (
        <div 
            onClick={() => onSelect(book.id)} 
            className="relative group bg-slate-800 rounded-lg shadow-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-cyan-500/50 hover:-translate-y-1"
        >
            <div className="aspect-[2/3] w-full bg-slate-700 flex items-center justify-center">
                {book.coverImage ? (
                    <img src={book.coverImage} alt={`${book.title} cover`} className="w-full h-full object-cover" />
                ) : (
                    <BookOpenIcon className="w-16 h-16 text-slate-500" />
                )}
            </div>
            <div className="p-4">
                <h3 className="text-lg font-bold text-cyan-400 truncate group-hover:text-cyan-300">{book.title}</h3>
                {book.author && <p className="text-sm text-slate-400 truncate">{book.author}</p>}
                <p className="text-xs text-slate-500 mt-1">{book.chapters.length} chapters</p>
            </div>
            <button
                onClick={handleDelete}
                className="absolute top-2 right-2 p-2 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-red-700 focus:opacity-100 focus:ring-2 focus:ring-red-400 focus:outline-none"
                aria-label={`Delete ${book.title}`}
            >
                <TrashIcon className="w-5 h-5" />
            </button>
        </div>
    );
};

export default BookCard;

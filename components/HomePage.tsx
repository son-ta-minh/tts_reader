
import React, { useState, useRef } from 'react';
import { Book } from '../types';
import BookCard from './BookCard';
import { parseFile } from '../services/parser';
import { LoadingSpinner, CogIcon, UsersIcon } from './icons';
import UserSwitcherModal from './UserSwitcherModal';

interface HomePageProps {
    books: Book[];
    onAddBook: (book: Book) => void;
    onSelectBook: (id: string) => void;
    onDeleteBook: (id: string) => void;
    onGoToSettings: () => void;
    onDataRestored: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ books, onAddBook, onSelectBook, onDeleteBook, onGoToSettings, onDataRestored }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);

        try {
            const newBook = await parseFile(file);
            onAddBook(newBook);
        } catch (err: any) {
            setError(err.message || "Failed to parse file.");
            alert(err.message || "Failed to parse file.");
        } finally {
            setIsLoading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <>
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="relative text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
                        My Ebook Library
                    </h1>
                    <p className="text-slate-400 mt-2">Import and listen to your favorite books.</p>
                    <div className="absolute top-0 right-0 flex items-center gap-2">
                         <button 
                            onClick={() => setIsUserSwitcherOpen(true)}
                            className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                            aria-label="Select User"
                        >
                            <UsersIcon className="w-7 h-7" />
                        </button>
                        <button 
                            onClick={onGoToSettings}
                            className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                            aria-label="Settings"
                        >
                            <CogIcon className="w-7 h-7" />
                        </button>
                    </div>
                </header>
                
                <div className="flex justify-center mb-8">
                    <label className="relative inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500 cursor-pointer transition-colors">
                        {isLoading ? (
                            <>
                                <LoadingSpinner className="w-5 h-5 mr-2" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <span>Import New Book</span>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="sr-only"
                            accept=".txt,.epub"
                            onChange={handleFileChange}
                            disabled={isLoading}
                        />
                    </label>
                </div>
                {error && <p className="text-center text-red-400 mb-4">{error}</p>}

                {books.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                        {books.map(book => (
                            <BookCard key={book.id} book={book} onSelect={onSelectBook} onDelete={onDeleteBook} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 px-4 border-2 border-dashed border-slate-700 rounded-lg">
                        <h2 className="text-xl font-medium text-slate-300">Your library is empty.</h2>
                        <p className="text-slate-500 mt-2">Click "Import New Book" to get started.</p>
                    </div>
                )}
            </div>
            <UserSwitcherModal 
                isOpen={isUserSwitcherOpen} 
                onClose={() => setIsUserSwitcherOpen(false)} 
                onDataRestored={onDataRestored}
            />
        </>
    );
};

export default HomePage;
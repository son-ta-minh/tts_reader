
import React, { useState, useEffect } from 'react';
import { Book } from './types';
import { useBookStore } from './hooks/useBookStore';
import HomePage from './components/HomePage';
import ReaderPage from './components/ReaderPage';
import SettingsPage from './components/SettingsPage';

type View = 'home' | 'reader' | 'settings';

const App: React.FC = () => {
    const { books, addBook, deleteBook, updateBook, updateBookPosition, loadBooks, loading } = useBookStore();
    const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
    const [view, setView] = useState<View>('home');

    useEffect(() => {
        if (selectedBookId) {
            setView('reader');
        } else if (view === 'reader') { // Only switch back to home if we were in reader
            setView('home');
        }
    }, [selectedBookId, view]);

    const handleDataReload = () => {
        loadBooks();
        setSelectedBookId(null);
        setView('home');
    };

    const handleDeleteBook = (bookId: string) => {
        deleteBook(bookId);
        if (selectedBookId === bookId) {
            setSelectedBookId(null);
        }
    }

    const handleSelectBook = (bookId: string) => {
        setSelectedBookId(bookId);
    };

    const handleBackToHome = () => {
        setSelectedBookId(null);
        setView('home');
    };

    const renderContent = () => {
        const selectedBook = books.find(b => b.id === selectedBookId) || null;

        if (loading) {
            return (
                <div className="flex items-center justify-center min-h-screen">
                    <h1 className="text-2xl text-slate-400">Loading Library...</h1>
                </div>
            )
        }

        switch (view) {
            case 'settings':
                return <SettingsPage books={books} onBack={() => setView('home')} onDataRestored={handleDataReload} />;
            case 'reader':
                if (selectedBook) {
                    return (
                        <ReaderPage 
                            book={selectedBook} 
                            onBack={handleBackToHome} 
                            onUpdatePosition={(chapterIndex, sentenceIndex) => 
                                updateBookPosition(selectedBook.id, { chapterIndex, sentenceIndex })
                            }
                            onUpdateBook={updateBook}
                        />
                    );
                }
                // Fallback to home if book is not found
                setView('home');
                return null;
            case 'home':
            default:
                return (
                    <HomePage 
                        books={books} 
                        onAddBook={addBook} 
                        onSelectBook={handleSelectBook} 
                        onDeleteBook={handleDeleteBook}
                        onGoToSettings={() => setView('settings')}
                        onDataRestored={handleDataReload}
                    />
                );
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
            {renderContent()}
        </div>
    );
};

export default App;

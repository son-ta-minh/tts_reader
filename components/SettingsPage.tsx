
import React, { useState, useEffect, useCallback } from 'react';
import { Book } from '../types';
import { getSettings, saveSettings, AppSettings } from '../services/settingsService';
import { listBackups, createBackup, restoreBackup, ServerBackup } from '../services/backupService';
import { db } from '../services/db';
import { ArrowLeftIcon, CloudArrowUpIcon, ArrowPathIcon, LoadingSpinner, CheckIcon } from './icons';

interface SettingsPageProps {
    books: Book[];
    onBack: () => void;
    onDataRestored: () => void;
}

type BackupStatus = {
    loading: boolean;
    error: string | null;
    message: string | null;
};

const SettingsPage: React.FC<SettingsPageProps> = ({ books, onBack, onDataRestored }) => {
    const [settings, setSettings] = useState<AppSettings>(getSettings());
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [serverBackups, setServerBackups] = useState<ServerBackup[]>([]);
    const [backupStatus, setBackupStatus] = useState<BackupStatus>({ loading: false, error: null, message: null });
    const [restoreStatus, setRestoreStatus] = useState<{[key: string]: BackupStatus}>({});

    const fetchServerBackups = useCallback(async () => {
        if (!settings.ttsServerUrl) return;
        setBackupStatus({ loading: true, error: null, message: null });
        try {
            const backups = await listBackups(settings.ttsServerUrl);
            setServerBackups(backups);
        } catch (error: any) {
            setBackupStatus({ loading: false, error: `Failed to fetch backups: ${error.message}`, message: null });
        } finally {
            setBackupStatus(prev => ({ ...prev, loading: false }));
        }
    }, [settings.ttsServerUrl]);

    useEffect(() => {
        fetchServerBackups();
    }, [fetchServerBackups]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveSettings(settings);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000); // Hide message after 2s
    };

    const handleBackup = async () => {
        if (!settings.username) {
            alert("Please set a username before backing up.");
            return;
        }

        setBackupStatus({ loading: true, error: null, message: 'Backing up...' });
        try {
            const settingsData = getSettings();

            const backupData = {
                books: books,
                settings: settingsData,
            };

            await createBackup(settings.ttsServerUrl, settings.username, backupData);
            setBackupStatus({ loading: false, error: null, message: 'Backup successful!' });
            await fetchServerBackups(); // Refresh the list
        } catch (error: any) {
            setBackupStatus({ loading: false, error: `Backup failed: ${error.message}`, message: null });
        } finally {
            setTimeout(() => setBackupStatus(prev => ({...prev, message: null, error: null })), 3000);
        }
    };

    const handleRestore = async (backupId: string) => {
        setRestoreStatus(prev => ({...prev, [backupId]: { loading: true, error: null, message: 'Restoring...' }}));
        try {
            const data = await restoreBackup(settings.ttsServerUrl, backupId);
            
            if (Array.isArray(data.books) && typeof data.settings === 'object' && data.settings !== null) {
                // Clear existing data and restore from backup
                await db.transaction('rw', db.books, async () => {
                    await db.books.clear();
                    await db.books.bulkAdd(data.books);
                });
                saveSettings(data.settings);
                
                setRestoreStatus(prev => ({...prev, [backupId]: { loading: false, error: null, message: 'Success!' }}));
                
                setTimeout(() => {
                    onDataRestored();
                    onBack();
                }, 1000);
            } else {
                throw new Error("Invalid backup file format from server.");
            }
        } catch (error: any) {
            setRestoreStatus(prev => ({...prev, [backupId]: { loading: false, error: `Restore failed: ${error.message}`, message: null }}));
        }
    };

    const renderRestoreButtonContent = (status?: BackupStatus) => {
        if (status?.loading) {
            return <><LoadingSpinner className="w-4 h-4" /> <span>Restoring...</span></>;
        }
        if (status?.message === 'Success!') {
            return <><CheckIcon className="w-4 h-4" /> <span>Success!</span></>;
        }
        if (status?.error) {
            return <><ArrowPathIcon className="w-4 h-4" /> <span>Retry</span></>;
        }
        return <><ArrowPathIcon className="w-4 h-4"/> <span>Restore</span></>;
    };

    const getRestoreButtonClass = (status?: BackupStatus) => {
        if (status?.message === 'Success!') return 'bg-green-500 hover:bg-green-600 disabled:bg-green-500 text-slate-900';
        if (status?.error) return 'bg-red-500 hover:bg-red-600 text-white';
        if (status?.loading) return 'bg-slate-600 text-white disabled:bg-slate-600';
        return 'bg-teal-400 hover:bg-teal-500 text-slate-900';
    };

    return (
        <div className="container mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
            <header className="relative mb-8">
                 <button onClick={onBack} className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back
                </button>
                <h1 className="text-center text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
                    Settings
                </h1>
            </header>

            <div className="bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <label htmlFor="ttsServerUrl" className="block text-sm font-medium text-slate-300 mb-2">
                            TTS Server URL
                        </label>
                        <input
                            type="url"
                            id="ttsServerUrl"
                            name="ttsServerUrl"
                            value={settings.ttsServerUrl}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="e.g., http://localhost:3000"
                        />
                    </div>
                    
                    <div className="mb-6">
                        <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={settings.username}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="Enter a username for server backups"
                        />
                         <p className="mt-2 text-xs text-slate-500">
                            This name is used to identify your backups on the server.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            type="submit"
                            className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-colors"
                        >
                            Save Settings
                        </button>
                        {saveStatus === 'saved' && (
                            <span className="text-green-400 transition-opacity duration-300">
                                Saved successfully!
                            </span>
                        )}
                    </div>
                </form>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-slate-200 mb-4">Server Sync / Backup</h2>
                
                <div className="mb-6">
                    <button
                        onClick={handleBackup}
                        disabled={backupStatus.loading || books.length === 0}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 disabled:bg-sky-800/50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500 transition-colors"
                    >
                        {backupStatus.loading && backupStatus.message ? <LoadingSpinner className="w-5 h-5"/> : <CloudArrowUpIcon className="w-5 h-5"/>}
                        {backupStatus.message || 'Backup to Server'}
                    </button>
                    {backupStatus.error && <p className="mt-2 text-sm text-red-400">{backupStatus.error}</p>}
                </div>
                
                <div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-3">Available Backups on Server</h3>
                    {backupStatus.loading && !backupStatus.message && <p className="text-slate-400">Loading backups...</p>}
                    {!backupStatus.loading && backupStatus.error && <p className="text-red-400">{backupStatus.error}</p>}
                    {!backupStatus.loading && !backupStatus.error && serverBackups.length === 0 && <p className="text-slate-500">No backups found on the server.</p>}
                    
                    <ul className="space-y-3">
                        {serverBackups.map(backup => {
                            const currentRestoreStatus = restoreStatus[backup.id];
                            return (
                                <li key={backup.id} className="bg-slate-700 p-3 rounded-md">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-cyan-400">{backup.name}</p>
                                            <p className="text-xs text-slate-400">
                                                {new Date(backup.date).toLocaleString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleRestore(backup.id)}
                                            disabled={currentRestoreStatus?.loading || currentRestoreStatus?.message === 'Success!'}
                                            className={`inline-flex items-center justify-center gap-2 w-32 px-4 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm transition-colors disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 ${getRestoreButtonClass(currentRestoreStatus)}`}
                                        >
                                            {renderRestoreButtonContent(currentRestoreStatus)}
                                        </button>
                                    </div>
                                    {currentRestoreStatus?.error && <p className="text-xs text-red-400 mt-2 text-right">{currentRestoreStatus.error}</p>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
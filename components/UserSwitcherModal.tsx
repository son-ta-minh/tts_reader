
import React, { useState, useEffect, useCallback } from 'react';
import { listBackups, restoreBackup, ServerBackup } from '../services/backupService';
import { getSettings, saveSettings } from '../services/settingsService';
import { db } from '../services/db';
import { LoadingSpinner, XMarkIcon, ArrowPathIcon, CheckIcon } from './icons';

interface UserSwitcherModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDataRestored: () => void;
}

type Status = {
    loading: boolean;
    error: string | null;
    success: boolean;
};

const UserSwitcherModal: React.FC<UserSwitcherModalProps> = ({ isOpen, onClose, onDataRestored }) => {
    const [backups, setBackups] = useState<ServerBackup[]>([]);
    const [status, setStatus] = useState<{ loading: boolean, error: string | null }>({ loading: false, error: null });
    const [restoreStatus, setRestoreStatus] = useState<{ [key: string]: Status }>({});

    const fetchBackups = useCallback(async () => {
        const { ttsServerUrl } = getSettings();
        if (!ttsServerUrl) {
            setStatus({ loading: false, error: 'TTS Server URL is not configured in Settings.' });
            return;
        }
        setStatus({ loading: true, error: null });
        try {
            const backupList = await listBackups(ttsServerUrl);
            setBackups(backupList);
        } catch (err: any) {
            setStatus({ loading: false, error: err.message });
        } finally {
            setStatus(prev => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchBackups();
            setRestoreStatus({});
        }
    }, [isOpen, fetchBackups]);

    const handleRestore = async (backup: ServerBackup) => {
        const { ttsServerUrl } = getSettings();
        setRestoreStatus(prev => ({ ...prev, [backup.id]: { loading: true, error: null, success: false } }));

        try {
            const data = await restoreBackup(ttsServerUrl, backup.id);
            if (data.books && data.settings) {
                await db.transaction('rw', db.books, async () => {
                    await db.books.clear();
                    await db.books.bulkAdd(data.books);
                });
                saveSettings(data.settings);
                
                setRestoreStatus(prev => ({ ...prev, [backup.id]: { loading: false, error: null, success: true } }));
                
                setTimeout(() => {
                    onDataRestored();
                    onClose();
                }, 1000); // Delay to show success feedback before refreshing UI
            } else {
                throw new Error("Invalid data format in backup.");
            }
        } catch (err: any) {
            setRestoreStatus(prev => ({ ...prev, [backup.id]: { loading: false, error: err.message, success: false } }));
        }
    };

    if (!isOpen) {
        return null;
    }
    
    const getButtonClass = (status?: Status) => {
        if (status?.success) return 'bg-green-600 hover:bg-green-700 disabled:bg-green-600';
        if (status?.error) return 'bg-red-600 hover:bg-red-700';
        if (status?.loading) return 'bg-slate-600 disabled:bg-slate-600';
        return 'bg-cyan-600 hover:bg-cyan-700';
    };

    const renderButtonContent = (status?: Status) => {
        if (status?.loading) {
            return <><LoadingSpinner className="w-4 h-4" /> <span>Selecting...</span></>;
        }
        if (status?.success) {
            return <><CheckIcon className="w-4 h-4" /> <span>Success!</span></>;
        }
        if (status?.error) {
            return <><ArrowPathIcon className="w-4 h-4" /> <span>Retry</span></>;
        }
        return <><ArrowPathIcon className="w-4 h-4" /> <span>Select</span></>;
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" 
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md m-4 transform transition-all" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-cyan-400">User Selection</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white" aria-label="Close">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {status.loading && (
                        <div className="flex justify-center items-center p-8">
                            <LoadingSpinner className="w-8 h-8 text-cyan-500" />
                        </div>
                    )}
                    {status.error && (
                        <div className="text-center text-red-400 p-4 bg-red-900/20 border border-red-800 rounded-md">
                            <p className="font-semibold">Error loading profiles:</p>
                            <p className="text-sm">{status.error}</p>
                        </div>
                    )}
                    {!status.loading && !status.error && (
                        <ul className="space-y-3">
                            {backups.length > 0 ? backups.map(backup => {
                                const backupRestoreStatus = restoreStatus[backup.id];

                                return (
                                <li key={backup.id} className="bg-slate-700 p-3 rounded-md">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-slate-200">{backup.name}</p>
                                            <p className="text-xs text-slate-400">
                                                Last updated: {new Date(backup.date).toLocaleString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleRestore(backup)}
                                            disabled={backupRestoreStatus?.loading || backupRestoreStatus?.success}
                                            className={`inline-flex items-center justify-center gap-2 w-32 px-4 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-colors ${getButtonClass(backupRestoreStatus)}`}
                                        >
                                           {renderButtonContent(backupRestoreStatus)}
                                        </button>
                                    </div>
                                    {backupRestoreStatus?.error && <p className="text-xs text-red-400 mt-2 text-right">{backupRestoreStatus.error}</p>}
                                </li>
                            )}) : (
                                <p className="text-center text-slate-500 p-8">No user profiles found on the server.</p>
                            )}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserSwitcherModal;
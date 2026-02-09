
export interface ServerBackup {
    id: string;
    name: string;
    size: number;
    date: string;
}

/**
 * Fetches the list of available backups from the server for this specific app.
 * @param serverUrl The base URL of the TTS server.
 * @returns A promise that resolves to an array of ServerBackup objects.
 */
export const listBackups = async (serverUrl: string): Promise<ServerBackup[]> => {
    const response = await fetch(`${serverUrl}/api/backups?app=book`);
    if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: Failed to list backups.`);
    }
    const data = await response.json();
    return data.backups || [];
};

/**
 * Creates a new backup on the server for this specific app.
 * @param serverUrl The base URL of the TTS server.
 * @param username The username to identify the backup.
 * @param data The data object (containing books and settings) to back up.
 * @returns A promise that resolves when the backup is successful.
 */
export const createBackup = async (serverUrl: string, username: string, data: object): Promise<void> => {
    const endpoint = `${serverUrl}/api/backup?username=${encodeURIComponent(username)}&app=book`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(`Server responded with ${response.status}: ${errorData.error}`);
    }
};

/**
 * Fetches the content of a specific backup from the server for this specific app for restoration.
 * @param serverUrl The base URL of the TTS server.
 * @param backupId The identifier of the backup to restore.
 * @returns A promise that resolves to the backup data object.
 */
export const restoreBackup = async (serverUrl: string, backupId: string): Promise<any> => {
    const endpoint = `${serverUrl}/api/backup/${encodeURIComponent(backupId)}?app=book`;
    const response = await fetch(endpoint);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Backup not found or server error' }));
        throw new Error(`Server responded with ${response.status}: ${errorData.error}`);
    }

    return response.json();
};

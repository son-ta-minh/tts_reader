
export interface AppSettings {
    ttsServerUrl: string;
    username: string;
}

const SETTINGS_KEY = 'ebook_reader_settings';

const DEFAULT_SETTINGS: AppSettings = {
    ttsServerUrl: 'https://localhost:3000',
    username: 'Default User',
};

/**
 * Retrieves the current application settings from localStorage.
 * If no settings are found, it returns the default settings.
 * @returns The application settings object.
 */
export const getSettings = (): AppSettings => {
    try {
        const item = window.localStorage.getItem(SETTINGS_KEY);
        if (item) {
            const parsedSettings = JSON.parse(item);
            // Merge with defaults to ensure all keys are present
            return { ...DEFAULT_SETTINGS, ...parsedSettings };
        }
    } catch (error) {
        console.error("Error reading settings from localStorage", error);
    }
    return DEFAULT_SETTINGS;
};

/**
 * Saves the application settings to localStorage.
 * @param settings The settings object to save.
 */
export const saveSettings = (settings: AppSettings): void => {
    try {
        const value = JSON.stringify(settings);
        window.localStorage.setItem(SETTINGS_KEY, value);
    } catch (error) {
        console.error("Error saving settings to localStorage", error);
    }
};

/**
 * A convenience function to get only the TTS server URL.
 * @returns The TTS server URL string.
 */
export const getServerUrl = (): string => {
    return getSettings().ttsServerUrl;
};

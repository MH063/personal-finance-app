export interface IElectronAPI {
  getAppVersion: () => Promise<string>;
  showNotification: (title: string, body: string) => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  saveBackground: (imageUrl: string, format: 'jpg' | 'png') => Promise<{ success: boolean; path?: string; error?: string }>;
  selectBackgroundFile: () => Promise<{ success: boolean; path?: string; error?: string }>;
  getBackgroundConfig: () => Promise<{ currentBackground: string; lastUpdated: string; isCustom?: boolean } | null>;
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

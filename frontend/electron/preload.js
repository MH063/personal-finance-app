const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  saveBackground: (imageUrl, format) => ipcRenderer.invoke('save-background', { imageUrl, format }),
  selectBackgroundFile: () => ipcRenderer.invoke('select-background-file'),
  getBackgroundConfig: () => ipcRenderer.invoke('get-background-config'),
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  onWindowMaximized: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('window-maximized', subscription);
    return () => ipcRenderer.removeListener('window-maximized', subscription);
  },
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  onWindowMaximized: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('window-maximized', subscription);
    return () => ipcRenderer.removeListener('window-maximized', subscription);
  },
});

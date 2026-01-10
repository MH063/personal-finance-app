const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');

// 开发环境下关闭安全警告
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// 禁用某些可能导致控制台报错的特性 (如 Autofill.enable 错误)
// 这些错误通常是因为 DevTools 尝试使用 Electron/Chromium 中未启用或不存在的协议域
app.commandLine.appendSwitch('disable-features', 'Autofill,PasswordManager,AutoFillServerCommunication');

const isDev = process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'development' || !process.env.NODE_ENV;

let mainWindow;
let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 540,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
  });

  splashWindow.loadFile('electron/splash.html');
  splashWindow.show();

  return splashWindow;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1080,
    minHeight: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff00', // 透明背景
      symbolColor: '#333333', // 按钮图标颜色，可以根据主题调整
      height: 40,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:8000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      setTimeout(() => {
        splashWindow.close();
        mainWindow.show();
      }, 2000);
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets/icon.png'),
      urgency: 'normal',
    }).show();
  }
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-notification', async (event, { title, body }) => {
  showNotification(title, body);
  return true;
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(() => {
  createSplashWindow();
  setTimeout(createMainWindow, 100);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.removeAllListeners('closed');
    mainWindow.close();
  }
});

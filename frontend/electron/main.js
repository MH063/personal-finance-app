const { app, BrowserWindow, ipcMain, Notification, net, protocol, dialog, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// 注册自定义协议以访问本地资源
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-resource', privileges: { bypassCSP: true, stream: true, secure: true, standard: true, supportFetchAPI: true } }
]);

// 开发环境下关闭安全警告
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// 禁用某些可能导致控制台报错的特性 (如 Autofill.enable 错误)
// 这些错误通常是因为 DevTools 尝试使用 Electron/Chromium 中未启用或不存在的协议域
app.commandLine.appendSwitch('disable-features', 'Autofill,PasswordManager,AutoFillServerCommunication,AutofillAssistant');
app.commandLine.appendSwitch('disable-autofill');
app.commandLine.appendSwitch('disable-blink-features', 'Autofill');
// 降低日志级别以减少不必要的控制台干扰 (2: ERROR, 3: FATAL)
app.commandLine.appendSwitch('log-level', '3');

const isDev = !app.isPackaged;

let mainWindow;
let splashWindow;
let widgetWindow;

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

function createWidgetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  widgetWindow = new BrowserWindow({
    width: 320,
    height: 180,
    x: width - 340,
    y: height - 200,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          localIp = alias.address;
          break;
        }
      }
      if (localIp !== 'localhost') break;
    }
    widgetWindow.loadURL(`http://${localIp}:8000/#/widget`);
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'widget' });
  }
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
    // 移除 titleBarOverlay 以便使用自定义控制按钮
  });

  // 监听窗口最大化状态变化并发送给渲染进程
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });

  if (isDev) {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          localIp = alias.address;
          break;
        }
      }
      if (localIp !== 'localhost') break;
    }
    
    console.log(`[Main] Loading URL: http://${localIp}:8000`);
    mainWindow.loadURL(`http://${localIp}:8000`);
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

function registerIpcHandlers() {
  console.log('[Main] Registering IPC handlers...');
  
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
  
  ipcMain.handle('get-api-base-url', () => {
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = '127.0.0.1';
      for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
          const alias = iface[i];
          if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
            localIp = alias.address;
            break;
          }
        }
        if (localIp !== '127.0.0.1') break;
      }
      return `http://${localIp}:4000/api/v1`;
    } catch (e) {
      return `http://127.0.0.1:4000/api/v1`;
    }
  });

  ipcMain.handle('show-notification', async (event, { title, body }) => {
    showNotification(title, body);
    return true;
  });

  ipcMain.handle('open-main-window', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
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

  ipcMain.handle('is-window-maximized', () => {
    const maximized = mainWindow ? mainWindow.isMaximized() : false;
    return maximized;
  });

  ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.close();
  });

  // 保存背景图片到本地
  ipcMain.handle('save-background', async (event, { imageUrl, format }) => {
    try {
      const userDataPath = app.getPath('userData');
      const bgDir = path.join(userDataPath, 'backgrounds', 'default');
      
      // 确保目录存在
      if (!fs.existsSync(bgDir)) {
        fs.mkdirSync(bgDir, { recursive: true });
      }

      // 如果是本地文件路径（format='file'）
      if (format === 'file') {
        const ext = path.extname(imageUrl);
        const fileName = `custom_bg${ext}`;
        const targetPath = path.join(bgDir, fileName);
        
        fs.copyFileSync(imageUrl, targetPath);
        
        const configPath = path.join(userDataPath, 'background_config.json');
        const config = {
          currentBackground: targetPath,
          lastUpdated: new Date().toISOString(),
          isCustom: true
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return { success: true, path: targetPath };
      }

      const ext = format === 'png' ? 'png' : 'jpg';
      const fileName = `default_bg.${ext}`;
      const filePath = path.join(bgDir, fileName);

      // 如果是 picsum URL，需要下载
      if (imageUrl.startsWith('http')) {
        const request = net.request(imageUrl);
        return new Promise((resolve, reject) => {
          request.on('response', (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              const buffer = Buffer.concat(chunks);
              fs.writeFileSync(filePath, buffer);
              
              // 保存配置文件
              const configPath = path.join(userDataPath, 'background_config.json');
              const config = {
                currentBackground: filePath,
                lastUpdated: new Date().toISOString()
              };
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
              
              resolve({ success: true, path: filePath });
            });
          });
          request.on('error', (err) => {
            console.error('[Main] Download error:', err);
            reject(err);
          });
          request.end();
        });
      } else if (imageUrl.startsWith('data:')) {
        // 处理 base64
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        
        const configPath = path.join(userDataPath, 'background_config.json');
        const config = {
          currentBackground: filePath,
          lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        return { success: true, path: filePath };
      }
      
      return { success: false, error: 'Unsupported image source' };
    } catch (error) {
      console.error('[Main] Save background error:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取背景图片配置
  ipcMain.handle('get-background-config', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const configPath = path.join(userDataPath, 'background_config.json');
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // 检查文件是否还存在
        if (config.currentBackground && fs.existsSync(config.currentBackground)) {
          // 在 Electron 中，本地文件需要通过 file:// 协议或者自定义协议访问
          // 这里返回路径，渲染进程会处理
          return config;
        }
      }
      return null;
    } catch (error) {
      console.error('[Main] Get background config error:', error);
      return null;
    }
  });
  
  // 选择并上传本地背景图片
  ipcMain.handle('select-background-file', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const sourcePath = result.filePaths[0];
      // 仅返回路径，不立即保存
      return { success: true, path: sourcePath };
    } catch (error) {
      console.error('[Main] Select background error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[Main] IPC handlers registered.');
}

app.whenReady().then(() => {
  // 注册 local-resource 协议
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    try {
      const parsed = new URL(request.url);
      let decoded;
      if (/^[a-zA-Z]$/.test(parsed.hostname)) {
        const pathname = parsed.pathname || '';
        const rest = pathname.startsWith('/') ? pathname.slice(1) : pathname;
        if (!rest) return callback({ error: -6 });
        decoded = `${parsed.hostname.toUpperCase()}:/${decodeURIComponent(rest)}`;
      } else {
        const combined = parsed.hostname ? `${parsed.hostname}${parsed.pathname}` : parsed.pathname;
        decoded = decodeURIComponent(combined);
      }
      decoded = decoded.replace(/^\/([a-zA-Z]:[\\/])/, '$1');
      decoded = decoded.replace(/\//g, path.sep);

      if (!decoded || /^[a-zA-Z]:[\\\/]?$/.test(decoded)) {
        return callback({ error: -6 });
      }

      const normalized = path.normalize(decoded);
      if (!fs.existsSync(normalized)) {
        return callback({ error: -6 });
      }

      return callback({ path: normalized });
    } catch (error) {
      console.error('Failed to handle protocol request', error);
      return callback({ error: -6 }); // NET_ERROR(FILE_NOT_FOUND, -6)
    }
  });

  registerIpcHandlers();
  createSplashWindow();
  setTimeout(createMainWindow, 100);
  setTimeout(createWidgetWindow, 500);

  // 注册全局快捷键 Ctrl+Shift+K 呼出主窗口
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

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
  globalShortcut.unregisterAll();
  if (mainWindow) {
    mainWindow.removeAllListeners('closed');
    mainWindow.close();
  }
});

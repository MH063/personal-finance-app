const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class OllamaManager {
  constructor() {
    this.process = null;
    this.isManaged = false; // 是否由我们启动
  }

  /**
   * 获取 Ollama 可执行文件路径
   */
  getOllamaPath() {
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const possiblePaths = [
        path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
        path.join(localAppData, 'Ollama', 'ollama.exe'),
        path.join(programFiles, 'Ollama', 'ollama.exe'),
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          console.log('[OllamaManager] Found Ollama executable at:', p);
          return p;
        }
      }
    }
    return 'ollama'; // 默认回退到 PATH
  }

  /**
   * 检查 Ollama 是否已安装
   */
  async checkInstallation() {
    const command = this.getOllamaPath() === 'ollama' ? 'ollama --version' : `"${this.getOllamaPath()}" --version`;
    return new Promise((resolve) => {
      exec(command, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * 检查 Ollama 服务是否正在运行
   */
  async checkRunning() {
    return new Promise((resolve) => {
      // 尝试访问 Ollama API
      const { net } = require('electron');
      const request = net.request('http://127.0.0.1:11434/api/tags');
      
      request.on('response', (response) => {
        resolve(response.statusCode === 200);
      });
      
      request.on('error', () => {
        resolve(false);
      });
      
      request.end();
    });
  }

  /**
   * 启动 Ollama 服务
   */
  async startService() {
    const isRunning = await this.checkRunning();
    if (isRunning) {
      console.log('[OllamaManager] Service already running.');
      return true;
    }

    console.log('[OllamaManager] Starting Ollama service...');
    
    // 设置环境变量
    const env = { 
      ...process.env,
      OLLAMA_KEEP_ALIVE: '5m', // 5分钟无请求自动释放显存
      OLLAMA_HOST: '127.0.0.1:11434',
      // 针对 AMD 显卡的优化配置 (如果需要强制指定，可以在这里添加)
      // OLLAMA_NUM_GPU: '1' 
    };

    try {
      // 在 Windows 下通常是 'ollama serve'
      // 使用 shell: true 可以解决 Windows 下找不到命令的问题 (ENOENT)
      const command = this.getOllamaPath();
      const args = ['serve'];
      
      console.log(`[OllamaManager] Spawning: ${command} ${args.join(' ')}`);

      this.process = spawn(command, args, {
        env,
        detached: true, // 允许独立运行
        stdio: 'ignore', // 忽略输出
        shell: process.platform === 'win32', // Windows 必须启用 shell
        windowsHide: true // 隐藏命令行窗口
      });

      this.process.on('error', (err) => {
        console.error('[OllamaManager] Spawn error:', err);
        this.isManaged = false;
        this.process = null;
      });

      this.isManaged = true;
      this.process.unref(); // 允许主进程退出时不等待子进程

      console.log('[OllamaManager] Service started with PID:', this.process.pid);
      
      // 等待服务就绪
      let retries = 0;
      while (retries < 10) {
        if (await this.checkRunning()) {
          console.log('[OllamaManager] Service is ready.');
          return true;
        }
        await new Promise(r => setTimeout(r, 1000));
        retries++;
      }
      
      return false;
    } catch (error) {
      console.error('[OllamaManager] Failed to start service:', error);
      return false;
    }
  }

  /**
   * 停止 Ollama 服务
   */
  stopService() {
    if (this.isManaged && this.process) {
      console.log('[OllamaManager] Stopping managed service...');
      try {
        if (this.process.pid) {
          process.kill(this.process.pid);
        }
        this.process = null;
        this.isManaged = false;
      } catch (error) {
        console.error('[OllamaManager] Failed to kill process:', error);
      }
    } else {
      // 如果不是我们管理的，或者想强制清理，可以使用 taskkill
      // 仅在明确需要清理时执行，避免误杀用户手动启动的服务
      // exec('taskkill /F /IM ollama_app.exe', () => {}); 
    }
  }
}

module.exports = new OllamaManager();

import { BrowserWindow, ipcMain, screen } from 'electron';

export interface WindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isMaximized?: boolean;
  isFullScreen?: boolean;
}

export class ProfileManager {
  private timer: NodeJS.Timeout | null = null;
  private isHidden = false;
  private window: BrowserWindow;
  private readonly READER_PATH = '/web/reader/';
  private boundUpdateVisibility: () => void;
  private ipcHandler: (event: Electron.IpcMainEvent) => void;

  public windowState: WindowState = {};

  constructor(win: BrowserWindow) {
    this.window = win;
    this.boundUpdateVisibility = () => this.updateVisibility();

    this.ipcHandler = (event) => {
      // 确保消息来自当前窗口
      const w = BrowserWindow.fromWebContents(event.sender);
      if (w && w.id === this.window.id) {
        this.updateVisibility();
      }
    };

    ipcMain.on('reader-mousemove', this.ipcHandler);
    this.window.on('enter-full-screen', this.boundUpdateVisibility);
    this.window.on('leave-full-screen', this.boundUpdateVisibility);
  }

  // --- Window State Management ---

  public restoreWindowState() {
    // 恢复窗口位置和大小
    // 注意：构造 BrowserWindow 时可能已经使用了部分初始值，
    // 这里主要处理 maximize 和 fullscreen，或者在窗口创建后再次校准位置
    if (this.windowState.isMaximized) {
      this.window.maximize();
    }
    if (this.windowState.isFullScreen) {
      this.window.setFullScreen(true);
    }
  }

  public saveWindowState() {
    if (this.window.isDestroyed()) return;
    
    const bounds = this.window.getBounds();
    this.windowState.x = bounds.x;
    this.windowState.y = bounds.y;
    this.windowState.width = bounds.width;
    this.windowState.height = bounds.height;
    this.windowState.isMaximized = this.window.isMaximized();
    this.windowState.isFullScreen = this.window.isFullScreen();
  }

  // --- Cursor Management ---

  public injectScript() {
    this.window.webContents.executeJavaScript(`
      (function() {
        if (window._wxrdMouseListenerInited) return;
        window._wxrdMouseListenerInited = true;

        try {
          // Changed to use contextBridge exposed API
          // const { ipcRenderer } = require('electron'); 
          const sendMouseMove = window.wxrd && window.wxrd.sendMouseMove;
          
          if (!sendMouseMove) {
             console.error('WXRD: window.wxrd.sendMouseMove not found');
             return;
          }

          let lastTime = 0;
          function notify() {
            const now = Date.now();
            if (now - lastTime > 200) { // 200ms 节流
              // ipcRenderer.send('reader-mousemove');
              sendMouseMove();
              lastTime = now;
            }
          }
          document.addEventListener('mousemove', notify);
          document.addEventListener('mousedown', notify);
          console.log('WXRD: Mouse listener injected');
        } catch (e) {
          console.error('WXRD: Failed to inject mouse listener', e);
        }
      })();
    `).catch(() => {});
  }

  private isInReader(): boolean {
    try {
      if (this.window.isDestroyed()) return false;
      return this.window.webContents.getURL().includes(this.READER_PATH);
    } catch {
      return false;
    }
  }

  public async updateVisibility(immediateHide: boolean = false) {
    if (this.window.isDestroyed()) return;

    // 1. 强制清理（无条件优先恢复光标）
    if (this.isHidden && !immediateHide) {
      try {
        await this.window.webContents.executeJavaScript(`
          document.body.classList.remove('wxrd-cursor-hidden');
        `);
      } catch { }
      this.isHidden = false;
    }

    // 2. 检查条件：必须在阅读页，且必须全屏
    if (!this.isInReader() || !this.window.isFullScreen()) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }

    // 3. 重置计时
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // 如果指定了立即隐藏，且满足条件，则直接隐藏，不等待
    if (immediateHide) {
      this.hideCursor();
      return;
    }

    // 4. 启动新的计时器
    this.timer = setTimeout(async () => {
      if (this.window.isDestroyed()) return;
      this.hideCursor();
    }, 3000);
  }

  private async hideCursor() {
    if (this.isInReader() && this.window.isFullScreen() && !this.isHidden) {
      try {
        await this.window.webContents.executeJavaScript(`
          if (!document.getElementById('wxrd-cursor-style')) {
            const style = document.createElement('style');
            style.id = 'wxrd-cursor-style';
            // 定义一个 class，而不是直接修改元素样式
            style.innerHTML = '.wxrd-cursor-hidden, .wxrd-cursor-hidden * { cursor: none !important; }';
            document.head.appendChild(style);
          }
          document.body.classList.add('wxrd-cursor-hidden');
        `);
        this.isHidden = true;
      } catch { }
    }
  }

  public dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    ipcMain.removeListener('reader-mousemove', this.ipcHandler);
  }
}

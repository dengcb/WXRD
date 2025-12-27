import electron from 'electron';
const { powerSaveBlocker, ipcMain } = electron;
import type { BrowserWindow } from 'electron';

export class TurnerManager {
  private window: BrowserWindow;
  private readonly READER_PATH = '/web/reader/';

  public autoFlip = false;
  public autoFlipStep = 30; // 默认 30 秒
  public keepAwake = true;  // 默认后台不休

  public rememberLastPage = true;
  public lastReaderUrl: string | null = null;

  private autoFlipTimer: NodeJS.Timeout | null = null;
  private autoFlipTickTimer: NodeJS.Timeout | null = null;
  private autoFlipPsbId: number | null = null;
  private autoFlipSyntheticTick = 0;
  private autoFlipCountdown = 30;
  private autoFlipOriginalTitle: string | null = null;

  constructor(win: BrowserWindow) {
    this.window = win;
  }

  public handleSwipeKey = (event: Electron.IpcMainEvent, key: string) => {
    if (!this.window || this.window.isDestroyed()) return;

    this.window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    this.window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
  }

  private isInReader(): boolean {
    if (this.window.isDestroyed()) return false;
    return this.window.webContents.getURL().includes(this.READER_PATH);
  }

  // 设置“自动翻页”标题初始值（同时备份原始标题）
  private async setAutoFlipTitleInitial() {
    try {
      if (this.autoFlipOriginalTitle == null) {
        this.autoFlipOriginalTitle = await this.window.webContents.executeJavaScript('document.title');
      }
      await this.window.webContents.executeJavaScript(`document.title = "微信阅读 - 自动翻页 - ${this.autoFlipCountdown} 秒"`);
    } catch { }
  }

  // 按当前倒计时数更新标题
  private async setAutoFlipTitle() {
    try {
      await this.window.webContents.executeJavaScript(`document.title = "微信阅读 - 自动翻页 - ${this.autoFlipCountdown} 秒"`);
    } catch { }
  }

  // 恢复自动翻页前备份的标题
  private async restoreAutoFlipTitle() {
    try {
      if (this.autoFlipOriginalTitle != null && this.isInReader()) {
        await this.window.webContents.executeJavaScript(`document.title = ${JSON.stringify(this.autoFlipOriginalTitle)}`);
      }
    } catch { }
    this.autoFlipOriginalTitle = null;
  }

  public setAutoFlipForState() {
    if (this.window.isDestroyed()) return;

    const inReader = this.isInReader();
    const active = inReader && this.autoFlip;

    // 清理旧定时器（虽然现在逻辑移交了，但为了安全还是要清）
    if (this.autoFlipTimer) {
      clearInterval(this.autoFlipTimer);
      this.autoFlipTimer = null;
    }
    if (this.autoFlipTickTimer) {
      clearInterval(this.autoFlipTickTimer);
      this.autoFlipTickTimer = null;
    }

    // 1. 处理防休眠逻辑 (Keep Awake)
    if (active) {
      try {
        if (this.keepAwake) {
          if (this.autoFlipPsbId === null || !powerSaveBlocker.isStarted(this.autoFlipPsbId)) {
            this.autoFlipPsbId = powerSaveBlocker.start('prevent-app-suspension');
          }
        } else {
          // 如果用户关闭了 keepAwake，但 autoFlip 还在，则停止防休眠
          if (this.autoFlipPsbId !== null) {
            if (powerSaveBlocker.isStarted(this.autoFlipPsbId)) powerSaveBlocker.stop(this.autoFlipPsbId);
            this.autoFlipPsbId = null;
          }
        }
      } catch { }
    } else {
      // 停止自动翻页，清理防休眠
      if (this.autoFlipPsbId !== null) {
        try { if (powerSaveBlocker.isStarted(this.autoFlipPsbId)) powerSaveBlocker.stop(this.autoFlipPsbId); } catch { }
        this.autoFlipPsbId = null;
      }
    }

    // 2. 通知渲染进程 (Preload) 启动/停止自动翻页逻辑
    // 将具体的定时器、滚动、按键模拟决策权下放给渲染进程，
    // 以便其根据单栏/双栏模式智能切换策略。
    this.window.webContents.send('auto-flip-status', {
      active: active,
      interval: this.autoFlipStep, // 秒
      keepAwake: this.keepAwake
    });
  }

  public handleInput(input: Electron.Input) {
    // 这里的重置逻辑也移交给渲染进程处理，主进程只负责转发输入事件（如果有必要）
    // 目前不需要做任何事，渲染进程会监听 DOM 的 keydown 事件
  }

  public stop() {
    this.autoFlip = false;
    this.setAutoFlipForState();
  }

  public checkAndSaveUrl() {
    if (this.window.isDestroyed()) return;
    if (!this.rememberLastPage) {
      this.lastReaderUrl = null;
      return;
    }
    const url = this.window.webContents.getURL();
    if (url.includes(this.READER_PATH)) {
      this.lastReaderUrl = url;
    } else {
      this.lastReaderUrl = null;
    }
  }

  public dispose() {
    if (this.autoFlipTimer) clearInterval(this.autoFlipTimer);
    if (this.autoFlipTickTimer) clearInterval(this.autoFlipTickTimer);
    if (this.autoFlipPsbId !== null && powerSaveBlocker.isStarted(this.autoFlipPsbId)) {
      powerSaveBlocker.stop(this.autoFlipPsbId);
    }
  }
}

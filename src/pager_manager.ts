import { BrowserWindow } from 'electron';

export class PagerManager {
  private window: BrowserWindow;
  private readonly READER_PATH = '/web/reader/';
  
  public readerWide = false;
  public hideToolbar = false;

  constructor(win: BrowserWindow) {
    this.window = win;
  }

  private isInReader(): boolean {
    if (this.window.isDestroyed()) return false;
    return this.window.webContents.getURL().includes(this.READER_PATH);
  }

  public async setReaderWidthForState() {
    if (this.window.isDestroyed()) return;
    if (!this.isInReader()) return;
    this.window.webContents.send('update-reading-style', { readerWide: this.readerWide });
  }

  public async setToolbarForState() {
    if (this.window.isDestroyed()) return;
    if (!this.isInReader()) return;
    this.window.webContents.send('update-reading-style', { hideToolbar: this.hideToolbar });
  }

  public async refreshReaderArea() {
    // 渲染进程中的 update-reading-style 监听器已经包含了刷新布局的逻辑
    // 但为了保险，或者其他地方手动调用，可以保留这个方法，但其实它也可以通过 IPC 通知
    // 不过原来的实现是 executeJavaScript，这里我们暂时不改，或者什么都不做
    // 因为 preload 里的监听器已经处理了 refreshLayout
  }

  public async applyState() {
    // 页面加载完成后调用。preload 已经处理了初始状态。
    // 这里再次发送可能是为了确保状态一致，或者处理加载过程中的变化。
    // 但实际上，preload 已经在最早期同步获取了状态并应用了。
    // 所以这里的 applyState 主要是为了应对那些“非初次加载”的情况？
    // 比如在页面内导航？
    // preload 是每个页面加载都会执行的。
    // 所以，其实 applyState 在 did-finish-load 时调用，可能是多余的，但无害。
    // 重要的是在运行时（菜单点击）调用 setReaderWidthForState 等方法时，能通过 IPC 通知到 preload。
    
    if (this.window.isDestroyed()) return;
    if (!this.isInReader()) return;
    
    this.window.webContents.send('update-reading-style', { 
      readerWide: this.readerWide,
      hideToolbar: this.hideToolbar 
    });
  }
}

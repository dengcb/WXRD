import { BrowserWindow, nativeTheme } from 'electron';

export class ThemeManager {
  private window: BrowserWindow;
  private readonly READER_PATH = '/web/reader/';
  private darkCSSKey: string | null = null;

  // 采用滤镜反转方案，这是一个通用性较强且代码量较小的方案
  // 它可以自动适配大多数浅色网页为深色模式
  private readonly DARK_CSS = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
      background-color: #1a1a1a !important;
    }
    
    /* 还原图片、视频、画布等媒体内容 */
    img, video, canvas, svg {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 还原背景图片元素（尽量匹配） */
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 微信读书特有的类名适配（如果能猜到的话，这里做一些防御性还原） */
    /* 例如头像、书籍封面通常是 img，上面已经涵盖 */
    
    /* 避免滚动条过于刺眼 */
    ::-webkit-scrollbar {
      background-color: #2c2c2c;
    }
    ::-webkit-scrollbar-track {
      background-color: #2c2c2c;
    }
    ::-webkit-scrollbar-thumb {
      background-color: #555;
      border-radius: 4px;
    }
  `;

  constructor(win: BrowserWindow) {
    this.window = win;

    // 监听系统主题变化
    nativeTheme.on('updated', () => {
      this.updateTheme();
    });
  }

  public async updateTheme() {
    if (this.window.isDestroyed()) return;

    // 无论是否在阅读页，都跟随系统更新窗口基础背景色
    // 这能有效防止在页面跳转或加载时的白屏/黑屏闪烁
    const bgColor = nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff';
    this.window.setBackgroundColor(bgColor);

    // 如果是阅读页，不应用此强制暗黑模式
    // 阅读页通常有自己的配色设置，且反色滤镜会严重破坏阅读体验（如字体抗锯齿、背景纹理等）
    if (this.isInReader()) {
      await this.removeDarkTheme();
      return;
    }

    if (nativeTheme.shouldUseDarkColors) {
      // 如果已经注入了 CSS，说明当前已经是深色模式，无需重复操作以免闪烁
      // 注意：页面刷新(did-finish-load)会将 darkCSSKey 重置为 null，所以这里只会在 SPA 跳转时生效
      if (this.darkCSSKey) {
        return;
      }
      await this.applyDarkTheme();
    } else {
      await this.removeDarkTheme();
    }
  }

  private isInReader(): boolean {
    try {
      const url = this.window.webContents.getURL();
      return url.includes(this.READER_PATH);
    } catch {
      return false;
    }
  }

  private async applyDarkTheme() {
    // 如果已经注入了 CSS，先移除旧的，再注入新的，确保状态一致
    if (this.darkCSSKey) {
      await this.removeDarkTheme();
    }

    try {
      this.darkCSSKey = await this.window.webContents.insertCSS(this.DARK_CSS);
    } catch (e) {
      console.error('Failed to apply dark theme:', e);
    }
  }

  private async removeDarkTheme() {
    // 移除 preload 脚本注入的样式（如果有）
    try {
      this.window.webContents.send('clear-dark-mode');
    } catch { }

    // 移除主进程注入的样式（如果有）
    if (this.darkCSSKey) {
      try {
        await this.window.webContents.removeInsertedCSS(this.darkCSSKey);
      } catch (e) {
        console.error('Failed to remove dark theme:', e);
      }
      this.darkCSSKey = null;
    }
  }

  // 页面刷新或跳转后，之前的 CSS Key 会失效，需要重置状态并重新应用
  public handleDidFinishLoad() {
    this.darkCSSKey = null; // 页面加载后，之前的 CSS 已经被清除
    this.updateTheme();
  }

  // 在页面开始加载时尽早注入，防止白屏闪烁
  public handleDidStartNavigation() {
    // 只有在非阅读页且系统是深色模式时才预注入
    if (!this.isInReader() && nativeTheme.shouldUseDarkColors) {
      // 注意：insertCSS 返回的是 promise，在 navigation 阶段可能不总是立即生效，
      // 但这是 Electron 提供的最早介入时机之一。
      // 更好的做法是利用 webContents.on('dom-ready')，但这往往也稍晚。
      // 最彻底的做法是在 preload 脚本中注入，但这里我们尽量保持逻辑集中在主进程。
      this.updateTheme();
    }
  }
}

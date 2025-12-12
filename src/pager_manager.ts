import { BrowserWindow } from 'electron';

export class PagerManager {
  private window: BrowserWindow;
  private readonly READER_PATH = '/web/reader/';
  
  public readerWide = false;
  public hideToolbar = false;

  private readerCssKey: string | null = null;
  private toolbarCssKey: string | null = null;

  private readonly readerCss = `
    .readerTopBar,
    .readerChapterContent {
      width: 96% !important;
    }
  `;

  private readonly toolbarHideCss = `
    .readerControls {
      display: none !important;
    }
    .readerTopBar,
    .readerChapterContent {
      max-width: calc(100vw - 124px) !important;
    }
  `;

  private readonly toolbarShowCss = `
    .readerControls {
      display: block !important;
    }
    .readerTopBar,
    .readerChapterContent {
      max-width: calc(100vw - 224px) !important;
    }
  `;

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

    if (this.readerCssKey) {
      try {
        await this.window.webContents.removeInsertedCSS(this.readerCssKey);
      } catch { }
      this.readerCssKey = null;
    }
    if (this.readerWide) {
      const key = await this.window.webContents.insertCSS(this.readerCss);
      this.readerCssKey = key;
    }
  }

  public async setToolbarForState() {
    if (this.window.isDestroyed()) return;
    if (!this.isInReader()) return;

    if (this.toolbarCssKey) {
      try {
        await this.window.webContents.removeInsertedCSS(this.toolbarCssKey);
      } catch { }
      this.toolbarCssKey = null;
    }
    const css = this.hideToolbar ? this.toolbarHideCss : this.toolbarShowCss;
    const key = await this.window.webContents.insertCSS(css);
    this.toolbarCssKey = key;
  }

  public async refreshReaderArea() {
    if (this.window.isDestroyed()) return;
    if (!this.isInReader()) return;
    try {
      await this.window.webContents.executeJavaScript(`(function(){const f=t=>window.dispatchEvent(new Event(t));f('resize');f('orientationchange');var el=document.querySelector('.readerChapterContent');if(el){void el.offsetHeight;}})();`);
    } catch { }
  }

  public async applyState() {
    await this.setReaderWidthForState();
    await this.setToolbarForState();
    await this.refreshReaderArea();
  }
}

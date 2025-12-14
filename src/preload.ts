import { webFrame, ipcRenderer, contextBridge } from 'electron';

// Expose safe API to Main World
contextBridge.exposeInMainWorld('wxrd', {
  sendMouseMove: () => ipcRenderer.send('reader-mousemove'),
});

// Store CSS keys locally
let preloadDarkCssKey: string | null = null;

// 这个脚本会在页面加载的最早期执行
(function () {
  const isReader = window.location.href.includes('/web/reader/');

  // Note: With contextIsolation: true, we don't need to manually delete Node.js variables
  // because they are not leaked to the Main World.

  // 1. 深色模式适配 (非阅读页)
  if (!isReader) {
    handleDarkMode();
  }

  // 2. 阅读页样式适配 (宽屏、隐藏工具栏)
  if (isReader) {
    handleReaderStyle();
  }
})();

// Listen for cleanup request from Main Process
ipcRenderer.on('clear-dark-mode', () => {
  if (preloadDarkCssKey) {
    webFrame.removeInsertedCSS(preloadDarkCssKey);
    preloadDarkCssKey = null;
  }
});

function handleDarkMode() {
  const isIframe = window.self !== window.top;

  const cssRoot = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
      background-color: #e0e0e0 !important; /* 反转后为深色 #1f1f1f */
    }
  `;

  const cssContent = `
    /* 还原图片、视频、画布等媒体内容 */
    img, video, canvas, svg {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 还原背景图片元素 */
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 滚动条适配 */
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

  const finalCss = isIframe ? cssContent : (cssRoot + cssContent);

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    preloadDarkCssKey = webFrame.insertCSS(finalCss);
  }
}

function handleReaderStyle() {
  // CSS Constants
  const CSS_READER_WIDE = `
    .readerTopBar,
    .readerChapterContent {
      width: 96% !important;
    }
  `;

  const CSS_HIDE_TOOLBAR = `
    .readerControls {
      display: none !important;
    }
    .readerTopBar,
    .readerChapterContent {
      max-width: calc(100vw - 124px) !important;
    }
  `;

  const CSS_SHOW_TOOLBAR_ADJUST = `
    .readerControls {
      display: block !important;
    }
    .readerTopBar,
    .readerChapterContent {
      max-width: calc(100vw - 224px) !important;
    }
  `;

  // State keys
  let wideKey: string | null = null;
  let toolbarKey: string | null = null;

  const updateWide = (isWide: boolean) => {
    if (wideKey) {
      webFrame.removeInsertedCSS(wideKey);
      wideKey = null;
    }
    if (isWide) {
      wideKey = webFrame.insertCSS(CSS_READER_WIDE);
    }
  };

  const updateToolbar = (hide: boolean) => {
    if (toolbarKey) {
      webFrame.removeInsertedCSS(toolbarKey);
      toolbarKey = null;
    }
    if (hide) {
      toolbarKey = webFrame.insertCSS(CSS_HIDE_TOOLBAR);
    } else {
      toolbarKey = webFrame.insertCSS(CSS_SHOW_TOOLBAR_ADJUST);
    }
  };

  const refreshLayout = () => {
    window.dispatchEvent(new Event('resize'));
    const el = document.querySelector('.readerChapterContent') as HTMLElement;
    if (el) void el.offsetHeight;
  };

  // Initial Sync
  try {
    const settings = ipcRenderer.sendSync('get-reading-settings-sync');
    if (settings) {
      updateWide(!!settings.readerWide);
      updateToolbar(!!settings.hideToolbar);
    }
  } catch (e) {
    console.error('Failed to sync reading settings:', e);
  }

  // Listen for updates from Main Process (PagerManager)
  ipcRenderer.on('update-reading-style', (_event, args) => {
    if (args.readerWide !== undefined) updateWide(args.readerWide);
    if (args.hideToolbar !== undefined) updateToolbar(args.hideToolbar);

    // 触发重排，确保样式应用
    setTimeout(refreshLayout, 10);
  });
}

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
  // 这里的判断保留，因为深色模式是全局的，且我们不希望在阅读页加载非阅读页的深色 CSS
  if (!isReader) {
    handleDarkMode();
  }

  // 2. 阅读页功能模块初始化
  // 移除 isReader 的外层判断，确保 IPC 监听器始终注册，支持 SPA 跳转
  handleReaderStyle();
  handleSwipeTurn();
  handleAutoFlip();
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
    /* 基础逻辑：宽屏模式 */
    .readerTopBar,
    body:has(.readerControls[is-horizontal="true"]) .readerChapterContent {
      width: 96% !important;
      max-width: calc(100vw - 224px) !important;
    }
    .app_content {
      max-width: calc(100vw - 224px) !important;
    }
    body:has(.readerControls:not([is-horizontal="true"])) .readerControls {
      margin-left: calc(50vw - 80px) !important;
    }
  `;

  const CSS_READER_THIN = `
    /* 基础逻辑：窄屏模式 */
    .readerTopBar,
    body:has(.readerControls[is-horizontal="true"]) .readerChapterContent {
      width: 80% !important;
      max-width: calc(100vw - 424px) !important;
    }
    .app_content {
      max-width: calc(100vw - 424px) !important;
    }
    body:has(.readerControls:not([is-horizontal="true"])) .readerControls {
      margin-left: calc(50vw - 180px) !important;
    }
  `;

  const CSS_HIDE_TOOLBAR = `
    /* 1. 基础逻辑：无论单栏双栏，都隐藏工具栏 */
    .readerControls {
      display: none !important;
    }

    /* 2. 双栏模式特有逻辑，请勿修改！！！ */
    .readerTopBar,
    body:has(.readerControls[is-horizontal="true"]) .readerChapterContent {
      max-width: calc(100vw - 124px) !important;
    }

    /* 3. 单栏模式特有逻辑，请勿删除！！！ */
    .app_content {
      max-width: calc(100vw - 124px) !important;
    }
  `;

  const CSS_SHOW_TOOLBAR = `
    /* 1. 基础逻辑：显示工具栏 */
    .readerControls {
      display: block !important;
    }

    /* 2. 双栏模式特有逻辑，请勿修改！！！ */
    .readerTopBar,
    body:has(.readerControls[is-horizontal="true"]) .readerChapterContent {
      max-width: calc(100vw - 224px) !important;
    }

    /* 3. 单栏模式特有逻辑，请勿删除！！！ */
    .app_content {
      max-width: calc(100vw - 224px) !important;
    }
    body:has(.readerControls:not([is-horizontal="true"])) .readerControls {
      margin-left: calc(50vw - 80px) !important;
    }
  `;

  // State keys
  let wideKey: string | null = null;
  let toolbarKey: string | null = null;

  const isCurrentReader = () => window.location.href.includes('/web/reader/');

  const updateWide = (isWide: boolean) => {
    if (!isCurrentReader()) return;

    if (wideKey) {
      webFrame.removeInsertedCSS(wideKey);
      wideKey = null;
    }
    if (isWide) {
      wideKey = webFrame.insertCSS(CSS_READER_WIDE);
    } else {
      wideKey = webFrame.insertCSS(CSS_READER_THIN);
    }
  };

  const updateToolbar = (isHide: boolean) => {
    if (!isCurrentReader()) return;

    if (toolbarKey) {
      webFrame.removeInsertedCSS(toolbarKey);
      toolbarKey = null;
    }
    if (isHide) {
      toolbarKey = webFrame.insertCSS(CSS_HIDE_TOOLBAR);
    } else {
      toolbarKey = webFrame.insertCSS(CSS_SHOW_TOOLBAR);
    }
  };

  const refreshLayout = () => {
    if (!isCurrentReader()) return;
    window.dispatchEvent(new Event('resize'));
    const el = document.querySelector('.readerChapterContent') as HTMLElement;
    if (el) void el.offsetHeight;
  };

  // Initial Sync
  try {
    if (isCurrentReader()) {
      const settings = ipcRenderer.sendSync('get-reading-settings-sync');
      if (settings) {
        updateWide(!!settings.readerWide);
        updateToolbar(!!settings.hideToolbar);
      }
    }
  } catch (e) {
    console.error('Failed to sync reading settings:', e);
  }

  // Listen for updates from Main Process (PagerManager)
  ipcRenderer.on('update-reading-style', (_event, args) => {
    // 即使当前不是 Reader，也可能通过 SPA 刚跳转过来，所以由 updateWide 内部的检查来决定
    // 实际上，如果 updateWide 内部检查了，这里就不需要了？
    // 但为了性能，这里也可以加一层。
    // 不过考虑到时序，最好是在 updateWide 里检查。

    if (args.readerWide !== undefined) updateWide(args.readerWide);
    if (args.hideToolbar !== undefined) updateToolbar(args.hideToolbar);

    // 触发重排，确保样式应用
    setTimeout(refreshLayout, 10);
  });
}

function handleSwipeTurn() {
  let lastTriggerTime = 0;
  let hasTriggeredInThisAction = false;

  window.addEventListener('wheel', (e) => {
    if (!window.location.href.includes('/web/reader/')) return;

    const now = Date.now();
    const currentDeltaX = e.deltaX;
    const absX = Math.abs(currentDeltaX);

    // 1. 重置逻辑 (Reset Logic)：
    // 必须等到滑动完全停止或非常慢 (< 10) 时，才重置本次动作的状态。
    // 这意味着：无论你滑得多快、多远，只要手没停下来，就只翻一页。
    // 这彻底解决了“一次大力滑动翻两页”的问题，因为惯性再大，只要不降到 10 以下，就不会重置。
    if (absX < 10) {
      hasTriggeredInThisAction = false;
    }

    // 2. 触发逻辑 (Trigger Logic)：
    // 阈值 > 15，且本次动作从未触发过，且距离上次触发超过 500ms
    if (!hasTriggeredInThisAction && absX > 15 && absX > Math.abs(e.deltaY)) {
      // 双重保险：防抖时间未到，坚决不触发
      if (now - lastTriggerTime < 500) return;

      // 阻止干扰
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      // 锁定状态
      lastTriggerTime = now;
      hasTriggeredInThisAction = true;

      const key = e.deltaX > 0 ? 'Right' : 'Left';
      ipcRenderer.send('simulate-swipe-key', key);
    }
    // 微小滑动拦截
    else if (absX > 0 && absX <= 15 && absX > Math.abs(e.deltaY)) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { passive: false, capture: true });
}

function handleAutoFlip() {
  let isActive = false;
  let intervalSeconds = 30;
  let keepAwake = false;

  // Double Column State
  let countdown = 30;
  let doubleTimer: any = null;
  let originalTitle: string | null = null;

  // Single Column State
  let singleRafId: number | null = null;
  let lastFrameTime = 0;
  let lastBottomTriggerTime = 0;
  let accumulatedMove = 0;

  // Helper: Check Mode
  const isDoubleColumn = () => !!document.querySelector('.readerControls[is-horizontal="true"]');

  // Logic: Stop All
  const stopAll = () => {
    if (doubleTimer) {
      clearInterval(doubleTimer);
      doubleTimer = null;
    }
    if (singleRafId) {
      cancelAnimationFrame(singleRafId);
      singleRafId = null;
    }
    if (originalTitle) {
      document.title = originalTitle;
      originalTitle = null;
    }
  };

  // Logic: Double Column Tick (Every 1s)
  const startDoubleColumnLogic = () => {
    if (doubleTimer) return; // Already running
    if (singleRafId) {
      cancelAnimationFrame(singleRafId);
      singleRafId = null;
    }

    countdown = intervalSeconds;
    if (!originalTitle) originalTitle = document.title;

    doubleTimer = setInterval(() => {
      // Check if mode changed
      if (!isDoubleColumn()) {
        stopAll();
        startSingleColumnLogic();
        return;
      }

      if (document.hidden && !keepAwake) return;

      countdown--;
      document.title = `微信阅读 - 自动翻页 - ${countdown} 秒`;

      if (countdown <= 0) {
        ipcRenderer.send('simulate-swipe-key', 'Right');
        countdown = intervalSeconds;
      }
    }, 1000);
  };

  // Logic: Single Column Tick (Every Frame)
  const startSingleColumnLogic = () => {
    if (singleRafId) return; // Already running
    if (doubleTimer) {
      clearInterval(doubleTimer);
      doubleTimer = null;
      if (originalTitle) {
        document.title = originalTitle;
        originalTitle = null;
      }
    }

    lastFrameTime = performance.now();

    const loop = (time: number) => {
      // Check if mode changed
      if (isDoubleColumn()) {
        stopAll();
        startDoubleColumnLogic();
        return;
      }

      if (!isActive) return;

      let deltaTime = time - lastFrameTime;
      lastFrameTime = time;

      // Prevent large jumps (e.g. after tab switch or lag)
      // If frame gap is too large (>100ms), treat it as a normal frame (~16ms)
      if (deltaTime > 100) deltaTime = 16;

      if (document.hidden && !keepAwake) {
        singleRafId = requestAnimationFrame(loop);
        return;
      }

      // Calculate Speed: Scroll TWO screen heights per intervalSeconds (User requested 2x speed)
      // Speed = px / ms
      const screenHeight = window.innerHeight;
      const validInterval = intervalSeconds > 0 ? intervalSeconds : 30;
      const speed = (screenHeight * 2) / (validInterval * 1000);
      const move = speed * deltaTime;

      // Accumulate fractional pixels
      accumulatedMove += move;

      // Execute Scroll only when we have at least 1px to move
      if (accumulatedMove >= 1) {
        const pixelsToScroll = Math.floor(accumulatedMove);
        window.scrollBy(0, pixelsToScroll);
        accumulatedMove -= pixelsToScroll; // Keep remainder

        // Check if hit bottom (with 5px threshold)
        // Use document.documentElement.scrollHeight to get full content height, 
        // as body.offsetHeight might be limited to viewport height in some layouts.
        const totalHeight = document.documentElement.scrollHeight;
        const currentPos = window.innerHeight + window.scrollY;

        if (currentPos >= totalHeight - 5) {
          // Throttle: only trigger once every 2 seconds to prevent spamming
          const now = Date.now();
          if (now - lastBottomTriggerTime > 2000) {
            lastBottomTriggerTime = now;
            ipcRenderer.send('simulate-swipe-key', 'Right');
          }
        }
      }

      singleRafId = requestAnimationFrame(loop);
    };

    singleRafId = requestAnimationFrame(loop);
  };

  // Listen for Main Process
  ipcRenderer.on('auto-flip-status', (_e, args) => {
    isActive = args.active;
    intervalSeconds = args.interval;
    keepAwake = args.keepAwake;

    stopAll();

    if (isActive) {
      if (isDoubleColumn()) {
        startDoubleColumnLogic();
      } else {
        startSingleColumnLogic();
      }
    }
  });

  // Listen for User Input (Reset Countdown in Double Mode)
  window.addEventListener('keydown', (e) => {
    if (!isActive) return;
    if (isDoubleColumn()) {
      if (['ArrowRight', 'ArrowLeft', ' ', 'Enter'].includes(e.key)) {
        countdown = intervalSeconds;
        document.title = `微信阅读 - 自动翻页 - ${countdown} 秒`;
      }
    }
  }, true);
}

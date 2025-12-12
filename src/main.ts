import * as dotenv from 'dotenv';
import { app, BrowserWindow, Menu, shell, MenuItemConstructorOptions, nativeImage, screen, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ProfileManager } from './profile_manager';
import { PagerManager } from './pager_manager';
import { TurnerManager } from './turner_manager';

dotenv.config();

const isMac = process.platform === 'darwin';

const READER_PATH = '/web/reader/';
const MENU_READER_WIDE_ID = 'menu-reader-wide';
const MENU_HIDE_TOOLBAR_ID = 'menu-hide-toolbar';
const MENU_AUTO_FLIP_ID = 'menu-auto-flip';
const MENU_FULL_SCREEN_ID = 'menu-full-screen';

let settingsPath: string | null = null;
let settingsWindow: BrowserWindow | null = null;
let windowState: { x?: number; y?: number; width?: number; height?: number; isMaximized?: boolean; isFullScreen?: boolean } = {};

// Managers
let pagerManager: PagerManager | null = null;
let turnerManager: TurnerManager | null = null;
let profileManager: ProfileManager | null = null;

async function loadSettings() {
  try {
    settingsPath = path.join(app.getPath('userData'), 'wxrd-settings.json');
    const txt = await fs.promises.readFile(settingsPath, 'utf8');
    const obj = JSON.parse(txt);

    if (obj.windowState) {
      windowState = obj.windowState;
    }

    if (pagerManager) {
      pagerManager.readerWide = !!obj.readerWide;
      pagerManager.hideToolbar = !!obj.hideToolbar;
    }
    if (turnerManager) {
      if (obj.autoFlipStep) turnerManager.autoFlipStep = parseInt(obj.autoFlipStep, 10);
      if (obj.keepAwake !== undefined) turnerManager.keepAwake = !!obj.keepAwake;

      turnerManager.rememberLastPage = obj.rememberLastPage !== undefined ? !!obj.rememberLastPage : true;
      if (turnerManager.rememberLastPage && obj.lastReaderUrl) {
        turnerManager.lastReaderUrl = obj.lastReaderUrl;
      }
    }
    return obj;
  } catch {
    return {};
  }
}

async function saveSettings() {
  try {
    if (!settingsPath) settingsPath = path.join(app.getPath('userData'), 'wxrd-settings.json');
    const obj: any = {};
    if (profileManager) {
      obj.windowState = profileManager.windowState;
    } else if (windowState) {
      obj.windowState = windowState;
    }
    if (pagerManager) {
      obj.readerWide = pagerManager.readerWide;
      obj.hideToolbar = pagerManager.hideToolbar;
    }
    if (turnerManager) {
      obj.autoFlipStep = turnerManager.autoFlipStep;
      obj.keepAwake = turnerManager.keepAwake;
      obj.rememberLastPage = turnerManager.rememberLastPage;
      if (turnerManager.rememberLastPage && turnerManager.lastReaderUrl) {
        obj.lastReaderUrl = turnerManager.lastReaderUrl;
      }
    }

    const txt = JSON.stringify(obj);
    await fs.promises.writeFile(settingsPath, txt, 'utf8');
  } catch { }
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const isDark = nativeTheme.shouldUseDarkColors;
  const bgColor = isDark ? '#222222' : '#f5f5f5';

  settingsWindow = new BrowserWindow({
    title: '设置',
    backgroundColor: bgColor,
    width: 400,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false, // 禁止设置窗口全屏
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  settingsWindow.loadFile(path.join(__dirname, '../asset/settings.html'));

  // 调试用：打开开发者工具
  if (process.env.NODE_ENV === 'dev') {
    settingsWindow.webContents.openDevTools();
  }
}

ipcMain.on('get-settings', (event) => {
  const data: any = {
    autoFlipStep: 30,
    keepAwake: true,
    rememberLastPage: true
  };

  if (turnerManager) {
    data.autoFlipStep = turnerManager.autoFlipStep;
    data.keepAwake = turnerManager.keepAwake;
    data.rememberLastPage = turnerManager.rememberLastPage;
  }

  event.sender.send('send-settings', data);
});

ipcMain.on('update-settings', async (event, args) => {
  let changed = false;
  if (turnerManager) {
    if (args.autoFlipStep) {
      turnerManager.autoFlipStep = args.autoFlipStep;
      changed = true;
    }
    if (args.keepAwake !== undefined) {
      turnerManager.keepAwake = args.keepAwake;
      changed = true;
    }
    if (args.rememberLastPage !== undefined) {
      turnerManager.rememberLastPage = args.rememberLastPage;
      if (!turnerManager.rememberLastPage) {
        turnerManager.lastReaderUrl = null;
      }
      changed = true;
    }
  }

  if (changed) {
    await saveSettings();
    // 如果正在自动翻页，需要实时更新状态
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win !== settingsWindow && isInReader(win)) {
        if (turnerManager) turnerManager.setAutoFlipForState();
      }
    }
  }
});

function moveWindowToDisplay(win: BrowserWindow, d: Electron.Display) {
  const area = d.workArea || d.bounds;
  const wb = win.getBounds();
  const width = Math.min(wb.width, area.width);
  const height = Math.min(wb.height, area.height);
  const x = area.x + Math.floor((area.width - width) / 2);
  const y = area.y + Math.floor((area.height - height) / 2);
  win.setBounds({ x, y, width, height }, true);
  win.focus();
  setCNMenu(win);
}

function fillWindowToCurrentDisplay(win: BrowserWindow) {
  const wb = win.getBounds();
  const d = screen.getDisplayMatching(wb);
  const area = d.workArea || d.bounds;
  const margin = 8;
  const width = Math.max(100, area.width - margin * 2);
  const height = Math.max(100, area.height - margin * 2);
  const x = area.x + margin;
  const y = area.y + margin;
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds({ x, y, width, height }, true);
  win.focus();
}

function updateReaderWideMenuEnabled(win?: BrowserWindow) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const wideItem = menu.getMenuItemById(MENU_READER_WIDE_ID);
  const hideItem = menu.getMenuItemById(MENU_HIDE_TOOLBAR_ID);
  const autoItem = menu.getMenuItemById(MENU_AUTO_FLIP_ID);

  if (wideItem && pagerManager) {
    if (!win || win.isDestroyed()) {
      wideItem.enabled = false;
      (wideItem as any).checked = false;
    } else {
      const inReader = win.webContents.getURL().includes(READER_PATH);
      wideItem.enabled = inReader;
      (wideItem as any).checked = inReader ? pagerManager.readerWide : false;
    }
  }
  if (hideItem && pagerManager) {
    if (!win || win.isDestroyed()) {
      hideItem.enabled = false;
      (hideItem as any).checked = false;
    } else {
      const inReader = win.webContents.getURL().includes(READER_PATH);
      hideItem.enabled = inReader;
      (hideItem as any).checked = inReader ? pagerManager.hideToolbar : false;
    }
  }
  if (autoItem && turnerManager) {
    if (!win || win.isDestroyed()) {
      autoItem.enabled = false;
      (autoItem as any).checked = false;
    } else {
      const inReader = win.webContents.getURL().includes(READER_PATH);
      autoItem.enabled = inReader;
      (autoItem as any).checked = inReader ? turnerManager.autoFlip : false;
    }
  }

  // Update Full Screen Menu Item State
  const fsItem = menu.getMenuItemById(MENU_FULL_SCREEN_ID);
  if (fsItem) {
    if (!win || win.isDestroyed()) {
      fsItem.enabled = false;
      (fsItem as any).checked = false;
    } else {
      fsItem.enabled = true;
      (fsItem as any).checked = win.isFullScreen();
    }
  }
}

function setCNMenu(mainWindow: BrowserWindow | null) {
  const template: MenuItemConstructorOptions[] = [];
  const hasWindow = !!mainWindow && !mainWindow.isDestroyed();
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于' },
        {
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    });
  }

  template.push({
    label: '文件',
    submenu: [{ role: 'close', label: '关闭窗口' }],
  });

  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'delete', label: '删除' },
      { role: 'selectAll', label: '全选' },
    ],
  });

  template.push({
    label: '视图',
    submenu: [
      { label: '刷新', accelerator: 'CmdOrCtrl+R', enabled: hasWindow, click: () => { if (hasWindow) mainWindow!.webContents.reload(); } },
      { label: '返回', accelerator: 'CmdOrCtrl+[', enabled: hasWindow, click: () => { if (hasWindow && mainWindow!.webContents.canGoBack()) mainWindow!.webContents.goBack(); } },
      { label: '前进', accelerator: 'CmdOrCtrl+]', enabled: hasWindow, click: () => { if (hasWindow && mainWindow!.webContents.canGoForward()) mainWindow!.webContents.goForward(); } },
      { id: MENU_AUTO_FLIP_ID, type: 'checkbox', label: '自动翻页', accelerator: 'CmdOrCtrl+I', enabled: false, checked: turnerManager?.autoFlip || false, click: async (item) => { if (!hasWindow || !turnerManager) return; turnerManager.autoFlip = (item as any).checked; turnerManager.setAutoFlipForState(); updateReaderWideMenuEnabled(mainWindow!); } },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小', accelerator: 'CmdOrCtrl+0', enabled: hasWindow },
      { role: 'zoomIn', label: '放大', accelerator: 'CmdOrCtrl+=', enabled: hasWindow },
      { role: 'zoomOut', label: '缩小', accelerator: 'CmdOrCtrl+-', enabled: hasWindow },
      { type: 'separator' },
      {
        id: MENU_FULL_SCREEN_ID,
        type: 'checkbox',
        label: '切换全屏',
        accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
        enabled: hasWindow,
        checked: hasWindow ? mainWindow!.isFullScreen() : false,
        click: () => {
          if (hasWindow) {
            const isFull = mainWindow!.isFullScreen();
            mainWindow!.setFullScreen(!isFull);
            updateReaderWideMenuEnabled(mainWindow!);
          }
        }
      },
      { id: MENU_READER_WIDE_ID, type: 'checkbox', label: '阅读变宽', accelerator: 'CmdOrCtrl+9', enabled: false, checked: pagerManager?.readerWide || false, click: async (item) => { if (!hasWindow || !pagerManager) return; pagerManager.readerWide = (item as any).checked; await pagerManager.setReaderWidthForState(); await pagerManager.refreshReaderArea(); await saveSettings(); updateReaderWideMenuEnabled(mainWindow!); } },
      { id: MENU_HIDE_TOOLBAR_ID, type: 'checkbox', label: '隐藏工具栏', accelerator: 'CmdOrCtrl+O', enabled: false, checked: pagerManager?.hideToolbar || false, click: async (item) => { if (!hasWindow || !pagerManager) return; pagerManager.hideToolbar = (item as any).checked; await pagerManager.setToolbarForState(); await pagerManager.refreshReaderArea(); await saveSettings(); updateReaderWideMenuEnabled(mainWindow!); } },
      { label: '开发者工具', accelerator: 'Alt+CmdOrCtrl+I', enabled: hasWindow, click: () => { if (hasWindow) mainWindow!.webContents.toggleDevTools(); } },
    ],
  });

  template.push({
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化', enabled: hasWindow },
      isMac ? { role: 'zoom', label: '缩放', enabled: hasWindow } : { label: '缩放', enabled: hasWindow, click: () => { if (!hasWindow) return; mainWindow!.isMaximized() ? mainWindow!.unmaximize() : mainWindow!.maximize(); } },
      { label: '填充', accelerator: 'CmdOrCtrl+Alt+F', enabled: hasWindow, click: () => { if (hasWindow) fillWindowToCurrentDisplay(mainWindow!); } },
      ...(function () {
        if (!hasWindow) return [] as MenuItemConstructorOptions[];
        const displays = screen.getAllDisplays();
        const current = screen.getDisplayMatching(mainWindow!.getBounds());
        if (!displays || displays.length <= 1) return [] as MenuItemConstructorOptions[];
        const items: MenuItemConstructorOptions[] = [];
        for (let i = 0; i < displays.length; i++) {
          const d = displays[i];
          if (d.id === current.id) continue;
          const name = (d as any).name || (d as any).label;
          const title = name ? `移到 “${name}”` : `移到 显示器 ${i + 1}（${d.bounds.width}×${d.bounds.height}）`;
          items.push({
            label: title,
            click: () => {
              if (hasWindow) moveWindowToDisplay(mainWindow!, d);
            },
          });
        }
        if (items.length > 0) {
          const sep: MenuItemConstructorOptions = { type: 'separator' as 'separator' };
          return [sep, ...items];
        }
        return [] as MenuItemConstructorOptions[];
      })(),
    ],
  });

  template.push({
    label: '帮助',
    submenu: [
      { label: '微信读书官网', click: () => shell.openExternal('https://weread.qq.com/') },
    ],
  });

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  updateReaderWideMenuEnabled(mainWindow || undefined);
}

// 判断当前窗口是否处于“阅读页”
function isInReader(win: BrowserWindow) {
  if (win.isDestroyed()) return false;
  const url = win.webContents.getURL();
  return url.includes(READER_PATH);
}

const createWindow = async () => {
  // Load initial settings first
  const settings = await loadSettings();

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: '微信阅读',

    height: windowState.height || 800,
    width: windowState.width || 1280,
    x: windowState.x,
    y: windowState.y,

    autoHideMenuBar: process.env.NODE_ENV === 'dev' ? false : true,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 必须关闭上下文隔离，否则无法在页面中使用 require
      backgroundThrottling: false,
    },
    icon: isMac ? (app.isPackaged ? path.join(process.resourcesPath, 'icon.icns') : path.join(__dirname, '../build/app.icns')) : path.join(__dirname, '../build/icon.png'),
  });

  if (windowState.isMaximized) {
    // mainWindow.maximize(); // Handled by ProfileManager
  }
  if (windowState.isFullScreen) {
    // mainWindow.setFullScreen(true); // Handled by ProfileManager
  }

  // Initialize Managers immediately
  profileManager = new ProfileManager(mainWindow);
  pagerManager = new PagerManager(mainWindow);
  turnerManager = new TurnerManager(mainWindow);

  // Restore window state
  if (profileManager) {
    profileManager.windowState = windowState;
    profileManager.restoreWindowState();
  }

  // Manually populate managers from settings object (since they were null during first loadSettings)
  if (settings) {
    if (pagerManager) {
      pagerManager.readerWide = !!settings.readerWide;
      pagerManager.hideToolbar = !!settings.hideToolbar;
    }
    if (turnerManager) {
      if (settings.autoFlipStep) turnerManager.autoFlipStep = parseInt(settings.autoFlipStep, 10);
      if (settings.keepAwake !== undefined) turnerManager.keepAwake = !!settings.keepAwake;
      turnerManager.rememberLastPage = settings.rememberLastPage !== undefined ? !!settings.rememberLastPage : true;
      if (turnerManager.rememberLastPage && settings.lastReaderUrl) {
        turnerManager.lastReaderUrl = settings.lastReaderUrl;
      }
    }
  }

  // Navigate based on populated state
  if (turnerManager && turnerManager.rememberLastPage && turnerManager.lastReaderUrl) {
    mainWindow.loadURL(turnerManager.lastReaderUrl);
  } else {
    mainWindow.loadURL('https://weread.qq.com/');
  }

  // Apply initial state
  if (pagerManager) pagerManager.applyState();
  if (turnerManager) turnerManager.setAutoFlipForState();
  updateReaderWideMenuEnabled(mainWindow);

  app.setName('微信阅读');
  setCNMenu(mainWindow);

  updateReaderWideMenuEnabled(mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    if (pagerManager) pagerManager.applyState();
    if (turnerManager) turnerManager.setAutoFlipForState();
    updateReaderWideMenuEnabled(mainWindow);

    if (profileManager) profileManager.injectScript();
  });

  mainWindow.webContents.on('did-navigate-in-page', (_e, url) => {
    if (url.includes(READER_PATH)) {
      if (pagerManager) pagerManager.applyState();
      if (turnerManager) turnerManager.setAutoFlipForState();
    }
    if (!url.includes(READER_PATH)) {
      if (turnerManager) turnerManager.stop();
    }
    if (profileManager) profileManager.updateVisibility(true);
    updateReaderWideMenuEnabled(mainWindow);
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (turnerManager) turnerManager.handleInput(input);
  });

  screen.on('display-added', () => setCNMenu(mainWindow));
  screen.on('display-removed', () => setCNMenu(mainWindow));
  screen.on('display-metrics-changed', () => setCNMenu(mainWindow));

  mainWindow.on('close', async () => {
    // 保存窗口状态
    if (profileManager) {
      profileManager.saveWindowState();
    }

    // 检查是否在阅读页，并保存状态
    if (!mainWindow.isDestroyed() && turnerManager) {
      turnerManager.checkAndSaveUrl();
      await saveSettings();
    }

    setCNMenu(null);
    updateReaderWideMenuEnabled(undefined);
    if (profileManager) profileManager.dispose();
    if (turnerManager) turnerManager.dispose();
  });

  mainWindow.on('enter-full-screen', () => {
    updateReaderWideMenuEnabled(mainWindow);
  });

  mainWindow.on('leave-full-screen', () => {
    updateReaderWideMenuEnabled(mainWindow);
  });

  // Open the DevTools.
  process.env.NODE_ENV === 'dev' && mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (isMac) {
    const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.icns') : path.join(__dirname, '../build/app.icns');
    const img = nativeImage.createFromPath(iconPath);
    app.dock.setIcon(img);
    app.setAboutPanelOptions({
      applicationName: '微信阅读',
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2025 - dengcb',
    });
  }
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  } else {
    setCNMenu(null);
    updateReaderWideMenuEnabled(undefined);
  }
});

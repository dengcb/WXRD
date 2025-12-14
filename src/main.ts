import * as dotenv from 'dotenv';
import { app, BrowserWindow, nativeImage, screen, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ProfileManager } from './profile_manager';
import { PagerManager } from './pager_manager';
import { TurnerManager } from './turner_manager';
import { ThemeManager } from './theme_manager';
import { MenuManager } from './menu_manager';

dotenv.config();

const isMac = process.platform === 'darwin';

const READER_PATH = '/web/reader/';

let settingsPath: string | null = null;
let settingsWindow: BrowserWindow | null = null;
let windowState: { x?: number; y?: number; width?: number; height?: number; isMaximized?: boolean; isFullScreen?: boolean } = {};

// Managers
let pagerManager: PagerManager | null = null;
let turnerManager: TurnerManager | null = null;
let profileManager: ProfileManager | null = null;
let themeManager: ThemeManager | null = null;
let menuManager: MenuManager | null = null;

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

ipcMain.on('get-reading-settings-sync', (event) => {
  event.returnValue = {
    readerWide: pagerManager ? pagerManager.readerWide : false,
    hideToolbar: pagerManager ? pagerManager.hideToolbar : false
  };
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
    menuManager?.updateReaderWideMenuEnabled();
  }
});

// Menu functions removed - logic moved to MenuManager


// 判断当前窗口是否处于“阅读页”
function isInReader(win: BrowserWindow) {
  if (win.isDestroyed()) return false;
  const url = win.webContents.getURL();
  return url.includes(READER_PATH);
}

const createWindow = async () => {
  // Load initial settings first
  const settings = await loadSettings();

  const isDark = nativeTheme.shouldUseDarkColors;
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: '微信阅读',
    backgroundColor: bgColor,

    height: windowState.height || 800,
    width: windowState.width || 1280,
    x: windowState.x,
    y: windowState.y,

    autoHideMenuBar: process.env.NODE_ENV === 'dev' ? false : true,
    show: false, // Prevent white flash on startup by waiting for ready-to-show

    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true, // Enable Context Isolation for security and clean environment
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: isMac ? (app.isPackaged ? path.join(process.resourcesPath, 'icon.icns') : path.join(__dirname, '../build/app.icns')) : path.join(__dirname, '../build/icon.png'),
  });

  // Spoof User Agent to look like a regular Chrome browser
  // This prevents the website from detecting Electron and serving incompatible code (hydration errors)
  const originalUserAgent = mainWindow.webContents.getUserAgent();
  const cleanUserAgent = originalUserAgent.replace(/Electron\/[0-9\.]+\s/, '').replace(/wx-read-desktop\/[0-9\.]+\s/, '');
  mainWindow.webContents.setUserAgent(cleanUserAgent);

  mainWindow.setMenuBarVisibility(false);

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
  themeManager = new ThemeManager(mainWindow);
  menuManager = new MenuManager(createSettingsWindow, saveSettings);
  menuManager.setWindow(mainWindow);
  menuManager.setManagers(pagerManager, turnerManager);

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
  menuManager?.updateReaderWideMenuEnabled();

  app.setName('微信阅读');
  menuManager?.setCNMenu();

  menuManager?.updateReaderWideMenuEnabled();

  // Show window only when it's ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Re-apply maximization if needed, as show() might reset or ignore it depending on OS
    if (windowState.isMaximized) {
      // mainWindow.maximize(); 
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pagerManager) pagerManager.applyState();
    if (turnerManager) turnerManager.setAutoFlipForState();
    menuManager?.updateReaderWideMenuEnabled();

    if (profileManager) profileManager.injectScript();
    if (themeManager) themeManager.handleDidFinishLoad();
  });

  mainWindow.webContents.on('dom-ready', () => {
    if (themeManager) themeManager.handleDidStartNavigation();
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
    if (themeManager) themeManager.updateTheme();
    menuManager?.updateReaderWideMenuEnabled();
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (turnerManager) turnerManager.handleInput(input);
  });

  screen.on('display-added', () => menuManager?.setCNMenu());
  screen.on('display-removed', () => menuManager?.setCNMenu());
  screen.on('display-metrics-changed', () => menuManager?.setCNMenu());

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

    if (menuManager) {
      menuManager.setWindow(null);
      menuManager.setCNMenu();
      menuManager.updateReaderWideMenuEnabled();
    }
    if (profileManager) profileManager.dispose();
    if (turnerManager) turnerManager.dispose();
  });

  mainWindow.on('enter-full-screen', () => {
    menuManager?.updateReaderWideMenuEnabled();
  });

  mainWindow.on('leave-full-screen', () => {
    menuManager?.updateReaderWideMenuEnabled();
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
    if (menuManager) {
      menuManager.setWindow(null);
      menuManager.setCNMenu();
      menuManager.updateReaderWideMenuEnabled();
    }
  }
});

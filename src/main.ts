import * as dotenv from 'dotenv';
import { app, BrowserWindow, nativeImage, screen, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ProfileManager } from './profile_manager';
import { PagerManager } from './pager_manager';
import { TurnerManager } from './turner_manager';
import { ThemeManager } from './theme_manager';
import { MenuManager } from './menu_manager';
import { UpdateManager } from './update_manager';
import { IPCManager } from './ipc_manager';

// 屏蔽 Electron 安全警告（控制台）
// 因为我们需要加载第三方网页（微信读书），无法强制实施严格的 CSP（如禁止 unsafe-eval），
// 且该警告仅在开发环境下显示，打包后会自动消失。
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

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
let updateManager: UpdateManager | null = null;
let ipcManager: IPCManager | null = null;

// 标记是否是首次启动 APP
let isAppFirstLaunch = true;

async function loadSettings() {
  try {
    settingsPath = path.join(app.getPath('userData'), 'wxrd-settings.json');
    const txt = await fs.promises.readFile(settingsPath, 'utf8');
    const obj = JSON.parse(txt);

    if (obj.windowState) {
      windowState = obj.windowState;
    }

    if (pagerManager) {
      pagerManager.restoreSettings(obj);
    }
    if (turnerManager) {
      if (obj.autoFlipStep) turnerManager.autoFlipStep = parseInt(obj.autoFlipStep, 10);
      if (obj.keepAwake !== undefined) turnerManager.keepAwake = !!obj.keepAwake;

      turnerManager.rememberLastPage = obj.rememberLastPage !== undefined ? !!obj.rememberLastPage : true;
      if (turnerManager.rememberLastPage && obj.lastReaderUrl) {
        turnerManager.lastReaderUrl = obj.lastReaderUrl;
      }
    }
    if (updateManager) {
      if (obj.autoCheckUpdate !== undefined) updateManager.autoCheck = !!obj.autoCheckUpdate;
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
      Object.assign(obj, pagerManager.getSettings());
    }
    if (turnerManager) {
      obj.autoFlipStep = turnerManager.autoFlipStep;
      obj.keepAwake = turnerManager.keepAwake;
      obj.rememberLastPage = turnerManager.rememberLastPage;
      if (turnerManager.rememberLastPage && turnerManager.lastReaderUrl) {
        obj.lastReaderUrl = turnerManager.lastReaderUrl;
      }
    }
    if (updateManager) {
      obj.autoCheckUpdate = updateManager.autoCheck;
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

  // 设置固定的 User Agent，确保完全模拟 Chrome 浏览器，避免被识别为 Electron
  // 这有助于解决部分样式文件加载 404 或被拦截的问题
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  mainWindow.webContents.setUserAgent(userAgent);

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 允许打开传书页，但强制在当前窗口加载
    if (details.url.includes('/web/upload')) {
      mainWindow.loadURL(details.url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
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
  themeManager = new ThemeManager(mainWindow);
  updateManager = new UpdateManager();

  // Initialize IPC Manager
  ipcManager = new IPCManager(
    mainWindow,
    pagerManager,
    turnerManager,
    profileManager,
    null, // menuManager not created yet
    saveSettings
  );
  ipcManager.registerListeners();

  // Wire up callbacks
  updateManager.setOnStateChange(() => {
    menuManager?.updateUpdateMenuItem();
  });
  updateManager.setOnSettingsChange(async () => {
    await saveSettings();
  });

  // Check for updates quietly on startup
  // We do this AFTER loading settings in createWindow, but wait...
  // createWindow calls loadSettings. updateManager is created in createWindow.
  // BUT we need to call checkUpdate AFTER settings are loaded to respect autoCheck preference.
  // In createWindow(), loadSettings() is called at the start. Then updateManager is created.
  // Then we manually populate managers.
  // So by the time we call checkUpdate below, autoCheck should be set correctly IF we populate it.

  menuManager = new MenuManager(createSettingsWindow, saveSettings);
  menuManager.setWindow(mainWindow);
  menuManager.setManagers(pagerManager, turnerManager, updateManager);

  if (ipcManager) {
    ipcManager.updateMenuManager(menuManager);
  }

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
    if (updateManager) {
      if (settings.autoCheckUpdate !== undefined) updateManager.autoCheck = !!settings.autoCheckUpdate;
    }
  }

  // Check update after settings are loaded
  if (updateManager) {
    updateManager.checkUpdate(false);
  }

  // Navigate based on populated state
  // 仅在 APP 首次启动时加载上次阅读进度，避免在窗口重载或重建时干扰
  if (isAppFirstLaunch && turnerManager && turnerManager.rememberLastPage && turnerManager.lastReaderUrl) {
    mainWindow.loadURL(turnerManager.lastReaderUrl);
  } else {
    mainWindow.loadURL('https://weread.qq.com/');
  }
  isAppFirstLaunch = false;

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
    if (pagerManager) {
      pagerManager.dispose();
    }
    if (turnerManager) turnerManager.dispose();
    if (ipcManager) ipcManager.dispose();
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

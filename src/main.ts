import * as dotenv from 'dotenv';
import { app, BrowserWindow, BrowserView, Menu, shell, MenuItemConstructorOptions, nativeImage, screen } from 'electron';
import * as path from 'path';

dotenv.config();

const isMac = process.platform === 'darwin';

const READER_PATH = '/web/reader/';
const MENU_READER_WIDE_ID = 'menu-reader-wide';
const readerCss = `
  .readerTopBar,
  .readerChapterContent {
    width: 95% !important;
  }
`;
let readerWide = false;
let readerCssKey: string | null = null;
async function setReaderWidthForState(win: BrowserWindow) {
  const url = win.webContents.getURL();
  if (!url.includes(READER_PATH)) return;
  if (readerCssKey) {
    try {
      await win.webContents.removeInsertedCSS(readerCssKey);
    } catch { }
    readerCssKey = null;
  }
  if (readerWide) {
    const key = await win.webContents.insertCSS(readerCss);
    readerCssKey = key;
  }
}

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
  const item = menu.getMenuItemById(MENU_READER_WIDE_ID);
  if (!item) return;
  if (!win || win.isDestroyed()) {
    item.enabled = false;
    return;
  }
  const url = win.webContents.getURL();
  item.enabled = url.includes(READER_PATH);
}

function setCNMenu(mainWindow: BrowserWindow | null) {
  const template: MenuItemConstructorOptions[] = [];
  const hasWindow = !!mainWindow && !mainWindow.isDestroyed();
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于' },
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
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小', accelerator: 'CmdOrCtrl+0', enabled: hasWindow },
      { role: 'zoomIn', label: '放大', accelerator: 'CmdOrCtrl+=', enabled: hasWindow },
      { role: 'zoomOut', label: '缩小', accelerator: 'CmdOrCtrl--', enabled: hasWindow },
      { type: 'separator' },
      isMac ? { role: 'togglefullscreen', label: '切换全屏', enabled: hasWindow } : { label: '切换全屏', accelerator: 'F11', enabled: hasWindow, click: () => { if (hasWindow) { const isFull = mainWindow!.isFullScreen(); mainWindow!.setFullScreen(!isFull); } } },
      { id: MENU_READER_WIDE_ID, label: '阅读变宽', accelerator: 'CmdOrCtrl+9', enabled: false, click: async () => { if (!hasWindow) return; readerWide = !readerWide; await setReaderWidthForState(mainWindow!); } },
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
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: '微信阅读',

    height: 800,
    width: 1280,

    autoHideMenuBar: process.env.NODE_ENV === 'dev' ? false : true,

    webPreferences: {
      nodeIntegration: true,
    },
    icon: isMac ? (app.isPackaged ? path.join(process.resourcesPath, 'icon.icns') : path.join(__dirname, '../build/app.icns')) : path.join(__dirname, '../build/icon.png'),
  });

  mainWindow.loadURL('https://weread.qq.com/');

  app.setName('微信阅读');
  setCNMenu(mainWindow);

  updateReaderWideMenuEnabled(mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    setReaderWidthForState(mainWindow);
    updateReaderWideMenuEnabled(mainWindow);
  });

  mainWindow.webContents.on('did-navigate-in-page', (_e, url) => {
    if (url.includes(READER_PATH)) {
      setReaderWidthForState(mainWindow);
    }
    updateReaderWideMenuEnabled(mainWindow);
  });

  screen.on('display-added', () => setCNMenu(mainWindow));
  screen.on('display-removed', () => setCNMenu(mainWindow));
  screen.on('display-metrics-changed', () => setCNMenu(mainWindow));

  mainWindow.on('closed', () => {
    setCNMenu(null);
    updateReaderWideMenuEnabled(undefined);
  });

  // Open the DevTools.
  process.env.NODE_ENV === 'dev' && mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (isMac) {
    const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.icns') : path.join(__dirname, '../build/app.icns');
    const img = nativeImage.createFromPath(iconPath);
    app.dock.setIcon(img);
    app.setAboutPanelOptions({
      applicationName: '微信阅读',
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2025 - Binghuan Zhang',
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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

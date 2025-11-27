import * as dotenv from 'dotenv';
import { app, BrowserWindow, BrowserView, Menu, shell, MenuItemConstructorOptions, nativeImage } from 'electron';
import * as path from 'path';

dotenv.config();

const isMac = process.platform === 'darwin';

const READER_PATH = '/web/reader/';
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

function setCNMenu(mainWindow: BrowserWindow) {
  const template: MenuItemConstructorOptions[] = [];
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
      { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.webContents.reload() },
      { label: '返回', accelerator: 'CmdOrCtrl+[', click: () => { if (mainWindow.webContents.canGoBack()) mainWindow.webContents.goBack(); } },
      { label: '前进', accelerator: 'CmdOrCtrl+]', click: () => { if (mainWindow.webContents.canGoForward()) mainWindow.webContents.goForward(); } },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小', accelerator: 'CmdOrCtrl+0' },
      { role: 'zoomIn', label: '放大', accelerator: 'CmdOrCtrl+=' },
      { role: 'zoomOut', label: '缩小', accelerator: 'CmdOrCtrl+-' },
      { type: 'separator' },
      isMac ? { role: 'togglefullscreen', label: '切换全屏' } : { label: '切换全屏', accelerator: 'F11', click: () => { const isFull = mainWindow.isFullScreen(); mainWindow.setFullScreen(!isFull); } },
      { label: '阅读变宽', accelerator: 'CmdOrCtrl+9', click: async () => { readerWide = !readerWide; await setReaderWidthForState(mainWindow); } },
      { label: '开发者工具', accelerator: 'Alt+CmdOrCtrl+I', click: () => mainWindow.webContents.toggleDevTools() },
    ],
  });

  template.push({
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'close', label: '关闭' },
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
    icon: isMac ? path.join(__dirname, '../build/app.icns') : path.join(__dirname, '../build/icon.png'),
  });

  mainWindow.loadURL('https://weread.qq.com/');

  app.setName('微信阅读');
  setCNMenu(mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    setReaderWidthForState(mainWindow);
  });

  mainWindow.webContents.on('did-navigate-in-page', (_e, url) => {
    if (url.includes(READER_PATH)) {
      setReaderWidthForState(mainWindow);
    }
  });

  // Open the DevTools.
  process.env.NODE_ENV === 'dev' && mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (isMac) {
    const iconPath = path.join(__dirname, '../build/app.icns');
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
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

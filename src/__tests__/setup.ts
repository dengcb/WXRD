console.log("Setup file loaded!");

import { mock } from "bun:test";

const mockIpcMain = {
  on: mock(),
  removeListener: mock(),
  removeHandler: mock(),
  removeAllListeners: mock(),
};

const mockBrowserWindow = {
  getAllWindows: mock(() => []),
  fromWebContents: mock(() => ({ id: 1 })),
};

const mockMenuItem = {
  enabled: true,
  checked: false,
  label: '',
};

const mockMenuInstance = {
  getMenuItemById: mock((id: string) => mockMenuItem),
  items: []
};

const mockMenu = {
  buildFromTemplate: mock((template: any) => ({
    ...mockMenuInstance,
    items: template
  })),
  setApplicationMenu: mock((menu: any) => {
    (mockMenu as any)._currentMenu = menu;
  }),
  getApplicationMenu: mock(() => (mockMenu as any)._currentMenu || mockMenuInstance),
  _currentMenu: null
};

const mockPowerSaveBlocker = {
  start: mock(() => 1),
  stop: mock(),
  isStarted: mock(() => false),
};

const mockDialog = {
  showMessageBox: mock(async () => ({ response: 0, checkboxChecked: false })),
  showErrorBox: mock(),
};

const mockAutoUpdater = {
  autoDownload: false,
  logger: null,
  on: mock(),
  checkForUpdates: mock(),
  quitAndInstall: mock(),
};

mock.module("electron", () => {
  console.log("Mocking electron module");
  const electronMock = {
    ipcMain: mockIpcMain,
    BrowserWindow: mockBrowserWindow,
    Menu: mockMenu,
    MenuItem: class { },
    powerSaveBlocker: mockPowerSaveBlocker,
    dialog: mockDialog,
    shell: { openExternal: mock() },
    app: {
      getPath: () => '/tmp',
      getName: () => 'WXRD',
      getVersion: () => '1.0.0',
      isPackaged: true,
    },
    nativeTheme: {
      shouldUseDarkColors: false,
    },
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1000, height: 800 } }),
      getAllDisplays: () => [],
      getDisplayMatching: () => ({ id: 1, bounds: { width: 1000, height: 800 } }),
    },
  };

  return {
    ...electronMock,
    default: electronMock
  };
});

mock.module("electron-updater", () => {
  console.log("Mocking electron-updater module");
  const exports = {
    autoUpdater: mockAutoUpdater
  };
  return {
    ...exports,
    default: exports
  };
});

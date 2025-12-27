import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import electron from "electron";
const { ipcMain } = electron;
import { IPCManager } from "../ipc_manager";

describe("IPCManager", () => {
  let ipcManager: IPCManager;
  let mockWindow: any;
  let mockPagerManager: any;
  let mockTurnerManager: any;
  let mockProfileManager: any;
  let mockMenuManager: any;
  let mockSaveSettings: any;

  beforeEach(() => {
    // Reset mocks
    (ipcMain.on as any).mockClear();
    (ipcMain.removeListener as any).mockClear();

    // Create mock dependencies
    mockWindow = {
      id: 1,
      isDestroyed: () => false,
      webContents: {
        getURL: () => "https://weread.qq.com/web/reader/123", // In reader
        send: mock(),
      }
    };

    mockPagerManager = {
      readerWide: false,
      hideToolbar: false,
    };

    mockTurnerManager = {
      autoFlipStep: 30,
      keepAwake: true,
      rememberLastPage: true,
      lastReaderUrl: null,
      setAutoFlipForState: mock(),
      handleSwipeKey: mock(),
    };

    mockProfileManager = {
      updateVisibility: mock(),
    };

    mockMenuManager = {
      updateReaderWideMenuEnabled: mock(),
    };

    mockSaveSettings = mock(async () => { });

    // Instantiate
    ipcManager = new IPCManager(
      mockWindow,
      mockPagerManager,
      mockTurnerManager,
      mockProfileManager,
      mockMenuManager,
      mockSaveSettings
    );
  });

  afterEach(() => {
    // Clean up
    ipcManager.dispose();
  });

  it("should register listeners on init (via registerListeners)", () => {
    ipcManager.registerListeners();

    // Verify key channels are registered
    expect(ipcMain.on).toHaveBeenCalledWith('get-settings', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('update-settings', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('get-reading-settings-sync', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('simulate-swipe-key', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('reader-mousemove', expect.any(Function));
  });

  it("should remove listeners on dispose", () => {
    ipcManager.dispose();

    // Verify removal
    expect(ipcMain.removeListener).toHaveBeenCalledWith('get-settings', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('update-settings', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('get-reading-settings-sync', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('simulate-swipe-key', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('reader-mousemove', expect.any(Function));
  });

  it("should handle 'get-settings' correctly", () => {
    ipcManager.registerListeners();

    // Find the handler
    const call = (ipcMain.on as any).mock.calls.find((c: any) => c[0] === 'get-settings');
    const handler = call[1];

    const mockEvent = {
      sender: {
        send: mock()
      }
    };

    // Execute handler
    handler(mockEvent);

    // Verify response
    expect(mockEvent.sender.send).toHaveBeenCalledWith('send-settings', {
      autoFlipStep: 30,
      keepAwake: true,
      rememberLastPage: true
    });
  });

  it("should handle 'update-settings' and trigger save + updates", async () => {
    ipcManager.registerListeners();

    const call = (ipcMain.on as any).mock.calls.find((c: any) => c[0] === 'update-settings');
    const handler = call[1];

    const mockEvent = {};
    const newSettings = { autoFlipStep: 60 };

    // Execute handler
    await handler(mockEvent, newSettings);

    // Verify turner manager updated
    expect(mockTurnerManager.autoFlipStep).toBe(60);
    // Verify save called
    expect(mockSaveSettings).toHaveBeenCalled();
    // Verify menu updated
    expect(mockMenuManager.updateReaderWideMenuEnabled).toHaveBeenCalled();
  });

  it("should handle 'get-reading-settings-sync' correctly", () => {
    ipcManager.registerListeners();

    const call = (ipcMain.on as any).mock.calls.find((c: any) => c[0] === 'get-reading-settings-sync');
    const handler = call[1];

    const mockEvent = { returnValue: null as any };

    // Setup pager manager state
    mockPagerManager.readerWide = true;
    mockPagerManager.hideToolbar = true;

    // Execute
    handler(mockEvent);

    // Verify return value
    expect(mockEvent.returnValue).toEqual({
      readerWide: true,
      hideToolbar: true
    });
  });

  it("should handle 'simulate-swipe-key' by delegating to TurnerManager", () => {
    ipcManager.registerListeners();

    const call = (ipcMain.on as any).mock.calls.find((c: any) => c[0] === 'simulate-swipe-key');
    const handler = call[1];

    const mockEvent = {};
    const key = 'ArrowLeft';

    handler(mockEvent, key);

    expect(mockTurnerManager.handleSwipeKey).toHaveBeenCalledWith(mockEvent, key);
  });
});

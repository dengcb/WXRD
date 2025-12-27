import { describe, it, expect, mock, beforeEach } from "bun:test";
import { PagerManager } from "../pager_manager";

describe("PagerManager", () => {
  let pagerManager: PagerManager;
  let mockWindow: any;

  beforeEach(() => {
    mockWindow = {
      isDestroyed: () => false,
      webContents: {
        getURL: mock(() => "https://weread.qq.com/web/reader/123"),
        send: mock(),
      }
    };
    pagerManager = new PagerManager(mockWindow);
  });

  it("should initialize with default values", () => {
    expect(pagerManager.readerWide).toBe(false);
    expect(pagerManager.hideToolbar).toBe(false);
  });

  it("should restore settings correctly", () => {
    pagerManager.restoreSettings({ readerWide: true, hideToolbar: true });
    expect(pagerManager.readerWide).toBe(true);
    expect(pagerManager.hideToolbar).toBe(true);
  });

  it("should get settings correctly", () => {
    pagerManager.readerWide = true;
    pagerManager.hideToolbar = true;
    const settings = pagerManager.getSettings();
    expect(settings).toEqual({ readerWide: true, hideToolbar: true });
  });

  it("should send reader width update via IPC if in reader", async () => {
    pagerManager.readerWide = true;
    await pagerManager.setReaderWidthForState();
    
    expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-reading-style', { readerWide: true });
  });

  it("should send toolbar visibility update via IPC if in reader", async () => {
    pagerManager.hideToolbar = true;
    await pagerManager.setToolbarForState();

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('update-reading-style', { hideToolbar: true });
  });

  it("should NOT send updates if not in reader", async () => {
    // Override getURL to return non-reader URL
    mockWindow.webContents.getURL = mock(() => "https://weread.qq.com/other");
    
    pagerManager.readerWide = true;
    await pagerManager.setReaderWidthForState();
    
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });
});

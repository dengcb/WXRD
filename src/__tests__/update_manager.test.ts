import { describe, it, expect, mock, beforeEach } from "bun:test";
import { autoUpdater } from "electron-updater";
import electron from "electron";
import { UpdateManager } from "../update_manager";

describe("UpdateManager", () => {
  let updateManager: UpdateManager;

  beforeEach(() => {
    // Reset mocks
    (autoUpdater.checkForUpdates as any).mockClear();
    (autoUpdater.quitAndInstall as any).mockClear();
    (autoUpdater.on as any).mockClear();
    (electron.dialog.showErrorBox as any).mockClear();

    updateManager = new UpdateManager();
  });

  it("should initialize with default state", () => {
    expect(updateManager.state).toBe('idle');
    expect(updateManager.autoCheck).toBe(true);
    expect(autoUpdater.autoDownload).toBe(true);
  });

  it("should check for updates manually", () => {
    updateManager.checkUpdate(true);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it("should skip auto check if disabled", () => {
    updateManager.autoCheck = false;
    updateManager.checkUpdate(false); // Auto check
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("should call quitAndInstall when requested", () => {
    updateManager.quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it("should show friendly error message for GitHub 404 error", () => {
    // 1. Trigger manual check to enable error dialog
    updateManager.checkUpdate(true);

    // 2. Simulate error
    const error = new Error("HttpError: 404 \n Error: Cannot find latest-mac.yml");

    // Find the 'error' event handler registered in UpdateManager constructor
    const errorCall = (autoUpdater.on as any).mock.calls.find((c: any) => c[0] === 'error');
    expect(errorCall).toBeDefined();

    const errorHandler = errorCall[1];
    errorHandler(error);

    // 3. Verify dialog
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
      '检查更新失败',
      '更新服务尚未就绪，请稍后再试'
    );
  });
});

import electron from 'electron';
const { ipcMain } = electron;
import type { IpcMainEvent, BrowserWindow } from 'electron';
import { PagerManager } from './pager_manager';
import { TurnerManager } from './turner_manager';
import { ProfileManager } from './profile_manager';
import { MenuManager } from './menu_manager';

/**
 * IPCManager: Centralized manager for all IPC listeners.
 * Ensures single source of truth for IPC channels and proper lifecycle management.
 */
export class IPCManager {
  private window: BrowserWindow;
  private pagerManager: PagerManager;
  private turnerManager: TurnerManager;
  private profileManager: ProfileManager;
  private menuManager: MenuManager | null;
  private saveSettings: () => Promise<void>;
  private readonly READER_PATH = '/web/reader/';

  constructor(
    win: BrowserWindow,
    pagerManager: PagerManager,
    turnerManager: TurnerManager,
    profileManager: ProfileManager,
    menuManager: MenuManager | null,
    saveSettings: () => Promise<void>
  ) {
    this.window = win;
    this.pagerManager = pagerManager;
    this.turnerManager = turnerManager;
    this.profileManager = profileManager;
    this.menuManager = menuManager;
    this.saveSettings = saveSettings;
  }

  public registerListeners() {
    this.removeListeners(); // Safety first

    // 1. Settings Window Communication
    ipcMain.on('get-settings', this.handleGetSettings);
    ipcMain.on('update-settings', this.handleUpdateSettings);

    // 2. Reading Style Sync (Preload)
    ipcMain.on('get-reading-settings-sync', this.handleGetReadingSettingsSync);

    // 3. Interaction Simulation (Turner)
    ipcMain.on('simulate-swipe-key', this.handleSimulateSwipeKey);

    // 4. Cursor Visibility (Profile)
    ipcMain.on('reader-mousemove', this.handleReaderMouseMove);
  }

  public dispose() {
    this.removeListeners();
  }

  private removeListeners() {
    ipcMain.removeListener('get-settings', this.handleGetSettings);
    ipcMain.removeListener('update-settings', this.handleUpdateSettings);
    ipcMain.removeListener('get-reading-settings-sync', this.handleGetReadingSettingsSync);
    ipcMain.removeListener('simulate-swipe-key', this.handleSimulateSwipeKey);
    ipcMain.removeListener('reader-mousemove', this.handleReaderMouseMove);
  }

  // --- Handlers ---

  private handleGetSettings = (event: IpcMainEvent) => {
    const data: any = {
      autoFlipStep: this.turnerManager.autoFlipStep,
      keepAwake: this.turnerManager.keepAwake,
      rememberLastPage: this.turnerManager.rememberLastPage
    };
    event.sender.send('send-settings', data);
  };

  private handleUpdateSettings = async (_event: IpcMainEvent, args: any) => {
    let changed = false;

    if (args.autoFlipStep) {
      this.turnerManager.autoFlipStep = args.autoFlipStep;
      changed = true;
    }
    if (args.keepAwake !== undefined) {
      this.turnerManager.keepAwake = args.keepAwake;
      changed = true;
    }
    if (args.rememberLastPage !== undefined) {
      this.turnerManager.rememberLastPage = args.rememberLastPage;
      if (!this.turnerManager.rememberLastPage) {
        this.turnerManager.lastReaderUrl = null;
      }
      changed = true;
    }

    if (changed) {
      await this.saveSettings();

      // Update state for all relevant windows
      const wins = electron.BrowserWindow.getAllWindows();
      for (const win of wins) {
        // Skip settings window (approximate check, or check title/url if needed, 
        // but setAutoFlipForState handles destroyed windows safely)
        // Ideally we check if it's a reader window.
        if (this.isInReader(win)) {
          this.turnerManager.setAutoFlipForState();
        }
      }
      this.menuManager?.updateReaderWideMenuEnabled();
    }
  };

  private handleGetReadingSettingsSync = (event: IpcMainEvent) => {
    event.returnValue = {
      readerWide: this.pagerManager.readerWide,
      hideToolbar: this.pagerManager.hideToolbar
    };
  };

  private handleSimulateSwipeKey = (event: IpcMainEvent, key: string) => {
    this.turnerManager.handleSwipeKey(event, key);
  };

  private handleReaderMouseMove = (event: IpcMainEvent) => {
    // Ensure message comes from the managed window
    const w = electron.BrowserWindow.fromWebContents(event.sender);
    if (w && w.id === this.window.id) {
      this.profileManager.updateVisibility();
    }
  };

  private isInReader(win: BrowserWindow): boolean {
    if (win.isDestroyed()) return false;
    try {
      const url = win.webContents.getURL();
      return url.includes(this.READER_PATH);
    } catch {
      return false;
    }
  }

  public updateMenuManager(menuManager: MenuManager) {
    this.menuManager = menuManager;
  }
}

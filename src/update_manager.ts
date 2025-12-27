import electron from 'electron';
const { app, dialog } = electron;
import { autoUpdater } from 'electron-updater';

export class UpdateManager {
  private manualCheck = false;

  // State for menu UI
  public state: 'idle' | 'checking' | 'downloading' | 'downloaded' = 'idle';
  public autoCheck = true; // Default to true

  private listeners: (() => void)[] = [];
  private onSettingsChangeCallback: (() => Promise<void>) | null = null;

  constructor() {
    // 设置自动下载，但下载完成后不会自动安装，需要调用 quitAndInstall
    autoUpdater.autoDownload = true;
    autoUpdater.logger = console;

    this.setupListeners();
  }

  public setOnStateChange(callback: () => void) {
    this.listeners.push(callback);
  }

  public setOnSettingsChange(callback: () => Promise<void>) {
    this.onSettingsChangeCallback = callback;
  }

  private updateState(newState: 'idle' | 'checking' | 'downloading' | 'downloaded') {
    this.state = newState;
    this.listeners.forEach(listener => listener());
  }

  private setupListeners() {
    autoUpdater.on('error', (error) => {
      console.error('Update error:', error);
      this.updateState('idle');
      if (this.manualCheck) {
        let message = error == null ? "unknown" : (error.stack || error).toString();

        // 优化 404 错误提示，避免直接展示晦涩的堆栈信息
        if ((message.includes('HttpError: 404') || message.includes('Cannot find')) && message.includes('.yml')) {
          message = '更新服务尚未就绪，请稍后再试';
        } else if (message.includes('net::ERR_CONNECTION_TIMED_OUT') || message.includes('net::ERR_INTERNET_DISCONNECTED')) {
          message = '检查更新失败：网络连接问题，请检查您的网络设置。';
        }

        dialog.showErrorBox('检查更新失败', message);
        this.manualCheck = false;
      }
    });

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      this.updateState('checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info);
      this.updateState('downloading');

      // If manual check, we rely on the menu state change to indicate "Downloading..."
      // No popup needed per user request.
      this.manualCheck = false;
    });

    autoUpdater.on('update-not-available', async (info) => {
      console.log('Update not available:', info);
      this.updateState('idle');

      if (this.manualCheck) {
        const result = await dialog.showMessageBox({
          type: 'info',
          title: '检查更新',
          message: `当前已是最新版本 (v${info.version})。`,
          buttons: ['好的'],
          checkboxLabel: '自动后台更新',
          checkboxChecked: this.autoCheck
        });

        // Update setting if changed
        if (result.checkboxChecked !== this.autoCheck) {
          this.autoCheck = result.checkboxChecked;
          if (this.onSettingsChangeCallback) {
            await this.onSettingsChangeCallback();
          }
        }

        this.manualCheck = false;
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
      // We stay in 'downloading' state
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded');
      this.updateState('downloaded');

      // No popup on download finish either, rely on menu change to "Restart to install"
    });
  }

  public checkUpdate(manual: boolean = false) {
    // If not manual (auto check on startup) and autoCheck is disabled, skip.
    if (!manual && !this.autoCheck) {
      console.log('Auto update check skipped because it is disabled in settings.');
      return;
    }

    this.manualCheck = manual;

    if (app.isPackaged) {
      autoUpdater.checkForUpdates();
    } else {
      if (manual) {
        dialog.showMessageBox({
          type: 'info',
          title: '检查更新',
          message: '开发环境下无法使用自动更新功能。',
          buttons: ['好的']
        });
        this.updateState('idle');
      }
    }
  }

  public quitAndInstall() {
    autoUpdater.quitAndInstall();
  }
}

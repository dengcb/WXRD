import { app, BrowserWindow, Menu, shell, MenuItemConstructorOptions, screen } from 'electron';
import { PagerManager } from './pager_manager';
import { TurnerManager } from './turner_manager';

const isMac = process.platform === 'darwin';

export class MenuManager {
  private readonly READER_PATH = '/web/reader/';
  private readonly MENU_READER_WIDE_ID = 'menu-reader-wide';
  private readonly MENU_HIDE_TOOLBAR_ID = 'menu-hide-toolbar';
  private readonly MENU_AUTO_FLIP_ID = 'menu-auto-flip';
  private readonly MENU_FULL_SCREEN_ID = 'menu-full-screen';

  private mainWindow: BrowserWindow | null = null;
  private pagerManager: PagerManager | null = null;
  private turnerManager: TurnerManager | null = null;
  private createSettingsWindow: () => void;
  private saveSettings: () => Promise<void>;

  constructor(
    createSettingsWindow: () => void,
    saveSettings: () => Promise<void>
  ) {
    this.createSettingsWindow = createSettingsWindow;
    this.saveSettings = saveSettings;
  }

  public setWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  public setManagers(pager: PagerManager | null, turner: TurnerManager | null) {
    this.pagerManager = pager;
    this.turnerManager = turner;
  }

  public setCNMenu() {
    const mainWindow = this.mainWindow;
    const template: MenuItemConstructorOptions[] = [];
    const hasWindow = !!mainWindow && !mainWindow.isDestroyed();

    if (isMac) {
      template.push({
        label: app.name,
        submenu: [
          { role: 'about', label: '关于' },
          {
            label: '设置…',
            accelerator: 'CmdOrCtrl+,',
            click: () => this.createSettingsWindow()
          },
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
        {
          id: this.MENU_AUTO_FLIP_ID, type: 'checkbox', label: '自动翻页', accelerator: 'CmdOrCtrl+I', enabled: false, checked: this.turnerManager?.autoFlip || false, click: async (item) => {
            if (!hasWindow || !this.turnerManager) return;
            this.turnerManager.autoFlip = (item as any).checked;
            this.turnerManager.setAutoFlipForState();
            this.updateReaderWideMenuEnabled();
          }
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小', accelerator: 'CmdOrCtrl+0', enabled: hasWindow },
        { role: 'zoomIn', label: '放大', accelerator: 'CmdOrCtrl+=', enabled: hasWindow },
        { role: 'zoomOut', label: '缩小', accelerator: 'CmdOrCtrl+-', enabled: hasWindow },
        { type: 'separator' },
        {
          id: this.MENU_FULL_SCREEN_ID,
          type: 'checkbox',
          label: '切换全屏',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          enabled: hasWindow,
          checked: hasWindow ? mainWindow!.isFullScreen() : false,
          click: () => {
            if (hasWindow) {
              const isFull = mainWindow!.isFullScreen();
              mainWindow!.setFullScreen(!isFull);
              this.updateReaderWideMenuEnabled();
            }
          }
        },
        {
          id: this.MENU_READER_WIDE_ID, type: 'checkbox', label: '阅读变宽', accelerator: 'CmdOrCtrl+9', enabled: false, checked: this.pagerManager?.readerWide || false, click: async (item) => {
            if (!hasWindow || !this.pagerManager) return;
            const isChecked = (item as any).checked;

            // 如果用户取消“阅读变宽”，且此时“隐藏工具栏”处于选中状态，则先取消“隐藏工具栏”
            if (!isChecked && this.pagerManager.hideToolbar) {
              this.pagerManager.hideToolbar = false;

              // 显式更新菜单项状态：先取消勾选，再禁用（后续 updateReaderWideMenuEnabled 会处理禁用）
              const menu = Menu.getApplicationMenu();
              const hideItem = menu?.getMenuItemById(this.MENU_HIDE_TOOLBAR_ID);
              if (hideItem) (hideItem as any).checked = false;

              await this.pagerManager.setToolbarForState();
            }

            this.pagerManager.readerWide = isChecked;
            await this.pagerManager.setReaderWidthForState();
            await this.pagerManager.refreshReaderArea();
            await this.saveSettings();
            this.updateReaderWideMenuEnabled();
          }
        },
        {
          id: this.MENU_HIDE_TOOLBAR_ID, type: 'checkbox', label: '隐藏工具栏', accelerator: 'CmdOrCtrl+O', enabled: false, checked: this.pagerManager?.hideToolbar || false, click: async (item) => {
            if (!hasWindow || !this.pagerManager) return;
            this.pagerManager.hideToolbar = (item as any).checked;
            await this.pagerManager.setToolbarForState();
            await this.pagerManager.refreshReaderArea();
            await this.saveSettings();
            this.updateReaderWideMenuEnabled();
          }
        },
        { label: '开发者工具', accelerator: 'Alt+CmdOrCtrl+I', enabled: hasWindow, click: () => { if (hasWindow) mainWindow!.webContents.toggleDevTools(); } },
      ],
    });

    template.push({
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化', enabled: hasWindow },
        isMac ? { role: 'zoom', label: '缩放', enabled: hasWindow } : { label: '缩放', enabled: hasWindow, click: () => { if (!hasWindow) return; mainWindow!.isMaximized() ? mainWindow!.unmaximize() : mainWindow!.maximize(); } },
        { label: '填充', accelerator: 'CmdOrCtrl+Alt+F', enabled: hasWindow, click: () => { if (hasWindow) this.fillWindowToCurrentDisplay(); } },
        ...((): MenuItemConstructorOptions[] => {
          if (!hasWindow) return [];
          const displays = screen.getAllDisplays();
          const current = screen.getDisplayMatching(mainWindow!.getBounds());
          if (!displays || displays.length <= 1) return [];
          const items: MenuItemConstructorOptions[] = [];
          for (let i = 0; i < displays.length; i++) {
            const d = displays[i];
            if (d.id === current.id) continue;
            const name = (d as any).name || (d as any).label;
            const title = name ? `移到 “${name}”` : `移到 显示器 ${i + 1}（${d.bounds.width}×${d.bounds.height}）`;
            items.push({
              label: title,
              click: () => {
                if (hasWindow) this.moveWindowToDisplay(d);
              },
            });
          }
          if (items.length > 0) {
            const sep: MenuItemConstructorOptions = { type: 'separator' as 'separator' };
            return [sep, ...items];
          }
          return [];
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
    this.updateReaderWideMenuEnabled();
  }

  public updateReaderWideMenuEnabled() {
    const win = this.mainWindow;
    const menu = Menu.getApplicationMenu();
    if (!menu) return;
    const wideItem = menu.getMenuItemById(this.MENU_READER_WIDE_ID);
    const hideItem = menu.getMenuItemById(this.MENU_HIDE_TOOLBAR_ID);
    const autoItem = menu.getMenuItemById(this.MENU_AUTO_FLIP_ID);

    if (wideItem && this.pagerManager) {
      if (!win || win.isDestroyed()) {
        wideItem.enabled = false;
        (wideItem as any).checked = false;
      } else {
        const inReader = win.webContents.getURL().includes(this.READER_PATH);
        wideItem.enabled = inReader;
        (wideItem as any).checked = inReader ? this.pagerManager.readerWide : false;
      }
    }
    if (hideItem && this.pagerManager) {
      if (!win || win.isDestroyed()) {
        hideItem.enabled = false;
        (hideItem as any).checked = false;
      } else {
        const inReader = win.webContents.getURL().includes(this.READER_PATH);
        // 只有当“阅读变宽”开启时，“隐藏工具栏”才可选
        hideItem.enabled = inReader && this.pagerManager.readerWide;
        (hideItem as any).checked = inReader ? this.pagerManager.hideToolbar : false;
      }
    }
    if (autoItem && this.turnerManager) {
      if (!win || win.isDestroyed()) {
        autoItem.enabled = false;
        (autoItem as any).checked = false;
      } else {
        const inReader = win.webContents.getURL().includes(this.READER_PATH);
        autoItem.enabled = inReader;
        (autoItem as any).checked = inReader ? this.turnerManager.autoFlip : false;
      }
    }

    // Update Full Screen Menu Item State
    const fsItem = menu.getMenuItemById(this.MENU_FULL_SCREEN_ID);
    if (fsItem) {
      if (!win || win.isDestroyed()) {
        fsItem.enabled = false;
        (fsItem as any).checked = false;
      } else {
        fsItem.enabled = true;
        (fsItem as any).checked = win.isFullScreen();
      }
    }
  }

  private moveWindowToDisplay(d: Electron.Display) {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;

    const area = d.workArea || d.bounds;
    const wb = win.getBounds();
    const width = Math.min(wb.width, area.width);
    const height = Math.min(wb.height, area.height);
    const x = area.x + Math.floor((area.width - width) / 2);
    const y = area.y + Math.floor((area.height - height) / 2);
    win.setBounds({ x, y, width, height }, true);
    win.focus();
    this.setCNMenu();
  }

  private fillWindowToCurrentDisplay() {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;

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
}

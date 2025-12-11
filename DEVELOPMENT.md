# WXRD 开发文档

## 项目概览
- 桌面端使用 Electron 主进程，直接加载 `https://weread.qq.com/` 作为界面渲染。
- 主进程入口文件为 `src/main.ts`，无自定义渲染进程代码，所有功能通过主进程与网页交互实现。
- 使用 `TypeScript` 编写，构建产物输出到 `tsout/`，应用打包输出到 `release/`。

## 主进程与窗口
- 创建窗口：`createWindow()` 在 `src/main.ts:343-415`，设置标题、尺寸、图标、`webPreferences`。
- 关键设置：`backgroundThrottling: false` 保证窗口在后台也保持计时与事件触发（`src/main.ts:353-356`）。
- 初始加载：`mainWindow.loadURL('https://weread.qq.com/')`（`src/main.ts:360`）。
- Mac 细节：设置 Dock 图标与关于面板（`src/main.ts:420-431`）。

## 菜单与交互
- 构建中文菜单：`setCNMenu(mainWindow)`（`src/main.ts:240-341`）。
- 标准视图操作：刷新、返回、前进、实际大小、放大、缩小、切换全屏（`src/main.ts:279-296`）。
- 阅读相关的三项状态菜单：
  - `阅读变宽`（`id: menu-reader-wide`，快捷键 `CmdOrCtrl+9`，`src/main.ts:292`）。
  - `隐藏工具栏`（`id: menu-hide-toolbar`，快捷键 `CmdOrCtrl+O`，`src/main.ts:293`）。
  - `自动翻页`（`id: menu-auto-flip`，快捷键 `CmdOrCtrl+I`，`src/main.ts:285`）。
- 菜单启用与勾选同步：`updateReaderWideMenuEnabled()` 根据当前是否为阅读页更新三项的 `enabled/checked`（`src/main.ts:202-238`）。

## 状态与持久化
- 状态变量：`readerWide`、`hideToolbar`、`autoFlip`（`src/main.ts:38-40`）。
- 本地持久化：
  - 读：`loadSettings()` 读取 `app.getPath('userData')/wxrd-settings.json`（`src/main.ts:50-58`）。
  - 写：`saveSettings()` 保存 `readerWide` 与 `hideToolbar`（`src/main.ts:59-65`）。
- 启动时加载设置，并在应用准备好后创建窗口（`src/main.ts:420-433`）。

## 阅读页判断
- 通过常量 `READER_PATH = '/web/reader/'` 判断是否处于阅读页（`src/main.ts:10`）。
- 辅助函数 `isInReader(win)` 统一判断逻辑（`src/main.ts:80-84`）。

## 页面样式注入与刷新
- 阅读变宽样式：`readerCss` 将 `.readerTopBar/.readerChapterContent` 设置为 `width: 95%`（`src/main.ts:14-19`）。
- 注入/移除逻辑：`setReaderWidthForState(win)` 按状态插入或移除 CSS（`src/main.ts:66-79`）。
- 工具栏隐藏/显示样式：
  - 隐藏：`toolbarHideCss` 隐藏 `.readerControls` 并将相关区域 `max-width: calc(100vw - 124px)`（`src/main.ts:20-28`）。
  - 显示：`toolbarShowCss` 显示 `.readerControls` 并设为 `max-width: calc(100vw - 224px)`（`src/main.ts:29-37`）。
- 工具栏样式应用：`setToolbarForState(win)` 动态切换并记录 CSS key（`src/main.ts:122-134`）。
- 布局刷新：`refreshReaderArea(win)` 在阅读页派发 `resize/orientationchange` 并触发强制重排，配合样式变更生效（`src/main.ts:113-120`）。

## 自动翻页
- 核心逻辑：`setAutoFlipForState(win)` 只在阅读页且自动翻页开启时生效（`src/main.ts:136-174`）。
- 倒计时与标题：
  - 初始设置与备份：`setAutoFlipTitleInitial(win)`（`src/main.ts:86-94`）。
  - 每秒更新标题：`setAutoFlipTitle(win)`（`src/main.ts:96-101`）。
  - 取消时恢复原始标题：`restoreAutoFlipTitle(win)`（`src/main.ts:103-111`）。
- 翻页触发：倒计时到 0 时通过 `webContents.sendInputEvent('Right')` 发送右箭头键（`src/main.ts:159-163`）。
- 手动干预：监听 `before-input-event`，用户按任意方向键时将倒计时重置为 30 秒（`src/main.ts:391-399`）。
- 后台行为：开启自动翻页时启动 `powerSaveBlocker('prevent-app-suspension')`，停止时关闭（`src/main.ts:148-171`）。
- 离开阅读页：在 `did-navigate-in-page` 中自动关闭自动翻页并清理计时器与标题备份（`src/main.ts:375-389`）。

## 生命周期与清理
- 加载完成：`did-finish-load` 中应用当前三项状态并刷新布局（`src/main.ts:367-373`）。
- 页内导航：`did-navigate-in-page` 中针对进入/离开阅读页的状态管理（`src/main.ts:375-389`）。
- 窗口关闭：清理菜单、计时器与 `powerSaveBlocker`（`src/main.ts:405-411`）。

## 窗口与显示器管理
- 适配当前显示器填充窗口：`fillWindowToCurrentDisplay(win)`（`src/main.ts:188-200`）。
- 移动到指定显示器并居中：`moveWindowToDisplay(win, d)`（`src/main.ts:176-186`）。
- 动态生成“移到显示器”菜单项：在 `窗口` 菜单内根据多显示器情况插入（`src/main.ts:304-329`）。

## 关于与图标
- 关于面板：`app.setAboutPanelOptions({... copyright: "Copyright © 2025 - dengcb" })`（`src/main.ts:426-431`）。
- 应用图标：打包前通过 `npm run gen:icns` 生成，窗口图标路径在 `src/main.ts:357`。

## 开发模式
- 当 `NODE_ENV=dev` 时：不自动隐藏菜单，并自动打开开发者工具（`src/main.ts:351, 413-415`）。

## 代码位置速查
- 主入口与窗口创建：`src/main.ts:343-415`。
- 菜单构建：`src/main.ts:240-341`。
- 阅读页判断：`src/main.ts:10, 80-84`。
- 三项状态菜单与点击处理：`src/main.ts:285, 292-293`。
- 状态持久化：`src/main.ts:50-65`。
- 样式注入：`src/main.ts:14-37, 66-79, 122-134`。
- 布局刷新：`src/main.ts:113-120`。
- 自动翻页：`src/main.ts:86-111, 136-174, 391-399`。
- 生命周期：`src/main.ts:367-373, 375-389, 405-411`。


# WXRD 部署与发布指南

## 概述
- 使用 `electron-builder` 生成 macOS DMG 与 Windows NSIS 安装包，输出目录为 `release/`（`package.json:45-49`）。
- 已实现构建、签名/硬化、（可选）公证与 GitHub 发布的解耦流程，上传与最终发布为独立步骤。

## 前置条件
- Node.js 与 npm。
- macOS：需要 Xcode 命令行工具用于代码签名；可选地配置 Apple 公证凭据。
- GitHub 访问令牌：设置环境变量 `GH_TOKEN`，拥有对应仓库的发布权限（至少 `repo`）。

## 构建产物
- 生成图标：`npm run gen:icns`（mac 打包前会自动调用）。
- 构建并打包：
  - `npm run pack-mac-x64-signed`（输出 `release/wxrd-${version}-x64.dmg`，`package.json:81`）。
  - `npm run pack-mac-arm-signed`（输出 `release/wxrd-${version}-arm64.dmg`，`package.json:82`）。
  - `npm run pack-win`（输出 `release/wxrd-setup-${version}.exe`，`package.json:78`）。
- 重要配置：
  - mac：`hardenedRuntime: true`、`entitlements: build/entitlements.mac.plist`（`package.json:55-57`）。
  - 产物命名：`mac.artifactName` 与 `win.artifactName`（`package.json:54, 62`）。

## 签名与公证
- 签名与硬化：由 `electron-builder` 在 mac 平台执行，启用了 Hardened Runtime 与相应 Entitlements（`build/entitlements.mac.plist`）。
- 公证：当前配置为 `"mac.notarize": null`（`package.json:58-59`），不主动触发。若提供有效环境与配置，`electron-builder` 可配合 `notarytool` 执行公证。
- 启用公证的方式（二选一，参考官方文档）：
  - 在 `package.json` 中设置 `build.mac.notarize`（如 `appleId`、`appleIdPassword`/`keychainProfile`）。
  - 通过环境与 Keychain Profile 配置（如 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`NOTARIZE_KEYCHAIN_PROFILE`）。
- 说明：公证耗时较长，签名阶段可能存在数分钟等待属正常现象。

## 上传资产（只上传 DMG/EXE）
- 先确保 GitHub 已存在与版本号对应的草稿 Release（Tag 名为 `v${version}`）。
- 执行上传：`npm run upload:assets`（`package.json:85`）。
  - 行为：枚举 `release/wxrd-${version}-arm64.dmg`、`release/wxrd-${version}-x64.dmg`、`release/wxrd-setup-${version}.exe`。
  - 若资产已存在，则输出 `SKIP ... exists` 并跳过；否则以正确的 MIME 类型上传到当前 Release。
  - 需要环境变量 `GH_TOKEN`。

## 发布最终版本（草稿 → 正式）
- 执行：`npm run release:finalize`（`package.json:86`）。
  - 行为：读取 `v${version}` 对应 Release ID，PATCH `draft=false`，不重新上传资产、不触发重新打包。
  - 需要环境变量 `GH_TOKEN`。

## 推荐发布流程
- 版本号：`package.json` 中更新 `version`（或使用 `npm version patch/minor/major`）。
- 构建：按需运行 `pack-mac-x64-signed`、`pack-mac-arm-signed`、`pack-win`（可以只构建 mac 进行本地测试）。
- 创建草稿 Release：在 GitHub UI 或通过自动化创建 `v${version}` 的草稿。
- 上传资产：运行 `npm run upload:assets`，资产已存在将自动跳过。
- 发布为正式版：运行 `npm run release:finalize`。

## 注意事项
- 已解耦脚本：`release-all` 仅执行本地构建，不上传资产，不发布（`package.json:84`）。
- 上传脚本仅处理 DMG/EXE，不会覆盖已存在资产，确保幂等。
- 若看到较长的等待，多为 macOS 签名或系统工具的处理时间，与公证无关（在未配置公证的情况下）。

## 配置参考与代码位置
- `electron-builder` 基础配置：`package.json:15-71`。
- mac 构建与签名：`package.json:50-59`，Entitlements 在 `build/entitlements.mac.plist`。
- 发布目标：`build.publish` 指向 GitHub（`package.json:64-70`）。
- 自定义脚本：
  - 构建：`package.json:78-83`。
  - 解耦的总构建：`package.json:84`。
  - 上传：`package.json:85`。
  - 发布：`package.json:86`。


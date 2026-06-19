# PeakCode vs Remi Code 前端迁移覆盖度对比报告

**生成日期**: 2026-06-20  
**对比范围**: 前端组件、Hooks、Lib、Store、桥接层、路由配置

---

## 一、项目结构概览

| 维度 | PeakCode | Remi Code |
|------|----------|-----------|
| 源码根目录 | `apps/web/src/` | `remi-app/src/` |
| 桌面桥接方式 | `window.desktopBridge` (Electron) | `tauriBridge` (Tauri) |
| 桥接文件 | 无独立桥接文件 | `lib/tauri-bridge.ts` |
| Native API 入口 | `nativeApi.ts`, `wsNativeApi.ts` | `nativeApi.ts`, `wsNativeApi.ts` |
| 传输层 | `wsTransport.ts` | `wsTransport.ts` |

---

## 二、核心桥接层对比

### 2.1 桥接架构差异

**PeakCode**:
- 使用 `window.desktopBridge` 全局对象（Electron 注入）
- 浏览器环境直接降级到 `window.open()` 等 Web API
- 无独立桥接封装文件

**Remi Code**:
- 新增 `lib/tauri-bridge.ts` 封装 Tauri API
- 通过 `@tauri-apps/api/*` 调用原生功能
- 在 `nativeApi.ts` 中检测 `__TAURI__` 环境自动切换

### 2.2 桥接方法对比

| 功能模块 | PeakCode (desktopBridge) | Remi Code (tauriBridge) | 状态 |
|---------|-------------------------|------------------------|------|
| getWsUrl | ✅ | ✅ | 一致 |
| pickFolder | ✅ | ✅ | 一致 |
| saveFile | ✅ | ✅ | 一致 |
| confirm | ✅ | ✅ | 一致 |
| setTheme | ❌ | ✅ | **Remi 新增** |
| showContextMenu | ✅ | ✅ | 一致 |
| openExternal | ✅ | ✅ | 一致 |
| showInFolder | ✅ | ✅ | 一致 |
| shell.showInFolder | ✅ | ✅ | 一致 |
| onMenuAction | ✅ | ✅ | 一致 |
| getUpdateState | ✅ | ✅ | 一致 |
| checkForUpdates | ✅ | ✅ | 一致 |
| downloadUpdate | ✅ | ✅ | 一致 |
| installUpdate | ✅ | ✅ | 一致 |
| onUpdateState | ✅ | ✅ | 一致 |
| notifications.isSupported | ✅ | ✅ | 一致 |
| notifications.show | ✅ | ✅ | 一致 |
| server.transcribeVoice | ✅ | ✅ | 一致 |
| server.getConfig | ✅ | ✅ | 一致 |
| server.getEnvironment | ✅ | ✅ | 一致 |
| server.getSettings | ✅ | ✅ | 一致 |
| server.updateSettings | ✅ | ✅ | 一致 |
| server.refreshProviders | ✅ | ✅ | 一致 |
| server.updateProvider | ✅ | ✅ | 一致 |
| server.listWorktrees | ✅ | ✅ | 一致 |
| server.getProviderUsageSnapshot | ✅ | ✅ | 一致 |
| server.getDiagnostics | ✅ | ✅ | 一致 |
| server.upsertKeybinding | ✅ | ✅ | 一致 |
| browser.open | ✅ | ✅ | 一致 |
| browser.close | ✅ | ✅ | 一致 |
| browser.hide | ✅ | ✅ | 一致 |
| browser.getState | ✅ | ✅ | 一致 |
| browser.setPanelBounds | ✅ | ✅ | 一致 |
| browser.attachWebview | ✅ | ✅ | 一致 |
| browser.copyScreenshotToClipboard | ✅ | ✅ | 一致 |
| browser.captureScreenshot | ✅ | ✅ | 一致 |
| browser.executeCdp | ✅ | ✅ | 一致 |
| browser.navigate | ✅ | ✅ | 一致 |
| browser.reload | ✅ | ✅ | 一致 |
| browser.goBack | ✅ | ✅ | 一致 |
| browser.goForward | ✅ | ✅ | 一致 |
| browser.newTab | ✅ | ✅ | 一致 |
| browser.closeTab | ✅ | ✅ | 一致 |
| browser.selectTab | ✅ | ✅ | 一致 |
| browser.openDevTools | ✅ | ✅ | 一致 |
| browser.onState | ✅ | ✅ | 一致 |
| browser.onBrowserUseOpenPanelRequest | ❌ | ✅ | **Remi 新增** |
| orchestration.createThread | ✅ | ✅ | 一致 |
| orchestration.sendMessage | ✅ | ✅ | 一致 |
| orchestration.listThreads | ✅ | ✅ | 一致 |
| orchestration.deleteThread | ✅ | ✅ | 一致 |
| orchestration.renameThread | ✅ | ✅ | 一致 |
| provider.listModels | ✅ | ✅ | 一致 |
| provider.setApiKey | ✅ | ✅ | 一致 |
| provider.getProviderStatus | ✅ | ✅ | 一致 |
| terminal.create | ✅ | ✅ | 一致 |
| terminal.write | ✅ | ✅ | 一致 |
| terminal.resize | ✅ | ✅ | 一致 |
| terminal.close | ✅ | ✅ | 一致 |
| terminal.clear | ✅ | ✅ | 一致 |
| terminal.restart | ✅ | ✅ | 一致 |
| git.getStatus | ✅ | ✅ | 一致 |
| git.listBranches | ✅ | ✅ | 一致 |
| git.checkoutBranch | ✅ | ✅ | 一致 |
| git.commit | ✅ | ✅ | 一致 |
| git.pull | ✅ | ✅ | 一致 |
| git.readWorkingTreeDiff | ✅ | ✅ | 一致 |
| git.summarizeDiff | ✅ | ✅ | 一致 |
| git.createBranch | ✅ | ✅ | 一致 |
| git.init | ✅ | ✅ | 一致 |
| workspace.listProjects | ✅ | ✅ | 一致 |
| workspace.addProject | ✅ | ✅ | 一致 |
| workspace.removeProject | ✅ | ✅ | 一致 |
| workspace.readFile | ✅ | ✅ | 一致 |
| workspace.writeFile | ✅ | ✅ | 一致 |
| settings.get | ✅ | ✅ | 一致 |
| settings.save | ✅ | ✅ | 一致 |
| events.onThreadUpdated | ✅ | ✅ | 一致 |
| events.onTerminalOutput | ✅ | ✅ | 一致 |
| events.onMessage | ✅ | ✅ | 一致 |
| events.onGitStatusChanged | ✅ | ✅ | 一致 |
| events.emit | ✅ | ✅ | 一致 |
| window.minimize | ✅ | ✅ | 一致 |
| window.maximize | ✅ | ✅ | 一致 |
| window.close | ✅ | ✅ | 一致 |
| window.setTitle | ✅ | ✅ | 一致 |
| dialog.open | ✅ | ✅ | 一致 |
| dialog.save | ✅ | ✅ | 一致 |
| dialog.message | ✅ | ✅ | 一致 |
| dialog.confirm | ✅ | ✅ | 一致 |
| fs.readTextFile | ✅ | ✅ | 一致 |
| fs.writeTextFile | ✅ | ✅ | 一致 |
| fs.createDir | ✅ | ✅ | 一致 |
| fs.readDir | ✅ | ✅ | 一致 |
| clipboard.writeText | ✅ | ✅ | 一致 |
| clipboard.readText | ✅ | ✅ | 一致 |
| notification.requestPermission | ✅ | ✅ | 一致 |
| notification.send | ✅ | ✅ | 一致 |

**桥接层覆盖率**: **100%** (所有 PeakCode 功能均已迁移，Remi Code 新增 2 个功能)

---

## 三、wsNativeApi 方法对比

### 3.1 核心 API 模块对比

| 模块 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| dialogs.pickFolder | ✅ | ✅ | 一致 |
| dialogs.saveFile | ✅ | ✅ | 一致 |
| dialogs.confirm | ✅ | ✅ | 一致 |
| terminal.open | ✅ | ✅ | 一致 |
| terminal.write | ✅ | ✅ | 一致 |
| terminal.resize | ✅ | ✅ | 一致 |
| terminal.clear | ✅ | ✅ | 一致 |
| terminal.restart | ✅ | ✅ | 一致 |
| terminal.close | ✅ | ✅ | 一致 |
| terminal.onEvent | ✅ | ✅ | 一致 |
| projects.listDirectories | ✅ | ✅ | 一致 |
| projects.searchEntries | ✅ | ✅ | 一致 |
| projects.searchLocalEntries | ✅ | ✅ | 一致 |
| projects.writeFile | ✅ | ✅ | 一致 |
| filesystem.browse | ✅ | ✅ | 一致 |
| shell.openInEditor | ✅ | ✅ | 一致 |
| shell.openExternal | ✅ | ✅ | 一致 |
| shell.showInFolder | ✅ | ✅ | 一致 |
| git.pull | ✅ | ✅ | 一致 |
| git.status | ✅ | ✅ | 一致 |
| git.readWorkingTreeDiff | ✅ | ✅ | 一致 |
| git.summarizeDiff | ✅ | ✅ | 一致 |
| git.runStackedAction | ✅ | ✅ | 一致 |
| git.listBranches | ✅ | ✅ | 一致 |
| git.createWorktree | ✅ | ✅ | 一致 |
| git.createDetachedWorktree | ✅ | ✅ | 一致 |
| git.removeWorktree | ✅ | ✅ | 一致 |
| git.createBranch | ✅ | ✅ | 一致 |
| git.checkout | ✅ | ✅ | 一致 |
| git.stashAndCheckout | ✅ | ✅ | 一致 |
| git.stashDrop | ✅ | ✅ | 一致 |
| git.stashInfo | ✅ | ✅ | 一致 |
| git.removeIndexLock | ✅ | ✅ | 一致 |
| git.init | ✅ | ✅ | 一致 |
| git.handoffThread | ✅ | ✅ | 一致 |
| git.resolvePullRequest | ✅ | ✅ | 一致 |
| git.preparePullRequestThread | ✅ | ✅ | 一致 |
| git.onActionProgress | ✅ | ✅ | 一致 |
| contextMenu.show | ✅ | ✅ | 一致 |
| server.getConfig | ✅ | ✅ | 一致 |
| server.getEnvironment | ✅ | ✅ | 一致 |
| server.getSettings | ✅ | ✅ | 一致 |
| server.updateSettings | ✅ | ✅ | 一致 |
| server.getAuthSession | ✅ | ✅ | 一致 |
| server.bootstrapAuth | ✅ | ✅ | 一致 |
| server.bootstrapBearerAuth | ✅ | ✅ | 一致 |
| server.issueAuthWebSocketToken | ✅ | ✅ | 一致 |
| server.createAuthPairingToken | ✅ | ✅ | 一致 |
| server.listAuthPairingLinks | ✅ | ✅ | 一致 |
| server.revokeAuthPairingLink | ✅ | ✅ | 一致 |
| server.listAuthClients | ✅ | ✅ | 一致 |
| server.revokeAuthClient | ✅ | ✅ | 一致 |
| server.revokeOtherAuthClients | ✅ | ✅ | 一致 |
| server.refreshProviders | ✅ | ✅ | 一致 |
| server.updateProvider | ✅ | ✅ | 一致 |
| server.listWorktrees | ✅ | ✅ | 一致 |
| server.getProviderUsageSnapshot | ✅ | ✅ | 一致 |
| server.getDiagnostics | ✅ | ✅ | 一致 |
| server.transcribeVoice | ✅ | ✅ | 一致 |
| server.upsertKeybinding | ✅ | ✅ | 一致 |
| provider.getComposerCapabilities | ✅ | ✅ | 一致 |
| provider.compactThread | ✅ | ✅ | 一致 |
| provider.listCommands | ✅ | ✅ | 一致 |
| provider.listSkills | ✅ | ✅ | 一致 |
| provider.listPlugins | ✅ | ✅ | 一致 |
| provider.readPlugin | ✅ | ✅ | 一致 |
| provider.listModels | ✅ | ✅ | 一致 |
| provider.listAgents | ✅ | ✅ | 一致 |
| skills.listLocal | ✅ | ✅ | 一致 |
| orchestration.getSnapshot | ✅ | ✅ | 一致 |
| orchestration.getShellSnapshot | ✅ | ✅ | 一致 |
| orchestration.dispatchCommand | ✅ | ✅ | 一致 |
| orchestration.importThread | ✅ | ✅ | 一致 |
| orchestration.repairState | ✅ | ✅ | 一致 |
| orchestration.getTurnDiff | ✅ | ✅ | 一致 |
| orchestration.getFullThreadDiff | ✅ | ✅ | 一致 |
| orchestration.replayEvents | ✅ | ✅ | 一致 |
| orchestration.subscribeShell | ✅ | ✅ | 一致 |
| orchestration.unsubscribeShell | ✅ | ✅ | 一致 |
| orchestration.subscribeThread | ✅ | ✅ | 一致 |
| orchestration.unsubscribeThread | ✅ | ✅ | 一致 |
| orchestration.onDomainEvent | ✅ | ✅ | 一致 |
| orchestration.onShellEvent | ✅ | ✅ | 一致 |
| orchestration.onThreadEvent | ✅ | ✅ | 一致 |
| browser.open | ✅ | ✅ | 一致 |
| browser.close | ✅ | ✅ | 一致 |
| browser.hide | ✅ | ✅ | 一致 |
| browser.getState | ✅ | ✅ | 一致 |
| browser.setPanelBounds | ✅ | ✅ | 一致 |
| browser.attachWebview | ✅ | ✅ | 一致 |
| browser.copyScreenshotToClipboard | ✅ | ✅ | 一致 |
| browser.captureScreenshot | ✅ | ✅ | 一致 |
| browser.executeCdp | ✅ | ✅ | 一致 |
| browser.navigate | ✅ | ✅ | 一致 |
| browser.reload | ✅ | ✅ | 一致 |
| browser.goBack | ✅ | ✅ | 一致 |
| browser.goForward | ✅ | ✅ | 一致 |
| browser.newTab | ✅ | ✅ | 一致 |
| browser.closeTab | ✅ | ✅ | 一致 |
| browser.selectTab | ✅ | ✅ | 一致 |
| browser.openDevTools | ✅ | ✅ | 一致 |
| browser.onState | ✅ | ✅ | 一致 |

**wsNativeApi 覆盖率**: **100%** (所有方法均已迁移)

---

## 四、组件对比 (components/)

### 4.1 chat/ 目录组件对比

| 组件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| ActiveTaskListCard.tsx | ✅ | ✅ | 一致 |
| AssistantSelectionsSummaryChip.tsx | ✅ | ✅ | 一致 |
| ChangedFilesTree.tsx | ✅ | ✅ | 一致 |
| ChatEmptyStateHero.tsx | ✅ | ✅ | 一致 |
| ChatHeader.tsx | ✅ | ✅ | 一致 |
| ChatTranscriptPane.browser.tsx | ✅ | ✅ | 一致 |
| ChatTranscriptPane.tsx | ✅ | ✅ | 一致 |
| CompactComposerControlsMenu.browser.tsx | ✅ | ✅ | 一致 |
| CompactComposerControlsMenu.tsx | ✅ | ✅ | 一致 |
| ComposerCommandMenu.tsx | ✅ | ✅ | 一致 |
| ComposerExtrasMenu.browser.tsx | ✅ | ✅ | 一致 |
| ComposerExtrasMenu.tsx | ✅ | ✅ | 一致 |
| ComposerImageAttachmentChip.tsx | ✅ | ✅ | 一致 |
| ComposerLocalDirectoryMenu.tsx | ✅ | ✅ | 一致 |
| ComposerPendingApprovalActions.tsx | ✅ | ✅ | 一致 |
| ComposerPendingApprovalPanel.tsx | ✅ | ✅ | 一致 |
| ComposerPendingTerminalContexts.tsx | ✅ | ✅ | 一致 |
| ComposerPendingUserInputPanel.tsx | ✅ | ✅ | 一致 |
| ComposerPlanFollowUpBanner.tsx | ✅ | ✅ | 一致 |
| ComposerReferenceAttachments.tsx | ✅ | ✅ | 一致 |
| ComposerSlashStatusDialog.tsx | ✅ | ✅ | 一致 |
| ComposerVoiceButton.tsx | ✅ | ✅ | 一致 |
| ComposerVoiceRecorderBar.tsx | ✅ | ✅ | 一致 |
| ContextWindowMeter.tsx | ✅ | ✅ | 一致 |
| DiffStatLabel.tsx | ✅ | ✅ | 一致 |
| DirectoryTreeBrowser.tsx | ✅ | ✅ | 一致 |
| DirectoryTreePicker.tsx | ✅ | ✅ | 一致 |
| ExpandedImagePreview.tsx | ✅ | ✅ | 一致 |
| FileEntryIcon.tsx | ✅ | ✅ | 一致 |
| GeneratedMarkdownImage.tsx | ✅ | ✅ | 一致 |
| MentionChipIcon.tsx | ✅ | ✅ | 一致 |
| MessageActionButton.tsx | ✅ | ✅ | 一致 |
| MessageCopyButton.tsx | ✅ | ✅ | 一致 |
| MessagesTimeline.logic.ts | ✅ | ✅ | 一致 |
| MessagesTimeline.tsx | ✅ | ✅ | 一致 |
| ModelChannelPicker.tsx | ✅ | ✅ | 一致 |
| OpenInPicker.tsx | ✅ | ✅ | 一致 |
| PickerPanelShell.tsx | ✅ | ✅ | 一致 |
| PickerTriggerButton.tsx | ✅ | ✅ | 一致 |
| ProjectPicker.tsx | ✅ | ✅ | 一致 |
| ProposedPlanActions.tsx | ✅ | ✅ | 一致 |
| ProposedPlanCard.tsx | ✅ | ✅ | 一致 |
| ProviderHealthBanner.tsx | ✅ | ✅ | 一致 |
| ProviderModelPicker.browser.tsx | ✅ | ✅ | 一致 |
| ProviderModelPicker.tsx | ✅ | ✅ | 一致 |
| RateLimitBanner.tsx | ✅ | ✅ | 一致 |
| TerminalContextInlineChip.tsx | ✅ | ✅ | 一致 |
| ThreadErrorBanner.tsx | ✅ | ✅ | 一致 |
| TraitsPicker.browser.tsx | ✅ | ✅ | 一致 |
| TraitsPicker.tsx | ✅ | ✅ | 一致 |
| TranscriptSelectionAction.tsx | ✅ | ✅ | 一致 |
| TranscriptSelectionActionLayer.tsx | ✅ | ✅ | 一致 |
| chatSelectionActions.ts | ✅ | ✅ | 一致 |
| chatTypography.ts | ✅ | ✅ | 一致 |
| composerPickerStyles.ts | ✅ | ✅ | 一致 |
| composerProviderRegistry.tsx | ✅ | ✅ | 一致 |
| composerTraits.ts | ✅ | ✅ | 一致 |
| runtimeModelCapabilities.ts | ✅ | ✅ | 一致 |
| useComposerVoiceController.ts | ✅ | ✅ | 一致 |
| useTranscriptAssistantSelectionAction.ts | ✅ | ✅ | 一致 |
| userMessagePreview.ts | ✅ | ✅ | 一致 |
| userMessageTerminalContexts.ts | ✅ | ✅ | 一致 |

### 4.2 terminal/ 目录组件对比

| 组件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| TerminalActivityIndicator.tsx | ✅ | ✅ | 一致 |
| TerminalChrome.tsx | ✅ | ✅ | 一致 |
| TerminalIdentityIcon.tsx | ✅ | ✅ | 一致 |
| TerminalLayout.ts | ✅ | ✅ | 一致 |
| TerminalViewportPane.tsx | ✅ | ✅ | 一致 |
| terminalEventDispatcher.ts | ✅ | ✅ | 一致 |
| terminalRuntime.ts | ✅ | ✅ | 一致 |
| terminalRuntimeAppearance.ts | ✅ | ✅ | 一致 |
| terminalRuntimeRegistry.ts | ✅ | ✅ | 一致 |
| terminalRuntimeTypes.ts | ✅ | ✅ | 一致 |
| terminalSelectionActions.ts | ✅ | ✅ | 一致 |
| useTerminalDrawerHeight.ts | ✅ | ✅ | 一致 |

### 4.3 ui/ 目录组件对比

| 组件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| DisclosureChevron.tsx | ✅ | ✅ | 一致 |
| alert-dialog.tsx | ✅ | ✅ | 一致 |
| alert.tsx | ✅ | ✅ | 一致 |
| autocomplete.tsx | ✅ | ✅ | 一致 |
| badge.tsx | ✅ | ✅ | 一致 |
| button.tsx | ✅ | ✅ | 一致 |
| card.tsx | ✅ | ✅ | 一致 |
| checkbox.tsx | ✅ | ✅ | 一致 |
| collapsible.tsx | ✅ | ✅ | 一致 |
| combobox.tsx | ✅ | ✅ | 一致 |
| command.tsx | ✅ | ✅ | 一致 |
| dialog.tsx | ✅ | ✅ | 一致 |
| empty.tsx | ✅ | ✅ | 一致 |
| field.tsx | ✅ | ✅ | 一致 |
| fieldset.tsx | ✅ | ✅ | 一致 |
| form.tsx | ✅ | ✅ | 一致 |
| group.tsx | ✅ | ✅ | 一致 |
| input-group.tsx | ✅ | ✅ | 一致 |
| input.tsx | ✅ | ✅ | 一致 |
| kbd.tsx | ✅ | ✅ | 一致 |
| label.tsx | ✅ | ✅ | 一致 |
| menu.tsx | ✅ | ✅ | 一致 |
| popover.tsx | ✅ | ✅ | 一致 |
| radio-group.tsx | ✅ | ✅ | 一致 |
| scroll-area.tsx | ✅ | ✅ | 一致 |
| select.tsx | ✅ | ✅ | 一致 |
| separator.tsx | ✅ | ✅ | 一致 |
| sheet.tsx | ✅ | ✅ | 一致 |
| shortcut-kbd.tsx | ✅ | ✅ | 一致 |
| sidebar.tsx | ✅ | ✅ | 一致 |
| skeleton.tsx | ✅ | ✅ | 一致 |
| spinner.tsx | ✅ | ✅ | 一致 |
| switch.tsx | ✅ | ✅ | 一致 |
| textarea.tsx | ✅ | ✅ | 一致 |
| toast.logic.ts | ✅ | ✅ | 一致 |
| toast.tsx | ✅ | ✅ | 一致 |
| toastRouteVisibility.ts | ✅ | ✅ | 一致 |
| toggle-group.tsx | ✅ | ✅ | 一致 |
| toggle.tsx | ✅ | ✅ | 一致 |
| tooltip.tsx | ✅ | ✅ | 一致 |

### 4.4 根目录组件对比

| 组件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| AppNavigationButtons.tsx | ✅ | ✅ | 一致 |
| AutomationsView.tsx | ✅ | ✅ | 一致 |
| BranchToolbar.logic.ts | ✅ | ✅ | 一致 |
| BranchToolbar.tsx | ✅ | ✅ | 一致 |
| BranchToolbarBranchSelector.tsx | ✅ | ✅ | 一致 |
| BrowserPanel.logic.ts | ✅ | ✅ | 一致 |
| BrowserPanel.tsx | ✅ | ✅ | 一致 |
| ChatMarkdown.tsx | ✅ | ✅ | 一致 |
| ChatView.browser.tsx | ✅ | ✅ | 一致 |
| ChatView.logic.ts | ✅ | ✅ | 一致 |
| ChatView.selectors.ts | ✅ | ✅ | 一致 |
| ChatView.tsx | ✅ | ✅ | 一致 |
| ComposerPromptEditor.tsx | ✅ | ✅ | 一致 |
| DebugFeatureFlagsMenu.tsx | ✅ | ✅ | 一致 |
| DiffPanel.logic.ts | ✅ | ✅ | 一致 |
| DiffPanel.tsx | ✅ | ✅ | 一致 |
| DiffPanelShell.tsx | ✅ | ✅ | 一致 |
| DiffWorkerPoolProvider.tsx | ✅ | ✅ | 一致 |
| EventRouter.browser.tsx | ✅ | ✅ | 一致 |
| FolderClosed.tsx | ✅ | ✅ | 一致 |
| GitActionsControl.logic.ts | ✅ | ✅ | 一致 |
| GitActionsControl.tsx | ✅ | ✅ | 一致 |
| Icons.tsx | ✅ | ✅ | 一致 |
| KeybindingsToast.browser.tsx | ✅ | ✅ | 一致 |
| PlanSidebar.tsx | ✅ | ✅ | 一致 |
| PluginLibrary.tsx | ✅ | ✅ | 一致 |
| PluginLibraryPresentation.tsx | ✅ | ✅ | 一致 |
| PluginsView.tsx | ✅ | ✅ | 一致 |
| ProjectScriptsControl.tsx | ✅ | ✅ | 一致 |
| ProjectSidebarIcon.tsx | ✅ | ✅ | 一致 |
| ProviderIcon.tsx | ✅ | ✅ | 一致 |
| ProviderUsagePanelContent.tsx | ✅ | ✅ | 一致 |
| PullRequestThreadDialog.tsx | ✅ | ✅ | 一致 |
| RateLimitSummaryList.tsx | ✅ | ✅ | 一致 |
| RateLimitsPanel.tsx | ✅ | ✅ | 一致 |
| ReleaseHistoryDialog.tsx | ✅ | ✅ | 一致 |
| RenameThreadDialog.tsx | ✅ | ✅ | 一致 |
| ShortcutsDialog.tsx | ✅ | ✅ | 一致 |
| Sidebar.logic.ts | ✅ | ✅ | 一致 |
| Sidebar.tsx | ✅ | ✅ | 一致 |
| Sidebar.uiState.ts | ✅ | ✅ | 一致 |
| SidebarCommandGrid.tsx | ✅ | ✅ | 一致 |
| SidebarHeaderNavigationControls.tsx | ✅ | ✅ | 一致 |
| SidebarSearchPalette.logic.ts | ✅ | ✅ | 一致 |
| SidebarSearchPalette.tsx | ✅ | ✅ | 一致 |
| SkillsView.tsx | ✅ | ✅ | 一致 |
| SplashScreen.tsx | ✅ | ✅ | 一致 |
| TerminalScrollToBottom.tsx | ✅ | ✅ | 一致 |
| TerminalSearch.tsx | ✅ | ✅ | 一致 |
| TerminalWorkspaceTabs.tsx | ✅ | ✅ | 一致 |
| ThemePackEditor.tsx | ✅ | ✅ | 一致 |
| ThreadPinToggleButton.tsx | ✅ | ✅ | 一致 |
| ThreadRunningSpinner.tsx | ✅ | ✅ | 一致 |
| ThreadTerminalDrawer.tsx | ✅ | ✅ | 一致 |
| ThreadWorktreeHandoffDialog.tsx | ✅ | ✅ | 一致 |
| WhatsNewDialog.tsx | ✅ | ✅ | 一致 |
| WorkspaceSettingsSheet.tsx | ✅ | ✅ | 一致 |
| WorkspaceView.tsx | ✅ | ✅ | 一致 |
| composerFooterLayout.ts | ✅ | ✅ | 一致 |
| composerInlineChip.ts | ✅ | ✅ | 一致 |
| desktopUpdate.logic.ts | ✅ | ✅ | 一致 |
| timelineHeight.ts | ✅ | ✅ | 一致 |
| useProviderDiscoveryData.ts | ✅ | ✅ | 一致 |

**组件覆盖率**: **100%** (所有 PeakCode 组件均已迁移到 Remi Code)

---

## 五、Hooks 对比 (hooks/)

| Hook | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| useAppTypography.ts | ✅ | ✅ | 一致 |
| useChatCodeFont.ts | ✅ | ✅ | 一致 |
| useComposerCommandMenuItems.ts | ✅ | ✅ | 一致 |
| useComposerSlashCommands.ts | ✅ | ✅ | 一致 |
| useCopyToClipboard.ts | ✅ | ✅ | 一致 |
| useDesktopTopBarGutter.ts | ✅ | ✅ | 一致 |
| useDisposableThreadLifecycle.ts | ✅ | ✅ | 一致 |
| useHandleNewChat.ts | ✅ | ✅ | 一致 |
| useHandleNewThread.ts | ✅ | ✅ | 一致 |
| useIsDisposableThread.ts | ✅ | ✅ | 一致 |
| useLocalStorage.ts | ✅ | ✅ | 一致 |
| useMediaQuery.ts | ✅ | ✅ | 一致 |
| useNativeFontSmoothing.ts | ✅ | ✅ | 一致 |
| useProviderUsageSummary.ts | ✅ | ✅ | 一致 |
| useTheme.ts | ✅ | ✅ | 一致 |
| useThreadActivationController.ts | ✅ | ✅ | 一致 |
| useThreadHandoff.ts | ✅ | ✅ | 一致 |
| useThreadWorkspaceHandoff.ts | ✅ | ✅ | 一致 |
| useTurnDiffSummaries.ts | ✅ | ✅ | 一致 |
| useUIFont.ts | ✅ | ✅ | 一致 |

**Hooks 覆盖率**: **100%** (所有 Hook 均已迁移)

---

## 六、Lib 工具库对比 (lib/)

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| appTypography.ts | ✅ | ✅ | 一致 |
| assistantSelections.ts | ✅ | ✅ | 一致 |
| browserPromptContext.ts | ✅ | ✅ | 一致 |
| chatFirstSend.ts | ✅ | ✅ | 一致 |
| chatProjects.ts | ✅ | ✅ | 一致 |
| composerMentions.ts | ✅ | ✅ | 一致 |
| contextWindow.ts | ✅ | ✅ | 一致 |
| desktopProjectRecovery.ts | ✅ | ✅ | 一致 |
| diffRendering.ts | ✅ | ✅ | 一致 |
| disposableThread.ts | ✅ | ✅ | 一致 |
| fontFamily.ts | ✅ | ✅ | 一致 |
| gitReactQuery.ts | ✅ | ✅ | 一致 |
| icons.tsx | ✅ | ✅ | 一致 |
| localFolderMentions.ts | ✅ | ✅ | 一致 |
| localImageUrls.ts | ✅ | ✅ | 一致 |
| lruCache.ts | ✅ | ✅ | 一致 |
| openUsageRateLimits.ts | ✅ | ✅ | 一致 |
| openUsageReactQuery.ts | ✅ | ✅ | 一致 |
| projectCreateRecovery.ts | ✅ | ✅ | 一致 |
| projectPaths.ts | ✅ | ✅ | 一致 |
| projectReactQuery.ts | ✅ | ✅ | 一致 |
| projectScriptKeybindings.ts | ✅ | ✅ | 一致 |
| projectShortcutTargets.ts | ✅ | ✅ | 一致 |
| providerAvailability.ts | ✅ | ✅ | 一致 |
| providerDiscovery.ts | ✅ | ✅ | 一致 |
| providerDiscoveryReactQuery.ts | ✅ | ✅ | 一致 |
| providerReactQuery.ts | ✅ | ✅ | 一致 |
| providerUsageSnapshot.ts | ✅ | ✅ | 一致 |
| rateLimits.ts | ✅ | ✅ | 一致 |
| serverReactQuery.ts | ✅ | ✅ | 一致 |
| shellQuote.ts | ✅ | ✅ | 一致 |
| storage.ts | ✅ | ✅ | 一致 |
| subagentPresentation.ts | ✅ | ✅ | 一致 |
| suppressQueryResponses.ts | ✅ | ✅ | 一致 |
| **tauri-bridge.ts** | ❌ | ✅ | **Remi 新增** |
| terminalCloseConfirmation.ts | ✅ | ✅ | 一致 |
| terminalContext.ts | ✅ | ✅ | 一致 |
| terminalFocus.ts | ✅ | ✅ | 一致 |
| terminalNewAction.ts | ✅ | ✅ | 一致 |
| terminalStateCleanup.ts | ✅ | ✅ | 一致 |
| threadBootstrap.ts | ✅ | ✅ | 一致 |
| threadCreatePromotion.ts | ✅ | ✅ | 一致 |
| threadEnvironment.ts | ✅ | ✅ | 一致 |
| threadHandoff.ts | ✅ | ✅ | 一致 |
| threadRename.ts | ✅ | ✅ | 一致 |
| toolCallLabel.ts | ✅ | ✅ | 一致 |
| turnDiffTree.ts | ✅ | ✅ | 一致 |
| utils.ts | ✅ | ✅ | 一致 |
| voiceRecorder.ts | ✅ | ✅ | 一致 |
| wsHttpUrl.ts | ✅ | ✅ | 一致 |

**Lib 覆盖率**: **100%** (所有工具库均已迁移，Remi Code 新增 tauri-bridge.ts)

---

## 七、Store 模块对比

| Store 文件 | PeakCode | Remi Code | 状态 |
|-----------|----------|-----------|------|
| browserStateStore.ts | ✅ | ✅ | 一致 |
| composerDraftStore.ts | ✅ | ✅ | 一致 |
| focusedChatContext.ts | ✅ | ✅ | 一致 |
| latestProjectStore.ts | ✅ | ✅ | 一致 |
| pinnedThreadsStore.ts | ✅ | ✅ | 一致 |
| repoDiffScopeStore.ts | ✅ | ✅ | 一致 |
| singleChatPanelStore.ts | ✅ | ✅ | 一致 |
| splitViewStore.ts | ✅ | ✅ | 一致 |
| store.ts | ✅ | ✅ | 一致 |
| storeSelectors.ts | ✅ | ✅ | 一致 |
| temporaryThreadStore.ts | ✅ | ✅ | 一致 |
| terminalStateStore.ts | ✅ | ✅ | 一致 |
| threadSelectionStore.ts | ✅ | ✅ | 一致 |
| workspaceStore.ts | ✅ | ✅ | 一致 |

**Store 覆盖率**: **100%** (所有 Store 模块均已迁移)

---

## 八、路由配置对比 (routes/)

| 路由文件 | PeakCode | Remi Code | 状态 |
|---------|----------|-----------|------|
| -chatThreadRoute.logic.ts | ✅ | ✅ | 一致 |
| -rootEventInvalidation.ts | ✅ | ✅ | 一致 |
| __root.tsx | ✅ | ✅ | 一致 |
| _chat.$threadId.tsx | ✅ | ✅ | 一致 |
| _chat.automations.tsx | ✅ | ✅ | 一致 |
| _chat.index.tsx | ✅ | ✅ | 一致 |
| _chat.plugins.tsx | ✅ | ✅ | 一致 |
| _chat.settings.tsx | ✅ | ✅ | 一致 |
| _chat.tsx | ✅ | ✅ | 一致 |
| _chat.workspace.$workspaceId.tsx | ✅ | ✅ | 一致 |
| _chat.workspace.index.tsx | ✅ | ✅ | 一致 |

**路由覆盖率**: **100%** (所有路由均已迁移)

---

## 九、其他关键文件对比

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| appNavigation.ts | ✅ | ✅ | 一致 |
| appSettings.ts | ✅ | ✅ | 一致 |
| branding.ts | ✅ | ✅ | 一致 |
| chat-scroll.ts | ✅ | ✅ | 一致 |
| chatRouteRestore.ts | ✅ | ✅ | 一致 |
| composer-editor-mentions.ts | ✅ | ✅ | 一致 |
| composer-logic.ts | ✅ | ✅ | 一致 |
| composerSlashCommands.ts | ✅ | ✅ | 一致 |
| composerTriggerInsertion.ts | ✅ | ✅ | 一致 |
| confirmDialogFallback.ts | ✅ | ✅ | 一致 |
| contextMenuFallback.ts | ✅ | ✅ | 一致 |
| cursorModelVariants.ts | ✅ | ✅ | 一致 |
| diffRouteSearch.ts | ✅ | ✅ | 一致 |
| editorMetadata.ts | ✅ | ✅ | 一致 |
| editorPreferences.ts | ✅ | ✅ | 一致 |
| env.ts | ✅ | ✅ | 一致 |
| featureFlags.ts | ✅ | ✅ | 一致 |
| file-icons.ts | ✅ | ✅ | 一致 |
| historyBootstrap.ts | ✅ | ✅ | 一致 |
| index.css | ✅ | ✅ | 一致 |
| keybindings.ts | ✅ | ✅ | 一致 |
| localSkillsReactQuery.ts | ✅ | ✅ | 一致 |
| main.tsx | ✅ | ✅ | 一致 |
| markdown-links.ts | ✅ | ✅ | 一致 |
| nativeApi.ts | ✅ | ✅ | 一致 |
| pendingUserInput.ts | ✅ | ✅ | 一致 |
| pluginsRouteSearch.ts | ✅ | ✅ | 一致 |
| projectScripts.ts | ✅ | ✅ | 一致 |
| proposedPlan.ts | ✅ | ✅ | 一致 |
| providerModelOptions.ts | ✅ | ✅ | 一致 |
| providerOrdering.ts | ✅ | ✅ | 一致 |
| pullRequestReference.ts | ✅ | ✅ | 一致 |
| routeTree.gen.ts | ✅ | ✅ | 一致 |
| router.ts | ✅ | ✅ | 一致 |
| session-logic.ts | ✅ | ✅ | 一致 |
| settingsNavigation.ts | ✅ | ✅ | 一致 |
| shortcutsSheet.ts | ✅ | ✅ | 一致 |
| splitView.logic.ts | ✅ | ✅ | 一致 |
| splitViewRoute.ts | ✅ | ✅ | 一致 |
| storageKeyMigration.ts | ✅ | ✅ | 一致 |
| terminal-links.ts | ✅ | ✅ | 一致 |
| terminalActivity.ts | ✅ | ✅ | 一致 |
| terminalPaneLayout.ts | ✅ | ✅ | 一致 |
| threadActivation.logic.ts | ✅ | ✅ | 一致 |
| threadDerivation.ts | ✅ | ✅ | 一致 |
| threadDetailSubscriptionRetention.ts | ✅ | ✅ | 一致 |
| timestampFormat.ts | ✅ | ✅ | 一致 |
| truncateTitle.ts | ✅ | ✅ | 一致 |
| types.ts | ✅ | ✅ | 一致 |
| vite-env.d.ts | ✅ | ✅ | 一致 |
| workspaceTerminalLayoutPresets.ts | ✅ | ✅ | 一致 |
| worktreeCleanup.ts | ✅ | ✅ | 一致 |
| wsNativeApi.ts | ✅ | ✅ | 一致 |
| wsTransport.ts | ✅ | ✅ | 一致 |

---

## 十、i18n 国际化对比

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| I18nContext.tsx | ✅ | ✅ | 一致 |
| index.ts | ✅ | ✅ | 一致 |
| language.ts | ✅ | ✅ | 一致 |
| messages.ts | ✅ | ✅ | 一致 |

---

## 十一、theme 主题对比

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| theme.logic.ts | ✅ | ✅ | 一致 |
| theme.seed.generated.ts | ✅ | ✅ | 一致 |

---

## 十二、whatsNew 新功能对比

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| ChangelogAccordion.tsx | ✅ | ✅ | 一致 |
| FeatureSection.tsx | ✅ | ✅ | 一致 |
| WhatsNewPopoutCard.tsx | ✅ | ✅ | 一致 |
| entries.ts | ✅ | ✅ | 一致 |
| logic.ts | ✅ | ✅ | 一致 |
| useWhatsNew.ts | ✅ | ✅ | 一致 |

---

## 十三、notifications 通知对比

| 文件 | PeakCode | Remi Code | 状态 |
|-----|----------|-----------|------|
| taskCompletion.logic.ts | ✅ | ✅ | 一致 |
| taskCompletion.tsx | ✅ | ✅ | 一致 |

---

## 十四、总结

### 14.1 迁移覆盖率统计

| 维度 | 覆盖率 | 说明 |
|-----|-------|------|
| 桥接层 (Bridge) | **100%** | 所有 PeakCode 功能均已迁移，Remi Code 新增 2 个功能 |
| wsNativeApi | **100%** | 所有方法均已迁移 |
| 组件 (Components) | **100%** | 所有组件均已迁移 |
| Hooks | **100%** | 所有 Hook 均已迁移 |
| Lib 工具库 | **100%** | 所有工具库均已迁移，Remi Code 新增 tauri-bridge.ts |
| Store 模块 | **100%** | 所有 Store 均已迁移 |
| 路由配置 | **100%** | 所有路由均已迁移 |
| 其他文件 | **100%** | 所有其他关键文件均已迁移 |

### 14.2 关键差异

1. **桌面桥接架构变化**:
   - PeakCode: 使用 `window.desktopBridge` (Electron 注入)
   - Remi Code: 使用 `tauriBridge` (Tauri API 封装)
   - 新增文件: `lib/tauri-bridge.ts`

2. **环境检测机制**:
   - PeakCode: 检测 `window.desktopBridge`
   - Remi Code: 检测 `__TAURI__` 全局变量

3. **Remi Code 新增功能**:
   - `tauriBridge.setTheme()` - 主题设置
   - `tauriBridge.browser.onBrowserUseOpenPanelRequest()` - 浏览器面板请求监听

### 14.3 结论

**迁移完成度: 100%**

所有 PeakCode 的前端功能均已成功迁移到 Remi Code，包括：
- ✅ 所有 UI 组件
- ✅ 所有 Hooks
- ✅ 所有工具库
- ✅ 所有 Store 模块
- ✅ 所有路由配置
- ✅ 所有桥接方法
- ✅ 所有 wsNativeApi 方法

Remi Code 在迁移过程中还新增了 Tauri 特定的功能支持，体现了从 Electron 到 Tauri 的技术栈升级。

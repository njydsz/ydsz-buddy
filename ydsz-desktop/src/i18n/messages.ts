/**
 * @file messages.ts
 * @description 集中管理所有面向用户的 UI 字符串，以便 React 组件树可以根据语言动态切换翻译内容，
 *              而无需修改调用方代码。消息按键（surface）分组，便于未来迁移到翻译工具时将其
 *              重新导出为扁平化的命名空间 ID。模板使用 ${...} 语法进行插值。 * @module messages
 */

import type { Language } from "./language";

/**
 * 翻译消息类型定义。
 * 定义了所有 UI 字符串的结构，按键分组组织。
 * 每个分组对应应用的一个功能模块或界面区域。
 * 部分字段为函数类型，用于支持动态插值（如传入用户名、数量等）。
 */
export type Messages = {
  common: {
    cancel: string;
    save: string;
    delete: string;
    confirm: string;
    retry: string;
    close: string;
    open: string;
    ok: string;
    done: string;
    loading: string;
    yes: string;
    no: string;
    errorOccurred: string;
    unexpectedError: string;
  };
  appShell: {
    connecting: string;
  };
  appNavigation: {
    back: string;
    backMac: string;
    backWin: string;
    forward: string;
    forwardMac: string;
    forwardWin: string;
  };
  accountBar: {
    guest: string;
    settingsTooltip: string;
    deviceTooltip: string;
    userMenuTooltip: string;
  };
  errorFallback: {
    title: string;
    retry: string;
    reload: string;
    showDetails: string;
    hideDetails: string;
    unexpected: string;
    noDetails: string;
    copyDetails: string;
    copySuccessTitle: string;
    copySuccessDescription: string;
    copyFailedTitle: string;
    copyFailedDescription: string;
  };
  splash: {
    retry: string;
  };
  providerFeedback: {
    switchedTitle: (provider: string) => string;
    switchedDescription: string;
    switchFailedTitle: string;
    switchFailedDescription: (provider: string) => string;
  };
  networkStatus: {
    offlineMessage: string;
    offlineMessageWithCount: (count: number) => string;
    degradedMessage: string;
    providerFallbackMessage: (provider: string) => string;
    flushStartToastTitle: string;
    flushStartToastDescription: (count: number) => string;
    flushCompleteToastTitle: string;
    flushCompleteToastDescription: (count: number) => string;
    flushFailedToastTitle: string;
    flushFailedToastDescription: string;
    saveDraftToastTitle: string;
    saveDraftToastDescription: (count: number) => string;
    removeDraftAria: string;
    draftsHeading: string;
    draftsEmpty: string;
    flushNowButton: string;
    flushAllButton: string;
    dismissAria: string;
    wsReconnectingMessage: string;
    wsReconnectedMessage: string;
    wsReconnectFailedMessage: string;
  };
  landing: {
    workTitle: string;
    codeTitle: string;
    workSubtitle: string;
    codeSubtitle: string;
    workBadge: string;
    codeBadge: string;
    workHint: string;
    codeHint: string;
    /** 品牌名（WorkBuddy 风格大标题左侧） */
    brandName: string;
    /** 品牌标语（WorkBuddy 风格大标题右侧） */
    brandTagline: string;
    quickActionsHeading: string;
    quickActionWebRead: string;
    quickActionResearch: string;
    quickActionDataMining: string;
    quickActionFileManager: string;
    quickActionAppDev: string;
    quickActionProjectInsight: string;
    quickActionDebugFix: string;
    quickActionCodeReview: string;
    quickActionGameIdea: string;
    quickActionToolScript: string;
    /** WorkBuddy 风格快捷入口：文档处理 */
    quickActionDocProcess: string;
    /** WorkBuddy 风格快捷入口：数据分析 */
    quickActionDataAnalysis: string;
    /**
     * Code 模式 composer 的占位提示
     */
    codeComposerPlaceholder: string;
    /**
     * 「打开终端」按钮文案(workspace landing 和其他场景共用)
     */
    openTerminal: string;
  };
  codeEditor: {
    noFileOpen: string;
    loading: string;
    loadError: string;
    binaryFile: string;
    save: string;
    readOnly: string;
    enableEdit: string;
    files: string;
    refresh: string;
    closeTab: string;
    openEditor: string;
    closeEditor: string;
  };
  sidebar: {
    brandLabel: string;
    newChat: string;
    newChatTooltip: string;
    newDisposableTooltip: string;
    search: string;
    threads: string;
    chats: string;
    workspace: string;
    recent: string;
    settings: string;
    addProject: string;
    noProjectsYet: string;
    noProjectsYetDescription: string;
    noWorkspacesYet: string;
    newWorkspace: string;
    chooseProjectFolder: string;
    openingFolderPicker: string;
    addingProject: string;
    loadingProjects: string;
    toggleSidebar: string;
    codeLabel: string;
    disposableChat: string;
    pendingApproval: string;
    commandsHeading: string;
    skillsLabel: string;
    pluginsLabel: string;
    automationsLabel: string;
    /**
     * 侧栏 Wiki 入口的显示标签。
     * 用户在侧栏网格中点击该卡片可进入 `/wiki` 路由,
     * 浏览、搜索项目 Wiki 文档。
     */
    wikiLabel: string;
    /**
     * 侧栏 Code Editor 入口的显示标签。
     * 点击后进入 `/editor` 路由,在内联 Monaco 编辑器中查看和编辑工作区文件。
     */
    editorLabel: string;
    /**
     * 编辑器着陆页提示文案:尚未选择工作区目录时显示。
     */
    editorNoWorkspace: string;
    /**
     * 侧栏 Pull Requests 入口的显示标签。
     * 点击后进入 `/pulls` 路由,在内嵌面板中浏览当前工作区的 GitHub PRs。
     */
    pullsLabel: string;
    /**
     * PR 浏览器着陆页提示文案:尚未选择工作区目录时显示。
     */
    pullsNoWorkspace: string;
    /**
     * 侧栏 Linear Tasks 入口的显示标签。
     * 点击后进入 `/linear` 路由,在内嵌面板中浏览 Linear 任务并从任务创建线程。
     */
    linearLabel: string;
    /**
     * Linear 任务浏览器着陆页提示文案:尚未选择工作区目录时显示。
     */
    linearNoWorkspace: string;
    /**
     * 侧栏 Extensions 入口的显示标签。
     * 点击后进入 `/plugins?tab=extensions` 路由,管理本地扩展(启用/停用/卸载/安装)。
     */
    extensionsLabel: string;
    automationsComingSoon: string;
    confirm: string;
    confirmArchive: string;
    archive: string;
    openNewChatHome: string;
    settingsAria: string;
    showMore: string;
    showLess: string;
    projectActionAdd: string;
    projectActionRename: string;
    projectActionRemove: string;
    projectActionCopyPath: string;
    projectActionArchive: string;
    projectActionDeleteThreads: string;
    intelOnArmTitle: string;
    sortProjects: string;
    sortThreads: string;
    sortChats: string;
    sortRecentlyActive: string;
    sortRecentlyAdded: string;
    sortCreatedAt: string;
    sortManual: string;
    sortNewestFirst: string;
    projectSortMenuHeader: string;
    threadSortMenuHeader: string;
    pinThread: string;
    unpinThread: string;
    addProjectError: string;
    openFolderError: string;
    linkUnavailable: string;
    openPRError: string;
    openFinderError: string;
    openTerminalError: string;
    removeProjectError: (name: string) => string;
    removeProjectSuccess: (name: string) => string;
    projectRenameSyncError: string;
    thread: {
      pinError: (action: "pin" | "unpin") => string;
      renameError: string;
      renameEmpty: string;
      handoffError: string;
      archiveRunningTitle: string;
      archiveRunningDescription: string;
      archiveEmpty: (projectName: string) => string;
      archiveFailedTitle: string;
      archiveSuccessOne: string;
      archiveSuccessMany: (count: number) => string;
      archiveError: string;
      deleteEmpty: string;
      deleteWorktreeWarning: string;
      deleteSuccessOne: string;
      deleteSuccessMany: (count: number) => string;
      deleteError: string;
      pathUnavailable: string;
      pathCopyUnavailable: string;
      pathOpenUnavailable: string;
      copyThreadId: string;
      copyThreadIdFailed: string;
      copyPath: string;
      copyPathFailed: string;
    };
    update: {
      availableTitle: string;
      availableDescription: (version: string) => string;
      upToDateTitle: string;
      upToDateDescription: (version: string) => string;
      checkFailedTitle: string;
      checkFailedDescription: string;
      downloadedTitle: string;
      downloadedDescription: string;
      downloadFailedTitle: string;
      downloadFailedDescription: string;
      startFailedTitle: string;
      startFailedDescription: string;
      installFailedTitle: string;
      installFailedDescription: string;
      unexpectedError: string;
    };
    command: {
      openHome: {
        title: string;
        description: string;
      };
      newChat: {
        title: string;
        description: string;
      };
      addProject: {
        title: string;
        description: string;
      };
      attachSession: {
        title: string;
        description: string;
      };
      openSettings: {
        title: string;
        description: string;
      };
    };
    deleteWorkspace: string;
    parallelSessions: string;
    parallelSessionsRunning: (count: number) => string;
    parallelSessionsOpen: string;
    threadDeletedToastTitle: string;
    threadDeletedToastDescription: (title: string) => string;
  };
  searchPalette: {
    importHeading: string;
    suggestedGroup: string;
    projectsGroup: string;
    configureGroup: string;
    inputHint: string;
    enterHint: string;
  };
  chat: {
    loadingModels: string;
    newChat: string;
    handOff: string;
    run: string;
    stop: string;
    share: string;
    compact: string;
    plan: string;
    planModeHint: string;
    noActiveThread: string;
    selectOrCreate: string;
    clearUnavailable: string;
    clearUnavailableDescription: string;
    implementationFailed: string;
    handoffError: string;
    refreshProviderStatus: string;
    deletedAction: (name: string) => string;
    deleteActionFailed: string;
    updateAccessModeFailed: string;
    tooManyAttachments: (max: number) => string;
    browserAttachFailed: string;
    imagePreview: string;
    imagePreviewClose: string;
    imagePreviewPrev: string;
    imagePreviewNext: string;
    attachImagesAfterPlan: string;
    voice: {
      authRequiredTitle: string;
      authRequiredDescription: string;
      authSessionTitle: string;
      authSessionDescription: string;
      planUnansweredTitle: string;
      planUnansweredDescription: string;
      startFailedTitle: string;
      startFailedDescription: string;
      transcriptionUnavailableTitle: string;
      transcriptionUnavailableDescription: string;
      noAudioTitle: string;
      noAudioDescription: string;
      transcribeFailedTitle: string;
      transcribeFailedDescription: string;
      polishToggleLabel: string;
      polishToggleDescription: string;
      polishAppliedToastTitle: string;
      polishAppliedToastDescription: (rules: number) => string;
    };
    offline: {
      draftSavedToastTitle: string;
      draftSavedToastDescription: string;
      draftsRestoredToastTitle: string;
      draftsRestoredToastDescription: string;
      networkDegradedTitle: string;
      networkDegradedDescription: string;
      networkOfflineTitle: string;
      networkOfflineDescription: string;
    };
    continueInNewWorktree: string;
    reviewLocalChanges: string;
    reviewBranchDiff: string;
    composerPlaceholder: (providerName: string) => string;
    stopGenerationAria: string;
    stopGenerationTitle: string;
    implementationActionsAria: string;
    imagePlaceholder: (count: number) => string;
    renameError: string;
    renameEmpty: string;
    timeline: {
      editMessage: string;
      editAndResend: string;
      revertLabel: string;
      revertTooltip: string;
      revertConfirmTitle: string;
      revertConfirmDescription: string;
      revertMessagePreview: string;
      revertWarning: string;
      revertConfirmButton: string;
      undoUnavailable: string;
      emptyResponse: string;
      response: string;
      responseWithSummary: (summary: string) => string;
      showLess: string;
      showMore: string;
      showMoreCount: (count: number) => string;
      moreToolCalls: (count: number) => string;
      edited: string;
      oneFileChanged: string;
      filesChanged: (count: number) => string;
      collapseFiles: string;
      expandFiles: string;
      undo: string;
      workingFor: (duration: string) => string;
      workingForPrefix: string;
      working: string;
      emptyChat: string;
    };
    rollback: {
      drawerTitle: (turnCount: number) => string;
      drawerDescription: string;
      turns: string;
      files: string;
      lines: string;
      filesHeading: string;
      moreFiles: (extra: number) => string;
      showDiff: string;
      hideDiff: string;
      loadingDiff: string;
      warning: (turnCount: number) => string;
      cancel: string;
      confirm: string;
      reverting: string;
      apiUnavailable: string;
    };
    copy: {
      buttonAria: string;
      success: string;
      failed: string;
    };
  };
  chatEmptyState: {
    title: string;
    subtitle: string;
    whatShouldWeWorkOn: string;
    whatShouldWeDoIn: string;
    thisFolder: string;
  };
  chatHeader: {
    closeSidechat: string;
  };
  a11y: {
    skipToContent: string;
  };
  projectRules: {
    indicatorLabel: string;
    countSummary: string;
    clickToView: string;
    truncatedSuffix: string;
    previewMerged: string;
    noRulesHint: string;
    filesHeading: string;
    teamAppliedBadge: string;
    teamDisabledBadge: string;
    teamErrorBadge: string;
    teamAppliedHint: string;
  };
  teamRules: {
    viewTitle: string;
    viewDescription: string;
    enabledLabel: string;
    enabledHint: string;
    teamNameLabel: string;
    teamNamePlaceholder: string;
    remoteUrlLabel: string;
    remoteUrlPlaceholder: string;
    remoteCommitLabel: string;
    listHeading: string;
    createRule: string;
    editRule: string;
    deleteRule: string;
    deleteConfirm: string;
    ruleNameLabel: string;
    ruleNamePlaceholder: string;
    ruleContentLabel: string;
    ruleContentPlaceholder: string;
    saveRule: string;
    cancel: string;
    emptyState: string;
    summary: string;
    bytesLabel: string;
    truncatedBadge: string;
    previewMerged: string;
    noRulesHint: string;
    saveSuccess: string;
    saveFailure: string;
    deleteSuccess: string;
    deleteFailure: string;
    manifestUpdated: string;
    manifestFailed: string;
    openInExplorer: string;
    openInExplorerHint: string;
    reload: string;
    reloadHint: string;
    teamNameHelp: string;
    remoteUrlHelp: string;
    enableToggleHelp: string;
    blankStateTitle: string;
    blankStateDescription: string;
  };
  chatRoute: {
    loadingDiff: string;
    splitPaneEmptyTitle: string;
    splitPaneEmptyProject: string;
  };
  composer: {
    placeholder: string;
    placeholderApproval: string;
    placeholderProgress: string;
    placeholderPlan: string;
    placeholderFollowUp: string;
    placeholderDisconnected: string;
    moreAria: string;
    extrasAria: string;
    modeLabel: string;
    buildLabel: string;
    planLabel: string;
    localLabel: string;
    codexLabel: string;
    removeImage: string;
    pendingApproval: string;
    pendingUserInput: string;
    cancelTurn: string;
    decline: string;
    alwaysAllow: string;
    approveOnce: string;
    terminalContextExpired: string;
    voiceTranscribing: string;
    voiceStop: string;
    voiceRecord: string;
    voiceHoldToRecord: string;
    statusDialog: {
      local: string;
      worktree: string;
      newWorktreePending: string;
    };
    slashCommands: {
      local: string;
      worktree: string;
      plan: string;
      newChat: string;
    };
    contextWindowLabel: string;
    contextWindowPercent: (percent: number) => string;
    sendMessage: string;
    sendingBusy: string;
    sendingConnecting: string;
    sendingTranscribing: string;
    sendingPreparingWorktree: string;
    steer: string;
    deleteQueuedFollowUp: string;
    queuedFollowUpActions: string;
    queuedFollowUp: string;
    planAccept: string;
    planAcceptTooltip: string;
    planAcceptedToast: string;
    planRevise: string;
    planReviseTooltip: string;
    planReviseToast: string;
    planReject: string;
    planRejectTooltip: string;
    planRejectedToast: string;
  };
  skills: {
    title: string;
    subtitle: string;
    newSkill: string;
    browseSkillSh: string;
    searchPlaceholder: string;
    localHeading: string;
    localCount: string;
    localEmptyTitle: string;
    localEmptyDescription: string;
    localEmptySearchTitle: string;
    localEmptySearchDescription: string;
    providerHeading: string;
    providerHint: string;
    installedHeading: string;
    emptyTitle: string;
    emptyDescription: string;
    emptySearchTitle: string;
    emptySearchDescription: string;
    unavailableTitle: string;
    unavailableDescription: string;
    needsWorkspace: string;
    marketplaceHeading: string;
    marketplaceSourceRemote: string;
    marketplaceSourceDiskCache: string;
    marketplaceSourceBuiltin: string;
    marketplaceCount: (count: number) => string;
    marketplaceLastRefreshed: (timestamp: string) => string;
    marketplaceLastRefreshedNever: string;
    marketplaceRefresh: string;
    marketplaceRefreshing: string;
    marketplaceEditUrl: string;
    marketplaceUrlDialogTitle: string;
    marketplaceUrlDialogDescription: string;
    marketplaceUrlLabel: string;
    marketplaceUrlPlaceholder: string;
    marketplaceUrlInvalid: string;
    marketplaceUrlApply: string;
    marketplaceUrlApplyAndRefresh: string;
    marketplaceUrlReset: string;
    marketplaceUrlCancel: string;
    marketplaceStatusBadgeTitle: string;
    marketplaceStatusRemoteTitle: string;
    marketplaceStatusDiskCacheTitle: string;
    marketplaceStatusBuiltinTitle: string;
  };
  automations: {
    subtitle: string;
    viewTemplates: string;
    createFromChat: string;
    emptyTitle: string;
    emptyDescription: string;
    templatesHeading: string;
    templatesHint: string;
  };
  voicePolish: {
    previewTitle: string;
    previewRevert: string;
    previewDismiss: string;
    previewTruncated: string;
    previewAutoAccept: (seconds: number) => string;
    noChanges: string;
  };
  ocr: {
    triggerButton: string;
    triggerButtonAria: string;
    triggerHint: string;
    recognizing: string;
    recognizedLines: (count: number) => string;
    noText: string;
    errorFallback: string;
    noProviderTitle: string;
    noProviderDescription: string;
    installTesseractHint: string;
    languageLabel: string;
    languageAuto: string;
    languageEnglish: string;
    languageChinese: string;
    providerActive: string;
    providerMacosVision: string;
    providerWindowsOcr: string;
    providerTesseract: string;
    providerNone: string;
    providersTitle: string;
    providersDescription: string;
    insertToComposer: string;
    copyText: string;
    closeAria: string;
  };
  eventReplay: {
    title: string;
    descriptionWithCount: (count: number) => string;
    empty: string;
    play: string;
    pause: string;
    stepBack: string;
    stepForward: string;
    reset: string;
    speed: string;
    scrubberAria: string;
    position: (current: number, total: number) => string;
    hintShortcuts: string;
  };
  settings: {
    title: string;
    restoreDefaults: string;
    backToApp: string;
    nav: {
      general: { label: string; description: string };
      appearance: { label: string; description: string };
      notifications: { label: string; description: string };
      behavior: { label: string; description: string };
      worktrees: { label: string; description: string };
      archived: { label: string; description: string };
      budget: { label: string; description: string };
      agent: { label: string; description: string };
      mcp: { label: string; description: string };
      cue: { label: string; description: string };
      models: { label: string; description: string };
      conversationFlow: { label: string; description: string };
      browser: { label: string; description: string };
      indexer: { label: string; description: string };
      skills: { label: string; description: string };
      rules: { label: string; description: string };
      imageGen: { label: string; description: string };
      im: { label: string; description: string };
      mobile: { label: string; description: string };
      advanced: { label: string; description: string };
      push: { label: string; description: string };
    };
    groups: {
      app: string;
      ydszBuddy: string;
    };
    general: {
      heading: string;
      description: string;
      coreDefaults: string;
      sidebarOrganization: string;
      language: {
        title: string;
        description: string;
        english: string;
        chinese: string;
      };
      defaultProvider: {
        title: string;
        description: string;
        resetLabel: string;
      };
      newThreads: {
        title: string;
        description: string;
        resetLabel: string;
        local: string;
        worktree: string;
      };
      sidebarPosition: {
        title: string;
        description: string;
        left: string;
        right: string;
        resetLabel: string;
      };
      projectOrder: {
        title: string;
        description: string;
        recentlyActive: string;
        recentlyAdded: string;
        manual: string;
        resetLabel: string;
      };
      threadOrder: {
        title: string;
        description: string;
        recentlyActive: string;
        newestFirst: string;
        resetLabel: string;
      };
    };
    appearance: {
      heading: string;
      description: string;
      themeAndTypographySection: string;
      timeAndReadingSection: string;
      accessibilitySection: string;
      theme: {
        title: string;
        description: string;
        system: string;
        light: string;
        dark: string;
        systemDescription: string;
        lightDescription: string;
        darkDescription: string;
      };
      lightThemeCard: {
        title: string;
        contextActive: string;
        contextInactive: string;
        contextSystemActive: string;
        contextSystemInactive: string;
      };
      darkThemeCard: {
        title: string;
        contextActive: string;
        contextInactive: string;
        contextSystemActive: string;
        contextSystemInactive: string;
      };
      themePackReset: string;
      themePackCopy: string;
      themePackImport: string;
      themePackShareStringAria: string;
      themePackCodeThemeAria: (label: string) => string;
      themePackTranslucentAria: (label: string) => string;
      themePackResetAria: (label: string) => string;
      themePackHexAria: (label: string) => string;
      accent: string;
      background: string;
      foreground: string;
      uiFontLabel: string;
      codeFontLabel: string;
      translucentSidebar: string;
      contrast: string;
      timestamp: {
        title: string;
        description: string;
        systemDefault: string;
        twelveHour: string;
        twentyFourHour: string;
        ariaLabel: string;
      };
      typography: {
        title: string;
        description: string;
        uiFont: string;
        codeFont: string;
        baseFontSize: string;
        fontSmoothing: string;
        uiFontDescription: string;
        codeFontDescription: string;
        baseFontSizeDescription: string;
        fontSmoothingDescription: string;
        uiFontAria: string;
        codeFontAria: string;
        baseFontSizeAria: string;
        fontSmoothingAria: string;
        unitPx: string;
      };
      accessibility: {
        fontSizeScale: string;
        fontSizeScaleDescription: string;
        fontSizeScaleAria: string;
        fontSizeScaleOption: (label: string) => string;
        fontSizeScaleSmall: string;
        fontSizeScaleMedium: string;
        fontSizeScaleLarge: string;
        fontSizeScaleXlarge: string;
        fontSizePercent: string;
        fontSizePercentDescription: string;
        fontSizePercentAria: string;
        fontSizePercentReset: string;
        highContrast: string;
        highContrastDescription: string;
        highContrastAria: string;
        highContrastAuto: string;
        highContrastOn: string;
        highContrastOff: string;
        highContrastSystemHint: (prefers: boolean) => string;
        performance: string;
        performanceDescription: string;
        performanceAria: string;
        performanceAuto: string;
        performanceReduced: string;
        performanceMinimal: string;
        performanceCurrentFps: (fps: number) => string;
        performanceAutoHint: string;
      };
    };
    notifications: {
      heading: string;
      description: string;
      activityAlertsSection: string;
      unavailableTitle: string;
      supportBrowserBlocked: string;
      supportBrowserPrompt: string;
      supportBrowserGranted: string;
      supportDesktopUnsupported: string;
      supportDesktopGranted: string;
      supportDesktopDenied: string;
      testTitle: string;
      testBody: string;
      testSuccessTitle: string;
      testUnavailableTitle: string;
      testSuccessDescriptionDesktop: string;
      testUnavailableDescriptionDesktop: string;
      testSuccessDescriptionBrowser: string;
      testButton: string;
      activityToasts: {
        title: string;
        description: string;
        ariaLabel: string;
      };
      desktopNotifications: {
        title: string;
        description: string;
        ariaLabel: string;
      };
    };
    behavior: {
      heading: string;
      description: string;
      runtimeSection: string;
      safetySection: string;
      assistantOutput: string;
      voicePolish: string;
      assistantOutputDescription: string;
      assistantOutputAria: string;
      voicePolishTitle: string;
      voicePolishDescription: string;
      voicePolishAria: string;
      diffLineWrapping: string;
      diffLineWrappingDescription: string;
      diffLineWrappingAria: string;
      deleteConfirmation: string;
      deleteConfirmationDescription: string;
      deleteConfirmationAria: string;
      archiveConfirmation: string;
      archiveConfirmationDescription: string;
      archiveConfirmationAria: string;
      terminalCloseConfirmation: string;
      terminalCloseConfirmationDescription: string;
      terminalCloseConfirmationAria: string;
      voicePolishAdvanced: string;
      voicePolishAdvancedDescription: string;
      voicePolishRemoveFillerWords: string;
      voicePolishRemoveFillerWordsDescription: string;
      voicePolishFixGrammar: string;
      voicePolishFixGrammarDescription: string;
      voicePolishAddStructure: string;
      voicePolishAddStructureDescription: string;
      voicePolishTargetLanguage: string;
      voicePolishTargetLanguageDescription: string;
      voicePolishTargetLanguageAuto: string;
      voicePolishTargetLanguageZh: string;
      voicePolishTargetLanguageEn: string;
    };
    worktrees: {
      heading: string;
      description: string;
      managedSection: string;
      loading: string;
      loadFailedFallback: string;
      emptyState: string;
      worktreeLabel: string;
      conversationsLabel: string;
      noConversations: string;
      deleteButton: string;
      deleteWarning: string;
      verifyTitle: string;
      verifyDescription: string;
      deleteConfirmWithLinks: (name: string, count: number) => string;
      deleteConfirm: (name: string) => string;
      deleteAnyway: string;
      deleteLinkedActive: (active: number) => string;
      deleteLinkedArchived: (archived: number) => string;
      deleteArchivedWillDeleteFirst: string;
      deleteLinkedWarning: string;
      deleteRemovesFromDisk: string;
      deletedTitle: string;
      deletedDescriptionWithArchived: (name: string, count: number) => string;
      deletedDescription: (name: string) => string;
      deleteErrorTitle: string;
      deleteErrorFallback: string;
    };
    archived: {
      heading: string;
      description: string;
      emptySection: string;
      emptyTitle: string;
      emptyDescription: string;
      unknownProject: string;
      archivedAt: (when: string) => string;
      restoreButton: string;
      deleteButton: string;
      restoreTitle: string;
      restoreDescription: string;
      restoreErrorTitle: string;
      restoreErrorFallback: string;
      deleteConfirm: (title: string) => string;
      deleteTitle: string;
      deleteDescription: string;
      deleteErrorTitle: string;
      deleteErrorFallback: string;
      contextMenuRestore: string;
      contextMenuDelete: string;
    };
    models: {
      heading: string;
      description: string;
      generationSection: string;
      customSection: string;
      gitWritingModel: string;
      gitWritingModelDescription: string;
      gitWritingModelAria: string;
      customModelEmpty: string;
      customModelBuiltIn: string;
      customModelTooLong: (max: number) => string;
      customModelDuplicate: string;
      customModelResetLabel: string;
      customAddPlaceholder: string;
      customAddButton: string;
      customAddAria: string;
      customProviderAria: string;
      customRemoveAria: (slug: string) => string;
      customShowLess: string;
      customShowMore: (count: number) => string;
      savedModelSlugs: string;
      savedModelSlugsDescription: string;
      managementTitle: string;
      managementDescription: string;
      addModel: string;
      addModelTooltip: string;
      builtInLabel: string;
      customLabel: string;
      customEmpty: string;
      customCreateLink: string;
      dialogTitle: string;
      dialogTabProvider: string;
      dialogTabCustom: string;
      dialogProviderLabel: string;
      dialogProviderPlaceholder: string;
      dialogModelLabel: string;
      dialogModelPlaceholder: string;
      dialogApiKeyLabel: string;
      dialogApiKeyPlaceholder: string;
      dialogAdvancedConfig: string;
      dialogDisplayNameLabel: string;
      dialogDisplayNamePlaceholder: string;
      dialogDisplayNameHint: string;
      dialogContextWindowLabel: string;
      dialogContextInput: string;
      dialogContextOutput: string;
      dialogToolRoundsLabel: string;
      dialogToolRoundsPlaceholder: string;
      dialogMultiModel: string;
      dialogSubmit: string;
      dialogApiFormatLabel: string;
      dialogApiFormatOpenAI: string;
      dialogApiFormatAnthropic: string;
      dialogCustomUrlLabel: string;
      dialogCustomUrlPlaceholder: string;
      dialogCustomUrlHint: string;
      dialogCustomUrlComplete: string;
      dialogModelIdLabel: string;
      dialogModelIdPlaceholder: string;
    };
    byok: {
      heading: string;
      description: string;
      emptyState: string;
      testConnection: string;
      testing: string;
      discoverModels: string;
      discovering: string;
      discoveryReachable: (version: string | undefined) => string;
      discoveryUnreachable: (reason: string) => string;
      discoveryNoModels: string;
      discoveryModelsLabel: (count: number) => string;
      selectModel: string;
      popularModelsLabel: string;
      noDiscoveryYet: string;
      refresh: string;
    };
    providers: {
      heading: string;
      description: string;
      updatesSection: string;
      pickerSection: string;
      toolsSection: string;
      installTitle: (providerName: string) => string;
      visibility: {
        title: string;
        description: string;
        statusAllVisible: string;
        statusCustomOrder: string;
        statusHidden: (count: number) => string;
        statusHiddenOne: string;
        showAria: (name: string) => string;
        reorderAria: (name: string) => string;
        resetLabel: string;
      };
      updates: {
        title: string;
        description: string;
        statusNoUpdates: string;
        statusAvailableOne: string;
        statusAvailableMany: (count: number) => string;
        statusAvailablePlural: (count: number) => string;
        manualUpdate: string;
        updateButton: string;
        updatingButton: string;
        commandLabel: string;
        runCommandTitle: (command: string) => string;
        versionAdvisoryNoCommand: string;
      };
      tools: {
        title: string;
        description: string;
        statusNoUpdates: string;
        statusAvailableOne: string;
        statusAvailableMany: (count: number) => string;
        statusAvailablePlural: (count: number) => string;
        customBadge: string;
        resetLabel: string;
        binaryPathLabel: (providerName: string) => string;
        homePathLabel: string;
        homePathDescription: string;
        agentDirLabel: string;
        agentDirDescription: string;
        apiEndpointLabel: string;
        apiEndpointDescription: string;
        serverUrlLabel: (providerName: string) => string;
        serverUrlDescription: (providerName: string) => string;
        serverPasswordLabel: (providerName: string) => string;
        serverPasswordDescription: (providerName: string) => string;
        binaryPathDescription: (command: string) => string;
        binaryPathPlaceholder: (providerName: string) => string;
        homePathPlaceholder: string;
        agentDirPlaceholder: string;
        apiEndpointPlaceholder: string;
        serverUrlPlaceholder: string;
        serverPasswordPlaceholder: (providerName: string) => string;
      };
      docs: {
        install: string;
        update: string;
        config: string;
        headless: string;
        label: string;
      };
      update: {
        queued: string;
        updating: string;
        updated: string;
        failed: string;
        stillOutdated: string;
        versionDelta: (current: string, latest: string) => string;
        latest: (version: string) => string;
        current: (version: string) => string;
        errorFallback: string;
      };
      cliDocs: string;
    };
    advanced: {
      heading: string;
      description: string;
      developerSection: string;
      aboutSection: string;
      keybindings: {
        title: string;
        description: string;
        pathPlaceholder: string;
        openEditorHint: string;
        openButton: string;
        openingButton: string;
        noEditor: string;
        openError: string;
        noEditorToast: string;
        openErrorFallback: string;
        openErrorUnknown: string;
      };
      recovery: {
        title: string;
        description: string;
        offerReason: string;
        hiddenReason: string;
        whatThisDoesLabel: string;
        whatThisDoesBody: string;
        repairButton: string;
        repairingButton: string;
        confirmTitle: string;
        confirmDescription: string;
        confirmSpacer: string;
        successTitle: string;
        successDescription: string;
        errorTitle: string;
        errorFallback: string;
      };
      version: {
        title: string;
        description: string;
        releaseHistory: string;
        releaseHistoryDescription: string;
        viewReleaseHistory: string;
      };
      idleLock: {
        heading: string;
        description: string;
        enabledLabel: string;
        enabledDescription: string;
        thresholdLabel: string;
        thresholdDescription: (seconds: number) => string;
        thresholdSecondsUnit: string;
        privacyOnlyLabel: string;
        privacyOnlyDescription: string;
        pinLabel: string;
        pinPlaceholder: string;
        pinDescription: string;
        pinMissing: string;
        setPinButton: string;
        clearPinButton: string;
        pinMinHint: string;
        statusLabel: string;
        statusArmed: string;
        statusDisarmed: string;
        statusLocked: string;
        idleSecondsLabel: (seconds: number) => string;
        lockNowButton: string;
        armButton: string;
        disarmButton: string;
        lockedOverlayTitle: string;
        lockedOverlaySubtitle: string;
        lockedOverlayPinPlaceholder: string;
        lockedOverlayUnlockButton: string;
        lockedOverlayUnlockErrorMismatch: string;
        lockedOverlayUnlockErrorPinNotSet: string;
        lockedOverlayUnlockErrorNotLocked: string;
        lockedOverlayUnlockErrorUnknown: string;
        changedSettingLabel: {
          idleLockEnabled: string;
          idleLockThreshold: string;
          idleLockPrivacyOnly: string;
          idleLockPin: string;
        };
      };
      mcpSection: string;
      mcpDescription: string;
      mcpNoWorkspace: string;
      sshSection: string;
      sshDescription: string;
      sshNoWorkspace: string;
    };
    agent: {
      title: string;
      heading: string;
      description: string;
      customAgents: {
        label: string;
        empty: string;
        create: string;
        createTooltip: string;
      };
      builtInAgents: {
        label: string;
        code: {
          name: string;
          description: string;
        };
        work: {
          name: string;
          description: string;
        };
        plan: {
          name: string;
          description: string;
        };
        review: {
          name: string;
          description: string;
        };
        ask: {
          name: string;
          description: string;
        };
      };
      toolPermissions: {
        title: string;
        description: string;
        status: string;
        currentLevel: string;
        fileReadWriteAll: string;
        fileRead: string;
        none: string;
        ariaLabel: string;
      };
      sandbox: {
        title: string;
        description: string;
        worktreeIsolation: string;
        worktreeIsolationDescription: string;
        worktreeIsolationAria: string;
      };
      retry: {
        title: string;
        description: string;
        autoRetry: string;
        autoRetryDescription: string;
        autoRetryAria: string;
      };
    };
    mcp: {
      title: string;
      heading: string;
      description: string;
      servers: {
        title: string;
        description: string;
        status: string;
        add: string;
        test: string;
        testing: string;
        remove: string;
        enable: string;
        disable: string;
        connected: string;
        disconnected: string;
        error: string;
        noWorkspace: string;
        transportType: string;
        stdio: string;
        sse: string;
        commandLabel: string;
        commandPlaceholder: string;
        argsLabel: string;
        envLabel: string;
      };
      presets: {
        title: string;
        description: string;
        install: string;
        installed: string;
      };
    };
    cue: {
      title: string;
      heading: string;
      description: string;
      templates: {
        title: string;
        description: string;
        status: string;
        add: string;
        edit: string;
        remove: string;
        empty: string;
      };
      responseTuning: {
        title: string;
        description: string;
        temperature: string;
        temperatureDescription: string;
        maxTokens: string;
        maxTokensDescription: string;
      };
      voicePolish: {
        title: string;
        description: string;
        enabled: string;
        enabledDescription: string;
        ariaLabel: string;
      };
    };
    conversationFlow: {
      title: string;
      heading: string;
      description: string;
      contextWindow: {
        title: string;
        description: string;
        status: string;
        maxTokens: string;
        maxTokensDescription: string;
        compaction: string;
        compactionDescription: string;
        compactionAria: string;
      };
      turnLimits: {
        title: string;
        description: string;
        maxTurns: string;
        maxTurnsDescription: string;
        maxRetries: string;
        maxRetriesDescription: string;
      };
      streaming: {
        title: string;
        description: string;
        enabled: string;
        enabledDescription: string;
        ariaLabel: string;
      };
    };
    browser: {
      title: string;
      heading: string;
      description: string;
      automation: {
        title: string;
        description: string;
        status: string;
        enabled: string;
        enabledDescription: string;
        ariaLabel: string;
      };
      security: {
        title: string;
        description: string;
        blockedHosts: string;
        blockedHostsDescription: string;
        rateLimit: string;
        rateLimitDescription: string;
        executionTimeout: string;
        executionTimeoutDescription: string;
      };
      screenshot: {
        title: string;
        description: string;
        autoInject: string;
        autoInjectDescription: string;
        ariaLabel: string;
      };
    };
    indexer: {
      title: string;
      heading: string;
      description: string;
      codeIndex: {
        title: string;
        description: string;
        status: string;
        rebuild: string;
        rebuilding: string;
        lastBuilt: string;
        fileCount: string;
        symbolCount: string;
      };
      astGrep: {
        title: string;
        description: string;
        patterns: string;
        empty: string;
      };
      semantic: {
        title: string;
        description: string;
        enabled: string;
        enabledDescription: string;
        ariaLabel: string;
      };
      repoWiki: {
        title: string;
        description: string;
        generate: string;
        generating: string;
        status: string;
      };
    };
    skills: {
      title: string;
      heading: string;
      description: string;
      customSkills: {
        title: string;
        description: string;
        status: string;
        empty: string;
        scanPaths: string;
      };
      slashCommands: {
        title: string;
        description: string;
        empty: string;
      };
      marketplace: {
        title: string;
        description: string;
        browse: string;
        refresh: string;
        refreshing: string;
      };
    };
    rules: {
      title: string;
      heading: string;
      description: string;
      projectRules: {
        title: string;
        description: string;
        status: string;
        loaded: string;
        noRules: string;
        files: string;
      };
      teamRules: {
        title: string;
        description: string;
        manage: string;
        enabled: string;
        enabledDescription: string;
        ariaLabel: string;
      };
      memory: {
        title: string;
        description: string;
        clear: string;
        clearing: string;
        status: string;
      };
    };
    work: {
      heading: string;
      description: string;
      officeSection: string;
      officePptx: {
        title: string;
        description: string;
        status: string;
      };
      automationSection: string;
      browserAutomation: {
        title: string;
        description: string;
        warning: string;
        ariaLabel: string;
      };
      cronPersistence: {
        title: string;
        description: string;
        status: string;
        ariaLabel: string;
      };
      skillMentions: {
        title: string;
        description: string;
        ariaLabel: string;
      };
      ocrSection: string;
      ocr: {
        title: string;
        description: string;
        languages: string;
      };
    };
    push: {
      heading: string;
      description: string;
      statusHeading: string;
      statusDescription: string;
      statusLoadFailed: string;
      refresh: string;
      jpushStatus: string;
      umengStatus: string;
      dryRunStatus: string;
      dryRunOn: string;
      dryRunOff: string;
      dryRunHint: string;
      jpushSection: string;
      umengSection: string;
      configured: string;
      notConfigured: string;
      testJpush: string;
      testUmeng: string;
      jpushAppKey: string;
      jpushMasterSecret: string;
      umengAppKey: string;
      umengAppMasterSecret: string;
      revealSecret: string;
      hideSecret: string;
      dryRunToggle: string;
      dryRunToggleDescription: string;
      dryRunEnabled: string;
      dryRunDisabled: string;
      save: string;
      saveSuccess: string;
      saveFailed: string;
      jpushTestSuccess: string;
      jpushTestFailed: string;
      umengTestSuccess: string;
      umengTestFailed: string;
    };
    themePack: {
      importTitle: string;
      importDescription: string;
      apply: string;
      reset: string;
    };
    changedSettingLabel: {
      theme: string;
      darkThemePack: string;
      lightThemePack: string;
      defaultProvider: string;
      newThreadMode: string;
      sidebarPosition: string;
      projectSortOrder: string;
      threadSortOrder: string;
      uiFont: string;
      codeFont: string;
      baseFontSize: string;
      fontSmoothing: string;
      timeFormat: string;
      activityToasts: string;
      desktopNotifications: string;
      assistantOutput: string;
      voicePolish: string;
      diffLineWrapping: string;
      deleteConfirmation: string;
      archiveConfirmation: string;
      terminalCloseConfirmation: string;
      gitWritingModel: string;
      customModels: string;
      providerInstalls: string;
      providerVisibility: string;
      providerOrder: string;
      language: string;
    };
    resetAria: (label: string) => string;
    resetTooltip: string;
    restoreDefaultsConfirm: (labels: string) => string;
  };
  dialog: {
    confirm: {
      deleteThread: (title: string) => string;
      deleteThreadPermanent: string;
      threadDeleteUndoButton: string;
      threadDeleteUndoSuccessTitle: string;
      threadDeleteUndoFailedTitle: string;
      threadDeleteUndoFailedDescription: string;
      archiveThread: string;
      removeProject: (name: string) => string;
      removeProjectAndThreads: (name: string, count: number) => string;
      cancel: string;
      continue: string;
      discardDraft: string;
    };
    rename: {
      title: string;
      description: string;
      submit: string;
      cancel: string;
    };
    pullRequest: {
      title: string;
      description: string;
      placeholder: string;
      open: string;
      cancel: string;
    };
    worktreeHandoff: {
      title: string;
      description: string;
      submit: string;
      cancel: string;
    };
  };
  whatsNew: {
    title: string;
    popoutTitle: string;
    open: string;
    dismiss: string;
    gotIt: string;
    releaseNotes: string;
    readMore: string;
    showLess: string;
    highlights: string;
    allReleases: string;
    versionLabel: (version: string) => string;
  };
  taskCompletion: {
    markAllRead: string;
    viewChat: string;
  };
  workspace: {
    fallbackTitle: string;
    renameHint: string;
    terminalTab: string;
    settingsAria: string;
    loading: string;
    emptyTitle: string;
    openInEditor: string;
  };
  workspaceModePicker: {
    modeLabel: string;
    chooseFolder: string;
    changeFolder: string;
    openingPicker: string;
    pickFolderError: string;
    cloudNotAvailable: string;
    worktreeCreateError: string;
    comingSoonHint: string;
    modes: {
      local: string;
      worktree: string;
      ssh: string;
      cloud: string;
    };
  };
  workspaceMigrationHint: {
    title: string;
    description: (count: number) => string;
    dismiss: string;
  };
  terminal: {
    findPlaceholder: string;
    matchCase: string;
    tabTerminal: string;
    tabChat: string;
  };
  gitActions: {
    groupAria: string;
    optionsAria: string;
    prTitlePlaceholder: string;
    linkUnavailable: string;
    noOpenPR: string;
    openPRErrorTitle: string;
    syncingTitle: string;
    syncSuccess: string;
    alreadyUpToDate: string;
    syncFailed: string;
    createPRUnavailable: string;
    noChanges: string;
    running: string;
    waiting: string;
    keeping: (name: string) => string;
    branchConfirmed: string;
    creatingBranch: string;
    switchedTo: (name: string) => string;
    createdCheckedOut: string;
    createFailed: string;
    editorUnavailable: string;
    openFileFailed: string;
  };
  browser: {
    screenshotCopied: string;
    urlPlaceholder: string;
    actionsAria: string;
  };
  branchToolbar: {
    newWorktree: string;
    handoffNewWorktree: string;
    handoffLocal: string;
    rateLimitsRemaining: string;
    checkoutPR: string;
    searchPlaceholder: string;
    createTitle: string;
    discardStash: string;
    loadingStash: string;
    fieldBranch: string;
    fieldWorktree: string;
    fieldStash: string;
    fieldName: string;
  };
  projectScripts: {
    groupAria: string;
    actionAria: string;
    editAria: (name: string) => string;
    nameLabel: string;
    chooseIcon: string;
    testPlaceholder: string;
    keybindingLabel: string;
    pressShortcut: string;
    pressShortcutHint: string;
    commandLabel: string;
    autoRunLabel: string;
    deleteConfirmDescription: string;
    addScript: string;
    delete: string;
  };
  themeEditor: {
    copiedTitle: string;
    copiedDescription: (variant: string) => string;
    copyFailedTitle: string;
    copyFailedDescription: string;
    codeAria: (label: string) => string;
    systemDefault: string;
    translucentSidebar: string;
    translucentSidebarAria: (label: string) => string;
    resetAria: (label: string) => string;
    resetTitle: string;
    hexValueAria: (label: string) => string;
    importedTitle: string;
    importedDescription: (variant: string) => string;
    shareStringAria: string;
    background: string;
    text: string;
    accent: string;
    border: string;
    status: string;
    code: string;
    light: string;
    dark: string;
    reset: string;
    shareString: string;
    apply: string;
    import: string;
    foreground: string;
    uiFont: string;
    codeFont: string;
    codeFontPlaceholder: string;
    contrast: string;
    contextActiveSystem: (variant: string) => string;
    contextActiveLocked: string;
    contextInactiveSystem: (variant: string) => string;
    contextInactiveLocked: (mode: string) => string;
    importDialogTitle: (variant: string) => string;
    importDialogDescription: (variant: string) => string;
    importDialogCancel: string;
    importDialogSubmit: string;
    importError: string;
    importPlaceholder: string;
    copy: string;
  };
  themePack: {
    importTitle: string;
    importDescription: string;
    apply: string;
    reset: string;
  };
  restoreDefaults: {
    title: string;
    description: (labels: string) => string;
    button: string;
  };
  keybindings: {
    searchPlaceholder: string;
    title: string;
  };
  releaseHistory: {
    title: string;
    open: string;
  };
  rateLimits: {
    reachedTitle: string;
    approachingTitle: string;
    planLimitTitle: string;
    noData: string;
  };
  providerUsage: {
    title: (providerName: string) => string;
    fallbackTitle: string;
    window: string;
    resetsAt: string;
    noData: string;
  };
  codingPlan: {
    sectionTitle: string;
    sectionDescription: string;
    providerLabel: {
      glm: string;
      deepseek: string;
      moonshot: string;
      qwen: string;
    };
    status: {
      notBound: string;
      bound: string;
      quotaUnknown: string;
      fetching: string;
    };
    quotaRow: {
      label: string;
      /** 剩余百分比插值函数(传入 0~100 的剩余百分比,返回本地化文案) */
      remaining: (percent: number) => string;
      /** 重置时间插值函数(传入已格式化的相对时间,返回本地化文案) */
      resetsAt: (when: string) => string;
      unlimited: string;
    };
    actions: {
      bind: string;
      viewUsage: string;
      refresh: string;
      open: string;
    };
    learnMore: string;
  };
  costBudget: {
    sectionTitle: string;
    sectionDescription: string;
    dailyBudget: {
      label: string;
      placeholder: string;
      hint: string;
    };
    monthlyBudget: {
      label: string;
      placeholder: string;
      hint: string;
    };
    policy: {
      label: string;
      warn: string;
      warnDescription: string;
      block: string;
      blockDescription: string;
    };
    progress: {
      title: string;
      dailyLabel: string;
      monthlyLabel: string;
      spentOf: (spend: string, budget: string) => string;
      noBudget: string;
      exceeded: string;
      remaining: (amount: string) => string;
    };
    alert: {
      title: string;
      description: (threshold: number, spend: string, budget: string) => string;
      dismiss: string;
      upgrade: string;
    };
    blockDialog: {
      title: string;
      description: string;
      reasonLabel: string;
      /** daily scope 结构化 reason 解析后渲染:`今日已花 X / 预算 Y` */
      reasonDaily: (spend: string, budget: string) => string;
      /** monthly scope 结构化 reason 解析后渲染:`本月已花 X / 预算 Y` */
      reasonMonthly: (spend: string, budget: string) => string;
      continue: string;
      cancel: string;
    };
  };
  /**
   * AI 生产占比(turn diff 聚合)
   * - 桌面端 StatusBar 右上角短显示
   * - ProviderUsagePanel 内分维度卡片
   * - 跨线程 workspace 级别卡片(`WorkspaceAiSharePanel`)使用
   */
  turnAiShare: {
    badge: {
      /** "AI 75%" 短标签 */
      label: string;
      /** 无数据兜底显示 */
      empty: string;
      /** 鼠标悬停 - 单行概览(行数 + 占比) */
      tooltip: (lines: string, percent: string) => string;
      /** 鼠标悬停 - 拆解 AI / User / Mixed */
      tooltipBreakdown: (ai: string, user: string, mixed: string, total: string) => string;
      /** 屏幕阅读器 */
      a11yLabel: (percent: string) => string;
    };
    panel: {
      sectionTitle: string;
      sectionDescription: string;
      ai: string;
      human: string;
      mixed: string;
      total: string;
      turnCount: (n: number) => string;
      fileCount: (n: number) => string;
      empty: string;
    };
    /**
     * Workspace 级别 AI 占比卡片(走服务端 `getTurnAiShareSnapshot` RPC)
     * 适合在 Sidebar 顶部 / Settings / TopChrome 展示
     */
    workspace: {
      title: string;
      subtitle: string;
      empty: string;
      window24h: string;
      window7d: string;
      window30d: string;
      percent: (n: number) => string;
      lines: (n: number) => string;
      refresh: string;
      /** 顶部短摘要:`AI 75% · 1.2K lines · 24h` */
      summary: (percent: string, lines: string, window: string) => string;
    };
  };
  debug: {
    actionFailed: string;
    fallback: string;
  };
  notification: {
    retention: {
      title: string;
      preparing: string;
      progress: (purged: number, total: number) => string;
      progressSimple: (purged: number) => string;
      compactingTitle: string;
      compactingReclaim: string;
      compactingFinishing: string;
      pausedTitle: string;
      pausedDescription: string;
      successTitle: string;
      successDescription: (purged: number) => string;
      successDescriptionEmpty: string;
    };
    providerUpdate: {
      title: (providerName: string) => string;
      titleMany: (count: number) => string;
      description: (providerName: string) => string;
      descriptionMany: (count: number) => string;
      errorFallback: string;
      stillOutdated: string;
      requestFailed: string;
      failedTitleAll: string;
      failedTitleSome: string;
      successTitleOne: (providerName: string) => string;
      successTitleMany: (count: number) => string;
      successDescription: string;
      availableTitleOne: (providerName: string) => string;
      availableTitleMany: (count: number) => string;
      availableDescriptionOne: (providerName: string) => string;
      availableDescriptionMany: (providerName: string, count: number) => string;
      actionReview: string;
      actionUpdateAll: string;
    };
    keybindings: {
      invalidTitle: string;
      openConfigAction: string;
      noEditor: string;
      openFileErrorTitle: string;
      openFileErrorFallback: string;
    };
  };
  /** P0-6 首次启动条款接受引导 + 设置页法律文档入口 */
  termsAcceptance: {
    /** 全屏 Gate 标题 */
    heading: string;
    /** 副标题,说明为何需要接受 */
    subtitle: string;
    /** "查看隐私政策" 按钮文案 */
    viewPrivacy: string;
    /** "查看使用条款" 按钮文案 */
    viewTerms: string;
    /** 复选框旁的同意声明 */
    acceptLabel: string;
    /** "同意并继续" 主按钮文案 */
    acceptButton: string;
    /** 已接受的时间展示前缀(设置页中显示) */
    acceptedAtPrefix: string;
    /** 设置页 "重新查看条款" 按钮文案 */
    reviewButton: string;
    /** 设置页 "重置接受状态" 按钮文案 */
    resetButton: string;
    /** 法律文档查看对话框标题 */
    dialogTitlePrivacy: string;
    dialogTitleTerms: string;
    /** 法律文档最后更新前缀 */
    lastUpdated: string;
    /** 对话框关闭按钮 */
    closeButton: string;
  };
};

const en: Messages = {
  common: {
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    confirm: "Confirm",
    retry: "Retry",
    close: "Close",
    open: "Open",
    ok: "OK",
    done: "Done",
    loading: "Loading...",
    yes: "Yes",
    no: "No",
    errorOccurred: "An error occurred.",
    unexpectedError: "An unexpected error occurred.",
  },
  appShell: {
    connecting: "Connecting to {name} server...",
  },
  appNavigation: {
    back: "Back",
    backMac: "Back (⌘[)",
    backWin: "Back (Alt+←)",
    forward: "Forward",
    forwardMac: "Forward (⌘])",
    forwardWin: "Forward (Alt+→)",
  },
  accountBar: {
    guest: "Guest",
    settingsTooltip: "Settings",
    deviceTooltip: "Device (coming soon)",
    userMenuTooltip: "Account menu",
  },
  errorFallback: {
    title: "Something went wrong.",
    retry: "Try again",
    reload: "Reload app",
    showDetails: "Show error details",
    hideDetails: "Hide error details",
    unexpected: "An unexpected router error occurred.",
    noDetails: "No additional error details are available.",
    copyDetails: "Copy error details",
    copySuccessTitle: "Error details copied",
    copySuccessDescription: "Paste into an issue or feedback.",
    copyFailedTitle: "Copy failed",
    copyFailedDescription: "Please copy the error details manually.",
  },
  splash: {
    retry: "Retry",
  },
  providerFeedback: {
    switchedTitle: (provider) => `Switched to ${provider}`,
    switchedDescription: "Provider changed for new messages.",
    switchFailedTitle: "Provider switch failed",
    switchFailedDescription: (provider) => `Could not switch to ${provider}. Please try again.`,
  },
  networkStatus: {
    offlineMessage: "You're offline. Messages will be saved as drafts and sent automatically when you reconnect.",
    offlineMessageWithCount: (count) => {
      if (!Number.isFinite(count) || count <= 0) {
        return "You're offline. 0 messages are saved as drafts and will be sent automatically when you reconnect.";
      }
      if (count === 1) {
        return "You're offline. 1 message is saved as a draft and will be sent automatically when you reconnect.";
      }
      return `You're offline. ${count} messages are saved as drafts and will be sent automatically when you reconnect.`;
    },
    degradedMessage: "Network is unstable. AI responses may be delayed.",
    providerFallbackMessage: (provider) =>
      `The current provider is unavailable. Switched to ${provider} fallback.`,
    flushStartToastTitle: "Resending offline drafts",
    flushStartToastDescription: (count) =>
      count <= 1
        ? "Sending 1 saved message now that you're back online."
        : `Sending ${count} saved messages now that you're back online.`,
    flushCompleteToastTitle: "Offline drafts sent",
    flushCompleteToastDescription: (count) =>
      count <= 1 ? "1 draft was sent successfully." : `${count} drafts were sent successfully.`,
    flushFailedToastTitle: "Couldn't resend offline drafts",
    flushFailedToastDescription:
      "We'll keep retrying the next time the network recovers.",
    saveDraftToastTitle: "Saved as offline draft",
    saveDraftToastDescription: (count) =>
      count <= 1
        ? "1 message is waiting to be sent when you're back online."
        : `${count} messages are waiting to be sent when you're back online.`,
    removeDraftAria: "Remove offline draft",
    draftsHeading: "Offline drafts",
    draftsEmpty: "No offline drafts",
    flushNowButton: "Send now",
    flushAllButton: "Send all",
    dismissAria: "Dismiss",
    wsReconnectingMessage: "Connection lost. Reconnecting…",
    wsReconnectedMessage: "Connection restored.",
    wsReconnectFailedMessage: "Reconnection failed. Please restart the app.",
  },
  landing: {
    workTitle: "使用云顶数字 工作",
    codeTitle: "使用云顶数字 编码",
    workSubtitle: "Task-driven digital employee — documents, browser automation, data processing, scheduled jobs.",
    codeSubtitle: "Programmer co-pilot inside your repo — edit, diff, debug, build, commit.",
    workBadge: "Work Mode",
    codeBadge: "Code Mode",
    workHint: "Press ⌘N to start a new session",
    codeHint: "Press ⌘N to start a new workspace",
    brandName: "云顶数字",
    brandTagline: "— 我帮你",
    quickActionsHeading: "Get started",
    quickActionWebRead: "Web reading",
    quickActionResearch: "Research analysis",
    quickActionDataMining: "Data mining",
    quickActionFileManager: "File manager",
    quickActionAppDev: "App development",
    quickActionProjectInsight: "Project understanding",
    quickActionDebugFix: "Debug & fix",
    quickActionCodeReview: "Code review",
    quickActionGameIdea: "Game idea",
    quickActionToolScript: "Tool & scripts",
    quickActionDocProcess: "Document processing",
    quickActionDataAnalysis: "Data analysis",
    codeComposerPlaceholder:
      "Describe a coding task, e.g. explain project structure, debug a bug, generate unit tests, review a diff…",
    openTerminal: "Open terminal",
  },
  codeEditor: {
    noFileOpen: "No file open",
    loading: "Loading…",
    loadError: "Failed to load file",
    binaryFile: "Binary file preview not available",
    save: "Save",
    readOnly: "Read-only",
    enableEdit: "Edit",
    files: "Files",
    refresh: "Refresh",
    closeTab: "Close tab",
    openEditor: "Open editor",
    closeEditor: "Close editor",
  },
  sidebar: {
    brandLabel: "Peak",
    newChat: "New chat",
    newChatTooltip: "New chat",
    newDisposableTooltip: "New disposable chat",
    search: "Search",
    threads: "Task list",
    chats: "Chats",
    workspace: "Task list",
    recent: "Recent",
    settings: "Settings",
    addProject: "Add project",
    noProjectsYet: "No projects yet",
    noProjectsYetDescription: "Choose a local project folder to start your first thread.",
    noWorkspacesYet: "No workspaces yet",
    newWorkspace: "New workspace",
    chooseProjectFolder: "Choose project folder",
    openingFolderPicker: "Opening...",
    addingProject: "Adding...",
    loadingProjects: "Loading projects",
    toggleSidebar: "Toggle thread sidebar",
    codeLabel: "Code",
    disposableChat: "Disposable chat",
    pendingApproval: "Pending approval",
    commandsHeading: "Commands",
    skillsLabel: "Skills",
    pluginsLabel: "Plugins",
    automationsLabel: "Automations",
    wikiLabel: "Wiki",
    editorLabel: "Editor",
    editorNoWorkspace: "Open a workspace folder to start editing files.",
    pullsLabel: "Pulls",
    pullsNoWorkspace: "Open a workspace folder to browse pull requests.",
    linearLabel: "Linear",
    linearNoWorkspace: "Open a workspace folder to browse Linear tasks.",
    extensionsLabel: "Extensions",
    automationsComingSoon: "Coming soon",
    confirm: "Confirm",
    confirmArchive: "Confirm archive",
    archive: "Archive",
    openNewChatHome: "Open new chat home",
    settingsAria: "Settings",
    showMore: "Show more",
    showLess: "Show less",
    projectActionAdd: "Add project",
    projectActionRename: "Rename project",
    projectActionRemove: "Remove project",
    projectActionCopyPath: "Copy path",
    projectActionArchive: "Archive project",
    projectActionDeleteThreads: "Delete all threads",
    intelOnArmTitle: "Intel build on Apple Silicon",
    sortProjects: "Sort projects",
    sortThreads: "Sort threads",
    sortChats: "Sort chats",
    sortRecentlyActive: "Recently active",
    sortRecentlyAdded: "Recently added",
    sortCreatedAt: "Created at",
    sortManual: "Manual",
    sortNewestFirst: "Newest first",
    projectSortMenuHeader: "Sort projects",
    threadSortMenuHeader: "Sort threads",
    pinThread: "Pin thread",
    unpinThread: "Unpin thread",
    addProjectError: "Unable to add project",
    openFolderError: "Unable to open folder picker",
    linkUnavailable: "Link opening is unavailable.",
    openPRError: "Unable to open PR link",
    openFinderError: "Unable to open in Finder",
    openTerminalError: "Unable to open terminal",
    removeProjectError: (name) => `Failed to remove "${name}"`,
    removeProjectSuccess: (name) => `Removed "${name}"`,
    projectRenameSyncError: "Failed to sync project name to server",
    thread: {
      pinError: (action) => (action === "pin" ? "Unable to pin thread" : "Unable to unpin thread"),
      renameError: "Failed to rename thread",
      renameEmpty: "Thread title cannot be empty",
      handoffError: "Could not create handoff thread",
      archiveRunningTitle: "Cannot archive",
      archiveRunningDescription: "Stop the running session before archiving this thread.",
      archiveEmpty: (projectName) => `"${projectName}" has no threads to archive.`,
      archiveFailedTitle: "Cannot archive threads",
      archiveSuccessOne: "Thread archived",
      archiveSuccessMany: (count) => `Archived ${count} threads`,
      archiveError: "Failed to archive threads",
      deleteEmpty: "Nothing to delete",
      deleteWorktreeWarning: "Thread deleted, but worktree removal failed",
      deleteSuccessOne: "Thread deleted",
      deleteSuccessMany: (count) => `Deleted ${count} threads`,
      deleteError: "Failed to delete threads",
      pathUnavailable: "Path unavailable",
      pathCopyUnavailable: "This thread does not have a workspace path to copy.",
      pathOpenUnavailable: "This thread does not have a workspace path to open.",
      copyThreadId: "Thread ID copied",
      copyThreadIdFailed: "Failed to copy thread ID",
      copyPath: "Path copied",
      copyPathFailed: "Failed to copy path",
    },
    update: {
      availableTitle: "Update available",
      availableDescription: (version) => `ydsz-buddy ${version} is available.`,
      upToDateTitle: "You're up to date",
      upToDateDescription: (version) => `ydsz-buddy ${version} is already the newest version.`,
      checkFailedTitle: "Could not check for updates",
      checkFailedDescription: "An unexpected error occurred.",
      downloadedTitle: "Update downloaded",
      downloadedDescription: "Restart the app to install the update.",
      downloadFailedTitle: "Could not download update",
      downloadFailedDescription: "Try again from the menu.",
      startFailedTitle: "Could not start update download",
      startFailedDescription: "The updater could not be started.",
      installFailedTitle: "Could not install update",
      installFailedDescription: "Restart the app manually to finish installing.",
      unexpectedError: "An unexpected error occurred.",
    },
    command: {
      openHome: {
        title: "Open new chat home",
        description: "Open the new chat landing screen.",
      },
      newChat: {
        title: "New chat",
        description: "Start a fresh thread in the current project.",
      },
      addProject: {
        title: "Add project",
        description: "Open a repository or folder in the sidebar.",
      },
      attachSession: {
        title: "Attach session",
        description: "Attach a local thread to an existing provider session.",
      },
      openSettings: {
        title: "Open settings",
        description: "Open app settings.",
      },
    },
    deleteWorkspace: "Delete workspace",
    parallelSessions: "Running tasks",
    parallelSessionsRunning: (count: number) => `${count} running`,
    parallelSessionsOpen: "Open",
    threadDeletedToastTitle: "Thread deleted",
    threadDeletedToastDescription: (title) => `"${title}" has been deleted.`,
  },
  searchPalette: {
    importHeading: "Import thread from provider",
    suggestedGroup: "Suggested",
    projectsGroup: "Projects",
    configureGroup: "Configure",
    inputHint: "Jump to threads, projects, actions, or appearance.",
    enterHint: "Enter to open",
  },
  chat: {
    loadingModels: "Loading models",
    newChat: "New chat",
    handOff: "Hand off",
    run: "Run",
    stop: "Stop",
    share: "Share",
    compact: "Compact",
    plan: "Plan",
    planModeHint: "Plan mode - click to return to normal build mode",
    noActiveThread: "No active thread",
    selectOrCreate: "Select a thread or create a new one to get started.",
    clearUnavailable: "Clear is unavailable",
    clearUnavailableDescription: "Open a project before starting a fresh thread.",
    implementationFailed: "Could not start implementation thread",
    handoffError: "Could not create handoff thread",
    refreshProviderStatus: "Unable to refresh provider status",
    deletedAction: (name) => `Deleted action "${name ?? "Unknown"}"`,
    deleteActionFailed: "Could not delete action",
    updateAccessModeFailed: "Could not update access mode",
    tooManyAttachments: (max) => `You can attach up to ${max} references per message.`,
    browserAttachFailed: "Couldn't attach the in-app browser context",
    imagePreview: "Expanded image preview",
    imagePreviewClose: "Close image preview",
    imagePreviewPrev: "Previous image",
    imagePreviewNext: "Next image",
    attachImagesAfterPlan: "Attach images after answering plan questions.",
    voice: {
      authRequiredTitle: "Sign in to ChatGPT in Codex before using voice notes.",
      authRequiredDescription: "Voice notes require a ChatGPT-authenticated Codex session.",
      authSessionTitle: "Voice notes require a ChatGPT-authenticated Codex session.",
      authSessionDescription: "Sign in to ChatGPT again to record a voice note.",
      planUnansweredTitle: "Answer plan questions before recording a voice note.",
      planUnansweredDescription: "Plan questions must be answered before recording.",
      startFailedTitle: "Could not start recording",
      startFailedDescription: "Try again in a moment.",
      transcriptionUnavailableTitle: "Voice transcription is unavailable right now.",
      transcriptionUnavailableDescription: "Voice transcription is unavailable right now.",
      noAudioTitle: "No audio was captured.",
      noAudioDescription: "Try recording again.",
      transcribeFailedTitle: "Sign in to ChatGPT again",
      transcribeFailedDescription: "Couldn't transcribe voice note",
      polishToggleLabel: "Auto-polish voice transcripts",
      polishToggleDescription: "Remove filler words, fix grammar, and clean up the text after transcription.",
      polishAppliedToastTitle: "Voice transcript polished",
      polishAppliedToastDescription: (rules: number) => `Applied ${rules} polish rule${rules === 1 ? "" : "s"}.`,
    },
    offline: {
      draftSavedToastTitle: "Draft saved locally",
      draftSavedToastDescription: "We'll restore it when you're back online.",
      draftsRestoredToastTitle: "Restored {count} draft",
      draftsRestoredToastDescription: "Your previously saved drafts are now available.",
      networkDegradedTitle: "Provider unavailable",
      networkDegradedDescription: "The current provider is not responding. We may auto-switch to a fallback.",
      networkOfflineTitle: "You're offline",
      networkOfflineDescription: "Drafts are auto-saved to this device.",
    },
    continueInNewWorktree: "Continue in a new worktree",
    reviewLocalChanges: "Review local uncommitted changes",
    reviewBranchDiff: "Review the current branch diff against its base",
    composerPlaceholder: (providerName) => `Message ${providerName}...`,
    stopGenerationAria: "Stop generation",
    stopGenerationTitle: "Stop the current response. On Mac, press Ctrl+C to interrupt.",
    implementationActionsAria: "Implementation actions",
    imagePlaceholder: (count) => `${count} image`,
    renameError: "Failed to rename thread",
    renameEmpty: "Thread title cannot be empty",
    timeline: {
      editMessage: "Edit message",
      editAndResend: "Edit and resend",
      revertLabel: "Revert to this message",
      revertTooltip: "Revert to this message",
      revertConfirmTitle: "Confirm Revert",
      revertConfirmDescription: "This will revert the conversation to this point. All subsequent changes will be lost.",
      revertMessagePreview: "Message preview:",
      revertWarning: "Warning: This action cannot be undone.",
      revertConfirmButton: "Revert",
      undoUnavailable: "Undo becomes available after a reply is checkpointed",
      emptyResponse: "(empty response)",
      response: "Response",
      responseWithSummary: (summary) => `Response: ${summary}`,
      showLess: "Show less",
      showMore: "Show more",
      showMoreCount: (count) => `Show ${count} more`,
      moreToolCalls: (count) => `+${count} more tool calls`,
      edited: "Edited",
      oneFileChanged: "1 File changed",
      filesChanged: (count) => `${count} Files changed`,
      collapseFiles: "Collapse changed files list",
      expandFiles: "Expand changed files list",
      undo: "Undo",
      workingFor: (duration) => `Working for ${duration}`,
      workingForPrefix: "Working for ",
      working: "Working...",
      emptyChat: "Send a message to start the conversation.",
    },
    rollback: {
      drawerTitle: (turnCount) => `Revert to checkpoint #${turnCount}`,
      drawerDescription:
        "This will discard newer messages and turn diffs in this thread.",
      turns: "Turns to discard",
      files: "Files changed",
      lines: "Lines +/−",
      filesHeading: "Files that will be reverted",
      moreFiles: (extra) => `+${extra} more file(s) not shown`,
      showDiff: "Show diff",
      hideDiff: "Hide diff",
      loadingDiff: "Loading diff preview…",
      warning: (turnCount) =>
        `This action cannot be undone. All messages and turn diffs after checkpoint #${turnCount} will be permanently removed.`,
      cancel: "Cancel",
      confirm: "Revert thread",
      reverting: "Reverting…",
      apiUnavailable: "Native API unavailable, cannot preview diff",
    },
    copy: {
      buttonAria: "Copy to clipboard",
      success: "Copied!",
      failed: "Failed to copy",
    },
  },
  chatEmptyState: {
    title: "Let's build",
    subtitle: "Start a new thread to begin.",
    whatShouldWeWorkOn: "What should we work on?",
    whatShouldWeDoIn: "What should we do in",
    thisFolder: "this folder",
  },
  chatHeader: {
    closeSidechat: "Close selected sidechat",
  },
  a11y: {
    skipToContent: "Skip to main content",
  },
  projectRules: {
    indicatorLabel: "Project rules",
    countSummary: "${count} file · ${bytes}b",
    clickToView: "Click to view merged project rules",
    truncatedSuffix: " (truncated)",
    previewMerged: "Preview merged markdown",
    noRulesHint: "No project rules discovered in this workspace.",
    filesHeading: "Loaded files",
    teamAppliedBadge: "+ team rules",
    teamDisabledBadge: "team rules off",
    teamErrorBadge: "team rules error",
    teamAppliedHint: "Team shared rules are appended (no project .ydsz/rules/ found).",
  },
  teamRules: {
    viewTitle: "Team shared rules",
    viewDescription: "Cross-project rules stored in ~/.ydsz-buddy/team-rules/. Loaded into every project unless explicitly disabled or overridden by a project-local .ydsz/rules/ entry.",
    enabledLabel: "Enabled",
    enabledHint: "禁用时,团队规则被完全跳过(manifest 仍会读取)。",
    teamNameLabel: "Team name",
    teamNamePlaceholder: "e.g. Platform Team",
    remoteUrlLabel: "Remote URL (optional)",
    remoteUrlPlaceholder: "git@github.com:org/rules.git",
    remoteCommitLabel: "最近一次同步 commit",
    listHeading: "Rule files",
    createRule: "New rule",
    editRule: "Edit rule",
    deleteRule: "Delete",
    deleteConfirm: "Delete this team rule? It will no longer be loaded into any project.",
    ruleNameLabel: "File name",
    ruleNamePlaceholder: "00-代码规范.md",
    ruleContentLabel: "Markdown 内容",
    ruleContentPlaceholder: "使用 Tab 缩进。每行不超过 100 字符。生产代码禁止 console.log。",
    saveRule: "Save",
    cancel: "Cancel",
    emptyState: "No team rules yet",
    summary: "${count} file · ${bytes}b",
    bytesLabel: "bytes",
    truncatedBadge: "truncated",
    previewMerged: "Preview merged markdown",
    noRulesHint: "Create a rule to enforce team-wide standards across every project.",
    saveSuccess: "Rule saved",
    saveFailure: "Failed to save rule",
    deleteSuccess: "Rule deleted",
    deleteFailure: "Failed to delete rule",
    manifestUpdated: "manifest 已更新",
    manifestFailed: "更新 manifest 失败",
    openInExplorer: "Reveal in file explorer",
    openInExplorerHint: "Open the team-rules folder to manage .md files directly.",
    reload: "Reload",
    reloadHint: "Re-read team rules from disk and refresh the in-memory cache.",
    teamNameHelp: "Only displayed in the UI. Used to identify this team's rule bundle.",
    remoteUrlHelp: "Optional git URL for the 'team sync' feature (planned).",
    enableToggleHelp: "Disable to silence the entire team rule set without deleting files.",
    blankStateTitle: "No team rules configured",
    blankStateDescription: "Create your first .md file to define coding standards, test policies or review checklists that follow every project.",
  },
  chatRoute: {
    loadingDiff: "Loading diff viewer...",
    splitPaneEmptyTitle: "Select a chat",
    splitPaneEmptyProject: "Project",
  },
  composer: {
    placeholder: "Ask anything, @tag files/folders, or use / to show available commands",
    placeholderApproval: "Resolve this approval request to continue",
    placeholderProgress: "Type your own answer, or leave this blank to use the selected option",
    placeholderPlan: "Add feedback to refine the plan, or leave this blank to implement it",
    placeholderFollowUp: "Ask for follow-up changes",
    placeholderDisconnected: "Ask for follow-up changes or attach images",
    moreAria: "More composer controls",
    extrasAria: "Composer extras",
    modeLabel: "Mode",
    buildLabel: "Build",
    planLabel: "Plan",
    localLabel: "Local",
    codexLabel: "Codex",
    removeImage: "Remove image",
    pendingApproval: "Pending approval",
    pendingUserInput: "Awaiting your input",
    cancelTurn: "Cancel turn",
    decline: "Decline",
    alwaysAllow: "Always allow this session",
    approveOnce: "Approve once",
    terminalContextExpired:
      "Terminal context expired. Remove and re-add the context to send this message.",
    voiceTranscribing: "Transcribing voice note",
    voiceStop: "Stop voice note",
    voiceRecord: "Record voice note",
    voiceHoldToRecord: "Hold to record",
    statusDialog: {
      local: "Local",
      worktree: "Worktree",
      newWorktreePending: "New worktree (pending)",
    },
    slashCommands: {
      local: "Local",
      worktree: "Worktree",
      plan: "Plan",
      newChat: "New chat",
    },
    contextWindowLabel: "Context window",
    contextWindowPercent: (percent) => `${percent}% used`,
    sendMessage: "Send message",
    sendingBusy: "Sending",
    sendingConnecting: "Connecting",
    sendingTranscribing: "Transcribing voice note",
    sendingPreparingWorktree: "Preparing worktree",
    steer: "Steer",
    deleteQueuedFollowUp: "Delete queued follow-up",
    queuedFollowUpActions: "Queued follow-up actions",
    queuedFollowUp: "Queued follow-up",
    planAccept: "Accept plan",
    planAcceptTooltip: "Accept this plan and switch to build mode to start execution.",
    planAcceptedToast: "Plan accepted — switched to build mode.",
    planRevise: "Revise plan",
    planReviseTooltip: "Request changes to this plan. The composer will be focused for your revision notes.",
    planReviseToast: "Describe your revision notes in the composer below.",
    planReject: "Reject plan",
    planRejectTooltip: "Discard this plan and return to chat mode.",
    planRejectedToast: "Plan rejected — returned to chat mode.",
  },
  skills: {
    title: "Skills",
    subtitle: "Give ydsz-buddy new superpowers.",
    newSkill: "New skill",
    browseSkillSh: "Browse skill.sh",
    searchPlaceholder: "Search skills",
    localHeading: "Installed on this machine",
    localCount: "{count} installed",
    localEmptyTitle: "No local skills found",
    localEmptyDescription:
      "ydsz-buddy scanned ~/.claude/skills, ~/.codex/skills, and ~/.agents/skills. Drop a skill folder containing a SKILL.md into one of those directories, then refresh.",
    localEmptySearchTitle: "No local skills match this search",
    localEmptySearchDescription: "Try a different keyword or clear the search.",
    providerHeading: "Provided by model",
    providerHint: "Skills the active provider surfaces for this workspace.",
    installedHeading: "Skills",
    emptyTitle: "No skills found",
    emptyDescription: "This provider has no skills available in your workspace yet.",
    emptySearchTitle: "No skills match this search",
    emptySearchDescription: "Try a different keyword or clear the search to see all skills.",
    unavailableTitle: "Skills unavailable for {provider}",
    unavailableDescription: "This provider does not expose skill discovery.",
    needsWorkspace: "Skills need a workspace path. Open a project or thread first.",
    marketplaceHeading: "Skill marketplace",
    marketplaceSourceRemote: "Remote",
    marketplaceSourceDiskCache: "Disk cache",
    marketplaceSourceBuiltin: "Built-in",
    marketplaceCount: (count) => `${count} skills`,
    marketplaceLastRefreshed: (timestamp) => `Updated ${timestamp}`,
    marketplaceLastRefreshedNever: "Not yet refreshed",
    marketplaceRefresh: "Refresh",
    marketplaceRefreshing: "Refreshing…",
    marketplaceEditUrl: "Edit URL",
    marketplaceUrlDialogTitle: "Skill marketplace URL",
    marketplaceUrlDialogDescription:
      "Switch the marketplace to a self-hosted JSON index. Leave empty to use the default (https://marketplace.njydsz.com/index.json).",
    marketplaceUrlLabel: "Marketplace URL",
    marketplaceUrlPlaceholder: "https://marketplace.example.com/index.json",
    marketplaceUrlInvalid: "URL must start with http:// or https://",
    marketplaceUrlApply: "Apply",
    marketplaceUrlApplyAndRefresh: "Apply & refresh",
    marketplaceUrlReset: "Reset to default",
    marketplaceUrlCancel: "Cancel",
    marketplaceStatusBadgeTitle: "Marketplace data source",
    marketplaceStatusRemoteTitle: "Loaded from remote URL",
    marketplaceStatusDiskCacheTitle: "Loaded from local disk cache",
    marketplaceStatusBuiltinTitle: "Loaded from built-in index",
  },
  automations: {
    subtitle: "Run chats on a schedule or on demand.",
    viewTemplates: "View templates",
    createFromChat: "Create from chat",
    emptyTitle: "Create your first automation",
    emptyDescription:
      "Automations are a fast, flexible way to do recurring work with your chats. Build one in seconds by describing what you need.",
    templatesHeading: "Templates",
    templatesHint: "Pick a starter to seed a new automation. Coming soon.",
  },
  voicePolish: {
    previewTitle: "Voice transcript polished",
    previewRevert: "Revert",
    previewDismiss: "Dismiss",
    previewTruncated: "(diff truncated)",
    previewAutoAccept: (seconds: number) => `Auto-accept in ${seconds}s`,
    noChanges: "No changes detected",
  },
  ocr: {
    triggerButton: "Recognize text",
    triggerButtonAria: "Recognize text from image",
    triggerHint: "Pick a screenshot or photo and pull out the text.",
    recognizing: "Recognizing text...",
    recognizedLines: (count: number) => `Recognized ${count} line${count === 1 ? "" : "s"}`,
    noText: "No text was detected in this image.",
    errorFallback: "Unable to recognize text. Please try again.",
    noProviderTitle: "No OCR engine available",
    noProviderDescription:
      "Install Tesseract (brew install tesseract / apt install tesseract-ocr) or run on macOS / Windows to enable image text recognition.",
    installTesseractHint: "brew install tesseract",
    languageLabel: "Recognition language",
    languageAuto: "Auto",
    languageEnglish: "English",
    languageChinese: "Simplified Chinese",
    providerActive: "Active engine",
    providerMacosVision: "Apple Vision (macOS)",
    providerWindowsOcr: "Windows OCR",
    providerTesseract: "Tesseract",
    providerNone: "None",
    providersTitle: "OCR engines",
    providersDescription:
      "ydsz-buddy automatically picks the best engine for your platform. macOS uses Apple Vision, Windows uses the built-in Windows OCR, and other platforms fall back to Tesseract.",
    insertToComposer: "Insert into message",
    copyText: "Copy text",
    closeAria: "Close",
  },
  eventReplay: {
    title: "Replay events",
    descriptionWithCount: (count: number) =>
      `Step through ${count} event${count === 1 ? "" : "s"} at your own pace.`,
    empty: "No events to replay.",
    play: "Play",
    pause: "Pause",
    stepBack: "Step back",
    stepForward: "Step forward",
    reset: "Reset to start",
    speed: "Speed",
    scrubberAria: "Event scrubber",
    position: (current: number, total: number) => `${current} / ${total}`,
    hintShortcuts: "Space play/pause · ←/→ step · Home/End jump",
  },
  settings: {
    title: "Settings",
    restoreDefaults: "Restore defaults",
    backToApp: "Back to app",
    nav: {
      general: {
        label: "General",
        description: "Default provider, thread mode, and sidebar organization.",
      },
      appearance: {
        label: "Appearance",
        description: "Theme, typography, and timestamp formatting.",
      },
      notifications: {
        label: "Notifications",
        description: "In-app toasts and desktop alerts.",
      },
      behavior: {
        label: "Behavior",
        description: "Streaming, diff handling, and destructive confirmations.",
      },
      worktrees: {
        label: "Worktrees",
        description: "Review and clean up the worktrees created by 云顶数字 Buddy.",
      },
      archived: {
        label: "Archived",
        description: "View and restore archived threads.",
      },
      budget: {
        label: "Cost budget",
        description: "Set a daily or monthly cap on AI spend and choose what happens when it is exceeded.",
      },
      agent: {
        label: "Agent",
        description: "Configure AI agent behavior, tool permissions, and sandbox settings.",
      },
      mcp: {
        label: "MCP",
        description: "Manage Model Context Protocol servers and tool integrations.",
      },
      cue: {
        label: "CUE",
        description: "Prompt engineering, structured cues, and response tuning.",
      },
      models: {
        label: "Models",
        description: "Git writing defaults and custom model slugs.",
      },
      conversationFlow: {
        label: "Conversation Flow",
        description: "Dialog management, turn limits, and context window settings.",
      },
      browser: {
        label: "Browser",
        description: "Web automation, CDP integration, and browser tool configuration.",
      },
      indexer: {
        label: "Index & Documents",
        description: "Code indexing, AST grep patterns, and document management.",
      },
      skills: {
        label: "Skills & Commands",
        description: "Custom skills, slash commands, and composer command menu.",
      },
      rules: {
        label: "Rules & Memory",
        description: "Project rules, team rules, and persistent memory configuration.",
      },
      imageGen: {
        label: "Image Generation",
        description: "Configure AI image generation backends (DALL-E 3, FLUX, Stable Diffusion).",
      },
      im: {
        label: "IM Integration",
        description: "Connect WeChat Work, DingTalk, Feishu and other IM platforms.",
      },
      mobile: {
        label: "Mobile Remote",
        description: "Push notifications, remote approval, and device pairing.",
      },
      advanced: {
        label: "Advanced",
        description: "Keybindings, recovery, and version info.",
      },
      push: {
        label: "Push Channel",
        description: "Configure JPush / Umeng credentials and test mobile push delivery.",
      },
    },
    groups: {
      app: "App",
      ydszBuddy: "云顶数字 Buddy",
    },
    general: {
      heading: "General",
      description: "Default provider, thread mode, and sidebar organization.",
      coreDefaults: "Core defaults",
      sidebarOrganization: "Sidebar organization",
      language: {
        title: "Language",
        description: "Choose the language used in the ydsz-buddy interface.",
        english: "English",
        chinese: "中文",
      },
      defaultProvider: {
        title: "Default provider",
        description: "Choose the provider used for new chats.",
        resetLabel: "default provider",
      },
      newThreads: {
        title: "New threads",
        description: "Pick the default workspace mode for newly created draft threads.",
        resetLabel: "new threads",
        local: "Local",
        worktree: "New worktree",
      },
      sidebarPosition: {
        title: "Position",
        description: "Choose which side of the screen the sidebar appears on.",
        left: "Left",
        right: "Right",
        resetLabel: "sidebar position",
      },
      projectOrder: {
        title: "Project order",
        description: "Controls how projects are arranged in the main sidebar.",
        recentlyActive: "Recently active",
        recentlyAdded: "Recently added",
        manual: "Manual order",
        resetLabel: "project order",
      },
      threadOrder: {
        title: "Thread order",
        description: "Controls how threads are arranged inside each project in the main sidebar.",
        recentlyActive: "Recently active",
        newestFirst: "Newest first",
        resetLabel: "thread order",
      },
    },
    appearance: {
      heading: "Appearance",
      description: "Theme, typography, and timestamp formatting.",
      themeAndTypographySection: "Theme and typography",
      timeAndReadingSection: "Time and reading",
      accessibilitySection: "Accessibility and performance",
      theme: {
        title: "Theme",
        description: "Choose how ydsz-buddy looks across the app.",
        system: "System",
        light: "Light",
        dark: "Dark",
        systemDescription: "Match your OS appearance setting.",
        lightDescription: "Always use the light theme.",
        darkDescription: "Always use the dark theme.",
      },
      lightThemeCard: {
        title: "Light theme",
        contextActive: "This is the active theme right now.",
        contextInactive: "Inactive while the app is locked to {mode}.",
        contextSystemActive: "System is currently using this light slot.",
        contextSystemInactive: "Used when your system switches to light.",
      },
      darkThemeCard: {
        title: "Dark theme",
        contextActive: "This is the active theme right now.",
        contextInactive: "Inactive while the app is locked to {mode}.",
        contextSystemActive: "System is currently using this dark slot.",
        contextSystemInactive: "Used when your system switches to dark.",
      },
      themePackReset: "Reset",
      themePackCopy: "Copy",
      themePackImport: "Import",
      themePackShareStringAria: "Theme share string",
      themePackCodeThemeAria: (label) => `${label} code theme`,
      themePackTranslucentAria: (label) => `${label} translucent sidebar`,
      themePackResetAria: (label) => `Reset ${label}`,
      themePackHexAria: (label) => `${label} hex value`,
      accent: "Accent",
      background: "Background",
      foreground: "Foreground",
      uiFontLabel: "UI font",
      codeFontLabel: "Code font",
      translucentSidebar: "Translucent sidebar",
      contrast: "Contrast",
      timestamp: {
        title: "Time format",
        description: "System default follows your browser or OS clock preference.",
        systemDefault: "System default",
        twelveHour: "12-hour",
        twentyFourHour: "24-hour",
        ariaLabel: "Timestamp format",
      },
      typography: {
        title: "Typography",
        description: "UI font, code font, and base size for the chat surface.",
        uiFont: "UI font",
        codeFont: "Code font",
        baseFontSize: "Base font size",
        fontSmoothing: "Font smoothing",
        uiFontDescription:
          "Set a custom font for the interface. Leave empty to use the active theme's UI font.",
        codeFontDescription:
          "Set a custom font for code blocks and inline code in chat. Leave empty to use the active theme's code font.",
        baseFontSizeDescription:
          "Adjust the app text base in pixels. Chat and UI typography scale proportionally from this value.",
        fontSmoothingDescription:
          "Use macOS-style antialiasing for lighter, crisper text rendering.",
        uiFontAria: "Custom UI font family",
        codeFontAria: "Custom chat code font family",
        baseFontSizeAria: "Base font size in pixels",
        fontSmoothingAria: "Enable font smoothing",
        unitPx: "px",
      },
      accessibility: {
        fontSizeScale: "Font size",
        fontSizeScaleDescription: "Scale interface text from 14px (small) to 20px (extra large).",
        fontSizeScaleAria: "Interface font size scale",
        fontSizeScaleOption: (label) => `${label}`,
        fontSizeScaleSmall: "Small (14px)",
        fontSizeScaleMedium: "Medium (16px)",
        fontSizeScaleLarge: "Large (18px)",
        fontSizeScaleXlarge: "Extra large (20px)",
        fontSizePercent: "Custom font scale",
        fontSizePercentDescription:
          "Fine-tune the interface from 80% (compact) to 150% (extra large) in 5% steps.",
        fontSizePercentAria: "Custom font scale percentage",
        fontSizePercentReset: "Reset to 100%",
        highContrast: "High contrast",
        highContrastDescription:
          "Boost contrast and reduce transparency. Auto follows your operating system preference.",
        highContrastAria: "High contrast mode",
        highContrastAuto: "Auto (follow system)",
        highContrastOn: "Always on",
        highContrastOff: "Off",
        highContrastSystemHint: (prefers) =>
          prefers ? "System currently prefers more contrast." : "System does not prefer more contrast.",
        performance: "Performance mode",
        performanceDescription:
          "Auto reduces animation when the frame rate drops. Override to force a mode.",
        performanceAria: "Performance mode",
        performanceAuto: "Auto (follow frame rate)",
        performanceReduced: "Reduced animations",
        performanceMinimal: "Minimal (no animations, no shadows)",
        performanceCurrentFps: (fps) => `Current frame rate: ${fps} fps`,
        performanceAutoHint: "Auto adjusts based on detected frame rate.",
      },
    },
    notifications: {
      heading: "Notifications",
      description: "In-app toasts and desktop alerts.",
      activityAlertsSection: "Activity alerts",
      unavailableTitle: "Desktop notifications unavailable",
      supportBrowserBlocked:
        "Browser notifications are blocked. Open the site settings to enable them.",
      supportBrowserPrompt: "Browser will prompt for notification permission.",
      supportBrowserGranted: "Browser notifications are enabled.",
      supportDesktopUnsupported: "Desktop notifications are not supported on this device.",
      supportDesktopGranted: "Desktop notifications are enabled.",
      supportDesktopDenied: "Desktop notifications are blocked in your OS settings.",
      testTitle: "Activity notification",
      testBody: "Notification test for chats and terminal agents.",
      testSuccessTitle: "Test notification sent",
      testUnavailableTitle: "Notifications unavailable",
      testSuccessDescriptionDesktop: "Your operating system should show the notification.",
      testUnavailableDescriptionDesktop: "Desktop notifications are not supported on this device.",
      testSuccessDescriptionBrowser: "Your browser should show the notification.",
      testButton: "Test",
      activityToasts: {
        title: "Activity toasts",
        description:
          "Show an in-app toast when a chat or managed terminal agent finishes or needs input.",
        ariaLabel: "Activity toast notifications",
      },
      desktopNotifications: {
        title: "Desktop notifications",
        description:
          "Show an OS notification when a chat or managed terminal agent finishes or needs input while the app is in the background.",
        ariaLabel: "Desktop activity notifications",
      },
    },
    behavior: {
      heading: "Behavior",
      description: "Streaming, diff handling, and destructive confirmations.",
      runtimeSection: "Runtime behavior",
      safetySection: "Safety confirmations",
      assistantOutput: "Assistant output",
      voicePolish: "Voice transcript polish",
      assistantOutputDescription: "Show token-by-token output while a response is in progress.",
      assistantOutputAria: "Stream assistant messages",
      voicePolishTitle: "Auto-polish voice transcripts",
      voicePolishDescription: "After voice transcription, automatically remove filler words, fix grammar, and clean whitespace. You can still review the result before sending.",
      voicePolishAria: "Auto-polish voice transcripts",
      diffLineWrapping: "Diff line wrapping",
      diffLineWrappingDescription:
        "Set the default wrap state when the diff panel opens. The in-panel wrap toggle only affects the current diff session.",
      diffLineWrappingAria: "Wrap diff lines by default",
      deleteConfirmation: "Delete confirmation",
      deleteConfirmationDescription: "Ask before deleting a thread and its chat history.",
      deleteConfirmationAria: "Confirm thread deletion",
      archiveConfirmation: "Archive confirmation",
      archiveConfirmationDescription: "Ask before archiving a thread.",
      archiveConfirmationAria: "Confirm thread archive",
      terminalCloseConfirmation: "Terminal close confirmation",
      terminalCloseConfirmationDescription:
        "Ask before closing a terminal tab and clearing its history.",
      terminalCloseConfirmationAria: "Confirm terminal tab close",
      voicePolishAdvanced: "Advanced voice polish options",
      voicePolishAdvancedDescription:
        "Tune which rules the voice transcript polish applies. Changes apply to the next voice note you record.",
      voicePolishRemoveFillerWords: "Remove filler words",
      voicePolishRemoveFillerWordsDescription:
        "Strip spoken filler words like 'um', 'uh', 'like' from the transcript.",
      voicePolishFixGrammar: "Fix grammar",
      voicePolishFixGrammarDescription:
        "Correct obvious grammar and punctuation errors after transcription.",
      voicePolishAddStructure: "Add structured prompt cues",
      voicePolishAddStructureDescription:
        "Inject scaffolding hints (sections, bullets) so the model receives a more structured input.",
      voicePolishTargetLanguage: "Target language",
      voicePolishTargetLanguageDescription:
        "Auto detects from the transcript. Pick a language to override detection.",
      voicePolishTargetLanguageAuto: "Auto-detect",
      voicePolishTargetLanguageZh: "Chinese",
      voicePolishTargetLanguageEn: "English",
    },
    worktrees: {
      heading: "Worktrees",
      description: "Review and clean up the worktrees created by 云顶数字 Buddy.",
      managedSection: "Managed worktrees",
      loading: "Loading managed worktrees...",
      loadFailedFallback: "Unable to load worktrees.",
      emptyState: "No app-managed worktrees found yet.",
      worktreeLabel: "Worktree",
      conversationsLabel: "Conversations",
      noConversations: "No conversations linked to this worktree.",
      deleteButton: "Delete",
      deleteWarning: "Linked conversations exist. Deleting will ask for confirmation.",
      verifyTitle: "Could not verify linked conversations",
      verifyDescription: "Retry once the app reconnects to the server.",
      deleteConfirmWithLinks: (name, count) =>
        `Permanently remove the worktree "${name}" and ${count} linked archived conversation${count === 1 ? "" : "s"}?`,
      deleteConfirm: (name) => `Permanently remove the worktree "${name}"?`,
      deleteAnyway: "Remove worktree",
      deleteLinkedActive: (active) => `${active} active`,
      deleteLinkedArchived: (archived) => `${archived} archived`,
      deleteArchivedWillDeleteFirst: "Archived conversations will be deleted first.",
      deleteLinkedWarning: "Deleting it can break reopening those chats in the same workspace.",
      deleteRemovesFromDisk: "This removes the Git worktree from disk.",
      deletedTitle: "Worktree deleted",
      deletedDescriptionWithArchived: (name, count) =>
        `${name} was removed and ${count} archived conversation${count === 1 ? "" : "s"} were deleted.`,
      deletedDescription: (name) => `${name} was removed.`,
      deleteErrorTitle: "Could not delete worktree",
      deleteErrorFallback: "Unable to delete the worktree.",
    },
    archived: {
      heading: "Archived",
      description: "View and restore archived threads.",
      emptySection: "Archived threads",
      emptyTitle: "No archived threads",
      emptyDescription: "Archived threads will appear here and can be restored to the sidebar.",
      unknownProject: "Unknown project",
      archivedAt: (when) => `Archived ${when}`,
      restoreButton: "Restore",
      deleteButton: "Delete",
      restoreTitle: "Thread restored",
      restoreDescription: "The thread has been moved back to the sidebar.",
      restoreErrorTitle: "Could not restore thread",
      restoreErrorFallback: "Unable to restore the thread.",
      deleteConfirm: (title) =>
        `Permanently delete "${title}"?\n\nThis will remove the thread and its conversation history forever.`,
      deleteTitle: "Thread deleted",
      deleteDescription: "The archived thread has been permanently removed.",
      deleteErrorTitle: "Could not delete thread",
      deleteErrorFallback: "Unable to delete the thread.",
      contextMenuRestore: "Restore",
      contextMenuDelete: "Delete",
    },
    models: {
      heading: "Models",
      description: "Git writing defaults and custom model slugs.",
      generationSection: "Generation defaults",
      customSection: "Custom models",
      gitWritingModel: "Git writing model",
      gitWritingModelDescription:
        "Used for generated commit messages, PR titles, and branch names.",
      gitWritingModelAria: "Git text generation model",
      customModelEmpty: "Enter a model slug.",
      customModelBuiltIn: "That model is already built in.",
      customModelTooLong: (max) => `Model slugs must be ${max} characters or less.`,
      customModelDuplicate: "That custom model is already saved.",
      customModelResetLabel: "custom models",
      customAddPlaceholder: "Add a custom model slug",
      customAddButton: "Add",
      customAddAria: "Add custom model",
      customProviderAria: "Custom model provider",
      customRemoveAria: (slug) => `Remove ${slug}`,
      customShowLess: "Show less",
      customShowMore: (count) => `Show more (${count})`,
      savedModelSlugs: "Saved model slugs",
      savedModelSlugsDescription: "Add custom model slugs for supported providers.",
      managementTitle: "Model Management",
      managementDescription:
        "Configure API keys, add more available models. Built-in models use stable versions by default.",
      addModel: "Add Model",
      addModelTooltip: "Add a new model from a provider or custom endpoint",
      builtInLabel: "Built-in",
      customLabel: "Custom",
      customEmpty: "No custom models yet",
      customCreateLink: "click to add custom model",
      dialogTitle: "Add Model",
      dialogTabProvider: "Model Provider",
      dialogTabCustom: "Custom Config",
      dialogProviderLabel: "Provider",
      dialogProviderPlaceholder: "Select model provider",
      dialogModelLabel: "Model",
      dialogModelPlaceholder: "Select model",
      dialogApiKeyLabel: "API Key",
      dialogApiKeyPlaceholder: "Enter API key",
      dialogAdvancedConfig: "Advanced Config",
      dialogDisplayNameLabel: "Display Name",
      dialogDisplayNamePlaceholder: "Enter display name",
      dialogDisplayNameHint:
        "Name shown in model list. Defaults to Model ID if not set.",
      dialogContextWindowLabel: "Context Window",
      dialogContextInput: "Input",
      dialogContextOutput: "Output",
      dialogToolRoundsLabel: "Tool Rounds",
      dialogToolRoundsPlaceholder: "200",
      dialogMultiModel: "Multi-model",
      dialogSubmit: "Add Model",
      dialogApiFormatLabel: "API Format",
      dialogApiFormatOpenAI: "OpenAI Chat Completions",
      dialogApiFormatAnthropic: "Anthropic Messages",
      dialogCustomUrlLabel: "Custom Endpoint URL",
      dialogCustomUrlPlaceholder: "e.g. https://api.openai.com/v1",
      dialogCustomUrlHint:
        "Please enter a compatible OpenAI API endpoint URL, without trailing slash. /chat/completions will be appended automatically.",
      dialogCustomUrlComplete: "Full URL",
      dialogModelIdLabel: "Model ID",
      dialogModelIdPlaceholder: "Enter model ID",
    },
    byok: {
      heading: "Custom Providers (BYOK)",
      description:
        "Connect any OpenAI / Anthropic / LiteLLM / Ollama compatible endpoint. API keys are encrypted in a local credential vault and never written to localStorage in plaintext.",
      emptyState: "No custom providers yet. Click “Add Provider” below to start configuring.",
      testConnection: "Test connection",
      testing: "Testing…",
      discoverModels: "Discover local models",
      discovering: "Discovering…",
      discoveryReachable: (version) =>
        version ? `Reachable · Ollama v${version}` : "Reachable",
      discoveryUnreachable: (reason) => `Unreachable: ${reason}`,
      discoveryNoModels: "Service reachable, but no local models have been pulled yet. Run `ollama pull <model>` to download one.",
      discoveryModelsLabel: (count) =>
        `${count} local model${count === 1 ? "" : "s"} discovered`,
      selectModel: "Pick a discovered model…",
      popularModelsLabel: "Popular model families",
      noDiscoveryYet: "点击“发现本地模型”扫描当前 Ollama 端点的已下载模型。",
      refresh: "Refresh",
    },
    providers: {
      heading: "Providers",
      description: "Choose visible providers, review CLI installs, and update provider tools.",
      updatesSection: "Updates",
      pickerSection: "Provider picker",
      toolsSection: "Provider tools",
      installTitle: (providerName) => `${providerName} installation`,
      visibility: {
        title: "Visible providers",
        description:
          "Drag providers into your preferred picker order and hide the ones you don't use. The provider you're currently using on a thread always stays visible.",
        statusAllVisible: "All providers visible",
        statusCustomOrder: "Custom order",
        statusHidden: (count) => `${count} providers hidden`,
        statusHiddenOne: "1 provider hidden",
        showAria: (name) => `Show ${name} in the provider picker`,
        reorderAria: (name) => `Reorder ${name}`,
        resetLabel: "provider picker",
      },
      updates: {
        title: "Provider updates",
        description: "Update installed provider tools that ydsz-buddy can safely update.",
        statusNoUpdates: "No provider updates detected",
        statusAvailableOne: "1 update available",
        statusAvailableMany: (count) => `${count} updates available`,
        statusAvailablePlural: (count) => `${count} updates available`,
        manualUpdate: "Manual update",
        updateButton: "Update",
        updatingButton: "Updating",
        commandLabel: "Command: ",
        runCommandTitle: (command) => `Run ${command}`,
        versionAdvisoryNoCommand:
          "A newer version is available, but ydsz-buddy could not identify a safe one-click update command for this installation.",
      },
      tools: {
        title: "Installed CLIs",
        description:
          "Review provider versions and update tools. Open a row only when you need binary overrides.",
        statusNoUpdates: "No provider updates detected",
        statusAvailableOne: "1 update available",
        statusAvailableMany: (count) => `${count} updates available`,
        statusAvailablePlural: (count) => `${count} updates available`,
        customBadge: "Custom",
        resetLabel: "provider tools",
        binaryPathLabel: (providerName) => `${providerName} binary path`,
        homePathLabel: "CODEX_HOME path",
        homePathDescription: "Optional custom Codex home and config directory.",
        agentDirLabel: "Pi agent directory",
        agentDirDescription:
          "Optional custom Pi agent directory for auth, models, skills, and commands.",
        apiEndpointLabel: "Cursor API endpoint",
        apiEndpointDescription:
          "Optional Cursor API endpoint override passed to `cursor-agent -e`.",
        serverUrlLabel: (providerName) => `${providerName} server URL`,
        serverUrlDescription: (providerName) =>
          `Optional existing ${providerName} server URL. Leave blank to spawn a local server.`,
        serverPasswordLabel: (providerName) => `${providerName} server password`,
        serverPasswordDescription: (providerName) =>
          `Optional password for an externally managed ${providerName} server.`,
        binaryPathDescription: (command) => `Leave blank to use \`${command}\` from your PATH.`,
        binaryPathPlaceholder: (providerName) => `${providerName} binary path`,
        homePathPlaceholder: "CODEX_HOME",
        agentDirPlaceholder: "Pi agent directory",
        apiEndpointPlaceholder: "https://api2.cursor.sh",
        serverUrlPlaceholder: "http://127.0.0.1:4096",
        serverPasswordPlaceholder: (providerName) => `${providerName} server password`,
      },
      docs: {
        install: "Install",
        update: "Update",
        config: "Config",
        headless: "Headless",
        label: "CLI docs",
      },
      update: {
        queued: "Update queued",
        updating: "Updating",
        updated: "Updated",
        failed: "Update failed",
        stillOutdated: "Still outdated",
        versionDelta: (current, latest) => `${current} -> ${latest}`,
        latest: (version) => `Latest ${version}`,
        current: (version) => `Current ${version}`,
        errorFallback: "The provider update did not complete.",
      },
      cliDocs: "CLI docs",
    },
    advanced: {
      heading: "Advanced",
      description: "Keybindings, recovery, and version info.",
      developerSection: "Developer tools",
      aboutSection: "About",
      keybindings: {
        title: "Keybindings",
        description:
          "Open the persisted `keybindings.json` file to edit advanced bindings directly.",
        pathPlaceholder: "Resolving keybindings path...",
        openEditorHint: "Opens in your preferred editor.",
        openButton: "Open file",
        openingButton: "Opening...",
        noEditor: "No available editors found.",
        openError: "Unable to open keybindings file.",
        noEditorToast: "No available editors found.",
        openErrorFallback: "Unable to open keybindings file.",
        openErrorUnknown: "Unable to open keybindings file.",
      },
      recovery: {
        title: "Recovery tools",
        description:
          "Rebuild local project indexes without clearing existing chats when the local state gets out of sync.",
        offerReason: "Visible because projects exist but no chat history is currently available.",
        hiddenReason: "Shown automatically only when recovery actions are relevant.",
        whatThisDoesLabel: "What this does",
        whatThisDoesBody:
          "Rebuilds local project indexes and refreshes project snapshots. Existing chats stay in place.",
        repairButton: "Repair state",
        repairingButton: "Repairing...",
        confirmTitle: "Repair local state?",
        confirmDescription: "This rebuilds local project indexes and refreshes project snapshots.",
        confirmSpacer: "It keeps existing chats in place, but it may take a moment.",
        successTitle: "Local state repaired",
        successDescription: "Project indexes were rebuilt without clearing existing chats.",
        errorTitle: "Repair failed",
        errorFallback: "Unable to repair local state.",
      },
      version: {
        title: "Version",
        description: "Current application version.",
        releaseHistory: "Release history",
        releaseHistoryDescription:
          "A running log of every update, newest first. Same notes the post-update dialog shows, kept here so you can revisit them any time.",
        viewReleaseHistory: "View release history",
      },
      idleLock: {
        heading: "Idle lock & privacy screen",
        description:
          "Automatically blur the workspace and require a PIN when you step away. Stays on the local device — your PIN is hashed before storage.",
        enabledLabel: "Enable idle lock",
        enabledDescription: "Lock automatically after the threshold when no mouse or keyboard input is detected.",
        thresholdLabel: "Idle threshold",
        thresholdDescription: (seconds: number) => `Lock after ${seconds} seconds of inactivity.`,
        thresholdSecondsUnit: "seconds",
        privacyOnlyLabel: "Privacy-only mode",
        privacyOnlyDescription: "Show the privacy screen without requiring a PIN to dismiss.",
        pinLabel: "Unlock PIN",
        pinPlaceholder: "Enter a PIN (4-32 digits)",
        pinDescription: "Used to unlock the privacy screen. Leave blank to clear.",
        pinMissing: "No PIN set — anyone with access to this device can dismiss the lock screen.",
        setPinButton: "Save PIN",
        clearPinButton: "Clear PIN",
        pinMinHint: "PIN must be 4-32 characters.",
        statusLabel: "Status",
        statusArmed: "Armed — watching for inactivity",
        statusDisarmed: "Disarmed",
        statusLocked: "Locked",
        idleSecondsLabel: (seconds: number) => `Idle for ${seconds}s`,
        lockNowButton: "Lock now",
        armButton: "Arm",
        disarmButton: "Disarm",
        lockedOverlayTitle: "Workspace locked",
        lockedOverlaySubtitle: "Enter your PIN to resume. The screen content is hidden until you unlock.",
        lockedOverlayPinPlaceholder: "PIN",
        lockedOverlayUnlockButton: "Unlock",
        lockedOverlayUnlockErrorMismatch: "Incorrect PIN. Please try again.",
        lockedOverlayUnlockErrorPinNotSet: "No PIN is configured for this device.",
        lockedOverlayUnlockErrorNotLocked: "Workspace is not currently locked.",
        lockedOverlayUnlockErrorUnknown: "Unable to unlock — please try again.",
        changedSettingLabel: {
          idleLockEnabled: "Idle lock",
          idleLockThreshold: "Idle threshold",
          idleLockPrivacyOnly: "Privacy-only mode",
          idleLockPin: "Unlock PIN",
        },
      },
      mcpSection: "MCP servers",
      mcpDescription:
        "Configure Model Context Protocol servers to extend AI with external tools (filesystem, fetch, github, databases).",
      mcpNoWorkspace: "Open a workspace to configure MCP servers.",
      sshSection: "SSH remote",
      sshDescription:
        "Connect to a remote development machine or container via SSH. Supports password and key-based authentication with auto-reconnect.",
      sshNoWorkspace: "Open a workspace to use SSH remote.",
    },
    agent: {
      title: "Agent",
      heading: "Agent Configuration",
      description: "Configure AI agent behavior, tool permissions, and sandbox settings.",
      customAgents: {
        label: "Custom Agents",
        empty: "No custom agents yet",
        create: "Create",
        createTooltip: "Create a new custom agent with customized instructions and capabilities",
      },
      builtInAgents: {
        label: "Built-in Agents",
        code: {
          name: "Code",
          description: "Read, write, and edit code. Execute terminal commands, manage Git, and run builds.",
        },
        work: {
          name: "Work",
          description: "Handle Office documents, browser automation, scheduled tasks, and data processing.",
        },
        plan: {
          name: "Plan",
          description: "Generate executable plans for approval before taking action.",
        },
        review: {
          name: "Review",
          description: "Review code diffs for correctness, security, and maintainability.",
        },
        ask: {
          name: "Ask",
          description: "Answer questions and provide information without executing side-effect operations.",
        },
      },
      toolPermissions: {
        title: "Tool Permissions",
        description: "Control which file operations the AI agent can perform.",
        status: "Active",
        currentLevel: "Current permission level",
        fileReadWriteAll: "Full read & write",
        fileRead: "Read only",
        none: "No file access",
        ariaLabel: "Select tool permission level",
      },
      sandbox: {
        title: "Sandbox",
        description: "Worktree isolation and execution environment.",
        worktreeIsolation: "Worktree isolation",
        worktreeIsolationDescription: "Run each agent in an isolated Git worktree for parallel development.",
        worktreeIsolationAria: "Toggle worktree isolation",
      },
      retry: {
        title: "Auto-retry",
        description: "Automatically retry failed tasks.",
        autoRetry: "Enable auto-retry",
        autoRetryDescription: "Failed tasks are automatically retried up to 3 times with exponential backoff.",
        autoRetryAria: "Toggle auto-retry",
      },
    },
    mcp: {
      title: "MCP",
      heading: "MCP Configuration",
      description: "Manage Model Context Protocol servers and tool integrations.",
      servers: {
        title: "MCP Servers",
        description: "Configure and manage MCP server connections.",
        status: "Active",
        add: "Add server",
        test: "Test connection",
        testing: "Testing...",
        remove: "Remove",
        enable: "Enable",
        disable: "Disable",
        connected: "Connected",
        disconnected: "Disconnected",
        error: "Error",
        noWorkspace: "Open a workspace to configure MCP servers.",
        transportType: "Transport type",
        stdio: "stdio",
        sse: "SSE",
        commandLabel: "Command / URL",
        commandPlaceholder: "npx -y @modelcontextprotocol/server-filesystem",
        argsLabel: "Arguments",
        envLabel: "Environment variables",
      },
      presets: {
        title: "Preset Templates",
        description: "Quick-install common MCP server presets.",
        install: "Install",
        installed: "Installed",
      },
    },
    cue: {
      title: "CUE",
      heading: "Prompt Engineering",
      description: "Prompt templates, structured cues, and response tuning.",
      templates: {
        title: "Prompt Templates",
        description: "Custom prompt templates for different task types.",
        status: "Active",
        add: "Add template",
        edit: "Edit",
        remove: "Remove",
        empty: "No custom templates. Use AGENTS.md or project rules for system prompts.",
      },
      responseTuning: {
        title: "Response Tuning",
        description: "Fine-tune AI response parameters.",
        temperature: "Temperature",
        temperatureDescription: "Higher values produce more creative responses. Range: 0.0–2.0.",
        maxTokens: "Max tokens",
        maxTokensDescription: "Maximum number of tokens in the response.",
      },
      voicePolish: {
        title: "Voice Polish",
        description: "Automatically polish voice transcript before sending.",
        enabled: "Enable voice polish",
        enabledDescription: "Remove filler words, fix grammar, and add structure to transcribed text.",
        ariaLabel: "Toggle voice polish",
      },
    },
    conversationFlow: {
      title: "Conversation Flow",
      heading: "Conversation Management",
      description: "Dialog management, turn limits, and context window settings.",
      contextWindow: {
        title: "Context Window",
        description: "Control how context is managed across turns.",
        status: "Active",
        maxTokens: "Max context tokens",
        maxTokensDescription: "Maximum number of tokens retained in the conversation context.",
        compaction: "Auto-compaction",
        compactionDescription: "Automatically compact context when the window is full, preserving key information.",
        compactionAria: "Toggle auto-compaction",
      },
      turnLimits: {
        title: "Turn Limits",
        description: "Limit the number of turns and retries per conversation.",
        maxTurns: "Max turns",
        maxTurnsDescription: "Maximum number of agent turns before requiring user input.",
        maxRetries: "Max retries",
        maxRetriesDescription: "Maximum number of retries on tool execution failure.",
      },
      streaming: {
        title: "Streaming",
        description: "Stream AI responses in real-time.",
        enabled: "Enable streaming",
        enabledDescription: "Display AI responses token-by-token as they are generated.",
        ariaLabel: "Toggle streaming",
      },
    },
    browser: {
      title: "Browser",
      heading: "Browser Configuration",
      description: "Web automation, CDP integration, and browser tool configuration.",
      automation: {
        title: "Browser Automation",
        description: "Enable CDP-based browser tooling for agents.",
        status: "Active",
        enabled: "Enable browser automation",
        enabledDescription: "Allow agents to navigate, click, fill forms, and extract data from web pages.",
        ariaLabel: "Toggle browser automation",
      },
      security: {
        title: "Security",
        description: "URL validation, rate limiting, and execution timeout.",
        blockedHosts: "Blocked hosts",
        blockedHostsDescription: "Internal addresses (localhost, 127.0.0.1, cloud metadata) are blocked by default.",
        rateLimit: "Rate limit",
        rateLimitDescription: "Maximum browser actions per minute (default: 30).",
        executionTimeout: "Execution timeout",
        executionTimeoutDescription: "Timeout for each browser action in seconds (default: 10).",
      },
      screenshot: {
        title: "Screenshot",
        description: "Automatically capture and inject screenshots into Composer.",
        autoInject: "Auto-inject screenshots",
        autoInjectDescription: "Capture screenshots after browser actions and inject them into the Composer.",
        ariaLabel: "Toggle auto-inject screenshots",
      },
    },
    indexer: {
      title: "Index & Documents",
      heading: "Indexing & Documentation",
      description: "Code indexing, AST grep patterns, and document management.",
      codeIndex: {
        title: "Code Index",
        description: "Symbol index for cross-file search and @codebase mentions.",
        status: "Active",
        rebuild: "Rebuild index",
        rebuilding: "Rebuilding...",
        lastBuilt: "Last built",
        fileCount: "Files indexed",
        symbolCount: "Symbols",
      },
      astGrep: {
        title: "AST-Grep",
        description: "Structural code search with pattern matching.",
        patterns: "Saved patterns",
        empty: "No saved AST-Grep patterns.",
      },
      semantic: {
        title: "Semantic Search",
        description: "Embedding-based code search.",
        enabled: "Enable semantic search",
        enabledDescription: "Use vector embeddings for semantic code search (requires indexing).",
        ariaLabel: "Toggle semantic search",
      },
      repoWiki: {
        title: "Repo Wiki",
        description: "Auto-generated project knowledge base.",
        generate: "Generate wiki",
        generating: "Generating...",
        status: "Not generated",
      },
    },
    skills: {
      title: "Skills & Commands",
      heading: "Skills & Commands",
      description: "Custom skills, slash commands, and composer command menu.",
      customSkills: {
        title: "Custom Skills",
        description: "Skills scanned from local directories.",
        status: "Active",
        empty: "No skills found. Drop a SKILL.md folder into ~/.claude/skills, ~/.codex/skills, or ~/.agents/skills.",
        scanPaths: "Scan paths: ~/.claude/skills, ~/.codex/skills, ~/.agents/skills",
      },
      slashCommands: {
        title: "Slash Commands",
        description: "Registered slash commands available in Composer.",
        empty: "No slash commands registered.",
      },
      marketplace: {
        title: "Skill Marketplace",
        description: "Browse and install community skills.",
        browse: "Browse marketplace",
        refresh: "Refresh",
        refreshing: "Refreshing...",
      },
    },
    rules: {
      title: "Rules & Memory",
      heading: "Rules & Memory",
      description: "Project rules, team rules, and persistent memory configuration.",
      projectRules: {
        title: "Project Rules",
        description: "Rules loaded from AGENTS.md, CLAUDE.md, .cursorrules, and .ydsz/rules/.",
        status: "Active",
        loaded: "Loaded rules",
        noRules: "No project rules discovered in this workspace.",
        files: "Files",
      },
      teamRules: {
        title: "Team Rules",
        description: "Cross-project rules stored in ~/.ydsz-buddy/team-rules/.",
        manage: "Manage team rules",
        enabled: "Enable team rules",
        enabledDescription: "Append team shared rules to every project context.",
        ariaLabel: "Toggle team rules",
      },
      memory: {
        title: "Persistent Memory",
        description: "Agent memory persisted across sessions.",
        clear: "Clear memory",
        clearing: "Clearing...",
        status: "No persistent memory stored.",
      },
    },
    work: {
      heading: "Work mode",
      description:
        "Toggle office document generation, browser automation, and scheduler capabilities.",
      officeSection: "Office documents",
      officePptx: {
        title: "PowerPoint 导出",
        description:
          "将已批准的计划导出为 .pptx 幻灯片。可从计划操作工具栏访问。",
        status: "Enabled",
      },
      automationSection: "Automation",
      browserAutomation: {
        title: "Browser automation",
        description:
          "Enable CDP-based browser tooling for agents to navigate, click, and scrape pages.",
        warning: "Sensitive capability. Disabled by default; turn on only when you trust the workspace.",
        ariaLabel: "Toggle browser automation",
      },
      cronPersistence: {
        title: "定时任务持久化",
        description:
          "将定时任务持久化到 .ydsz/scheduler-jobs.json,重启后自动恢复。",
        status: "Persisted",
        ariaLabel: "Toggle scheduled job persistence",
      },
      skillMentions: {
        title: "Skill 提及",
        description:
          "在编辑器中显示 @indexer、@ppt、@html 等 Work 域技能节点。",
        ariaLabel: "Toggle skill mentions",
      },
      ocrSection: "Recognition",
      ocr: {
        title: "OCR languages",
        description:
          "Image text recognition supports auto, English, and Chinese. Managed from the OCR panel.",
        languages: "auto / en / zh",
      },
    },
    push: {
      heading: "Push Channel",
      description:
        "Configure JPush / Umeng credentials to send approvals and task updates to mobile devices.",
      statusHeading: "Channel status",
      statusDescription:
        "Live status of JPush / Umeng credentials and dry_run mode applied to the embedded dispatcher.",
      statusLoadFailed: "Failed to load push channel status",
      refresh: "Refresh status",
      jpushStatus: "JPush",
      umengStatus: "Umeng",
      dryRunStatus: "Dry-run",
      dryRunOn: "active",
      dryRunOff: "inactive",
      dryRunHint:
        "Dry-run is ON: dispatch calls only log to console and never hit the vendor APIs. Toggle off before real-device testing.",
      jpushSection: "JPush (Aurora)",
      umengSection: "Umeng",
      configured: "Configured",
      notConfigured: "Not configured",
      testJpush: "Test JPush",
      testUmeng: "Test Umeng",
      jpushAppKey: "JPush App Key",
      jpushMasterSecret: "JPush Master Secret",
      umengAppKey: "Umeng App Key",
      umengAppMasterSecret: "Umeng App Master Secret",
      revealSecret: "Reveal secret",
      hideSecret: "Hide secret",
      dryRunToggle: "Dry-run mode",
      dryRunToggleDescription:
        "When enabled, dispatch calls log to console without hitting vendor APIs. Useful for CI and demos.",
      dryRunEnabled: "Dry-run enabled",
      dryRunDisabled: "Dry-run disabled",
      save: "Save credentials",
      saveSuccess: "Push credentials updated",
      saveFailed: "Failed to update push credentials",
      jpushTestSuccess: "JPush connection test succeeded",
      jpushTestFailed: "JPush connection test failed",
      umengTestSuccess: "Umeng connection test succeeded",
      umengTestFailed: "Umeng connection test failed",
    },
    changedSettingLabel: {
      theme: "Theme",
      darkThemePack: "Dark theme pack",
      lightThemePack: "Light theme pack",
      defaultProvider: "Default provider",
      newThreadMode: "New thread mode",
      sidebarPosition: "Sidebar position",
      projectSortOrder: "Project sort order",
      threadSortOrder: "Thread sort order",
      uiFont: "UI font",
      codeFont: "Code font",
      baseFontSize: "Base font size",
      fontSmoothing: "Font smoothing",
      timeFormat: "Time format",
      activityToasts: "Activity toasts",
      desktopNotifications: "Desktop notifications",
      assistantOutput: "Assistant output",
      voicePolish: "Voice transcript polish",
      diffLineWrapping: "Diff line wrapping",
      deleteConfirmation: "Delete confirmation",
      archiveConfirmation: "Archive confirmation",
      terminalCloseConfirmation: "Terminal close confirmation",
      gitWritingModel: "Git writing model",
      customModels: "Custom models",
      providerInstalls: "Provider installs",
      providerVisibility: "Provider visibility",
      providerOrder: "Provider order",
      language: "Language",
    },
    resetAria: (label) => `Reset ${label} to default`,
    resetTooltip: "Reset to default",
    restoreDefaultsConfirm: (labels) => `Restore default settings?\nThis will reset: ${labels}.`,
    themePack: {
      importTitle: "Import theme pack",
      importDescription: "Paste a shared theme pack string to apply it instantly.",
      apply: "Apply",
      reset: "Reset",
    },
  },
  dialog: {
    confirm: {
      deleteThread: (title) =>
        `"${title}"\n\nThis will permanently delete the thread and its history.`,
      deleteThreadPermanent: "Delete thread",
      threadDeleteUndoButton: "Undo",
    threadDeleteUndoSuccessTitle: "Thread restored",
    threadDeleteUndoFailedTitle: "Could not undo deletion",
    threadDeleteUndoFailedDescription: "The thread may have been permanently removed.",
    archiveThread: "Archive thread",
      removeProject: (name) => `Remove "${name}" from the sidebar?`,
      removeProjectAndThreads: (name, count) =>
        `Remove "${name}" from the sidebar and delete ${count} thread${count === 1 ? "" : "s"}?`,
      cancel: "Cancel",
      continue: "Delete",
      discardDraft: "Discard the new thread draft?",
    },
    rename: {
      title: "Rename chat",
      description: "Keep it short and recognizable.",
      submit: "Rename",
      cancel: "Cancel",
    },
    pullRequest: {
      title: "Link pull request",
      description: "Paste a GitHub pull request URL or number to attach to this thread.",
      placeholder: "https://github.com/owner/repo/pull/42 or #42",
      open: "Open",
      cancel: "Cancel",
    },
    worktreeHandoff: {
      title: "Hand off to worktree",
      description:
        "Move the running session into a new worktree so you can keep working without losing context.",
      submit: "Hand off",
      cancel: "Cancel",
    },
  },
  whatsNew: {
    title: "What's new",
    popoutTitle: "What's new in ydsz-buddy",
    open: "Open",
    dismiss: "Dismiss",
    gotIt: "Got it",
    releaseNotes: "Release notes",
    readMore: "Read more",
    showLess: "Show less",
    highlights: "Highlights",
    allReleases: "All releases",
    versionLabel: (version) => `v${version}`,
  },
  taskCompletion: {
    markAllRead: "Mark all as read",
    viewChat: "View chat",
  },
  workspace: {
    fallbackTitle: "Workspace",
    renameHint: "Double-click to rename",
    terminalTab: "Terminal",
    settingsAria: "Workspace settings",
    loading: "Loading workspace",
    emptyTitle: "No workspace open",
    openInEditor: "Open in editor",
  },
  workspaceModePicker: {
    modeLabel: "Workspace mode",
    chooseFolder: "Select folder",
    changeFolder: "Change folder",
    openingPicker: "Opening…",
    pickFolderError: "Could not open the folder picker",
    cloudNotAvailable: "Cloud workspaces are coming soon",
    worktreeCreateError: "Could not create a git worktree from this folder",
    comingSoonHint: "Coming soon",
    modes: {
      local: "Local",
      worktree: "Worktree",
      ssh: "SSH Remote",
      cloud: "Cloud",
    },
  },
  workspaceMigrationHint: {
    title: "Pick a folder to get started",
    description: (count: number) =>
      count === 1
        ? "1 workspace is waiting for a folder. Click [Select folder] below to choose one."
        : `${count} workspaces are waiting for folders. Click [Select folder] below to choose one.`,
    dismiss: "Got it",
  },
  terminal: {
    findPlaceholder: "Find",
    matchCase: "Match case",
    tabTerminal: "Terminal",
    tabChat: "Chat",
  },
  gitActions: {
    groupAria: "Git actions",
    optionsAria: "Git action options",
    prTitlePlaceholder: "Leave empty to auto-generate",
    linkUnavailable: "Link opening is unavailable.",
    noOpenPR: "No open PR found.",
    openPRErrorTitle: "Unable to open PR link",
    syncingTitle: "Syncing with remote...",
    syncSuccess: "Remote synced",
    alreadyUpToDate: "Already up to date",
    syncFailed: "Sync failed",
    createPRUnavailable: "Create PR unavailable",
    noChanges: "No branch changes to include in a PR.",
    running: "Running git action...",
    waiting: "Waiting for Git...",
    keeping: (name) => `Keeping ${name}`,
    branchConfirmed: "Branch name confirmed.",
    creatingBranch: "Creating branch...",
    switchedTo: (name) => `Switched to ${name}`,
    createdCheckedOut: "Branch created and checked out.",
    createFailed: "Failed to create branch",
    editorUnavailable: "Editor opening is unavailable.",
    openFileFailed: "Unable to open file",
  },
  browser: {
    screenshotCopied: "Browser screenshot copied",
    urlPlaceholder: "Search or enter a URL",
    actionsAria: "Browser actions",
  },
  branchToolbar: {
    newWorktree: "New worktree",
    handoffNewWorktree: "Hand off to new worktree",
    handoffLocal: "Hand off to local",
    rateLimitsRemaining: "Rate limits remaining",
    checkoutPR: "Checkout Pull Request",
    searchPlaceholder: "Search branches...",
    createTitle: "Create Branch",
    discardStash: "Discard saved stash?",
    loadingStash: "Loading stash details...",
    fieldBranch: "Branch",
    fieldWorktree: "Worktree",
    fieldStash: "Stash",
    fieldName: "Name",
  },
  projectScripts: {
    groupAria: "Project scripts",
    actionAria: "Script actions",
    editAria: (name) => `Edit ${name}`,
    nameLabel: "Name",
    chooseIcon: "Choose icon",
    testPlaceholder: "Test",
    keybindingLabel: "Keybinding",
    pressShortcut: "Press shortcut",
    pressShortcutHint: "Press a shortcut. Use Backspace to clear.",
    commandLabel: "Command",
    autoRunLabel: "Run automatically on worktree creation",
    deleteConfirmDescription: "This action cannot be undone.",
    addScript: "Add script",
    delete: "Delete",
  },
  themeEditor: {
    copiedTitle: "Theme copied",
    copiedDescription: (variant) => `Copied the ${variant} theme share string.`,
    copyFailedTitle: "Copy failed",
    copyFailedDescription: "Unable to copy the theme share string.",
    codeAria: (label) => `${label} code theme`,
    systemDefault: "System default",
    translucentSidebar: "Translucent sidebar",
    translucentSidebarAria: (label) => `${label} translucent sidebar`,
    resetAria: (label) => `Reset ${label}`,
    resetTitle: "Reset to default",
    hexValueAria: (label) => `${label} hex value`,
    importedTitle: "Theme imported",
    importedDescription: (variant) => `Updated the ${variant} theme pack.`,
    shareStringAria: "Theme share string",
    background: "Background",
    text: "Text",
    accent: "Accent",
    border: "Border",
    status: "Status",
    code: "Code",
    light: "Light",
    dark: "Dark",
    reset: "Reset",
    shareString: "Share string",
    apply: "Apply",
    import: "Import",
    foreground: "Foreground",
    uiFont: "UI font",
    codeFont: "Code font",
    codeFontPlaceholder: '"JetBrains Mono"',
    contrast: "Contrast",
    contextActiveSystem: (variant) => `System is currently using this ${variant} slot.`,
    contextActiveLocked: "This is the active theme right now.",
    contextInactiveSystem: (variant) => `Used when your system switches to ${variant}.`,
    contextInactiveLocked: (mode) => `Inactive while the app is locked to ${mode}.`,
    importDialogTitle: (variant) => `Import ${variant} theme`,
    importDialogDescription: (variant) =>
      `Paste a codex-theme-v1: share string. The embedded variant must match ${variant}, and the selected code theme must exist for that variant.`,
    importDialogCancel: "Cancel",
    importDialogSubmit: "Import",
    importError: "Unable to import that theme string.",
    importPlaceholder: 'codex-theme-v1:{"codeThemeId":"linear",...}',
    copy: "Copy",
  },
  themePack: {
    importTitle: "Import theme pack",
    importDescription: "Paste a shared theme pack string to apply it instantly.",
    apply: "Apply",
    reset: "Reset",
  },
  restoreDefaults: {
    title: "Restore defaults",
    description: (labels) => `Restore default settings?\nThis will reset: ${labels}.`,
    button: "Restore",
  },
  keybindings: {
    searchPlaceholder: "Search shortcuts...",
    title: "Keyboard shortcuts",
  },
  releaseHistory: {
    title: "Release notes",
    open: "Open",
  },
  rateLimits: {
    reachedTitle: "Rate limit reached.",
    approachingTitle: "Approaching rate limit",
    planLimitTitle: "Plan limit reached",
    noData: "No rate limit data yet.",
  },
  providerUsage: {
    title: (providerName) => `${providerName} usage`,
    fallbackTitle: "Usage",
    window: "Window",
    resetsAt: "Resets at",
    noData: "No usage data yet.",
  },
  codingPlan: {
    sectionTitle: "国内 Coding Plan 配额",
    sectionDescription:
      "一站式查看 4 家国内 Coding Plan 订阅的剩余额度，点击卡片可跳转到官方用量控制台。",
    providerLabel: {
      glm: "智谱 BigModel (GLM)",
      deepseek: "DeepSeek",
      moonshot: "Moonshot (Kimi)",
      qwen: "Qwen (Tongyi)",
    },
    status: {
      notBound: "Not bound",
      bound: "Bound",
      quotaUnknown: "Quota not reported",
      fetching: "Fetching quota…",
    },
    quotaRow: {
      label: "Remaining",
      remaining: (percent: number) => `${Math.round(percent)}% left`,
      resetsAt: (when: string) => `Resets ${when}`,
      unlimited: "Unlimited",
    },
    actions: {
      bind: "绑定 Coding Plan",
      viewUsage: "Open usage console",
      refresh: "Refresh",
      open: "Open",
    },
    learnMore: "了解更多国内 Coding Plan",
  },
  costBudget: {
    sectionTitle: "Cost budget",
    sectionDescription: "Set a daily or monthly cap on AI spend. The desktop client tracks token usage from every provider and warns or blocks before you overshoot.",
    dailyBudget: {
      label: "Daily budget (USD)",
      placeholder: "e.g. 10",
      hint: "Resets every day at 00:00 local time. Set to 0 to disable.",
    },
    monthlyBudget: {
      label: "Monthly budget (USD)",
      placeholder: "e.g. 200",
      hint: "Resets on the 1st of each month at 00:00 local time. Set to 0 to disable.",
    },
    policy: {
      label: "When budget is exceeded",
      warn: "Warn only",
      warnDescription: "Continue sending; show a banner so you can decide to slow down.",
      block: "Block new calls",
      blockDescription: "Require explicit confirmation in a dialog before the next model call.",
    },
    progress: {
      title: "Current spend",
      dailyLabel: "Today",
      monthlyLabel: "This month",
      spentOf: (spend, budget) => `${spend} of ${budget}`,
      noBudget: "No budget set",
      exceeded: "Over budget",
      remaining: (amount) => `${amount} left`,
    },
    alert: {
      title: "Cost budget reached",
      description: (threshold, spend, budget) =>
        `You've crossed the ${Math.round(threshold * 100)}% threshold (${spend} of ${budget}). Consider switching to a smaller model or pausing usage.`,
      dismiss: "Got it",
      upgrade: "Adjust budget",
    },
    blockDialog: {
      title: "AI call blocked by budget",
      description: "Your daily/monthly budget is exhausted. Confirm to override and continue, or cancel to stop the current task.",
      reasonLabel: "Reason",
      reasonDaily: (spend, budget) => `Today you have spent ${spend} of the ${budget} daily budget.`,
      reasonMonthly: (spend, budget) => `This month you have spent ${spend} of the ${budget} budget.`,
      continue: "Continue anyway",
      cancel: "Cancel",
    },
  },
  turnAiShare: {
    badge: {
      label: "AI {percent}",
      empty: "AI —",
      tooltip: (lines, percent) => `${lines} lines · ${percent} AI-authored`,
      tooltipBreakdown: (ai, user, mixed, total) =>
        `AI ${ai} · User ${user} · Mixed ${mixed} of ${total} lines`,
      a11yLabel: (percent) => `AI authored ${percent} of lines in this thread`,
    },
    panel: {
      sectionTitle: "AI production share",
      sectionDescription: "Net line attribution across every turn in this thread. Mixed files are split 50/50 between AI and you.",
      ai: "AI",
      human: "You",
      mixed: "Mixed",
      total: "Total",
      turnCount: (n) => `${n} turn${n === 1 ? "" : "s"}`,
      fileCount: (n) => `${n} file${n === 1 ? "" : "s"}`,
      empty: "No code changes recorded yet — the first AI-authored diff will appear here.",
    },
    workspace: {
      title: "Workspace AI share",
      subtitle: "Rollup of every thread in this workspace, bucketed by 24h / 7d / 30d windows.",
      empty: "No turn data across the workspace yet.",
      window24h: "24h",
      window7d: "7d",
      window30d: "30d",
      percent: (n) => `${n.toFixed(1)}%`,
      lines: (n) => `${n} lines`,
      refresh: "Refresh",
      summary: (percent, lines, window) => `AI ${percent} · ${lines} · ${window}`,
    },
  },
  debug: {
    actionFailed: "Action failed",
    fallback: "An error occurred.",
  },
  notification: {
    retention: {
      title: "Cleaning old chats...",
      preparing: "Preparing background cleanup.",
      progress: (purged, total) => `${purged} of ${total} chats removed.`,
      progressSimple: (purged) => `${purged} chats removed.`,
      compactingTitle: "Compacting chat database...",
      compactingReclaim: "Reclaiming unused database space.",
      compactingFinishing: "Finishing cleanup.",
      pausedTitle: "Cleanup paused",
      pausedDescription: "Old chats will be retried later.",
      successTitle: "Old chats cleaned",
      successDescription: (purged) => `${purged} chats removed from the database.`,
      successDescriptionEmpty: "No old chats needed cleanup.",
    },
    providerUpdate: {
      title: (providerName) => `Updating ${providerName}.`,
      titleMany: (count) => `Updating ${count} providers.`,
      description: (providerName) => `Updating ${providerName}.`,
      descriptionMany: (count) => `Updating ${count} providers.`,
      errorFallback: "The update command did not complete successfully.",
      stillOutdated: "The provider still appears outdated after updating.",
      requestFailed: "The update request failed.",
      failedTitleAll: "Provider updates failed",
      failedTitleSome: "Some provider updates failed",
      successTitleOne: (providerName) => `${providerName} updated`,
      successTitleMany: (count) => `${count} providers updated`,
      successDescription: "New sessions will use the refreshed provider tools.",
      availableTitleOne: (providerName) => `${providerName} update available`,
      availableTitleMany: (count) => `${count} provider updates available`,
      availableDescriptionOne: (providerName) => `${providerName} has a newer version available.`,
      availableDescriptionMany: (providerName, count) =>
        `${providerName} and ${count} more provider${count === 1 ? "" : "s"} have newer versions available.`,
      actionReview: "Review updates",
      actionUpdateAll: "Update all",
    },
    keybindings: {
      invalidTitle: "Invalid keybindings configuration",
      openConfigAction: "Open keybindings.json",
      noEditor: "No available editors found.",
      openFileErrorTitle: "Unable to open keybindings file",
      openFileErrorFallback: "Unknown error opening file.",
    },
  },
  termsAcceptance: {
    heading: "Welcome to ydsz-buddy",
    subtitle:
      "Before you start, please review and accept our Terms of Service and Privacy Policy. They explain how your workspace data, provider keys, and local vector store are handled.",
    viewPrivacy: "View privacy policy",
    viewTerms: "View terms of service",
    acceptLabel:
      "I have read and agree to the Terms of Service and Privacy Policy.",
    acceptButton: "Agree and continue",
    acceptedAtPrefix: "Accepted on",
    reviewButton: "Review documents",
    resetButton: "Reset acceptance",
    dialogTitlePrivacy: "Privacy Policy",
    dialogTitleTerms: "Terms of Service",
    lastUpdated: "Last updated",
    closeButton: "Close",
  },
};

const zh: Messages = {
  common: {
    cancel: "取消",
    save: "保存",
    delete: "删除",
    confirm: "确认",
    retry: "重试",
    close: "关闭",
    open: "打开",
    ok: "好的",
    done: "完成",
    loading: "加载中…",
    yes: "是",
    no: "否",
    errorOccurred: "发生错误",
    unexpectedError: "发生意外错误",
  },
  appShell: {
    connecting: "正在连接 {name} 服务器",
  },
  appNavigation: {
    back: "后退",
    backMac: "后退（⌘[）",
    backWin: "后退（Alt+←）",
    forward: "前进",
    forwardMac: "前进（⌘]）",
    forwardWin: "前进（Alt+→）",
  },
  accountBar: {
    guest: "未登录",
    settingsTooltip: "设置",
    deviceTooltip: "设备",
    userMenuTooltip: "账户菜单",
  },
  errorFallback: {
    title: "出错了",
    retry: "重试",
    reload: "重新加载应用",
    showDetails: "显示错误详情",
    hideDetails: "隐藏错误详情",
    unexpected: "发生意外路由错误",
    noDetails: "没有更多可用的错误信息",
    copyDetails: "复制错误详情",
    copySuccessTitle: "已复制错误详情",
    copySuccessDescription: "可粘贴到问题或反馈中",
    copyFailedTitle: "复制失败",
    copyFailedDescription: "请手动复制错误详情",
  },
  splash: {
    retry: "重试",
  },
  providerFeedback: {
    switchedTitle: (_provider) => `已切换到 {_provider}`,
    switchedDescription: "新消息将使用此提供方。",
    switchFailedTitle: "提供方切换失败",
    switchFailedDescription: (_provider) => `无法切换到 {_provider},请重试。`,
  },
  networkStatus: {
    offlineMessage: "已断开网络连接，消息将保存为草稿，联网后自动发送。",
    offlineMessageWithCount: (count) => {
      if (!Number.isFinite(count) || count <= 0) {
        return "已断开网络连接，0 条消息已保存为草稿，联网后将自动发送。";
      }
      if (count === 1) {
        return "已断开网络连接，1 条消息已保存为草稿，联网后将自动发送。";
      }
      return `已断开网络连接，${count} 条消息已保存为草稿，联网后将自动发送。`;
    },
    degradedMessage: "网络连接不稳定，AI 响应可能延迟。",
    providerFallbackMessage: (provider) => `当前提供方不可用，已切换到 ${provider} 降级。`,
    flushStartToastTitle: "正在重发离线草稿",
    flushStartToastDescription: (count) =>
      count <= 1
        ? "网络已恢复，正在发送 1 条已保存的消息。"
        : `网络已恢复，正在发送 ${count} 条已保存的消息。`,
    flushCompleteToastTitle: "离线草稿已发送",
    flushCompleteToastDescription: (count) =>
      count <= 1 ? "1 条草稿已成功发送。" : `${count} 条草稿已成功发送。`,
    flushFailedToastTitle: "重发离线草稿失败",
    flushFailedToastDescription: "我们会在网络再次恢复时继续重试。",
    saveDraftToastTitle: "已保存为离线草稿",
    saveDraftToastDescription: (count) =>
      count <= 1
        ? "1 条消息正在等待联网后发送。"
        : `${count} 条消息正在等待联网后发送。`,
    removeDraftAria: "删除离线草稿",
    draftsHeading: "离线草稿",
    draftsEmpty: "暂无离线草稿",
    flushNowButton: "立即发送",
    flushAllButton: "全部发送",
    dismissAria: "关闭",
    wsReconnectingMessage: "连接已断开,正在重连…",
    wsReconnectedMessage: "连接已恢复",
    wsReconnectFailedMessage: "重连失败,请重启应用",
  },
  landing: {
    workTitle: "使用云顶数字 工作",
    codeTitle: "使用云顶数字 编码",
    workSubtitle: "任务驱动的数字员工 — 文档、浏览器自动化、数据处理、定时调度。",
    codeSubtitle: "仓库内的程序员副驾 — 代码编辑、差异审查、调试构建、Git 操作。",
    workBadge: "办公模式",
    codeBadge: "编码模式",
    workHint: "按 ⌘N 开启新会话",
    codeHint: "按 ⌘N 开启新工作区",
    brandName: "云顶数字",
    brandTagline: "— 我帮你",
    quickActionsHeading: "开始",
    quickActionWebRead: "网页读取",
    quickActionResearch: "调研分析",
    quickActionDataMining: "数据挖掘",
    quickActionFileManager: "文件管理",
    quickActionAppDev: "应用开发",
    quickActionProjectInsight: "项目理解",
    quickActionDebugFix: "调试修复",
    quickActionCodeReview: "代码审查",
    quickActionGameIdea: "游戏创意",
    quickActionToolScript: "工具脚本",
    quickActionDocProcess: "文档处理",
    quickActionDataAnalysis: "数据分析",
    codeComposerPlaceholder: "输入你的代码任务，例如解释项目结构、调试缺陷、生成单元测试、审查差异等",
    openTerminal: "打开终端",
  },
  codeEditor: {
    noFileOpen: "未打开文件",
    loading: "加载中…",
    loadError: "文件加载失败",
    binaryFile: "二进制文件暂不支持预览",
    save: "保存",
    readOnly: "只读",
    enableEdit: "编辑",
    files: "文件",
    refresh: "刷新",
    closeTab: "关闭标签页",
    openEditor: "打开编辑器",
    closeEditor: "关闭编辑器",
  },
  sidebar: {
    brandLabel: "Peak",
    newChat: "新建会话",
    newChatTooltip: "新建会话",
    newDisposableTooltip: "新建一次性会话",
    search: "搜索",
    threads: "任务列表",
    chats: "聊天",
    workspace: "任务列表",
    recent: "最近",
    settings: "设置",
    addProject: "添加项目",
    noProjectsYet: "暂无项目",
    noProjectsYetDescription: "选择一个本地项目文件夹来开始第一个线程",
    noWorkspacesYet: "暂无工作区",
    newWorkspace: "新建工作区",
    chooseProjectFolder: "选择项目文件夹",
    openingFolderPicker: "正在打开...",
    addingProject: "正在添加...",
    loadingProjects: "正在加载项目",
    toggleSidebar: "切换线程侧边栏",
    codeLabel: "代码",
    disposableChat: "一次性聊天",
    pendingApproval: "待审批",
    commandsHeading: "工具",
    skillsLabel: "技能",
    pluginsLabel: "插件",
    automationsLabel: "自动化",
    wikiLabel: "Wiki",
    editorLabel: "编辑器",
    editorNoWorkspace: "请先打开一个工作区文件夹以开始编辑文件。",
    pullsLabel: "合并请求",
    pullsNoWorkspace: "请先打开一个工作区文件夹以浏览合并请求。",
    linearLabel: "Linear",
    linearNoWorkspace: "请先打开一个工作区文件夹以浏览 Linear 任务。",
    extensionsLabel: "扩展",
    automationsComingSoon: "即将推出",
    confirm: "确认",
    confirmArchive: "确认归档",
    archive: "归档",
    openNewChatHome: "打开新聊天首页",
    settingsAria: "设置",
    showMore: "展开更多",
    showLess: "收起",
    projectActionAdd: "添加项目",
    projectActionRename: "重命名项目",
    projectActionRemove: "移除项目",
    projectActionCopyPath: "复制路径",
    projectActionArchive: "归档项目",
    projectActionDeleteThreads: "删除所有线程",
    intelOnArmTitle: "Apple 芯片上的 Intel 构建",
    sortProjects: "项目排序",
    sortThreads: "线程排序",
    sortChats: "聊天排序",
    sortRecentlyActive: "最近活动",
    sortRecentlyAdded: "最近添加",
    sortCreatedAt: "创建时间",
    sortManual: "手动",
    sortNewestFirst: "最新优先",
    projectSortMenuHeader: "项目排序",
    threadSortMenuHeader: "线程排序",
    pinThread: "置顶线程",
    unpinThread: "取消置顶",
    addProjectError: "无法添加项目",
    openFolderError: "无法打开文件夹选择器",
    linkUnavailable: "链接打开不可用",
    openPRError: "无法打开 PR 链接",
    openFinderError: "无法在访达中打开",
    openTerminalError: "无法打开终端",
    removeProjectError: (_name) => `移除「{name}」失败`,
    removeProjectSuccess: (_name) => `已移除「{name}」`,
    projectRenameSyncError: "项目名称同步到服务端失败",
    thread: {
      pinError: (action) => (action === "pin" ? "无法置顶线程" : "无法取消置顶"),
      renameError: "重命名线程失败",
      renameEmpty: "线程标题不能为空",
      handoffError: "无法创建交接线程",
      archiveRunningTitle: "无法归档",
      archiveRunningDescription: "请先停止正在运行的会话，再归档此线程",
      archiveEmpty: (_projectName) => `「{projectName}」没有可归档的线程。`,
      archiveFailedTitle: "无法归档线程",
      archiveSuccessOne: "线程已归档",
      archiveSuccessMany: (count) => `已归档 ${count} 个线程`,
      archiveError: "归档线程失败",
      deleteEmpty: "没有可删除的内容",
      deleteWorktreeWarning: "线程已删除，但工作树清理失败",
      deleteSuccessOne: "线程已删除",
      deleteSuccessMany: (count) => `已删除 ${count} 个线程`,
      deleteError: "删除线程失败",
      pathUnavailable: "路径不可用",
      pathCopyUnavailable: "此线程没有可复制的工作区路径",
      pathOpenUnavailable: "此线程没有可打开的工作区路径",
      copyThreadId: "线程 ID 已复制",
      copyThreadIdFailed: "复制线程 ID 失败",
      copyPath: "路径已复制",
      copyPathFailed: "复制路径失败",
    },
    update: {
      availableTitle: "有新版本可用",
      availableDescription: (version) => `ydsz-buddy ${version} 已可更新。`,
      upToDateTitle: "已是最新版本",
      upToDateDescription: (version) => `ydsz-buddy ${version} 已是最新版本。`,
      checkFailedTitle: "无法检查更新",
      checkFailedDescription: "发生意外错误",
      downloadedTitle: "更新已下载",
      downloadedDescription: "重启应用以安装更新",
      downloadFailedTitle: "无法下载更新",
      downloadFailedDescription: "请在菜单中重试",
      startFailedTitle: "无法启动更新下载",
      startFailedDescription: "更新器无法启动",
      installFailedTitle: "无法安装更新",
      installFailedDescription: "请手动重启应用以完成安装",
      unexpectedError: "发生意外错误",
    },
    command: {
      openHome: {
        title: "打开新聊天首页",
        description: "打开新聊天着陆页",
      },
      newChat: {
        title: "新建聊天",
        description: "在当前项目中开启一个全新线程",
      },
      addProject: {
        title: "添加项目",
        description: "在侧边栏打开一个仓库或文件夹",
      },
      attachSession: {
        title: "挂接会话",
        description: "将本地线程挂接到现有的提供方会话",
      },
      openSettings: {
        title: "打开设置",
        description: "打开应用设置",
      },
    },
    deleteWorkspace: "删除工作区",
    parallelSessions: "运行中的任务",
    parallelSessionsRunning: (count: number) => `${count} 个运行中`,
    parallelSessionsOpen: "打开",
    threadDeletedToastTitle: "线程已删除",
    threadDeletedToastDescription: (_title) => `「{_title}」已删除`,
  },
  searchPalette: {
    importHeading: "从提供方导入线程",
    suggestedGroup: "推荐",
    projectsGroup: "项目",
    configureGroup: "配置",
    inputHint: "跳转到线程、项目、操作或外观设置",
    enterHint: "回车打开",
  },
  chat: {
    loadingModels: "正在加载模型",
    newChat: "新建聊天",
    handOff: "交接",
    run: "运行",
    stop: "停止",
    share: "分享",
    compact: "压缩",
    plan: "计划",
    planModeHint: "计划模式 - 点击切回常规构建模式",
    noActiveThread: "暂无活跃线程",
    selectOrCreate: "请选择一个线程或新建一个以开始",
    clearUnavailable: "无法清空",
    clearUnavailableDescription: "请先打开一个项目，再开始新线程",
    implementationFailed: "无法启动实施线程",
    handoffError: "无法创建交接线程",
    refreshProviderStatus: "无法刷新提供方状态",
    deletedAction: (_name) => `已删除操作「{name ?? "未知"}」`,
    deleteActionFailed: "无法删除操作",
    updateAccessModeFailed: "无法更新访问模式",
    tooManyAttachments: (max) => `每条消息最多附加 ${max} 个引用。`,
    browserAttachFailed: "无法附加应用内浏览器上下文",
    imagePreview: "展开的图片预览",
    imagePreviewClose: "关闭图片预览",
    imagePreviewPrev: "上一张",
    imagePreviewNext: "下一张",
    attachImagesAfterPlan: "请在回答完计划问题后再附加图片",
    voice: {
      authRequiredTitle: "请先在 Codex 中登录 ChatGPT 再使用语音功能",
      authRequiredDescription: "语音功能需要已登录 ChatGPT 的 Codex 会话",
      authSessionTitle: "语音功能需要已登录 ChatGPT 的 Codex 会话",
      authSessionDescription: "请重新登录 ChatGPT 后再录制语音",
      planUnansweredTitle: "请先回答计划问题再录制语音",
      planUnansweredDescription: "必须在回答计划问题后才能录制",
      startFailedTitle: "无法开始录音",
      startFailedDescription: "请稍后再试",
      transcriptionUnavailableTitle: "当前语音转写不可用",
      transcriptionUnavailableDescription: "当前语音转写不可用",
      noAudioTitle: "未捕获到音频",
      noAudioDescription: "请重新录制",
      transcribeFailedTitle: "请重新登录 ChatGPT",
      transcribeFailedDescription: "无法转写语音备注",
      polishToggleLabel: "自动润色语音转写",
      polishToggleDescription: "转写后自动去除口语填充词、修正语法、清理多余空白。",
      polishAppliedToastTitle: "语音已润色",
      polishAppliedToastDescription: (rules: number) => `已应用 ${rules} 条润色规则。`,
    },
    offline: {
      draftSavedToastTitle: "草稿已暂存本地",
      draftSavedToastDescription: "网络恢复后将自动恢复你的输入。",
      draftsRestoredToastTitle: "已恢复 {count} 条草稿",
      draftsRestoredToastDescription: "你之前保存的草稿已可用。",
      networkDegradedTitle: "提供方不可达",
      networkDegradedDescription: "当前提供方无法响应，可能会自动切换到备用提供方。",
      networkOfflineTitle: "已离线",
      networkOfflineDescription: "草稿将自动保存到本机。",
    },
    continueInNewWorktree: "在新工作树中继续",
    reviewLocalChanges: "查看本地未提交的变更",
    reviewBranchDiff: "查看当前分支相对基线的差异",
    composerPlaceholder: (providerName) => `向 ${providerName} 发送消息…`,
    stopGenerationAria: "停止生成",
    stopGenerationTitle: "停止当前回复。在 Mac 上，按 Ctrl+C 中断",
    implementationActionsAria: "实施操作",
    imagePlaceholder: (count) => `${count} 张图片`,
    renameError: "重命名线程失败",
    renameEmpty: "线程标题不能为空",
    timeline: {
      editMessage: "编辑消息",
      editAndResend: "编辑并重新发送",
      revertLabel: "回滚到此消息",
      revertTooltip: "回滚到此消息",
      revertConfirmTitle: "确认回滚",
      revertConfirmDescription: "这将回滚对话到此位置。所有后续更改都将丢失。",
      revertMessagePreview: "消息预览：",
      revertWarning: "警告：此操作无法撤销。",
      revertConfirmButton: "回滚",
      undoUnavailable: "回复被确认后才能撤销",
      emptyResponse: "（空回复）",
      response: "回复",
      responseWithSummary: (summary) => `回复：${summary}`,
      showLess: "收起",
      showMore: "展开更多",
      showMoreCount: (count) => `展开剩余 ${count} 个`,
      moreToolCalls: (count) => `+${count} 个更多工具调用`,
      edited: "已编辑",
      oneFileChanged: "1 个文件已更改",
      filesChanged: (count) => `${count} 个文件已更改`,
      collapseFiles: "折叠变更文件列表",
      expandFiles: "展开变更文件列表",
      undo: "撤销",
      workingFor: (duration) => `已工作 ${duration}`,
      workingForPrefix: "已工作 ",
      working: "处理中",
      emptyChat: "发送一条消息以开始对话",
    },
    rollback: {
      drawerTitle: (turnCount) => `回滚到检查点 #${turnCount}`,
      drawerDescription: "此操作将丢弃该线程中更新的消息和轮次差异。",
      turns: "将丢弃的轮次",
      files: "变更文件",
      lines: "行数 +/−",
      filesHeading: "将被回滚的文件",
      moreFiles: (extra) => `还有 ${extra} 个文件未显示`,
      showDiff: "显示差异",
      hideDiff: "收起差异",
      loadingDiff: "正在加载差异预览…",
      warning: (turnCount) =>
        `此操作不可撤销。检查点 #${turnCount} 之后的所有消息和轮次差异将被永久删除。`,
      cancel: "取消",
      confirm: "回滚线程",
      reverting: "回滚中…",
      apiUnavailable: "原生 API 不可用，无法预览差异",
    },
    copy: {
      buttonAria: "复制到剪贴板",
      success: "已复制！",
      failed: "复制失败",
    },
  },
  chatEmptyState: {
    title: "开始构建",
    subtitle: "新建一个线程以开始",
    whatShouldWeWorkOn: "我们一起做点什么？",
    whatShouldWeDoIn: "在",
    thisFolder: "此文件夹",
  },
  chatHeader: {
    closeSidechat: "关闭所选旁白",
  },
  a11y: {
    skipToContent: "跳至主要内容",
  },
  projectRules: {
    indicatorLabel: "项目规则",
    countSummary: "${count} 个 · ${bytes}b",
    clickToView: "点击查看合并后的项目规则",
    truncatedSuffix: "（已截断）",
    previewMerged: "预览合并后的 markdown",
    noRulesHint: "此工作区未发现项目规则",
    filesHeading: "已加载文件",
    teamAppliedBadge: "已叠加团队规则",
    teamDisabledBadge: "团队规则已关闭",
    teamErrorBadge: "团队规则错误",
    teamAppliedHint: "项目未发现 .ydsz/rules/,已自动追加团队共享规则。",
  },
  teamRules: {
    viewTitle: "团队共享规则",
    viewDescription: "存储在 ~/.ydsz-buddy/team-rules/ 的跨项目规则。除非显式禁用,或被项目本地 .ydsz/rules/ 覆盖,会自动注入到每个项目。",
    enabledLabel: "启用",
    enabledHint: "禁用时,团队规则被完全跳过(manifest 仍会读取)。",
    teamNameLabel: "团队名称",
    teamNamePlaceholder: "例如：基础架构组",
    remoteUrlLabel: "远端地址(可选)",
    remoteUrlPlaceholder: "git@github.com:org/rules.git",
    remoteCommitLabel: "最近一次同步 commit",
    listHeading: "规则文件",
    createRule: "新建规则",
    editRule: "编辑规则",
    deleteRule: "删除",
    deleteConfirm: "删除这条团队规则？删除后它将不再注入到任何项目。",
    ruleNameLabel: "文件名",
    ruleNamePlaceholder: "00-代码规范.md",
    ruleContentLabel: "Markdown 内容",
    ruleContentPlaceholder: "使用 Tab 缩进。每行不超过 100 字符。生产代码禁止 console.log。",
    saveRule: "保存",
    cancel: "取消",
    emptyState: "暂无团队规则",
    summary: "${count} 个 · ${bytes}b",
    bytesLabel: "字节",
    truncatedBadge: "已截断",
    previewMerged: "预览合并后的 markdown",
    noRulesHint: "新建一条规则,即可在每个项目里强制团队规范。",
    saveSuccess: "规则已保存",
    saveFailure: "保存规则失败",
    deleteSuccess: "规则已删除",
    deleteFailure: "删除规则失败",
    manifestUpdated: "manifest 已更新",
    manifestFailed: "更新 manifest 失败",
    openInExplorer: "在文件管理器中打开",
    openInExplorerHint: "打开 team-rules 文件夹直接管理 .md 文件。",
    reload: "重新加载",
    reloadHint: "重新从磁盘读取团队规则并刷新内存缓存。",
    teamNameHelp: "仅在 UI 中展示,用于标识当前团队的规则集。",
    remoteUrlHelp: "可选的 git 地址(为「团队同步」功能预留)。",
    enableToggleHelp: "禁用即可临时关停整组规则,无需删除文件。",
    blankStateTitle: "尚未配置团队规则",
    blankStateDescription: "新建第一个 .md 文件来定义代码规范、测试要求或评审清单,自动跟随每一个项目。",
  },
  chatRoute: {
    loadingDiff: "正在加载差异视图",
    splitPaneEmptyTitle: "选择一个聊天",
    splitPaneEmptyProject: "项目",
  },
  composer: {
    placeholder: "输入任何内容，使用 @ 引用文件/文件夹，或使用 / 查看可用命令",
    placeholderApproval: "请先处理此授权请求再继续",
    placeholderProgress: "输入你自己的答案，或留空使用所选选项",
    placeholderPlan: "添加反馈以优化计划，或留空以执行",
    placeholderFollowUp: "请求后续修改",
    placeholderDisconnected: "请求后续修改或附加图片",
    moreAria: "更多输入控制",
    extrasAria: "输入扩展",
    modeLabel: "模式",
    buildLabel: "构建",
    planLabel: "计划",
    localLabel: "本地",
    codexLabel: "Codex",
    removeImage: "移除图片",
    pendingApproval: "待审批",
    pendingUserInput: "等待你的输入",
    cancelTurn: "取消回合",
    decline: "拒绝",
    alwaysAllow: "本会话始终允许",
    approveOnce: "本次允许",
    terminalContextExpired: "终端上下文已过期。请移除并重新添加该上下文后再发送",
    voiceTranscribing: "正在转写语音",
    voiceStop: "停止语音",
    voiceRecord: "录制语音",
    voiceHoldToRecord: "按住录制",
    statusDialog: {
      local: "本地",
      worktree: "工作树",
      newWorktreePending: "新建工作树（待处理）",
    },
    slashCommands: {
      local: "本地",
      worktree: "工作树",
      plan: "计划",
      newChat: "新建聊天",
    },
    contextWindowLabel: "上下文窗口",
    contextWindowPercent: (percent) => `已使用 ${percent}%`,
    sendMessage: "发送消息",
    sendingBusy: "发送中",
    sendingConnecting: "连接中",
    sendingTranscribing: "正在转写语音",
    sendingPreparingWorktree: "正在准备工作树",
    steer: "引导",
    deleteQueuedFollowUp: "删除排队的追问",
    queuedFollowUpActions: "排队追问操作",
    queuedFollowUp: "排队的追问",
    planAccept: "接受计划",
    planAcceptTooltip: "接受此计划并切换到构建模式开始执行。",
    planAcceptedToast: "计划已接受 — 已切换到构建模式。",
    planRevise: "修改计划",
    planReviseTooltip: "请求修改此计划。输入框将被聚焦以便填写修改说明。",
    planReviseToast: "请在下方输入框中描述你的修改要求。",
    planReject: "拒绝计划",
    planRejectTooltip: "放弃此计划并返回聊天模式。",
    planRejectedToast: "计划已拒绝 — 已返回聊天模式。",
  },
  skills: {
    title: "技能",
    subtitle: "赋予 ydsz-buddy 更强大的能力",
    newSkill: "新技能",
    browseSkillSh: "浏览 Skill.sh",
    searchPlaceholder: "搜索技能",
    localHeading: "本机已安装",
    localCount: "{count} 个已安装",
    localEmptyTitle: "未发现本机技能",
    localEmptyDescription:
      "ydsz-buddy 已扫描 ~/.claude/skills、~/.codex/skills 和 ~/.agents/skills。把一个含 SKILL.md 的技能目录放进任一目录后刷新即可",
    localEmptySearchTitle: "没有匹配的本机技能",
    localEmptySearchDescription: "尝试其他关键词，或清空搜索",
    providerHeading: "由模型提供",
    providerHint: "当前工作区下，当前模型暴露的技能",
    installedHeading: "技能",
    emptyTitle: "未找到技能",
    emptyDescription: "当前工作区还没有可用的技能",
    emptySearchTitle: "没有匹配此搜索的技能",
    emptySearchDescription: "尝试其他关键词，或清空搜索查看全部技能",
    unavailableTitle: "{provider} 暂不支持技能",
    unavailableDescription: "该模型未开放技能发现能力",
    needsWorkspace: "技能需要工作区路径。请先打开项目或会话",
    marketplaceHeading: "技能市场",
    marketplaceSourceRemote: "远端",
    marketplaceSourceDiskCache: "磁盘缓存",
    marketplaceSourceBuiltin: "内置",
    marketplaceCount: (count) => `${count} 个技能`,
    marketplaceLastRefreshed: (timestamp) => `更新于 ${timestamp}`,
    marketplaceLastRefreshedNever: "尚未刷新",
    marketplaceRefresh: "刷新",
    marketplaceRefreshing: "刷新中…",
    marketplaceEditUrl: "编辑 URL",
    marketplaceUrlDialogTitle: "技能市场 URL",
    marketplaceUrlDialogDescription:
      "切换到自托管的 JSON 索引。留空则使用默认（https://marketplace.njydsz.com/index.json）。",
    marketplaceUrlLabel: "市场 URL",
    marketplaceUrlPlaceholder: "https://marketplace.example.com/index.json",
    marketplaceUrlInvalid: "URL 必须以 http:// 或 https:// 开头",
    marketplaceUrlApply: "应用",
    marketplaceUrlApplyAndRefresh: "应用并刷新",
    marketplaceUrlReset: "恢复默认",
    marketplaceUrlCancel: "取消",
    marketplaceStatusBadgeTitle: "市场数据来源",
    marketplaceStatusRemoteTitle: "从远端 URL 加载",
    marketplaceStatusDiskCacheTitle: "从本地磁盘缓存加载",
    marketplaceStatusBuiltinTitle: "从内置索引加载",
  },
  automations: {
    subtitle: "按计划或按需运行聊天",
    viewTemplates: "查看模板",
    createFromChat: "通过聊天创建",
    emptyTitle: "创建首个自动化",
    emptyDescription:
      "自动化是让你以聊天为载体快速处理重复性工作的方式。只需描述需求，秒级创建一个",
    templatesHeading: "模板",
    templatesHint: "选一个模板来快速创建一个自动化。即将推出",
  },
  voicePolish: {
    previewTitle: "语音转写已润色",
    previewRevert: "撤销",
    previewDismiss: "关闭",
    previewTruncated: "（差异已截断）",
    previewAutoAccept: (seconds: number) => `${seconds} 秒后自动接受`,
    noChanges: "未检测到需要润色的差异",
  },
  ocr: {
    triggerButton: "识别文字",
    triggerButtonAria: "从图片中识别文字",
    triggerHint: "选择截图或照片，提取其中的文字。",
    recognizing: "正在识别文字…",
    recognizedLines: (count: number) => `已识别 ${count} 行`,
    noText: "未在图片中检测到文字。",
    errorFallback: "无法识别文字，请重试。",
    noProviderTitle: "暂无可用的 OCR 引擎",
    noProviderDescription:
      "请安装 Tesseract (brew install tesseract / apt install tesseract-ocr)，或在 macOS / Windows 上运行以启用图片识别。",
    installTesseractHint: "brew install tesseract",
    languageLabel: "识别语言",
    languageAuto: "自动",
    languageEnglish: "英语",
    languageChinese: "简体中文",
    providerActive: "当前引擎",
    providerMacosVision: "Apple Vision (macOS)",
    providerWindowsOcr: "Windows OCR",
    providerTesseract: "Tesseract",
    providerNone: "无",
    providersTitle: "OCR 引擎",
    providersDescription:
      "ydsz-buddy 会根据运行平台自动选择最合适的引擎：macOS 使用 Apple Vision，Windows 使用内置的 Windows OCR，其他平台兜底到 Tesseract。",
    insertToComposer: "插入到消息",
    copyText: "复制文字",
    closeAria: "关闭",
  },
  eventReplay: {
    title: "事件回放",
    descriptionWithCount: (count: number) => `按自己的节奏逐步回放 ${count} 条事件。`,
    empty: "没有可回放的事件。",
    play: "播放",
    pause: "暂停",
    stepBack: "上一步",
    stepForward: "下一步",
    reset: "回到开始",
    speed: "速度",
    scrubberAria: "事件进度条",
    position: (current: number, total: number) => `${current} / ${total}`,
    hintShortcuts: "Space 播放/暂停 · ←/→ 单步 · Home/End 跳到首/尾",
  },
  settings: {
    title: "设置",
    restoreDefaults: "恢复默认",
    backToApp: "返回应用",
    nav: {
      general: {
        label: "通用",
        description: "默认提供方、线程模式以及侧边栏的组织方式",
      },
      appearance: {
        label: "外观",
        description: "主题、字体与时间格式",
      },
      notifications: {
        label: "通知",
        description: "应用内提示与桌面通知",
      },
      behavior: {
        label: "行为",
        description: "流式输出、差异处理与危险操作的二次确认",
      },
      worktrees: {
        label: "工作树",
        description: "查看并清理由 云顶数字 Buddy 创建的工作树",
      },
      archived: {
        label: "已归档",
        description: "查看和恢复已归档的线程",
      },
      budget: {
        label: "成本预算",
        description: "设置每日 / 每月 AI 花费上限,以及超额后的处理方式",
      },
      agent: {
        label: "智能体",
        description: "配置 AI 智能体行为、工具权限与沙箱设置",
      },
      mcp: {
        label: "MCP",
        description: "管理 Model Context Protocol 服务与工具集成",
      },
      cue: {
        label: "CUE",
        description: "提示词工程、结构化提示与响应调优",
      },
      models: {
        label: "模型",
        description: "写入 Git 的默认模型与自定义模型",
      },
      conversationFlow: {
        label: "对话流",
        description: "对话管理、轮次限制与上下文窗口设置",
      },
      browser: {
        label: "浏览器",
        description: "Web 自动化、CDP 集成与浏览器工具配置",
      },
      indexer: {
        label: "索引与文档",
        description: "代码索引、AST grep 模式与文档管理",
      },
      skills: {
        label: "技能与命令",
        description: "自定义技能、斜杠命令与 Composer 命令菜单",
      },
      rules: {
        label: "规则与记忆",
        description: "项目规则、团队规则与持久化记忆配置",
      },
      imageGen: {
        label: "文生图",
        description: "配置 AI 图片生成后端（DALL-E 3、FLUX、Stable Diffusion）",
      },
      im: {
        label: "IM 集成",
        description: "连接企业微信、钉钉、飞书等即时通讯平台",
      },
      mobile: {
        label: "移动端远程",
        description: "推送通知、远程审批与设备配对",
      },
      advanced: {
        label: "高级",
        description: "快捷键、恢复与版本信息",
      },
      push: {
        label: "推送通道",
        description: "配置极光 / 友盟推送凭证，测试移动端推送连通性。",
      },
    },
    groups: {
      app: "应用",
      ydszBuddy: "云顶数字 Buddy",
    },
    general: {
      heading: "通用",
      description: "默认提供方、线程模式以及侧边栏的组织方式",
      coreDefaults: "核心默认",
      sidebarOrganization: "侧边栏组织",
      language: {
        title: "语言",
        description: "打开 ydsz Claw 界面所使用的语言",
        english: "English",
        chinese: "中文",
      },
      defaultProvider: {
        title: "默认提供方",
        description: "为新聊天选择使用的提供方",
        resetLabel: "默认提供方",
      },
      newThreads: {
        title: "新线程",
        description: "选择新创建的草稿线程的默认工作区模式",
        resetLabel: "新线程",
        local: "本地",
        worktree: "新建工作树",
      },
      sidebarPosition: {
        title: "位置",
        description: "选择侧边栏在屏幕的哪一侧显示",
        left: "左侧",
        right: "右侧",
        resetLabel: "侧边栏位置",
      },
      projectOrder: {
        title: "项目排序",
        description: "控制主侧边栏中项目的排列方式",
        recentlyActive: "最近活动",
        recentlyAdded: "最近添加",
        manual: "手动排序",
        resetLabel: "项目排序",
      },
      threadOrder: {
        title: "线程排序",
        description: "控制主侧边栏中每个项目下线程的排列方式",
        recentlyActive: "最近活动",
        newestFirst: "最新优先",
        resetLabel: "线程排序",
      },
    },
    appearance: {
      heading: "外观",
      description: "主题、字体与时间格式",
      themeAndTypographySection: "主题与排版",
      timeAndReadingSection: "时间与阅读",
      accessibilitySection: "无障碍与性能",
      theme: {
        title: "主题",
        description: "选择 云顶数字 Buddy 能做到应用中的外观",
        system: "跟随系统",
        light: "浅色",
        dark: "深色",
        systemDescription: "跟随操作系统的外观设置",
        lightDescription: "始终使用浅色主题",
        darkDescription: "始终使用深色主题",
      },
      lightThemeCard: {
        title: "浅色主题",
        contextActive: "当前正在使用的主题",
        contextInactive: "应用已锁定为 {mode}，此主题暂不生效",
        contextSystemActive: "系统当前正在使用该浅色主题",
        contextSystemInactive: "当系统切换到浅色时使用",
      },
      darkThemeCard: {
        title: "深色主题",
        contextActive: "当前正在使用的主题",
        contextInactive: "应用已锁定为 {mode}，此主题暂不生效",
        contextSystemActive: "系统当前正在使用该深色主题",
        contextSystemInactive: "当系统切换到深色时使用",
      },
      themePackReset: "重置",
      themePackCopy: "复制",
      themePackImport: "导入",
      themePackShareStringAria: "主题分享串",
      themePackCodeThemeAria: (label) => `${label} 代码主题`,
      themePackTranslucentAria: (label) => `${label} 半透明侧边栏`,
      themePackResetAria: (label) => `重置 ${label}`,
      themePackHexAria: (label) => `${label} 十六进制色值`,
      accent: "主色",
      background: "背景",
      foreground: "前景",
      uiFontLabel: "界面字体",
      codeFontLabel: "代码字体",
      translucentSidebar: "半透明侧边栏",
      contrast: "对比度",
      timestamp: {
        title: "时间格式",
        description: "默认跟随浏览器或系统的时钟偏好",
        systemDefault: "系统默认",
        twelveHour: "12 小时制",
        twentyFourHour: "24 小时制",
        ariaLabel: "时间戳格式",
      },
      typography: {
        title: "排版",
        description: "界面字体、代码字体与聊天界面的基础字号",
        uiFont: "界面字体",
        codeFont: "代码字体",
        baseFontSize: "基础字号",
        fontSmoothing: "字体平滑",
        uiFontDescription: "为界面设置自定义字体，留空则使用当前主题的界面字体",
        codeFontDescription:
          "为聊天中的代码块与行内代码设置自定义字体，留空则使用当前主题的代码字体",
        baseFontSizeDescription: "调整应用文本的基础像素值，聊天与界面排版会按此比例缩放",
        fontSmoothingDescription: "启用 macOS 风格的反锯齿，使文字更轻盈清晰",
        uiFontAria: "自定义界面字体族",
        codeFontAria: "自定义聊天代码字体族",
        baseFontSizeAria: "基础字号（像素）",
        fontSmoothingAria: "启用字体平滑",
        unitPx: "px",
      },
      accessibility: {
        fontSizeScale: "字体大小",
        fontSizeScaleDescription: "在 14px（小）到 20px（特大）之间缩放界面文字。",
        fontSizeScaleAria: "界面字体大小档位",
        fontSizeScaleOption: (label) => `${label}`,
        fontSizeScaleSmall: "小 (14px)",
        fontSizeScaleMedium: "中 (16px)",
        fontSizeScaleLarge: "大 (18px)",
        fontSizeScaleXlarge: "特大 (20px)",
        fontSizePercent: "字号无级调节",
        fontSizePercentDescription: "在 80%（紧凑）到 150%（超大）之间以 5% 步长精细调节界面文字。",
        fontSizePercentAria: "字号无级调节百分比",
        fontSizePercentReset: "重置到 100%",
        highContrast: "高对比度",
        highContrastDescription: "提高对比度、降低透明度。自动模式会跟随操作系统的偏好。",
        highContrastAria: "高对比度模式",
        highContrastAuto: "自动（跟随系统）",
        highContrastOn: "始终开启",
        highContrastOff: "关闭",
        highContrastSystemHint: (prefers) =>
          prefers ? "系统当前偏好更高对比度" : "系统未偏好更高对比度",
        performance: "性能模式",
        performanceDescription:
          "自动在帧率下降时降低动画强度。可手动覆盖为指定模式。",
        performanceAria: "性能模式",
        performanceAuto: "自动（跟随帧率）",
        performanceReduced: "降级动画",
        performanceMinimal: "最小化（关闭动画与阴影）",
        performanceCurrentFps: (fps) => `当前帧率：${fps} fps`,
        performanceAutoHint: "自动根据检测到的帧率调整。",
      },
    },
    notifications: {
      heading: "通知",
      description: "应用内提示与桌面通知",
      activityAlertsSection: "活动提醒",
      unavailableTitle: "桌面通知不可用",
      supportBrowserBlocked: "浏览器通知被禁用，请在站点设置中开启",
      supportBrowserPrompt: "浏览器将提示授予通知权限",
      supportBrowserGranted: "浏览器通知已开启",
      supportDesktopUnsupported: "当前设备不支持桌面通知",
      supportDesktopGranted: "桌面通知已开启",
      supportDesktopDenied: "系统设置中桌面通知被禁用",
      testTitle: "活动通知",
      testBody: "用于聊天和终端代理的通知测试",
      testSuccessTitle: "测试通知已发送",
      testUnavailableTitle: "通知不可用",
      testSuccessDescriptionDesktop: "操作系统应显示该通知",
      testUnavailableDescriptionDesktop: "当前设备不支持桌面通知",
      testSuccessDescriptionBrowser: "浏览器应显示该通知",
      testButton: "测试",
      activityToasts: {
        title: "活动提示",
        description: "当聊天或托管的终端代理结束或需要输入时，显示应用内提示",
        ariaLabel: "活动提示通知",
      },
      desktopNotifications: {
        title: "桌面通知",
        description: "当应用处于后台时，聊天或托管的终端代理结束或需要输入时显示系统通知",
        ariaLabel: "桌面活动通知",
      },
    },
    behavior: {
      heading: "行为",
      description: "流式输出、差异处理与危险操作的二次确认",
      runtimeSection: "运行时行为",
      safetySection: "安全确认",
      assistantOutput: "助手输出",
      voicePolish: "语音转写润色",
      assistantOutputDescription: "响应进行中时，按 token 实时显示助手输出",
      assistantOutputAria: "流式输出助手消息",
      voicePolishTitle: "自动润色语音转写",
      voicePolishDescription: "语音转写完成后，自动去除口语填充词、修正语法、清理多余空白。你仍可在发送前查看润色结果。",
      voicePolishAria: "自动润色语音转写",
      diffLineWrapping: "差异换行",
      diffLineWrappingDescription:
        "设置差异面板打开时的默认换行状态。面板内的换行开关仅影响当前差异会话",
      diffLineWrappingAria: "默认对差异行进行换行",
      deleteConfirmation: "删除确认",
      deleteConfirmationDescription: "在删除线程及其聊天历史之前要求确认",
      deleteConfirmationAria: "确认删除线程",
      archiveConfirmation: "归档确认",
      archiveConfirmationDescription: "在归档线程之前要求确认",
      archiveConfirmationAria: "确认归档线程",
      terminalCloseConfirmation: "关闭终端确认",
      terminalCloseConfirmationDescription: "在关闭终端标签页并清除其历史记录之前要求确认",
      terminalCloseConfirmationAria: "确认关闭终端标签页",
      voicePolishAdvanced: "高级语音润色选项",
      voicePolishAdvancedDescription:
        "调整语音转写润色所应用的规则。修改将在下一次录制的语音笔记中生效。",
      voicePolishRemoveFillerWords: "去除口语填充词",
      voicePolishRemoveFillerWordsDescription: "从转写结果中去掉“嗯”“啊”“那个”等口语填充词。",
      voicePolishFixGrammar: "修正语法",
      voicePolishFixGrammarDescription: "在转写完成后修正明显的语法和标点错误。",
      voicePolishAddStructure: "添加结构化提示线索",
      voicePolishAddStructureDescription:
        "注入小节、列表等脚手架式提示，让模型收到更结构化的输入。",
      voicePolishTargetLanguage: "目标语言",
      voicePolishTargetLanguageDescription: "默认从转写中自动检测，可手动选择语言覆盖。",
      voicePolishTargetLanguageAuto: "自动检测",
      voicePolishTargetLanguageZh: "中文",
      voicePolishTargetLanguageEn: "English",
    },
    worktrees: {
      heading: "工作树",
      description: "查看并清理由 云顶数字 Buddy 创建的工作树",
      managedSection: "托管的工作树",
      loading: "正在加载托管的工作树",
      loadFailedFallback: "无法加载工作树",
      emptyState: "尚未发现由应用托管的工作树",
      worktreeLabel: "工作树",
      conversationsLabel: "会话",
      noConversations: "此工作树未关联任何会话",
      deleteButton: "删除",
      deleteWarning: "存在关联的会话，删除时将要求二次确认",
      verifyTitle: "无法验证关联的会话",
      verifyDescription: "请在应用重新连接服务器后再试",
      deleteConfirmWithLinks: (_name, _count) =>
        `永久移除工作树「{name}」及 ${_count} 个关联的已归档会话？`,
      deleteConfirm: (_name) => `永久移除工作树「{name}」？`,
      deleteAnyway: "移除工作树",
      deleteLinkedActive: (active) => `${active} 个进行中`,
      deleteLinkedArchived: (archived) => `${archived} 个已归档`,
      deleteArchivedWillDeleteFirst: "已归档的会话会先被删除",
      deleteLinkedWarning: "删除后可能无法在同一个工作区中重新打开这些聊天",
      deleteRemovesFromDisk: "这将从磁盘上移除 Git 工作树",
      deletedTitle: "工作树已删除",
      deletedDescriptionWithArchived: (_name, _count) =>
        `「{name}」已移除，{count} 个已归档会话已删除。`,
      deletedDescription: (_name) => `「{name}」已移除。`,
      deleteErrorTitle: "无法删除工作树",
      deleteErrorFallback: "无法删除该工作树",
    },
    archived: {
      heading: "已归档",
      description: "查看和恢复已归档的线程",
      emptySection: "已归档线程",
      emptyTitle: "暂无已归档线程",
      emptyDescription: "已归档的线程会出现在这里，可以恢复到侧边栏",
      unknownProject: "未知项目",
      archivedAt: (when) => `${when} 归档`,
      restoreButton: "恢复",
      deleteButton: "删除",
      restoreTitle: "线程已恢复",
      restoreDescription: "该线程已移回侧边栏",
      restoreErrorTitle: "无法恢复线程",
      restoreErrorFallback: "无法恢复该线程",
      deleteConfirm: (_title) => `永久删除「{title}」？\n\n这将移除该线程及其对话历史。`,
      deleteTitle: "线程已删除",
      deleteDescription: "该已归档线程已被永久移除",
      deleteErrorTitle: "无法删除线程",
      deleteErrorFallback: "无法删除该线程",
      contextMenuRestore: "恢复",
      contextMenuDelete: "删除",
    },
    models: {
      heading: "模型",
      description: "写入 Git 的默认模型与自定义模型",
      generationSection: "生成默认值",
      customSection: "自定义模型",
      gitWritingModel: "Git 写入模型",
      gitWritingModelDescription: "用于生成提交信息、PR 标题与分支名",
      gitWritingModelAria: "Git 文本生成模型",
      customModelEmpty: "请输入模型标识",
      customModelBuiltIn: "该模型已是内置",
      customModelTooLong: (max) => `模型标识不得超过 ${max} 个字符。`,
      customModelDuplicate: "该自定义模型已存在",
      customModelResetLabel: "自定义模型",
      customAddPlaceholder: "添加自定义模型标识",
      customAddButton: "添加",
      customAddAria: "添加自定义模型",
      customProviderAria: "自定义模型提供方",
      customRemoveAria: (slug) => `移除 ${slug}`,
      customShowLess: "收起",
      customShowMore: (count) => `展开更多 (${count})`,
      savedModelSlugs: "已保存的模型标识",
      savedModelSlugsDescription: "为支持的提供方添加自定义模型标识",
      managementTitle: "模型管理",
      managementDescription:
        "配置 API key、添加更多可用模型，预置模型默认使用稳定版本。",
      addModel: "添加模型",
      addModelTooltip: "从服务商或自定义端点添加新模型",
      builtInLabel: "内置",
      customLabel: "自定义",
      customEmpty: "暂无自定义模型",
      customCreateLink: "点击添加自定义模型",
      dialogTitle: "添加模型",
      dialogTabProvider: "模型服务商",
      dialogTabCustom: "自定义配置",
      dialogProviderLabel: "服务商",
      dialogProviderPlaceholder: "选择模型服务商",
      dialogModelLabel: "模型",
      dialogModelPlaceholder: "选择模型",
      dialogApiKeyLabel: "API 密钥",
      dialogApiKeyPlaceholder: "输入 API 密钥",
      dialogAdvancedConfig: "高级配置",
      dialogDisplayNameLabel: "模型展示名称",
      dialogDisplayNamePlaceholder: "请输入模型展示名称",
      dialogDisplayNameHint:
        "在模型列表中展示的名称，未设置时默认显示 Model ID。",
      dialogContextWindowLabel: "上下文窗口",
      dialogContextInput: "输入",
      dialogContextOutput: "输出",
      dialogToolRoundsLabel: "工具调用轮次",
      dialogToolRoundsPlaceholder: "200",
      dialogMultiModel: "多模态",
      dialogSubmit: "添加模型",
      dialogApiFormatLabel: "API 格式",
      dialogApiFormatOpenAI: "OpenAI Chat Completions 格式",
      dialogApiFormatAnthropic: "Anthropic Messages 格式",
      dialogCustomUrlLabel: "自定义请求地址",
      dialogCustomUrlPlaceholder: "e.g. https://api.openai.com/v1",
      dialogCustomUrlHint:
        "请填写兼容 OpenAI API 的服务端点地址，不要以斜杠结尾。/chat/completions 将会被补充到你填写的地址末尾。",
      dialogCustomUrlComplete: "完整 URL",
      dialogModelIdLabel: "模型 ID",
      dialogModelIdPlaceholder: "输入模型 ID",
    },
    byok: {
      heading: "自定义提供方 (BYOK)",
      description:
        "接入任意 OpenAI / Anthropic / LiteLLM / Ollama 兼容端点。API Key 加密存储在本地凭证保险箱,不会明文写入 localStorage。",
      emptyState: '还没有自定义提供方。点击下方"添加提供方"开始配置。',
      testConnection: "测试连接",
      testing: "测试中…",
      discoverModels: "发现本地模型",
      discovering: "发现中…",
      discoveryReachable: (version) =>
        version ? `已连接 · Ollama v${version}` : "已连接",
      discoveryUnreachable: (reason) => `无法连接: ${reason}`,
      discoveryNoModels: "服务可达,但本地还未拉取模型。请先运行 `ollama pull <model>` 下载模型。",
      discoveryModelsLabel: (count) => `已发现 ${count} 个本地模型`,
      selectModel: "选择已发现的模型…",
      popularModelsLabel: "常见模型家族",
      noDiscoveryYet: "点击“发现本地模型”扫描当前 Ollama 端点的已下载模型。",
      refresh: "刷新",
    },
    providers: {
      heading: "提供方",
      description: "选择可见的提供方、查看 CLI 安装状态并更新提供方工具",
      updatesSection: "更新",
      pickerSection: "提供方选择器",
      toolsSection: "提供方工具",
      installTitle: (providerName) => `${providerName} 安装`,
      visibility: {
        title: "可见的提供方",
        description:
          "拖动调整选择器顺序，并隐藏不使用的提供方。当前线程正在使用的提供方始终保持可见",
        statusAllVisible: "所有提供方均可见",
        statusCustomOrder: "自定义顺序",
        statusHidden: (count) => `已隐藏 ${count} 个提供方`,
        statusHiddenOne: "已隐藏 1 个提供方",
        showAria: (name) => `在选择器中显示 ${name}`,
        reorderAria: (name) => `调整 ${name} 顺序`,
        resetLabel: "提供方选择器",
      },
      updates: {
        title: "提供方更新",
        description: "更新 ydsz-buddy 可以安全更新的已安装提供方工具",
        statusNoUpdates: "未检测到提供方更新",
        statusAvailableOne: "有 1 项可用更新",
        statusAvailableMany: (count) => `有 ${count} 项可用更新`,
        statusAvailablePlural: (count) => `有 ${count} 项可用更新`,
        manualUpdate: "手动更新",
        updateButton: "更新",
        updatingButton: "正在更新",
        commandLabel: "命令",
        runCommandTitle: (command) => `运行 ${command}`,
        versionAdvisoryNoCommand:
          "检测到新版本，但 ydsz-buddy 未能为该安装识别出安全的一键更新命令",
      },
      tools: {
        title: "已安装的 CLI",
        description: "查看提供方版本并更新工具，仅在需要覆写二进制路径时展开对应行",
        statusNoUpdates: "未检测到提供方更新",
        statusAvailableOne: "有 1 项可用更新",
        statusAvailableMany: (count) => `有 ${count} 项可用更新`,
        statusAvailablePlural: (count) => `有 ${count} 项可用更新`,
        customBadge: "自定义",
        resetLabel: "提供方工具",
        binaryPathLabel: (providerName) => `${providerName} 可执行文件路径`,
        homePathLabel: "CODEX_HOME 路径",
        homePathDescription: "可选的自定义 Codex 主目录与配置目录",
        agentDirLabel: "Pi 代理目录",
        agentDirDescription: "可选的自定义 Pi 代理目录，用于鉴权、模型、技能与命令",
        apiEndpointLabel: "Cursor API 端点",
        apiEndpointDescription: "可选的 Cursor API 端点覆写，会传给 `cursor-agent -e`",
        serverUrlLabel: (providerName) => `${providerName} 服务器地址`,
        serverUrlDescription: (providerName) =>
          `可选的现有 ${providerName} 服务器地址，留空将启动本地服务器。`,
        serverPasswordLabel: (providerName) => `${providerName} 服务器密码`,
        serverPasswordDescription: (providerName) => `可选的外部管理 ${providerName} 服务器密码。`,
        binaryPathDescription: (command) => `留空将使用 PATH 中的 \`${command}\`。`,
        binaryPathPlaceholder: (providerName) => `${providerName} 可执行文件路径`,
        homePathPlaceholder: "CODEX_HOME",
        agentDirPlaceholder: "Pi 代理目录",
        apiEndpointPlaceholder: "https://api2.cursor.sh",
        serverUrlPlaceholder: "http://127.0.0.1:4096",
        serverPasswordPlaceholder: (providerName) => `${providerName} 服务器密码`,
      },
      docs: {
        install: "安装",
        update: "更新",
        config: "配置",
        headless: "无头模式",
        label: "CLI 文档",
      },
      update: {
        queued: "更新已排队",
        updating: "更新中",
        updated: "已更新",
        failed: "更新失败",
        stillOutdated: "仍为旧版",
        versionDelta: (current, latest) => `${current} → ${latest}`,
        latest: (version) => `最新 ${version}`,
        current: (version) => `当前 ${version}`,
        errorFallback: "提供方更新未完成",
      },
      cliDocs: "CLI 文档",
    },
    advanced: {
      heading: "高级",
      description: "快捷键、恢复与版本信息",
      developerSection: "开发者工具",
      aboutSection: "关于",
      keybindings: {
        title: "快捷键",
        description: "打开持久化的 `keybindings.json` 文件以直接编辑高级快捷键",
        pathPlaceholder: "正在解析快捷键路径",
        openEditorHint: "将使用你偏好的编辑器打开",
        openButton: "打开文件",
        openingButton: "正在打开",
        noEditor: "未找到可用编辑器",
        openError: "无法打开快捷键文件",
        noEditorToast: "未找到可用编辑器",
        openErrorFallback: "无法打开快捷键文件",
        openErrorUnknown: "无法打开快捷键文件",
      },
      recovery: {
        title: "恢复工具",
        description: "当本地状态不同步时重建本地项目索引，且不会清空现有聊天",
        offerReason: "因存在项目但当前无聊天记录而显示",
        hiddenReason: "仅在恢复操作适用时自动显示",
        whatThisDoesLabel: "这会做什么",
        whatThisDoesBody: "重建本地项目索引并刷新项目快照，现有聊天保持不变",
        repairButton: "修复状态",
        repairingButton: "正在修复",
        confirmTitle: "修复本地状态？",
        confirmDescription: "这会重建本地项目索引并刷新项目快照",
        confirmSpacer: "不会清空现有聊天，但可能需要一些时间",
        successTitle: "本地状态已修复",
        successDescription: "项目索引已重建，现有聊天未受影响",
        errorTitle: "修复失败",
        errorFallback: "无法修复本地状态",
      },
      version: {
        title: "版本",
        description: "当前应用版本",
        releaseHistory: "更新历史",
        releaseHistoryDescription:
          "每次更新的滚动日志，按时间倒序排列。与更新后弹窗中的内容一致，可随时回看",
        viewReleaseHistory: "查看更新历史",
      },
      idleLock: {
        heading: "离座锁定 / 隐私屏",
        description:
          "离开座位后自动模糊工作区并要求输入 PIN 才能继续。本地存储、PIN 在落盘前已做哈希处理。",
        enabledLabel: "启用离座锁定",
        enabledDescription: "在阈值内无任何鼠标/键盘活动时自动锁定应用。",
        thresholdLabel: "空闲阈值",
        thresholdDescription: (seconds: number) => `连续 ${seconds} 秒无活动后锁定。`,
        thresholdSecondsUnit: "秒",
        privacyOnlyLabel: "仅隐私屏模式",
        privacyOnlyDescription: "只展示隐私屏，不强制要求输入 PIN 即可解除。",
        pinLabel: "解锁 PIN",
        pinPlaceholder: "请输入 PIN（4-32 位）",
        pinDescription: "用于解除隐私屏，留空表示清除。",
        pinMissing: "尚未设置 PIN — 任何能接触此设备的人都能直接关闭锁屏。",
        setPinButton: "保存 PIN",
        clearPinButton: "清除 PIN",
        pinMinHint: "PIN 长度需为 4-32 位。",
        statusLabel: "状态",
        statusArmed: "已布防 — 正在监听空闲",
        statusDisarmed: "已撤防",
        statusLocked: "已锁定",
        idleSecondsLabel: (seconds: number) => `已空闲 ${seconds} 秒`,
        lockNowButton: "立即锁定",
        armButton: "布防",
        disarmButton: "撤防",
        lockedOverlayTitle: "工作区已锁定",
        lockedOverlaySubtitle: "请输入 PIN 以继续。锁定期间屏幕内容会被隐藏。",
        lockedOverlayPinPlaceholder: "PIN",
        lockedOverlayUnlockButton: "解锁",
        lockedOverlayUnlockErrorMismatch: "PIN 不正确，请重试。",
        lockedOverlayUnlockErrorPinNotSet: "当前设备未配置 PIN。",
        lockedOverlayUnlockErrorNotLocked: "当前未处于锁定状态。",
        lockedOverlayUnlockErrorUnknown: "无法解锁，请重试。",
        changedSettingLabel: {
          idleLockEnabled: "离座锁定",
          idleLockThreshold: "空闲阈值",
          idleLockPrivacyOnly: "仅隐私屏模式",
          idleLockPin: "解锁 PIN",
        },
      },
      mcpSection: "MCP 服务器",
    mcpDescription: "配置 MCP 服务器,为 AI 扩展文件系统、抓取、GitHub、数据库等外部工具能力。",
    mcpNoWorkspace: "请先打开工作区以配置 MCP 服务器。",
      sshSection: "SSH 远程连接",
      sshDescription:
        "通过 SSH 连接远程开发机或容器，支持密码和密钥认证，可启用自动重连。",
      sshNoWorkspace: "请先打开工作区以使用 SSH 远程连接。",
    },
    agent: {
      title: "智能体",
      heading: "智能体配置",
      description: "配置 AI 智能体行为、工具权限与沙箱设置",
      customAgents: {
        label: "自定义智能体",
        empty: "暂无自定义智能体",
        create: "创建",
        createTooltip: "创建新的自定义智能体，可定制指令与能力范围",
      },
      builtInAgents: {
        label: "内置智能体",
        code: {
          name: "Code",
          description: "读写代码、执行终端命令、管理 Git 与运行构建",
        },
        work: {
          name: "Work",
          description: "处理 Office 文档、浏览器自动化、定时任务与数据处理",
        },
        plan: {
          name: "Plan",
          description: "先生成可审批的执行计划，经用户确认后再执行操作",
        },
        review: {
          name: "Review",
          description: "审查代码差异，关注正确性、安全性与可维护性",
        },
        ask: {
          name: "Ask",
          description: "回答问题并提供信息，不执行副作用操作",
        },
      },
      toolPermissions: {
        title: "工具权限",
        description: "控制 AI 智能体可执行的文件操作",
        status: "已启用",
        currentLevel: "当前权限级别",
        fileReadWriteAll: "完整读写",
        fileRead: "仅读",
        none: "无文件访问",
        ariaLabel: "选择工具权限级别",
      },
      sandbox: {
        title: "沙箱",
        description: "工作树隔离与执行环境",
        worktreeIsolation: "工作树隔离",
        worktreeIsolationDescription: "每个智能体在独立的 Git 工作树中运行，支持并行开发",
        worktreeIsolationAria: "切换工作树隔离",
      },
      retry: {
        title: "自动重试",
        description: "自动重试失败的任务",
        autoRetry: "启用自动重试",
        autoRetryDescription: "失败任务将自动重试最多 3 次，指数退避",
        autoRetryAria: "切换自动重试",
      },
    },
    mcp: {
      title: "MCP",
      heading: "MCP 配置",
      description: "管理 Model Context Protocol 服务与工具集成",
      servers: {
        title: "MCP 服务器",
        description: "配置和管理 MCP 服务器连接",
        status: "已启用",
        add: "添加服务器",
        test: "测试连接",
        testing: "测试中...",
        remove: "移除",
        enable: "启用",
        disable: "禁用",
        connected: "已连接",
        disconnected: "未连接",
        error: "错误",
        noWorkspace: "请先打开工作区以配置 MCP 服务器",
        transportType: "传输类型",
        stdio: "stdio",
        sse: "SSE",
        commandLabel: "命令 / URL",
        commandPlaceholder: "npx -y @modelcontextprotocol/server-filesystem",
        argsLabel: "参数",
        envLabel: "环境变量",
      },
      presets: {
        title: "预设模板",
        description: "快速安装常用 MCP 服务器预设",
        install: "安装",
        installed: "已安装",
      },
    },
    cue: {
      title: "CUE",
      heading: "提示词工程",
      description: "提示词模板、结构化提示与响应调优",
      templates: {
        title: "提示词模板",
        description: "不同任务类型的自定义提示词模板",
        status: "已启用",
        add: "添加模板",
        edit: "编辑",
        remove: "删除",
        empty: "无自定义模板。使用 AGENTS.md 或项目规则配置系统提示词",
      },
      responseTuning: {
        title: "响应调优",
        description: "微调 AI 响应参数",
        temperature: "温度",
        temperatureDescription: "较高值产生更有创意的响应。范围：0.0–2.0",
        maxTokens: "最大令牌数",
        maxTokensDescription: "响应中的最大令牌数量",
      },
      voicePolish: {
        title: "语音润色",
        description: "发送前自动润色语音转写文本",
        enabled: "启用语音润色",
        enabledDescription: "移除语气词、修正语法、添加结构到转写文本",
        ariaLabel: "切换语音润色",
      },
    },
    conversationFlow: {
      title: "对话流",
      heading: "对话管理",
      description: "对话管理、轮次限制与上下文窗口设置",
      contextWindow: {
        title: "上下文窗口",
        description: "控制跨轮次的上下文管理方式",
        status: "已启用",
        maxTokens: "最大上下文令牌数",
        maxTokensDescription: "对话上下文中保留的最大令牌数",
        compaction: "自动压缩",
        compactionDescription: "上下文窗口满时自动压缩，保留关键信息",
        compactionAria: "切换自动压缩",
      },
      turnLimits: {
        title: "轮次限制",
        description: "限制每轮对话的轮次和重试次数",
        maxTurns: "最大轮次",
        maxTurnsDescription: "需要用户输入前的最大智能体轮次数",
        maxRetries: "最大重试次数",
        maxRetriesDescription: "工具执行失败时的最大重试次数",
      },
      streaming: {
        title: "流式输出",
        description: "实时流式输出 AI 响应",
        enabled: "启用流式输出",
        enabledDescription: "逐令牌显示 AI 响应",
        ariaLabel: "切换流式输出",
      },
    },
    browser: {
      title: "浏览器",
      heading: "浏览器配置",
      description: "Web 自动化、CDP 集成与浏览器工具配置",
      automation: {
        title: "浏览器自动化",
        description: "为智能体启用基于 CDP 的浏览器工具",
        status: "已启用",
        enabled: "启用浏览器自动化",
        enabledDescription: "允许智能体导航、点击、填表和提取网页数据",
        ariaLabel: "切换浏览器自动化",
      },
      security: {
        title: "安全",
        description: "URL 校验、速率限制与执行超时",
        blockedHosts: "黑名单主机",
        blockedHostsDescription: "内部地址（localhost、127.0.0.1、云元数据）默认已屏蔽",
        rateLimit: "速率限制",
        rateLimitDescription: "每分钟最大浏览器操作数（默认：30）",
        executionTimeout: "执行超时",
        executionTimeoutDescription: "每个浏览器操作的超时时间（秒，默认：10）",
      },
      screenshot: {
        title: "截图",
        description: "自动捕获并注入截图到输入框",
        autoInject: "自动注入截图",
        autoInjectDescription: "浏览器操作后捕获截图并注入到输入框",
        ariaLabel: "切换自动注入截图",
      },
    },
    indexer: {
      title: "索引与文档",
      heading: "索引与文档",
      description: "代码索引、AST grep 模式与文档管理",
      codeIndex: {
        title: "代码索引",
        description: "符号索引，用于跨文件搜索和 @codebase 提及",
        status: "已启用",
        rebuild: "重建索引",
        rebuilding: "重建中...",
        lastBuilt: "上次构建",
        fileCount: "已索引文件",
        symbolCount: "符号数",
      },
      astGrep: {
        title: "AST-Grep",
        description: "结构化代码搜索与模式匹配",
        patterns: "已保存的模式",
        empty: "无已保存的 AST-Grep 模式",
      },
      semantic: {
        title: "语义搜索",
        description: "基于嵌入的代码搜索",
        enabled: "启用语义搜索",
        enabledDescription: "使用向量嵌入进行语义代码搜索（需要索引）",
        ariaLabel: "切换语义搜索",
      },
      repoWiki: {
        title: "Repo Wiki",
        description: "自动生成的项目知识库",
        generate: "生成 Wiki",
        generating: "生成中...",
        status: "未生成",
      },
    },
    skills: {
      title: "技能与命令",
      heading: "技能与命令",
      description: "自定义技能、斜杠命令与 Composer 命令菜单",
      customSkills: {
        title: "自定义技能",
        description: "从本地目录扫描的技能",
        status: "已启用",
        empty: "未找到技能。将含 SKILL.md 的文件夹放入 ~/.claude/skills、~/.codex/skills 或 ~/.agents/skills",
        scanPaths: "扫描路径：~/.claude/skills、~/.codex/skills、~/.agents/skills",
      },
      slashCommands: {
        title: "斜杠命令",
        description: "在 Composer 中可用的已注册斜杠命令",
        empty: "无已注册的斜杠命令",
      },
      marketplace: {
        title: "技能市场",
        description: "浏览和安装社区技能",
        browse: "浏览市场",
        refresh: "刷新",
        refreshing: "刷新中...",
      },
    },
    rules: {
      title: "规则与记忆",
      heading: "规则与记忆",
      description: "项目规则、团队规则与持久化记忆配置",
      projectRules: {
        title: "项目规则",
        description: "从 AGENTS.md、CLAUDE.md、.cursorrules 和 .ydsz/rules/ 加载的规则",
        status: "已启用",
        loaded: "已加载规则",
        noRules: "此工作区未发现项目规则",
        files: "文件",
      },
      teamRules: {
        title: "团队规则",
        description: "存储在 ~/.ydsz-buddy/team-rules/ 的跨项目规则",
        manage: "管理团队规则",
        enabled: "启用团队规则",
        enabledDescription: "将团队共享规则追加到每个项目上下文",
        ariaLabel: "切换团队规则",
      },
      memory: {
        title: "持久化记忆",
        description: "跨会话持久化的智能体记忆",
        clear: "清除记忆",
        clearing: "清除中...",
        status: "无持久化记忆",
      },
    },
    work: {
      heading: "办公模式",
      description: "办公文档生成、浏览器自动化与定时任务等能力开关。",
      officeSection: "办公文档",
      officePptx: {
        title: "PowerPoint 导出",
        description: "将已批准的计划导出为 .pptx 幻灯片,可在计划操作工具栏中使用。",
        status: "已启用",
      },
      automationSection: "自动化",
      browserAutomation: {
        title: "浏览器自动化",
        description: "启用基于 CDP 的浏览器工具,允许智能体导航、点击与抓取页面。",
        warning: "敏感能力,默认关闭;仅在信任工作区时开启。",
        ariaLabel: "切换浏览器自动化",
      },
      cronPersistence: {
        title: "定时任务持久化",
        description: "将定时任务持久化到 .ydsz/scheduler-jobs.json,重启后自动恢复。",
        status: "已持久化",
        ariaLabel: "切换定时任务持久化",
      },
      skillMentions: {
        title: "技能提及",
        description: "在输入框中显示 @indexer、@ppt、@html 等办公域技能节点。",
        ariaLabel: "切换技能提及",
      },
      ocrSection: "识别",
      ocr: {
        title: "OCR 识别语言",
        description: "图片文字识别支持自动、英文与中文,可在 OCR 面板中管理。",
        languages: "auto / en / zh",
      },
    },
    push: {
      heading: "推送通道",
      description: "配置极光 / 友盟推送凭证,向移动端发送审批与任务状态通知。",
      statusHeading: "通道状态",
      statusDescription: "查看内嵌 dispatcher 当前的 JPush / 友盟凭证与 dry_run 模式。",
      statusLoadFailed: "加载推送通道状态失败",
      refresh: "刷新状态",
      jpushStatus: "极光",
      umengStatus: "友盟",
      dryRunStatus: "Dry-run",
      dryRunOn: "已开启",
      dryRunOff: "未开启",
      dryRunHint:
        "Dry-run 已开启:dispatch 调用只会在日志中打印,不会真发到厂商 API。真机联调前请关闭。",
      jpushSection: "极光推送 (JPush)",
      umengSection: "友盟推送 (Umeng)",
      configured: "已配置",
      notConfigured: "未配置",
      testJpush: "测试极光",
      testUmeng: "测试友盟",
      jpushAppKey: "极光 App Key",
      jpushMasterSecret: "极光 Master Secret",
      umengAppKey: "友盟 App Key",
      umengAppMasterSecret: "友盟 App Master Secret",
      revealSecret: "显示密钥",
      hideSecret: "隐藏密钥",
      dryRunToggle: "Dry-run 模式",
      dryRunToggleDescription:
        "开启后,dispatch 调用只在日志中打印,不会调用厂商 API。适用于 CI 与演示。",
      dryRunEnabled: "Dry-run 已开启",
      dryRunDisabled: "Dry-run 已关闭",
      save: "保存凭证",
      saveSuccess: "推送凭证已更新",
      saveFailed: "更新推送凭证失败",
      jpushTestSuccess: "极光连接测试成功",
      jpushTestFailed: "极光连接测试失败",
      umengTestSuccess: "友盟连接测试成功",
      umengTestFailed: "友盟连接测试失败",
    },
    changedSettingLabel: {
      theme: "主题",
      darkThemePack: "深色主题",
      lightThemePack: "浅色主题",
      defaultProvider: "默认提供方",
      newThreadMode: "新线程模式",
      sidebarPosition: "侧边栏位置",
      projectSortOrder: "项目排序",
      threadSortOrder: "线程排序",
      uiFont: "界面字体",
      codeFont: "代码字体",
      baseFontSize: "基础字号",
      fontSmoothing: "字体平滑",
      timeFormat: "时间格式",
      activityToasts: "活动提示",
      desktopNotifications: "桌面通知",
      assistantOutput: "助手输出",
      voicePolish: "语音转写润色",
      diffLineWrapping: "差异换行",
      deleteConfirmation: "删除确认",
      archiveConfirmation: "归档确认",
      terminalCloseConfirmation: "关闭终端确认",
      gitWritingModel: "Git 写入模型",
      customModels: "自定义模型",
      providerInstalls: "提供方安装",
      providerVisibility: "提供方可见性",
      providerOrder: "提供方顺序",
      language: "语言",
    },
    resetAria: (_label) => `将「{label}」重置为默认`,
    resetTooltip: "重置为默认",
    restoreDefaultsConfirm: (labels) => `恢复默认设置？\n将重置：${labels}。`,
    themePack: {
      importTitle: "导入主题",
      importDescription: "粘贴一个已分享的主题包字符串以立即应用",
      apply: "应用",
      reset: "重置",
    },
  },
  dialog: {
    confirm: {
      deleteThread: (_title) => `「{title}」\n\n这将永久删除该线程及其历史记录。`,
      deleteThreadPermanent: "删除线程",
      threadDeleteUndoButton: "撤销",
    threadDeleteUndoSuccessTitle: "线程已恢复",
    threadDeleteUndoFailedTitle: "无法撤销删除",
    threadDeleteUndoFailedDescription: "线程可能已被永久移除。",
    archiveThread: "归档线程",
      removeProject: (_name) => `从侧边栏移除「{name}」？`,
      removeProjectAndThreads: (_name, _count) => `从侧边栏移除「{name}」并删除 ${_count} 个线程？`,
      cancel: "取消",
      continue: "删除",
      discardDraft: "放弃新线程草稿？",
    },
    rename: {
      title: "重命名聊天",
      description: "保持简短易记",
      submit: "重命名",
      cancel: "取消",
    },
    pullRequest: {
      title: "关联 Pull Request",
      description: "粘贴 GitHub Pull Request 的 URL 或编号以关联到此线程",
      placeholder: "https://github.com/owner/repo/pull/42 或 #42",
      open: "打开",
      cancel: "取消",
    },
    worktreeHandoff: {
      title: "交接至工作树",
      description: "将会话迁移到新工作树中，避免中断当前工作",
      submit: "交接",
      cancel: "取消",
    },
  },
  whatsNew: {
    title: "新增内容",
    popoutTitle: "ydsz-buddy 更新内容",
    open: "打开",
    dismiss: "忽略",
    gotIt: "知道了",
    releaseNotes: "更新说明",
    readMore: "阅读更多",
    showLess: "收起",
    highlights: "亮点",
    allReleases: "所有版本",
    versionLabel: (version) => `v${version}`,
  },
  taskCompletion: {
    markAllRead: "全部标记为已读",
    viewChat: "查看聊天",
  },
  workspace: {
    fallbackTitle: "工作区",
    renameHint: "双击重命名",
    terminalTab: "终端",
    settingsAria: "工作区设置",
    loading: "正在加载工作区",
    emptyTitle: "没有打开的工作区",
    openInEditor: "在编辑器中打开",
  },
  workspaceModePicker: {
    modeLabel: "工作区模式",
    chooseFolder: "选择文件夹",
    changeFolder: "更改文件夹",
    openingPicker: "打开中…",
    pickFolderError: "无法打开文件夹选择器",
    cloudNotAvailable: "云端工作区敬请期待",
    worktreeCreateError: "无法基于此文件夹创建 git worktree",
    comingSoonHint: "敬请期待",
    modes: {
      local: "本地",
      worktree: "工作树",
      ssh: "SSH 远程",
      cloud: "云端",
    },
  },
  workspaceMigrationHint: {
    title: "选择文件夹以开始使用",
    description: (count: number) =>
      count === 1
        ? "1 个工作区正在等待选择文件夹。点击下方的 [选择文件夹] 完成选择。"
        : `${count} 个工作区正在等待选择文件夹。点击下方的 [选择文件夹] 完成选择。`,
    dismiss: "知道了",
  },
  terminal: {
    findPlaceholder: "查找",
    matchCase: "区分大小写",
    tabTerminal: "终端",
    tabChat: "聊天",
  },
  gitActions: {
    groupAria: "Git 操作",
    optionsAria: "Git 操作选项",
    prTitlePlaceholder: "留空以自动生成",
    linkUnavailable: "链接打开不可用",
    noOpenPR: "未找到打开的 PR",
    openPRErrorTitle: "无法打开 PR 链接",
    syncingTitle: "正在与远程同步",
    syncSuccess: "远程已同步",
    alreadyUpToDate: "已是最新",
    syncFailed: "同步失败",
    createPRUnavailable: "无法创建 PR",
    noChanges: "没有可包含在 PR 中的变更",
    running: "正在执行 Git 操作",
    waiting: "等待 Git",
    keeping: (name) => `保留 ${name}`,
    branchConfirmed: "分支名已确认",
    creatingBranch: "正在创建分支",
    switchedTo: (name) => `已切换到 ${name}`,
    createdCheckedOut: "分支已创建并签出",
    createFailed: "创建分支失败",
    editorUnavailable: "编辑器打开不可用",
    openFileFailed: "无法打开文件",
  },
  browser: {
    screenshotCopied: "浏览器截图已复制",
    urlPlaceholder: "搜索或输入 URL",
    actionsAria: "浏览器操作",
  },
  branchToolbar: {
    newWorktree: "新建工作树",
    handoffNewWorktree: "交接至新工作树",
    handoffLocal: "交接至本地",
    rateLimitsRemaining: "剩余速率限制",
    checkoutPR: "签出合并请求",
    searchPlaceholder: "搜索分支",
    createTitle: "创建分支",
    discardStash: "放弃已保存的储藏",
    loadingStash: "正在加载储藏",
    fieldBranch: "分支",
    fieldWorktree: "工作树",
    fieldStash: "储藏",
    fieldName: "名称",
  },
  projectScripts: {
    groupAria: "项目脚本",
    actionAria: "脚本操作",
    editAria: (name) => `编辑 ${name}`,
    nameLabel: "名称",
    chooseIcon: "选择图标",
    testPlaceholder: "测试",
    keybindingLabel: "快捷键",
    pressShortcut: "按下快捷键",
    pressShortcutHint: "按下快捷键。使用退格键清除",
    commandLabel: "命令",
    autoRunLabel: "创建工作树时自动运行",
    deleteConfirmDescription: "此操作无法撤销",
    addScript: "添加脚本",
    delete: "删除",
  },
  themeEditor: {
    copiedTitle: "主题已复制",
    copiedDescription: (variant) => `已复制 ${variant} 主题分享串。`,
    copyFailedTitle: "复制失败",
    copyFailedDescription: "无法复制主题分享串",
    codeAria: (label) => `${label} 代码主题`,
    systemDefault: "系统默认",
    translucentSidebar: "半透明侧边栏",
    translucentSidebarAria: (label) => `${label} 半透明侧边栏`,
    resetAria: (label) => `重置 ${label}`,
    resetTitle: "重置为默认",
    hexValueAria: (label) => `${label} 十六进制值`,
    importedTitle: "主题已导入",
    importedDescription: (variant) => `${variant} 主题包已更新。`,
    shareStringAria: "主题分享串",
    background: "背景",
    text: "文本",
    accent: "强调色",
    border: "边框",
    status: "状态",
    code: "代码",
    light: "浅色",
    dark: "深色",
    reset: "重置",
    shareString: "分享串",
    apply: "应用",
    import: "导入",
    foreground: "前景",
    uiFont: "界面字体",
    codeFont: "代码字体",
    codeFontPlaceholder: '"JetBrains Mono"',
    contrast: "对比度",
    contextActiveSystem: (variant) => `系统当前正在使用 ${variant} 主题。`,
    contextActiveLocked: "这是当前使用的主题",
    contextInactiveSystem: (variant) => `当系统切换到 ${variant} 时使用。`,
    contextInactiveLocked: (mode) => `应用已锁定为 ${mode} 模式，此主题未启用。`,
    importDialogTitle: (variant) => `导入${variant === "dark" ? "深色" : "浅色"}主题`,
    importDialogDescription: (variant) =>
      `粘贴 codex-theme-v1: 分享串。嵌入的变体必须匹配 ${variant}，且所选代码主题必须存在于该变体。`,
    importDialogCancel: "取消",
    importDialogSubmit: "导入",
    importError: "无法导入该主题字符串",
    importPlaceholder: 'codex-theme-v1:{"codeThemeId":"linear",...}',
    copy: "复制",
  },
  themePack: {
    importTitle: "导入主题",
    importDescription: "粘贴一个已分享的主题包字符串以立即应用",
    apply: "应用",
    reset: "重置",
  },
  restoreDefaults: {
    title: "恢复默认",
    description: (labels) => `恢复默认设置？\n将重置：${labels}。`,
    button: "恢复",
  },
  keybindings: {
    searchPlaceholder: "搜索快捷键",
    title: "键盘快捷键",
  },
  releaseHistory: {
    title: "更新说明",
    open: "打开",
  },
  rateLimits: {
    reachedTitle: "已达到速率限制",
    approachingTitle: "接近速率限制",
    planLimitTitle: "已达套餐限制",
    noData: "暂无速率限制数据",
  },
  providerUsage: {
    title: (providerName) => `${providerName} 用量`,
    fallbackTitle: "用量",
    window: "窗口",
    resetsAt: "重置于",
    noData: "暂无用量数据。",
  },
  codingPlan: {
    sectionTitle: "国内 Coding Plan 配额",
    sectionDescription: "一站式查看 4 家国内 Coding Plan 订阅的剩余额度，点击卡片可跳转到官方用量控制台。",
    providerLabel: {
      glm: "智谱 BigModel (GLM)",
      deepseek: "DeepSeek",
      moonshot: "月之暗面 (Kimi)",
      qwen: "通义千问 (Qwen)",
    },
    status: {
      notBound: "未绑定",
      bound: "已绑定",
      quotaUnknown: "未返回额度",
      fetching: "正在获取额度…",
    },
    quotaRow: {
      label: "剩余",
      remaining: (percent: number) => `剩余 ${Math.round(percent)}%`,
      resetsAt: (when: string) => `${when} 重置`,
      unlimited: "不限量",
    },
    actions: {
      bind: "绑定 Coding Plan",
      viewUsage: "打开用量控制台",
      refresh: "刷新",
      open: "打开",
    },
    learnMore: "了解更多国内 Coding Plan",
  },
  costBudget: {
    sectionTitle: "成本预算",
    sectionDescription: "设置每日或每月 AI 花费上限。客户端会统计所有提供方的 token 用量,在超支前给出提示或拦截。",
    dailyBudget: {
      label: "每日预算(美元)",
      placeholder: "例如 10",
      hint: "每天本地时间 00:00 重置。设为 0 即关闭。",
    },
    monthlyBudget: {
      label: "每月预算(美元)",
      placeholder: "例如 200",
      hint: "每月 1 日本地时间 00:00 重置。设为 0 即关闭。",
    },
    policy: {
      label: "超额后的行为",
      warn: "仅提示",
      warnDescription: "继续发送,弹出横幅让你自行决定是否放慢节奏。",
      block: "拦截新调用",
      blockDescription: "下一次模型调用前需要用户在对话框中确认才能放行。",
    },
    progress: {
      title: "当前花费",
      dailyLabel: "今日",
      monthlyLabel: "本月",
      spentOf: (spend, budget) => `${spend} / ${budget}`,
      noBudget: "未设置预算",
      exceeded: "已超额",
      remaining: (amount) => `剩余 ${amount}`,
    },
    alert: {
      title: "成本预算提醒",
      description: (threshold, spend, budget) =>
        `你已跨越 ${Math.round(threshold * 100)}% 阈值(${spend} / ${budget})。建议切换到更轻量的模型或暂停使用。`,
      dismiss: "知道了",
      upgrade: "调整预算",
    },
    blockDialog: {
      title: "AI 调用已被预算拦截",
      description: "今日 / 本月预算已用完。确认后强制放行本次调用,或取消以终止当前任务。",
      reasonLabel: "原因",
      reasonDaily: (spend, budget) => `今日已花 ${spend} / 每日预算 ${budget}`,
      reasonMonthly: (spend, budget) => `本月已花 ${spend} / 每月预算 ${budget}`,
      continue: "仍要继续",
      cancel: "取消",
    },
  },
  turnAiShare: {
    badge: {
      label: "AI {percent}",
      empty: "AI —",
      tooltip: (lines, percent) => `${lines} 行 · AI 占比 ${percent}`,
      tooltipBreakdown: (ai, user, mixed, total) =>
        `AI ${ai} · 你 ${user} · 混合 ${mixed} / 共 ${total} 行`,
      a11yLabel: (percent) => `本线程 AI 归属代码占比 ${percent}`,
    },
    panel: {
      sectionTitle: "AI 生产占比",
      sectionDescription: "本线程所有轮次的净行归属;混合归属文件按 50/50 拆分到 AI 与你。",
      ai: "AI",
      human: "你",
      mixed: "混合",
      total: "总行数",
      turnCount: (n) => `${n} 个轮次`,
      fileCount: (n) => `${n} 个文件`,
      empty: "暂无代码改动记录,首个 AI 差异出现后会自动显示。",
    },
    workspace: {
      title: "整库 AI 占比",
      subtitle: "聚合整个工作区所有会话,按 24 小时 / 7 天 / 30 天三个窗口统计。",
      empty: "整个工作区还没有会话数据。",
      window24h: "近 24 小时",
      window7d: "近 7 天",
      window30d: "近 30 天",
      percent: (n) => `${n.toFixed(1)}%`,
      lines: (n) => `${n} 行`,
      refresh: "刷新",
      summary: (percent, lines, window) => `AI ${percent} · ${lines} · ${window}`,
    },
  },
  debug: {
    actionFailed: "操作失败",
    fallback: "发生错误",
  },
  notification: {
    retention: {
      title: "正在清理旧聊天",
      preparing: "正在准备后台清理",
      progress: (purged, _total) => `已移除 ${purged} / {total} 个聊天。`,
      progressSimple: (purged) => `已移除 ${purged} 个聊天。`,
      compactingTitle: "正在压缩聊天数据库",
      compactingReclaim: "正在回收未使用的数据库空间",
      compactingFinishing: "正在完成清理",
      pausedTitle: "清理已暂停",
      pausedDescription: "旧聊天将稍后重试",
      successTitle: "旧聊天已清理",
      successDescription: (purged) => `已从数据库移除 ${purged} 个聊天。`,
      successDescriptionEmpty: "无需清理旧聊天",
    },
    providerUpdate: {
      title: (providerName) => `正在更新 ${providerName}。`,
      titleMany: (count) => `正在更新 ${count} 个提供方。`,
      description: (providerName) => `正在更新 ${providerName}。`,
      descriptionMany: (count) => `正在更新 ${count} 个提供方。`,
      errorFallback: "更新命令未成功完成",
      stillOutdated: "更新后该提供方仍显示为旧版",
      requestFailed: "更新请求失败",
      failedTitleAll: "提供方更新失败",
      failedTitleSome: "部分提供方更新失败",
      successTitleOne: (providerName) => `${providerName} 已更新`,
      successTitleMany: (count) => `已更新 ${count} 个提供方`,
      successDescription: "新会话将使用已刷新的提供方工具",
      availableTitleOne: (providerName) => `${providerName} 有可用更新`,
      availableTitleMany: (count) => `${count} 个提供方有可用更新`,
      availableDescriptionOne: (providerName) => `${providerName} 有更新版本可用。`,
      availableDescriptionMany: (providerName, count) =>
        `${providerName} 及其 ${count} 个提供方有更新版本可用。`,
      actionReview: "查看更新",
      actionUpdateAll: "全部更新",
    },
    keybindings: {
      invalidTitle: "快捷键配置无效",
      openConfigAction: "打开 keybindings.json",
      noEditor: "未找到可用编辑器",
      openFileErrorTitle: "无法打开快捷键文件",
      openFileErrorFallback: "打开文件时出现未知错误",
    },
  },
  termsAcceptance: {
    heading: "欢迎使用 ydsz-buddy",
    subtitle:
      "开始前请阅读并接受使用条款与隐私政策。文档说明了你的工作区数据、提供方密钥与本地向量库的处理方式。",
    viewPrivacy: "查看隐私政策",
    viewTerms: "查看使用条款",
    acceptLabel: "我已阅读并同意《使用条款》与《隐私政策》。",
    acceptButton: "同意并继续",
    acceptedAtPrefix: "已于以下时间接受:",
    reviewButton: "重新查看文档",
    resetButton: "重置接受状态",
    dialogTitlePrivacy: "隐私政策",
    dialogTitleTerms: "使用条款",
    lastUpdated: "最后更新",
    closeButton: "关闭",
  },
};

/**
 * 所有语言的翻译消息字典。
 * 键为语言代码（"en" | "zh"），值为对应语言的完整翻译消息对象。
 * 用于在运行时根据当前语言设置获取对应的 UI 字符串。
 */
export const MESSAGES: Record<Language, Messages> = { en, zh };

/**
 * 各语言的原生名称标签。
 * 键为语言代码，值为该语言的原生显示名称（如 "English"、"中文"）。
 * 通常用于语言切换器等需要显示语言选项的场景。
 */
export const NATIVE_LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "中文",
};

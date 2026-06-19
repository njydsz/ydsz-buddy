// English locale. Mirrors the keys used in
// `apps/web/src/i18n/en.ts` in Peak Code, but kept tight to the
// remi-app surface for M1.

export default {
  "app.title": "Remi Code",
  "app.dev": "Dev",
  "app.alpha": "Alpha",

  "nav.chat": "Chat",
  "nav.automations": "Automations",
  "nav.plugins": "Plugins",
  "nav.settings": "Settings",

  "sidebar.search": "Search threads…",
  "sidebar.noMatches": "No matches",
  "sidebar.loading": "Loading projects…",
  "sidebar.toggleTheme": "Toggle theme",

  "transport.connecting": "Connecting to {app} server…",
  "transport.reconnecting": "Reconnecting (attempt {n})…",
  "transport.reconnectSimple": "Reconnecting…",
  "transport.disconnected": "Disconnected from server",
  "transport.transportDisposed": "Transport disposed",
  "transport.reload": "Reload",

  "chat.empty.heading": "Start a new conversation",
  "chat.empty.description":
    "Pick a project to open a new thread. Remi Code streams assistant replies in real time, executes tools against your repository, and keeps every turn inspectable in the diff panel.",
  "chat.empty.noProjects": "No projects yet. Add a project in {section} first.",
  "chat.empty.createError": "Could not create thread: {error}",
  "chat.placeholder": "Ask Remi Code anything…  (use @ to attach files)",
  "chat.attach": "@ Attach",
  "chat.send": "Send",
  "chat.sending": "Sending…",
  "chat.cancel": "Cancel",
  "chat.retry": "Retry",
  "chat.copy": "Copy",
  "chat.copied": "Copied",
  "chat.selectThread": "Select a thread to start chatting.",
  "chat.noMessages": "No messages yet. Type a prompt below to start.",
  "chat.assistant": "assistant",
  "chat.user": "user",
  "chat.system": "system",
  "chat.error": "Error",
  "chat.turnFailed": "This turn failed.",
  "chat.thinking": "Thinking…",
  "chat.attachments": "Attachments",
  "chat.draftRestored": "Draft restored from previous session.",

  "settings.heading": "Settings",
  "settings.stub":
    "Remi Code settings are stubbed in this skeleton. The full settings surface (providers, keybindings, theme packs, voice, debug) is scheduled for the M2 milestone.",

  "plugins.heading": "Plugins",
  "plugins.stub": "The plugin library ships in milestone M3.",

  "automations.heading": "Automations",
  "automations.stub": "Scheduled automations ship in milestone M4.",

  "workspace.heading": "Workspaces",
  "workspace.stub": "Workspace switcher ships in milestone M3.",
  "workspace.detail": "Workspace {id}",

  "provider.ready": "Ready",
  "provider.degraded": "Degraded",
  "provider.offline": "Offline",
  "provider.unknown": "Unknown",
  "provider.configuredCount": "{n} configured",

  "errors.unexpected": "An unexpected error occurred.",
  "errors.reload": "Reload",
  "errors.backHome": "Back to home",
  "errors.routeNotFound": "Page not found",
  "errors.routeError": "Route error",
  "errors.notFound.heading": "Not found",
  "errors.notFound.body": "The page you are looking for could not be found.",
  "errors.goHome": "Go home",

  "language.label": "Language",
  "language.en": "English",
  "language.zh-CN": "简体中文",

  "auth.bootstrap": "Authenticating…",
  "auth.pairing": "Pair this device",
  "auth.revoke": "Revoke",
  "auth.signOut": "Sign out",

  "toast.connectionLost": "Lost connection to the server. Retrying…",
  "toast.connectionRestored": "Connection restored.",
  "toast.unauthorized": "You are not signed in. Pair this device to continue.",
  "toast.providerFailed": "{provider} failed: {error}",
} satisfies Record<string, string>;

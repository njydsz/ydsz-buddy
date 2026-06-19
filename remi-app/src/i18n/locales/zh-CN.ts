// Simplified Chinese locale. Mirrors `en.ts` so the translator can
// diff them easily.

export default {
  "app.title": "Remi Code",
  "app.dev": "开发",
  "app.alpha": "内测",

  "nav.chat": "对话",
  "nav.automations": "自动化",
  "nav.plugins": "插件",
  "nav.settings": "设置",

  "sidebar.search": "搜索会话…",
  "sidebar.noMatches": "无匹配结果",
  "sidebar.loading": "正在加载项目…",
  "sidebar.toggleTheme": "切换主题",

  "transport.connecting": "正在连接 {app} 服务器…",
  "transport.reconnecting": "重新连接中（第 {n} 次）…",
  "transport.reconnectSimple": "正在重连…",
  "transport.disconnected": "已与服务器断开",
  "transport.transportDisposed": "传输层已释放",
  "transport.reload": "重新加载",

  "chat.empty.heading": "开始新对话",
  "chat.empty.description":
    "选择一个项目以开启新会话。Remi Code 会实时流式输出回复、在你的代码库上执行工具调用，并在 Diff 面板里保留每一轮的变更。",
  "chat.empty.noProjects": "暂无项目。请先到 {section} 中添加项目。",
  "chat.empty.createError": "无法创建会话：{error}",
  "chat.placeholder": "向 Remi Code 提问…  （使用 @ 附加文件）",
  "chat.attach": "@ 附加",
  "chat.send": "发送",
  "chat.sending": "发送中…",
  "chat.cancel": "取消",
  "chat.retry": "重试",
  "chat.copy": "复制",
  "chat.copied": "已复制",
  "chat.selectThread": "选择一个会话开始对话。",
  "chat.noMessages": "暂无消息。在下方输入提示词开始。",
  "chat.assistant": "助手",
  "chat.user": "用户",
  "chat.system": "系统",
  "chat.error": "错误",
  "chat.turnFailed": "本轮回复失败。",
  "chat.thinking": "思考中…",
  "chat.attachments": "附件",
  "chat.draftRestored": "已恢复上次未发送的草稿。",

  "settings.heading": "设置",
  "settings.stub":
    "Remi Code 设置页仍是占位实现。完整设置（Provider、键位、主题、语音、调试）计划在 M2 里程碑落地。",

  "plugins.heading": "插件",
  "plugins.stub": "插件市场计划在 M3 里程碑上线。",

  "automations.heading": "自动化",
  "automations.stub": "定时自动化任务计划在 M4 里程碑上线。",

  "workspace.heading": "工作区",
  "workspace.stub": "工作区切换器计划在 M3 里程碑上线。",
  "workspace.detail": "工作区 {id}",

  "provider.ready": "就绪",
  "provider.degraded": "降级",
  "provider.offline": "离线",
  "provider.unknown": "未知",
  "provider.configuredCount": "已配置 {n} 个",

  "errors.unexpected": "发生了意外错误。",
  "errors.reload": "重新加载",
  "errors.backHome": "返回首页",
  "errors.routeNotFound": "页面不存在",
  "errors.routeError": "路由错误",
  "errors.notFound.heading": "未找到",
  "errors.notFound.body": "找不到您要访问的页面。",
  "errors.goHome": "回到首页",

  "language.label": "语言",
  "language.en": "English",
  "language.zh-CN": "简体中文",

  "auth.bootstrap": "正在鉴权…",
  "auth.pairing": "配对此设备",
  "auth.revoke": "撤销",
  "auth.signOut": "退出登录",

  "toast.connectionLost": "与服务器断开连接，正在重试…",
  "toast.connectionRestored": "已恢复连接。",
  "toast.unauthorized": "未登录。请先配对此设备。",
  "toast.providerFailed": "{provider} 失败：{error}",
} satisfies Record<string, string>;

# Ydsz Buddy

Ydsz Buddy（`ydb`）是由 [南京云顶数字科技有限公司](https://njydsz.com) 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开源智能体工作台。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

Ydsz Buddy 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @njydsz/ydb web
```

该命令会启动 Web UI，默认地址为 `http://127.0.0.1:3080`。详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/njydsz/ydsz-buddy.git
cd ydsz-buddy
pnpm install
pnpm run build
pnpm ydb web
```

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/njydsz/ydsz-buddy/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`ydb-plugin`](https://github.com/topics/ydb-plugin) 话题，便于被发现。
- 欢迎加入 Ydsz Buddy 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

![输入图片说明](https://foruda.gitee.com/images/1786851643498196800/04021221_16262811.png "ScreenShot_2026-08-16_114023_774.png")

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

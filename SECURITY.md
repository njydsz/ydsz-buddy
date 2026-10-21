# Security Policy

> **归属声明:** Ydsz Worker (云顶数字工作台) 基于腾讯 Octop（[MIT 协议](https://github.com/TencentCloud/Octop/blob/main/LICENSE)）二开。安全漏洞请同时参考上游 Octop 项目。

## Supported versions

| Version | Supported |
|---------|-----------|
| latest release on `main` | ✅ |
| older releases | best effort |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

- **GitHub Security Advisory:** [Create advisory](https://github.com/TencentCloud/Octop/security/advisories/new)
- **Email:** jubaoliang@gmail.com

We aim to acknowledge reports within **3 business days** and provide a fix timeline within **7 business days** for confirmed issues.

## Scope

Ydsz Worker is a self-hosted control plane. Operators are responsible for:

- Securing the host and network exposure of `ydsz-worker run`
- Rotating JWT secrets and admin credentials
- Reviewing tool guard rules under `~/.octop/security/tool_guard/`
- Protecting LLM API keys and IM channel credentials

See [docs/configuration.md](docs/configuration.md) for deployment hardening guidance.

# Ydsz Worker Docker 部署

---

本目录包含 云顶数字工作台 (Ydsz Worker) 的 Docker 构建与部署相关文件。

### 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 多阶段镜像定义（构建上下文为仓库根目录） |
| `../.dockerignore` | 构建上下文忽略规则（Podman 与 BuildKit 均适用） |
| `docker_build.sh` | 从源码构建镜像（默认开启 BuildKit 缓存） |
| `docker-compose.yml` | 本地开发 / 自托管一键启动 |
| `docker-compose.cn.yml` | 同一套服务，拉取 `ghcr.io/njydsz/ydsz-worker:latest`（不本地构建） |
| `docker-compose.postgres.yml` | 仅 PostgreSQL（+ pgvector）开发/测试库；扩展在 `postgres/init-vector.sql` |
| `postgres/init-vector.sql` | 实例级 `CREATE EXTENSION vector`（initdb.d；**不**进 Ydsz Worker 迁移） |
| `docker-entrypoint.sh` | 容器入口：首次初始化数据库并启动服务 |

### 快速开始

**方式一：Compose（推荐）**

在仓库根目录执行：

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

访问 `http://localhost:8088`。设置了合格的 `YDSZ_DEFAULT_PASSWORD`（≥8 位且同时包含字母和数字）时，首次启动会创建管理员，并把凭据写入 `/data/.ydsz-worker/credential.txt`。未设置，或密码被策略拒绝（过短、缺字母/数字、常见弱密码）时，**不**自动建账号，打开页面走设置向导；向导口令在 `/data/.ydsz-worker/ydsz-login.txt`（`credential.txt` 里也有说明）。在向导里自行设置管理员密码。

Compose 将多 agent 服务的文件描述符限制设为 65535。服务启动时也会在继承的 hard limit 内将 soft limit 提升至最多 65535，并记录实际限额。已有容器需重新创建才能应用 Compose 限额变化；仅重启不会改变容器的 hard limit。

**方式二：构建脚本**

```bash
bash docker/docker_build.sh
docker run -d \
  --name ydsz \
  --ulimit nofile=65535:65535 \
  -p 8088:8088 \
  -v ydsz-data:/data/.ydsz-worker \
  -e HOME=/data \
  ydsz-worker:latest
```

### 镜像加速（可选）

构建时可通过环境变量加速依赖下载。以下以常用国内镜像为例，可替换为任意可用的镜像源：

```bash
PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple \
PIP_TRUSTED_HOST=mirrors.cloud.tencent.com \
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/ \
APT_MIRROR=mirrors.cloud.tencent.com \
bash docker/docker_build.sh
```

### 常用环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOME` | `/data` | 必须为 `/data`，数据目录映射到 `~/.ydsz-worker` |
| `YDSZ_PORT` | `8088` | HTTP 服务端口 |
| `YDSZ_DEFAULT_PASSWORD` | _(未设置)_ | 首次管理员密码（≥8 位，字母+数字）。合格则 `ydsz-worker init` 建账号；未设置或不合格则走 Web 设置向导 |
| `YDSZ_ADMIN_USERNAME` | `admin` | 首次管理员用户名 |
| `YDSZ_DATABASE_URL` | — | PostgreSQL DSN（或其他 `YDSZ_DATABASE_*`，见 [configuration.md](../docs/configuration.md)） |
| `YDSZ_DATABASE_DRIVER` | — | 通过环境变量覆盖时：`sqlite` \| `postgresql` |
| `OPENAI_API_KEY` | — | OpenAI 兼容 API Key |
| `DASHSCOPE_API_KEY` | — | 阿里云通义千问 API Key |

Compose 可在 `docker/.env` 中配置上述变量。注意：`.env` 只参与 Compose 插值，变量必须出现在 `docker-compose.yml` 的 `environment:` 中才会进入容器。也可把相同键写入挂载数据目录下的 `~/.ydsz-worker/env`。

### 知识库依赖

镜像除 `browser` 外，还包含 `local-embedding` 和 `knowledge-ocr` 可选依赖。
两次依赖安装均指定这些 extras，避免最后一次 `uv sync` 将其移除。构建时会检查
嵌入与 OCR 模块能否导入；不会下载模型权重，也不会自动开启知识库或 OCR。

通过控制台安装到运行中容器的依赖位于容器可写层，重建容器后会丢失。应重新构建或
拉取已包含这些 extras 的镜像，而不是依赖运行时安装。保留 `/data/.ydsz-worker` 数据卷，
即可保留配置、知识库索引与本地嵌入模型缓存。已有部署需要重新构建或升级镜像才能
获得这些依赖，仅重启旧镜像无效。

### 数据持久化

- Compose 默认将宿主机 `~/.ydsz-worker` 挂载到容器 `/data/.ydsz-worker`
- `docker run` 示例使用命名卷 `ydsz-data`
- 首次启动：`YDSZ_DEFAULT_PASSWORD` 合格则执行 `ydsz-worker init` 并写入 `credential.txt`；未设置或不合格则不建管理员，向导口令写入 `/data/.ydsz-worker/ydsz-login.txt`，打开页面完成设置（容器不会因弱密码退出）。

### 健康检查

镜像内置 `HEALTHCHECK`，探测 `GET /api/health`：

```bash
curl http://localhost:8088/api/health
```

### 常用运维命令

```bash
docker logs -f ydsz
docker exec -it ydsz ydsz-worker --version
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

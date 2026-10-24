# Ydsz Worker Docker Deployment

---

This directory contains the Docker build and deployment assets for 云顶数字工作台 (Ydsz Worker).

### Files

| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage image definition (build context is the repo root) |
| `../.dockerignore` | Build context ignore rules (applies to both Podman and BuildKit) |
| `docker_build.sh` | Build image from source (BuildKit cache enabled by default) |
| `docker-compose.yml` | One-command local / self-hosted deployment |
| `docker-compose.cn.yml` | Same stack, pulls `ghcr.io/njydsz/ydsz-worker:latest` (no local build) |
| `docker-compose.postgres.yml` | PostgreSQL (+ pgvector) for dual-backend dev/tests |
| `postgres/init-vector.sql` | Instance-level `CREATE EXTENSION vector` (initdb.d; **not** Ydsz Worker migrations) |
| `docker-entrypoint.sh` | Container entrypoint: first-run init + start server |

### Quick start

**Option 1: Compose (recommended)**

From the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Open `http://localhost:8088`. A valid `YDSZ_DEFAULT_PASSWORD` (≥8 characters with letters and digits) creates the admin on first boot and writes credentials to `/data/.ydsz-worker/credential.txt`. If the variable is unset, or the password fails policy (too short, missing letters/digits, or a common password), **no** admin is created — open the dashboard and complete the setup wizard. The wizard unlock password is in `/data/.ydsz-worker/ydsz-login.txt` (also noted in `credential.txt`).

Compose sets the open-file limit to 65535 for multi-agent workloads. Server startup also raises the soft limit up to 65535 within the inherited hard limit and logs the effective limits. Recreate existing containers to apply changed Compose limits; a restart alone does not change their hard limit.

**Option 2: Build script**

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

### Faster downloads (mirrors, optional)

Pass mirror env vars when building. The values below are common Chinese mirror examples — replace with any mirror that works for you:

```bash
PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple \
PIP_TRUSTED_HOST=mirrors.cloud.tencent.com \
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/ \
APT_MIRROR=mirrors.cloud.tencent.com \
bash docker/docker_build.sh
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOME` | `/data` | Must be `/data` so `~/.ydsz-worker` maps to the data volume |
| `YDSZ_PORT` | `8088` | HTTP listen port |
| `YDSZ_DEFAULT_PASSWORD` | _(unset)_ | First-run admin password (≥8 chars, letters + digits). Valid → `ydsz-worker init`; unset or rejected → web setup wizard |
| `YDSZ_ADMIN_USERNAME` | `admin` | Initial admin username |
| `YDSZ_DATABASE_URL` | — | PostgreSQL DSN (or other `YDSZ_DATABASE_*`; see [configuration.md](../docs/configuration.md)) |
| `YDSZ_DATABASE_DRIVER` | — | `sqlite` \| `postgresql` when overriding defaults via env |
| `OPENAI_API_KEY` | — | OpenAI-compatible API key |
| `DASHSCOPE_API_KEY` | — | Alibaba DashScope API key |

For Compose, put these in `docker/.env`. Values only reach the container if listed under `environment:` in `docker-compose.yml` (Compose interpolates `.env`; it does not auto-export every key). Alternatively write the same keys into the mounted data dir as `~/.ydsz-worker/env`.

### Knowledge-base dependencies

The image includes the `local-embedding` and `knowledge-ocr` extras alongside
`browser`. Both dependency installation steps use these extras, so the final
`uv sync` retains them. The build checks that the embedding and OCR modules can
be imported; it does not download model weights or enable either feature.

Dependencies installed from the dashboard into a running container live in its
writable layer and disappear when that container is recreated. Rebuild or pull
an image containing these extras instead of relying on runtime installation.
Keep the `/data/.ydsz-worker` volume to preserve settings, knowledge indexes and the
local embedding model cache. Existing deployments must rebuild or upgrade their
image to receive these dependencies; restarting an older image is insufficient.

### Data persistence

- Compose mounts host `~/.ydsz-worker` → container `/data/.ydsz-worker`
- `docker run` example uses named volume `ydsz-data`
- First boot: a valid `YDSZ_DEFAULT_PASSWORD` runs `ydsz-worker init` and writes `credential.txt`; unset or rejected passwords skip admin creation and write the wizard unlock password to `/data/.ydsz-worker/ydsz-login.txt`. The container does not exit because of a weak default.

### Health check

The image probes `GET /api/health`:

```bash
curl http://localhost:8088/api/health
```

### Operations

```bash
docker logs -f ydsz
docker exec -it ydsz ydsz-worker --version
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build
```

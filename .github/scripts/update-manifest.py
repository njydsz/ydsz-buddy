name: Update Tauri auto-updater manifest.

This script rebuilds `remi-app/src-tauri/latest.json` from a list of
artefacts published under a GitHub release tag. It is called by
`.github/workflows/release.yml` after a release is drafted.

Usage:
    python3 .github/scripts/update-manifest.py \
        --repo remi-code/remi-code \
        --tag v0.1.0 \
        --output remi-app/src-tauri/latest.json

The script intentionally only depends on the Python standard library so it
runs in a stock `ubuntu-latest` runner.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.request

GITHUB_API = "https://api.github.com"


def fetch_release(repo: str, tag: str) -> dict:
    url = f"{GITHUB_API}/repos/{repo}/releases/tags/{tag}"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - public GitHub API
        return json.load(resp)


def sha256_of(url: str) -> str:
    """Download a remote asset and return its SHA-256 digest as a hex string."""
    with urllib.request.urlopen(url, timeout=120) as resp:  # noqa: S310 - asset URL
        h = hashlib.sha256()
        for chunk in iter(lambda: resp.read(1024 * 64), b""):
            h.update(chunk)
        return h.hexdigest()


def platform_key(name: str) -> str | None:
    n = name.lower()
    if n.endswith(".dmg"):
        if "arm64" in n or "aarch64" in n:
            return "darwin-aarch64"
        return "darwin-x86_64"
    if n.endswith(".msi"):
        if "arm64" in n or "aarch64" in n:
            return "windows-aarch64"
        return "windows-x86_64"
    if n.endswith(".appimage"):
        if "aarch64" in n or "arm64" in n:
            return "linux-aarch64"
        return "linux-x86_64"
    if n.endswith(".deb"):
        return "linux-x86_64" if "amd64" in n else None
    if n.endswith(".rpm"):
        return "linux-x86_64" if "x86_64" in n else None
    return None


def build_manifest(release: dict) -> dict:
    version = release["tag_name"].lstrip("v")
    notes = release.get("body", "") or ""
    platforms: dict[str, dict] = {}

    for asset in release.get("assets", []):
        key = platform_key(asset["name"])
        if key is None:
            continue
        url = asset["browser_download_url"]
        signature_url = f"{url}.sig"
        platforms[key] = {
            "url": url,
            "signature": signature_url,
        }

    return {
        "version": version,
        "notes": notes,
        "pub_date": release.get("published_at") or release.get("created_at"),
        "platforms": platforms,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/repo, e.g. remi-code/remi-code")
    parser.add_argument("--tag", required=True, help="release tag, e.g. v0.1.0")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()

    release = fetch_release(args.repo, args.tag)
    manifest = build_manifest(release)
    args.output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} for {args.tag} with {len(manifest['platforms'])} platforms.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

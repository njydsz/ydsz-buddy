// Wrap `rust,no_run` doctests in `#[tokio::main] async fn main() { ... }`.
// Handles doc comments with leading whitespace and both `//!` and `///` styles.
const fs = require("fs");
const path = require("path");

const ROOT = "d:\\Code\\remi\\org\\modules\\remi-code";

const CRATES = [
  "remi-workspace",
  "remi-auth",
  "remi-git",
  "remi-persistence",
  "remi-orchestration",
  "remi-server",
  "remi-cli",
  "remi-provider",
  "remi-core",
  "remi-config",
  "remi-checkpoint",
  "remi-telemetry",
  "remi-terminal",
];

// Matches the open fence `    /// ```rust,no_run` and captures the leading
// whitespace and the comment prefix.
const OPEN_RE = /^(\s*)(\/\/!|\/\/\/)\s*```rust,no_run\s*$/;
// Matches the close fence `    /// ```.
const CLOSE_RE = /^(\s*)(\/\/!|\/\/\/)\s*```\s*$/;

function findPrefix(line) {
  const m = line.match(OPEN_RE);
  if (!m) return null;
  return { indent: m[1], prefix: m[2] };
}

function isClose(line, indent, prefix) {
  const re = new RegExp("^" + indent.replace(/ /g, " ") + prefix.replace(/\//g, "\\/") + "\\s*```\\s*$");
  return re.test(line);
}

function isAlreadyWrapped(lines, start, indent, prefix) {
  for (let k = start + 1; k < Math.min(start + 4, lines.length); k++) {
    const stripped = lines[k].trim();
    if (stripped === "") continue;
    return stripped.includes("tokio::main");
  }
  return false;
}

function transform(content) {
  const lines = content.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = findPrefix(line);
    if (!open) {
      out.push(line);
      i++;
      continue;
    }
    if (isAlreadyWrapped(lines, i, open.indent, open.prefix)) {
      out.push(line);
      i++;
      continue;
    }
    const body = [];
    let j = i + 1;
    while (j < lines.length) {
      if (isClose(lines[j], open.indent, open.prefix)) break;
      body.push(lines[j]);
      j++;
    }
    if (j >= lines.length) {
      out.push(line);
      i++;
      continue;
    }
    const p = open.indent + open.prefix;
    out.push(line);
    out.push(p + " #[tokio::main]");
    out.push(p + " async fn main() {");
    for (const b of body) {
      if (b.trim() === "") {
        out.push(open.indent);
      } else {
        // Preserve the original leading whitespace after the doc prefix.
        const m = b.match(/^(\s*)(\/\/!|\/\/\/)\s?(.*)$/);
        if (m) {
          out.push(m[1] + m[2] + " " + m[3]);
        } else {
          out.push(b);
        }
      }
    }
    out.push(p + " }");
    i = j + 1;
  }
  return out.join("\n");
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.isFile() && p.endsWith(".rs")) {
      out.push(p);
    }
  }
  return out;
}

let patched = 0;
for (const crate of CRATES) {
  const src = path.join(ROOT, crate, "src");
  if (!fs.existsSync(src)) continue;
  for (const file of walk(src)) {
    const content = fs.readFileSync(file, "utf8");
    const newContent = transform(content);
    if (newContent !== content) {
      fs.writeFileSync(file, newContent, { encoding: "utf8" });
      console.log("patched " + file);
      patched++;
    }
  }
}
console.log("total: " + patched + " file(s) patched");

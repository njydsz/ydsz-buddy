/**
 * @file 文件扩展名到 Monaco 语言 ID 的映射
 * @description 覆盖 Monaco 内置语言 + 项目常用文件名（Dockerfile / Makefile 等）。
 */

const EXTENSION_MAP: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  rs: "rust",
  go: "go",
  py: "python",
  pyi: "python",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  scala: "scala",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  bat: "bat",
  cmd: "bat",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "html",
  svelte: "html",
  dockerfile: "dockerfile",
  makefile: "makefile",
  lua: "lua",
  r: "r",
  rkt: "scheme",
  clj: "clojure",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  fs: "fsharp",
  fsx: "fsharp",
  hs: "haskell",
  jl: "julia",
  ml: "ocaml",
  nim: "nim",
  pl: "perl",
  pm: "perl",
  dart: "dart",
  proto: "proto",
  tex: "latex",
  txt: "plaintext",
  log: "plaintext",
};

const FILENAME_MAP: Readonly<Record<string, string>> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  "CMakeLists.txt": "cmake",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".env": "ini",
  ".editorconfig": "ini",
  ".eslintrc": "json",
  ".prettierrc": "json",
  "tsconfig.json": "jsonc",
  "package.json": "json",
  "Cargo.toml": "ini",
  "Cargo.lock": "ini",
  "go.mod": "ini",
  "go.sum": "ini",
  "Gemfile": "ruby",
  "Rakefile": "ruby",
};

/**
 * 根据文件路径推断 Monaco 语言 ID。
 * @param filePath 文件绝对路径或相对路径
 * @returns Monaco 语言 ID（如 "typescript"）；未识别返回 "plaintext"
 */
export function detectLanguageId(filePath: string): string {
  const basename = filePath.split(/[\\/]/).pop() ?? "";
  if (FILENAME_MAP[basename]) return FILENAME_MAP[basename];

  const ext = basename.includes(".") ? basename.split(".").pop()!.toLowerCase() : "";
  return EXTENSION_MAP[ext] ?? "plaintext";
}

/**
 * 判断文件是否为二进制（粗略判断，基于扩展名）。
 */
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "tiff",
  "pdf",
  "zip",
  "gz",
  "tar",
  "rar",
  "7z",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "dat",
  "db",
  "sqlite",
  "class",
  "jar",
  "war",
  "wasm",
  "mp3",
  "mp4",
  "avi",
  "mov",
  "wav",
  "flac",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
]);

export function isBinaryFile(filePath: string): boolean {
  const basename = filePath.split(/[\\/]/).pop() ?? "";
  const ext = basename.includes(".") ? basename.split(".").pop()!.toLowerCase() : "";
  return BINARY_EXTENSIONS.has(ext);
}

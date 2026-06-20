/**
 * @file 文件图标解析模块
 * @description 基于 Seti UI 图标主题，通过 CDN（jsDelivr）解析文件/文件夹图标 URL。
 *              为编辑器、差异面板、时间线、侧边栏等组件提供统一的文件图标服务。
 *              依赖 jsDelivr 托管的 jesseweed/seti-ui 仓库提供 SVG 图标。
 */

/** Seti UI 图标仓库的 Git 分支 */
const SETI_ICONS_BRANCH = "master";
/** Seti UI 图标 CDN 基础 URL */
const SETI_ICONS_BASE_URL = `https://cdn.jsdelivr.net/gh/jesseweed/seti-ui@${SETI_ICONS_BRANCH}/icons`;

/** 默认文件图标名称 */
const DEFAULT_FILE_ICON = "default";
/** 默认文件夹图标名称 */
const DEFAULT_FOLDER_ICON = "folder";

/**
 * 文件名（不含路径）到 Seti 图标名称的映射（不区分大小写）
 * 当知名文件名有专属 Seti 图标时，在此添加映射
 */
const FILE_ICON_BY_BASENAME: Record<string, string> = {
  "package.json": "npm",
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  ".npmrc": "npm",
  ".npmignore": "npm",
  "yarn.lock": "yarn",
  ".yarnrc": "yarn",
  ".yarnrc.yml": "yarn",
  "pnpm-lock.yaml": "npm",
  "pnpm-workspace.yaml": "npm",
  "bun.lockb": "npm",
  "bun.lock": "npm",
  "bower.json": "bower",
  ".bowerrc": "bower",
  "gruntfile.js": "grunt",
  "gruntfile.ts": "grunt",
  "gulpfile.js": "gulp",
  "gulpfile.ts": "gulp",
  "webpack.config.js": "webpack",
  "webpack.config.ts": "webpack",
  "rollup.config.js": "rollup",
  "rollup.config.ts": "rollup",
  "rollup.config.mjs": "rollup",
  dockerfile: "docker",
  ".dockerignore": "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  "docker-compose.override.yml": "docker",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".gitkeep": "git",
  ".gitconfig": "git",
  ".eslintrc": "eslint",
  ".eslintrc.js": "eslint",
  ".eslintrc.cjs": "eslint",
  ".eslintrc.json": "eslint",
  ".eslintrc.yml": "eslint",
  ".eslintrc.yaml": "eslint",
  ".eslintignore": "eslint",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  "eslint.config.cjs": "eslint",
  "eslint.config.ts": "eslint",
  ".prettierrc": "prettier",
  ".prettierrc.json": "prettier",
  ".prettierrc.js": "prettier",
  ".prettierrc.cjs": "prettier",
  ".prettierrc.yml": "prettier",
  ".prettierrc.yaml": "prettier",
  ".prettierignore": "prettier",
  "prettier.config.js": "prettier",
  "prettier.config.mjs": "prettier",
  "prettier.config.cjs": "prettier",
  ".stylelintrc": "stylelint",
  ".stylelintrc.json": "stylelint",
  "stylelint.config.js": "stylelint",
  ".babelrc": "babel",
  ".babelrc.js": "babel",
  ".babelrc.json": "babel",
  "babel.config.js": "babel",
  "babel.config.json": "babel",
  "babel.config.ts": "babel",
  license: "license",
  "license.md": "license",
  "license.txt": "license",
  "readme.md": "markdown",
  "tsconfig.json": "typescript",
  "tsconfig.base.json": "typescript",
  "tsconfig.build.json": "typescript",
  "tsconfig.node.json": "typescript",
  "tsconfig.eslint.json": "typescript",
  "go.mod": "go",
  "go.sum": "go",
  "cargo.toml": "rust",
  "cargo.lock": "rust",
  "requirements.txt": "python",
  pipfile: "python",
  "pyproject.toml": "python",
  "setup.py": "python",
  "setup.cfg": "python",
  gemfile: "ruby",
  "gemfile.lock": "ruby",
  rakefile: "ruby",
  "package.swift": "swift",
  "pom.xml": "java",
  "build.gradle": "java",
  "build.gradle.kts": "kotlin",
  "settings.gradle": "java",
  "settings.gradle.kts": "kotlin",
  ".editorconfig": "settings",
  ".env": "settings",
  ".env.local": "settings",
  ".env.development": "settings",
  ".env.production": "settings",
  ".env.test": "settings",
  ".env.example": "settings",
  "firebase.json": "firebase",
  ".firebaserc": "firebase",
  procfile: "heroku",
};

/**
 * 文件扩展名到 Seti 图标名称的映射
 * 最长扩展名优先匹配，因为 extensionCandidates 先产出复合扩展名（如 `.d.ts` 先于 `.ts`）
 */
const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "react",
  "d.ts": "typescript",
  js: "javascript",
  jsx: "react",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  json5: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  mdc: "markdown",
  markdown: "markdown",
  yml: "yml",
  yaml: "yml",
  toml: "settings",
  ini: "settings",
  conf: "settings",
  cfg: "settings",
  env: "settings",
  html: "html",
  htm: "html",
  xhtml: "html",
  pug: "pug",
  jade: "pug",
  ejs: "ejs",
  twig: "twig",
  slim: "slim",
  mustache: "mustache",
  hbs: "mustache",
  handlebars: "mustache",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "less",
  styl: "stylus",
  stylus: "stylus",
  xml: "xml",
  svg: "svg",
  vue: "vue",
  svelte: "svelte",
  py: "python",
  pyc: "python",
  pyi: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  php: "php",
  phtml: "php",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  hpp: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "c-sharp",
  fs: "f-sharp",
  fsx: "f-sharp",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  scala: "scala",
  sbt: "scala",
  erl: "erlang",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  lhs: "haskell",
  lua: "lua",
  pl: "perl",
  pm: "perl",
  r: "r",
  ml: "ocaml",
  mli: "ocaml",
  elm: "elm",
  dart: "dart",
  jl: "julia",
  cr: "crystal",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  graphql: "graphql",
  gql: "graphql",
  tf: "terraform",
  tfvars: "terraform",
  hcl: "terraform",
  tex: "tex",
  bib: "tex",
  jinja: "jinja",
  jinja2: "jinja",
  dockerfile: "docker",
  lock: "lock",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  ico: "favicon",
  bmp: "image",
  tiff: "image",
  avif: "image",
};

/**
 * 文件夹名称到图标名称的映射
 * Seti 仅提供一个 folder.svg，无按名称区分的文件夹变体，
 * 此映射预留以便后续添加覆盖项而无需修改调用方
 */
const FOLDER_ICON_BY_BASENAME: Record<string, string> = {};

/**
 * 提取路径中的文件名部分（支持正斜杠和反斜杠）
 * @param pathValue - 文件路径
 * @returns 文件名（不含目录部分）
 */
export function basenameOfPath(pathValue: string): string {
  const slashIndex = Math.max(pathValue.lastIndexOf("/"), pathValue.lastIndexOf("\\"));
  if (slashIndex === -1) return pathValue;
  return pathValue.slice(slashIndex + 1);
}

/**
 * 判断路径是否看起来像已知文件类型
 * @param pathValue - 文件路径
 * @returns 是否匹配已知文件图标
 */
function pathLooksLikeKnownFile(pathValue: string): boolean {
  const basename = basenameOfPath(pathValue).toLowerCase();
  if (FILE_ICON_BY_BASENAME[basename]) {
    return true;
  }
  return extensionCandidates(basename).some((candidate) => FILE_ICON_BY_EXTENSION[candidate]);
}

/**
 * 根据路径推断条目类型（文件或目录）
 * 优先通过已知文件图标判断，其次通过文件名特征推断
 * @param pathValue - 文件/目录路径
 * @returns "file" 或 "directory"
 */
export function inferEntryKindFromPath(pathValue: string): "file" | "directory" {
  const base = basenameOfPath(pathValue);
  if (pathLooksLikeKnownFile(pathValue)) {
    return "file";
  }
  if (base.startsWith(".") && !base.slice(1).includes(".")) {
    return "directory";
  }
  if (base.includes(".")) {
    return "file";
  }
  return "directory";
}

/**
 * 生成文件名的所有扩展名候选（从最具体到最通用）
 * 例如 "file.d.ts" → ["d.ts", "ts"]，最长扩展名优先
 * @param fileName - 文件名
 * @returns 扩展名候选列表
 */
function extensionCandidates(fileName: string): string[] {
  const candidates: string[] = [];
  let dotIndex = fileName.indexOf(".");
  while (dotIndex !== -1 && dotIndex < fileName.length - 1) {
    const candidate = fileName.slice(dotIndex + 1);
    if (candidate.length > 0) candidates.push(candidate);
    dotIndex = fileName.indexOf(".", dotIndex + 1);
  }
  return candidates;
}

/**
 * 解析文件路径对应的 Seti 图标名称
 * 优先按文件名匹配，其次按扩展名匹配，最后使用默认图标
 * @param pathValue - 文件路径
 * @returns Seti 图标名称
 */
function resolveFileIconName(pathValue: string): string {
  const basename = basenameOfPath(pathValue).toLowerCase();
  const byName = FILE_ICON_BY_BASENAME[basename];
  if (byName) return byName;
  for (const candidate of extensionCandidates(basename)) {
    const byExt = FILE_ICON_BY_EXTENSION[candidate];
    if (byExt) return byExt;
  }
  return DEFAULT_FILE_ICON;
}

/**
 * 解析文件夹路径对应的 Seti 图标名称
 * @param pathValue - 文件夹路径
 * @returns Seti 图标名称，当前统一返回默认文件夹图标
 */
function resolveFolderIconName(pathValue: string): string {
  const basename = basenameOfPath(pathValue).toLowerCase();
  return FOLDER_ICON_BY_BASENAME[basename] ?? DEFAULT_FOLDER_ICON;
}

/**
 * 获取文件/文件夹图标的 CDN URL
 * Seti 渲染单一颜色变体，在亮色和暗色背景下均可读，因此忽略 theme 参数
 * @param pathValue - 文件/文件夹路径
 * @param kind - 条目类型，"file" 或 "directory"
 * @param _theme - 主题（保留参数，当前未使用）
 * @returns 图标 SVG 的 CDN URL
 */
export function getFileIconUrlForEntry(
  pathValue: string,
  kind: "file" | "directory",
  _theme: "light" | "dark",
): string {
  const iconName =
    kind === "directory" ? resolveFolderIconName(pathValue) : resolveFileIconName(pathValue);
  return `${SETI_ICONS_BASE_URL}/${iconName}.svg`;
}

// FILE: managedTerminalWrappers.ts
// Purpose: Create Superset-style managed command wrappers so terminal agent identity is canonical
// and survives zsh startup that rewrites PATH.

import fs from "node:fs";
import path from "node:path";

import {
  defaultTerminalTitleForCliKind,
  managedTerminalCommandNameForCliKind,
  REMI_CODE_TERMINAL_HOOK_OSC_PREFIX,
  REMI_CODE_TERMINAL_CLI_KIND_ENV_KEY,
  type TerminalAgentHookEventType,
  type TerminalCliKind,
} from "@remi-code/shared/terminalThreads";

export interface ManagedTerminalWrapperState {
  binDir: string | null;
  codexHomeDir: string | null;
  hookScriptPath: string | null;
  claudeSettingsPath: string | null;
  zshDir: string | null;
  targetPathByCliKind: Partial<Record<TerminalCliKind, string>>;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function envPathKeyFor(env: NodeJS.ProcessEnv): "PATH" | "Path" | "path" {
  if ("PATH" in env) return "PATH";
  if ("Path" in env) return "Path";
  return "path";
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableCandidates(commandName: string): string[] {
  if (process.platform !== "win32") {
    return [commandName];
  }

  const pathExt = process.env.PATHEXT?.split(";").filter(Boolean) ?? [".EXE", ".CMD", ".BAT"];
  const lowerCommandName = commandName.toLowerCase();
  const hasExtension = pathExt.some((extension) =>
    lowerCommandName.endsWith(extension.toLowerCase()),
  );
  return hasExtension ? [commandName] : pathExt.map((extension) => `${commandName}${extension}`);
}

function resolveExecutableOnPath(commandName: string, env: NodeJS.ProcessEnv): string | null {
  const envPathKey = envPathKeyFor(env);
  const envPath = env[envPathKey]?.trim();
  if (!envPath) {
    return null;
  }

  for (const entry of envPath.split(path.delimiter)) {
    const directory = entry.trim();
    if (!directory) {
      continue;
    }
    for (const candidateName of executableCandidates(commandName)) {
      const candidatePath = path.join(directory, candidateName);
      if (isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function buildHookOscSequence(eventType: TerminalAgentHookEventType): string {
  return `\\033]${REMI_CODE_TERMINAL_HOOK_OSC_PREFIX}${eventType}\\007`;
}

function buildNotifyHookScript(): string {
  return `#!/bin/sh
set -eu
if [ "$#" -gt 0 ]; then
  _remi-code_hook_input="$1"
else
  _remi-code_hook_input="$(cat)"
fi

_remi-code_extract_event() {
  printf '%s' "$_remi-code_hook_input" | sed -n "s/.*\\\"$1\\\"[[:space:]]*:[[:space:]]*\\\"\\([^\\\"]*\\)\\\".*/\\1/p" | head -n 1
}

_remi-code_event="$(_remi-code_extract_event hook_event_name)"
if [ -z "$_remi-code_event" ]; then
  _remi-code_type="$(_remi-code_extract_event type)"
  case "$_remi-code_type" in
    task_started|userPromptSubmitted|user_prompt_submit)
      _remi-code_event="Start"
      ;;
    task_complete|agent-turn-complete|stop|session_end|sessionEnd)
      _remi-code_event="Stop"
      ;;
    exec_approval_request|apply_patch_approval_request|request_user_input)
      _remi-code_event="PermissionRequest"
      ;;
  esac
fi

_remi-code_emit_osc() {
  _remi-code_sequence="$1"
  if [ -w /dev/tty ]; then
    printf '%b' "$_remi-code_sequence" > /dev/tty 2>/dev/null || printf '%b' "$_remi-code_sequence"
    return
  fi
  printf '%b' "$_remi-code_sequence"
}

case "$_remi-code_event" in
  UserPromptSubmit|PostToolUse|PostToolUseFailure|Start)
    _remi-code_emit_osc '${buildHookOscSequence("Start")}'
    ;;
  Stop)
    _remi-code_emit_osc '${buildHookOscSequence("Stop")}'
    ;;
  PermissionRequest|PreToolUse|Notification)
    _remi-code_emit_osc '${buildHookOscSequence("PermissionRequest")}'
    ;;
esac
`;
}

function buildClaudeSettingsJson(notifyHookPath: string): string {
  const command = notifyHookPath;
  return JSON.stringify(
    {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command }] }],
        Stop: [{ hooks: [{ type: "command", command }] }],
        PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command }] }],
        PostToolUseFailure: [{ matcher: "*", hooks: [{ type: "command", command }] }],
        PermissionRequest: [{ matcher: "*", hooks: [{ type: "command", command }] }],
        Notification: [{ matcher: "*", hooks: [{ type: "command", command }] }],
      },
    },
    null,
    2,
  );
}

function buildCodexHooksJson(notifyHookPath: string): string {
  const command = notifyHookPath;
  return JSON.stringify(
    {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command }] }],
        Stop: [{ hooks: [{ type: "command", command }] }],
      },
    },
    null,
    2,
  );
}

function buildCodexWrapperScript(input: {
  codexHomeDir: string;
  notifyHookPath: string;
  targetPath: string;
}): string {
  const { codexHomeDir, notifyHookPath, targetPath } = input;
  return [
    `export CODEX_HOME=${shellQuote(codexHomeDir)}`,
    `if [ -f ${shellQuote(notifyHookPath)} ]; then`,
    "  export CODEX_TUI_RECORD_SESSION=1",
    '  if [ -z "${CODEX_TUI_SESSION_LOG_PATH:-}" ]; then',
    '    _remi-code_codex_ts="$(date +%s 2>/dev/null || echo "$$")"',
    '    export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/remi-code-codex-session-$$_${_remi-code_codex_ts}.jsonl"',
    "  fi",
    "  (",
    '    _remi-code_log="$CODEX_TUI_SESSION_LOG_PATH"',
    `    _remi-code_notify=${shellQuote(notifyHookPath)}`,
    '    _remi-code_last_turn_id=""',
    '    _remi-code_last_approval_id=""',
    '    _remi-code_last_exec_call_id=""',
    "    _remi-code_approval_fallback_seq=0",
    "",
    "    _remi-code_emit_event() {",
    '      _remi-code_event="$1"',
    `      _remi-code_payload=$(printf '{"hook_event_name":"%s"}' "$_remi-code_event")`,
    '      "$_remi-code_notify" "$_remi-code_payload" >/dev/null 2>&1 || true',
    "    }",
    "",
    "    _remi-code_i=0",
    '    while [ ! -f "$_remi-code_log" ] && [ "$_remi-code_i" -lt 200 ]; do',
    "      _remi-code_i=$((_remi-code_i + 1))",
    "      sleep 0.05",
    "    done",
    '    if [ ! -f "$_remi-code_log" ]; then',
    "      exit 0",
    "    fi",
    "",
    '    tail -n 0 -F "$_remi-code_log" 2>/dev/null | while IFS= read -r _remi-code_line; do',
    '      case "$_remi-code_line" in',
    `        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"task_started"'*)`,
    `          _remi-code_turn_id=$(printf '%s\n' "$_remi-code_line" | awk -F'"turn_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')`,
    '          [ -n "$_remi-code_turn_id" ] || _remi-code_turn_id="task_started"',
    '          if [ "$_remi-code_turn_id" != "$_remi-code_last_turn_id" ]; then',
    '            _remi-code_last_turn_id="$_remi-code_turn_id"',
    '            _remi-code_emit_event "Start"',
    "          fi",
    "          ;;",
    `        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"'*'_approval_request"'*)`,
    `          _remi-code_approval_id=$(printf '%s\n' "$_remi-code_line" | awk -F'"id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')`,
    `          [ -n "$_remi-code_approval_id" ] || _remi-code_approval_id=$(printf '%s\n' "$_remi-code_line" | awk -F'"approval_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')`,
    `          [ -n "$_remi-code_approval_id" ] || _remi-code_approval_id=$(printf '%s\n' "$_remi-code_line" | awk -F'"call_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')`,
    '          if [ -z "$_remi-code_approval_id" ]; then',
    "            _remi-code_approval_fallback_seq=$((_remi-code_approval_fallback_seq + 1))",
    '            _remi-code_approval_id="approval_request_${_remi-code_approval_fallback_seq}"',
    "          fi",
    '          if [ "$_remi-code_approval_id" != "$_remi-code_last_approval_id" ]; then',
    '            _remi-code_last_approval_id="$_remi-code_approval_id"',
    '            _remi-code_emit_event "PermissionRequest"',
    "          fi",
    "          ;;",
    `        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"exec_command_begin"'*)`,
    `          _remi-code_exec_call_id=$(printf '%s\n' "$_remi-code_line" | awk -F'"call_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')`,
    '          if [ -n "$_remi-code_exec_call_id" ]; then',
    '            if [ "$_remi-code_exec_call_id" != "$_remi-code_last_exec_call_id" ]; then',
    '              _remi-code_last_exec_call_id="$_remi-code_exec_call_id"',
    '              _remi-code_emit_event "Start"',
    "            fi",
    "          else",
    '            _remi-code_emit_event "Start"',
    "          fi",
    "          ;;",
    "      esac",
    "    done",
    "  ) &",
    "  REMI_CODE_CODEX_START_WATCHER_PID=$!",
    "fi",
    `${shellQuote(targetPath)} --enable codex_hooks -c ${shellQuote(`notify=["bash",${JSON.stringify(notifyHookPath)}]`)} "$@"`,
    "_remi-code_status=$?",
    'if [ -n "${REMI_CODE_CODEX_START_WATCHER_PID:-}" ]; then',
    '  kill "$REMI_CODE_CODEX_START_WATCHER_PID" >/dev/null 2>&1 || true',
    '  wait "$REMI_CODE_CODEX_START_WATCHER_PID" 2>/dev/null || true',
    "fi",
    'exit "$_remi-code_status"',
  ].join("\n");
}

function buildWrapperScript(input: {
  claudeSettingsPath: string;
  cliKind: TerminalCliKind;
  codexHomeDir: string;
  notifyHookPath: string;
  targetPath: string;
}): string {
  const { claudeSettingsPath, cliKind, codexHomeDir, notifyHookPath, targetPath } = input;
  const commandName = managedTerminalCommandNameForCliKind(cliKind);
  const title = defaultTerminalTitleForCliKind(cliKind);
  const commandBody =
    cliKind === "claude"
      ? `exec ${shellQuote(targetPath)} --settings ${shellQuote(claudeSettingsPath)} "$@"`
      : buildCodexWrapperScript({ codexHomeDir, notifyHookPath, targetPath });
  return [
    "#!/bin/sh",
    `# Managed ${commandName} wrapper injected by remi-code terminal sessions.`,
    `printf '\\033]0;%s\\007' ${shellQuote(title)}`,
    `export ${REMI_CODE_TERMINAL_CLI_KIND_ENV_KEY}=${shellQuote(cliKind)}`,
    commandBody,
    "",
  ].join("\n");
}

function writeFileIfChanged(filePath: string, content: string, mode: number): void {
  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (currentContent !== content) {
    fs.writeFileSync(filePath, content, { mode });
  }
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best effort.
  }
}

function buildManagedZshRc(quotedZshDir: string): string {
  return `# Remi Code zsh rc wrapper
_remi-code_home="\${REMI_CODE_ORIGINAL_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_remi-code_home"
[[ -f "$_remi-code_home/.zshrc" ]] && source "$_remi-code_home/.zshrc"
export ZDOTDIR=${quotedZshDir}
if [ -n "\${REMI_CODE_MANAGED_BIN_DIR:-}" ] && [ -d "\${REMI_CODE_MANAGED_BIN_DIR}" ]; then
  case ":$PATH:" in
    *:\${REMI_CODE_MANAGED_BIN_DIR}:*) ;;
    *) export PATH="\${REMI_CODE_MANAGED_BIN_DIR}:$PATH" ;;
  esac
  unalias claude 2>/dev/null || true
  claude() {
    if [ -x "\${REMI_CODE_MANAGED_BIN_DIR}/claude" ] && [ ! -d "\${REMI_CODE_MANAGED_BIN_DIR}/claude" ]; then
      "\${REMI_CODE_MANAGED_BIN_DIR}/claude" "$@"
    else
      command claude "$@"
    fi
  }
  unalias codex 2>/dev/null || true
  codex() {
    if [ -x "\${REMI_CODE_MANAGED_BIN_DIR}/codex" ] && [ ! -d "\${REMI_CODE_MANAGED_BIN_DIR}/codex" ]; then
      "\${REMI_CODE_MANAGED_BIN_DIR}/codex" "$@"
    else
      command codex "$@"
    fi
  }
  typeset -ga precmd_functions 2>/dev/null || true
  _remi-code_ensure_managed_bin() {
    case ":$PATH:" in
      *:\${REMI_CODE_MANAGED_BIN_DIR}:*) ;;
      *) PATH="\${REMI_CODE_MANAGED_BIN_DIR}:$PATH" ;;
    esac
  }
  {
    precmd_functions=(\${precmd_functions:#_remi-code_ensure_managed_bin} _remi-code_ensure_managed_bin)
  } 2>/dev/null || true
fi
`;
}

function ensureManagedZshWrappers(zshDir: string): void {
  fs.mkdirSync(zshDir, { recursive: true });
  const quotedZshDir = shellQuote(zshDir);
  writeFileIfChanged(
    path.join(zshDir, ".zshenv"),
    `# Remi Code zsh env wrapper
_remi-code_home="\${REMI_CODE_ORIGINAL_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_remi-code_home"
[[ -f "$_remi-code_home/.zshenv" ]] && source "$_remi-code_home/.zshenv"
export ZDOTDIR=${quotedZshDir}
`,
    0o644,
  );
  writeFileIfChanged(
    path.join(zshDir, ".zprofile"),
    `# Remi Code zsh profile wrapper
_remi-code_home="\${REMI_CODE_ORIGINAL_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_remi-code_home"
[[ -f "$_remi-code_home/.zprofile" ]] && source "$_remi-code_home/.zprofile"
export ZDOTDIR=${quotedZshDir}
`,
    0o644,
  );
  writeFileIfChanged(path.join(zshDir, ".zshrc"), buildManagedZshRc(quotedZshDir), 0o644);
}

export function prepareManagedTerminalWrappers(options: {
  baseEnv: NodeJS.ProcessEnv;
  rootDir: string;
  zshRootDir: string;
}): ManagedTerminalWrapperState {
  if (process.platform === "win32") {
    return {
      binDir: null,
      codexHomeDir: null,
      hookScriptPath: null,
      claudeSettingsPath: null,
      zshDir: null,
      targetPathByCliKind: {},
    };
  }

  const targetPathByCliKind: Partial<Record<TerminalCliKind, string>> = {};
  for (const cliKind of ["codex", "claude"] as const) {
    const commandName = managedTerminalCommandNameForCliKind(cliKind);
    const targetPath = resolveExecutableOnPath(commandName, options.baseEnv);
    if (!targetPath) {
      continue;
    }
    targetPathByCliKind[cliKind] = targetPath;
  }

  if (Object.keys(targetPathByCliKind).length === 0) {
    return {
      binDir: null,
      codexHomeDir: null,
      hookScriptPath: null,
      claudeSettingsPath: null,
      zshDir: null,
      targetPathByCliKind,
    };
  }

  fs.mkdirSync(options.rootDir, { recursive: true });
  const codexHomeDir = path.join(options.rootDir, "codex-home");
  const hookScriptPath = path.join(options.rootDir, "notify-hook.sh");
  const claudeSettingsPath = path.join(options.rootDir, "claude-settings.json");
  fs.mkdirSync(codexHomeDir, { recursive: true });
  writeFileIfChanged(hookScriptPath, buildNotifyHookScript(), 0o755);
  writeFileIfChanged(claudeSettingsPath, buildClaudeSettingsJson(hookScriptPath), 0o644);
  writeFileIfChanged(
    path.join(codexHomeDir, "hooks.json"),
    buildCodexHooksJson(hookScriptPath),
    0o644,
  );
  for (const [cliKind, targetPath] of Object.entries(targetPathByCliKind) as Array<
    [TerminalCliKind, string]
  >) {
    const wrapperPath = path.join(options.rootDir, managedTerminalCommandNameForCliKind(cliKind));
    writeFileIfChanged(
      wrapperPath,
      buildWrapperScript({
        claudeSettingsPath,
        cliKind,
        codexHomeDir,
        notifyHookPath: hookScriptPath,
        targetPath,
      }),
      0o755,
    );
  }
  ensureManagedZshWrappers(options.zshRootDir);

  return {
    binDir: options.rootDir,
    codexHomeDir,
    hookScriptPath,
    claudeSettingsPath,
    zshDir: options.zshRootDir,
    targetPathByCliKind,
  };
}

function applyManagedTerminalWrapperEnvState(
  env: NodeJS.ProcessEnv,
  wrapperState: {
    binDir: string | null;
    zshDir: string | null;
  },
): NodeJS.ProcessEnv {
  if (!wrapperState.binDir) {
    return env;
  }

  const envPathKey = envPathKeyFor(env);
  const currentPath = env[envPathKey]?.trim() ?? "";
  const currentEntries = currentPath
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!currentEntries.includes(wrapperState.binDir)) {
    currentEntries.unshift(wrapperState.binDir);
  }

  return {
    ...env,
    REMI_CODE_MANAGED_BIN_DIR: wrapperState.binDir,
    REMI_CODE_ORIGINAL_ZDOTDIR: env.ZDOTDIR ?? env.HOME ?? "",
    ...(wrapperState.zshDir ? { ZDOTDIR: wrapperState.zshDir } : {}),
    [envPathKey]: currentEntries.join(path.delimiter),
  };
}

export function applyManagedTerminalAgentWrapperEnv(
  env: NodeJS.ProcessEnv,
  wrapperState: {
    binDir: string | null;
    zshDir: string | null;
  },
): NodeJS.ProcessEnv {
  return applyManagedTerminalWrapperEnvState(env, wrapperState);
}

export function prepareManagedTerminalAgentWrappers(options: {
  baseEnv: NodeJS.ProcessEnv;
  targetDir: string;
  zshDir: string;
}): ManagedTerminalWrapperState {
  return prepareManagedTerminalWrappers({
    baseEnv: options.baseEnv,
    rootDir: options.targetDir,
    zshRootDir: options.zshDir,
  });
}

export function prependManagedTerminalAgentWrapperPath(
  env: NodeJS.ProcessEnv,
  managedWrapperState: {
    binDir: string | null;
    zshDir: string | null;
  },
): NodeJS.ProcessEnv {
  return applyManagedTerminalWrapperEnvState(env, managedWrapperState);
}

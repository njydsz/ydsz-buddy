// Auth panel. Generates a pairing code on the server, copies it to
// the clipboard, and caches the device's `clientId`/`sessionToken`
// locally so subsequent launches can do a "silent" bootstrap.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { rpc, type AuthPairingInfo } from "@/lib/rpc";
import { useSettingsStore } from "@/store/settings";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";

const STORAGE_KEY = "remi:auth:v1";

interface AuthStorage {
  clientId?: string;
  sessionToken?: string;
  expiresAt?: string;
}

function readAuthStorage(): AuthStorage {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AuthStorage;
  } catch {
    return {};
  }
}

function writeAuthStorage(value: AuthStorage) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function clearAuthStorage() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthPanel() {
  const t = useT();
  const setAuth = useSettingsStore((s) => s.setAuth);
  const setLastPairingCode = useSettingsStore((s) => s.setLastPairingCode);
  const auth = useSettingsStore((s) => s.auth);
  const lastPairingCode = useSettingsStore((s) => s.lastPairingCode);
  const [stored, setStored] = useState<AuthStorage>(() => readAuthStorage());

  // Pull the authoritative bootstrap state from the server.
  const bootstrapQuery = useMutation({
    mutationFn: () => rpc.authBootstrap(),
    onSuccess: (state) => {
      setAuth(state);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn("authBootstrap failed", { error: msg });
    },
  });

  useEffect(() => {
    bootstrapQuery.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pairMutation = useMutation({
    mutationFn: (deviceName: string) =>
      rpc.authCreatePairingCredential(deviceName),
    onSuccess: (info: AuthPairingInfo) => {
      setLastPairingCode(info.pairingCode);
      navigator.clipboard
        ?.writeText(info.pairingCode)
        .catch(() => undefined);
      toast.success(t("auth.pairingCodeCopied"), { source: "auth" });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { source: "auth" });
    },
  });

  const onPair = (label: string) => {
    if (!label) {
      toast.warning(t("auth.deviceNameRequired"), { source: "auth" });
      return;
    }
    pairMutation.mutate(label);
  };

  const onSignOut = () => {
    clearAuthStorage();
    setStored({});
    setAuth(null);
    setLastPairingCode(null);
    toast.info(t("auth.signedOut"), { source: "auth" });
  };

  const needsPairing = auth?.needsPairing ?? true;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("auth.intro")}</p>
      <div
        className={
          needsPairing
            ? "rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            : "rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
        }
      >
        {needsPairing ? t("auth.statusPairing") : t("auth.statusActive")}
      </div>

      {needsPairing ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-card/40 p-3">
          <div className="text-sm font-medium text-foreground">
            {t("auth.generate")}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("auth.generateHint")}</p>
          <div className="flex gap-2">
            <input
              id="auth-device-name"
              type="text"
              defaultValue="remi-desktop"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              className="rounded-md border border-primary bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
              onClick={() => {
                const el = document.getElementById(
                  "auth-device-name",
                ) as HTMLInputElement | null;
                onPair(el?.value ?? "");
              }}
              disabled={pairMutation.isPending}
            >
              {pairMutation.isPending
                ? t("auth.generating")
                : t("auth.generateCta")}
            </button>
          </div>
          {lastPairingCode ? (
            <div className="mt-2 rounded bg-background/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("auth.codeLabel")}
              </div>
              <code className="font-mono text-base text-foreground">
                {lastPairingCode}
              </code>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border/60 bg-card/40 p-3">
          <div className="text-sm font-medium text-foreground">
            {t("auth.activeSession")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {stored.expiresAt
              ? t("auth.expiresAt", { time: new Date(stored.expiresAt).toLocaleString() })
              : t("auth.expiresUnknown")}
          </div>
          <button
            type="button"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20"
            onClick={onSignOut}
          >
            {t("auth.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

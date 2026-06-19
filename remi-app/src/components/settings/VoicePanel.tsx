// Voice panel. Configures the speech-to-text pipeline. Surfaces a
// device picker (when running under Tauri + a media devices API) and
// a model selector. The actual recording UI lives in
// `ComposerPromptEditor`; this panel is the configuration surface.

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";

interface MediaDeviceLite {
  deviceId: string;
  label: string;
}

const SUPPORTED_LANGS: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
];

export function VoicePanel() {
  const t = useT();
  const voice = useSettingsStore((s) => s.voice);
  const setVoice = useSettingsStore((s) => s.setVoice);
  const [devices, setDevices] = useState<MediaDeviceLite[]>([]);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "unsupported">(
    "unknown",
  );

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.enumerateDevices
    ) {
      setPermission("unsupported");
      return;
    }
    void navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        const filtered = list
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }));
        setDevices(filtered);
        setPermission("granted");
      })
      .catch(() => {
        setPermission("denied");
      });
  }, []);

  const onEnable = async () => {
    if (!voice.enabled) {
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        }
        setPermission("granted");
      } catch {
        setPermission("denied");
        toast.warning(t("settings.voice.micDenied"), { source: "settings" });
        return;
      }
    }
    setVoice({ enabled: !voice.enabled });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("settings.voice.intro")}</p>

      <div className="rounded-md border border-border/60 bg-card/40 p-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={voice.enabled}
            onChange={onEnable}
          />
          {t("settings.voice.enable")}
        </label>
        {permission === "denied" ? (
          <div className="mt-2 text-[11px] text-amber-300">
            {t("settings.voice.micDenied")}
          </div>
        ) : null}
        {permission === "unsupported" ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {t("settings.voice.unsupported")}
          </div>
        ) : null}
      </div>

      <label className="block text-[11px] text-muted-foreground">
        {t("settings.voice.language")}
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={voice.language}
          onChange={(e) => setVoice({ language: e.target.value })}
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        {t("settings.voice.device")}
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={voice.deviceId ?? ""}
          onChange={(e) => setVoice({ deviceId: e.target.value || undefined })}
          disabled={devices.length === 0}
        >
          <option value="">{t("settings.voice.deviceDefault")}</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        {t("settings.voice.model")}
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={voice.model ?? "whisper-1"}
          onChange={(e) => setVoice({ model: e.target.value })}
        >
          <option value="whisper-1">whisper-1</option>
          <option value="whisper-large-v3">whisper-large-v3</option>
          <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
        </select>
      </label>
    </div>
  );
}

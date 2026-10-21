import { bridgeAgentHeaders, request } from "../request";

export interface YdszTimezoneSettings {
  timezone: string;
}

export interface YdszUploadSettings {
  max_upload_mb: number;
  max_upload_bytes: number;
}

export interface YdszHitlSettings {
  enabled: boolean;
  tool_guard_require_approval: boolean;
  show_approval_ui: boolean;
}

export interface YdszCapabilitiesSettings {
  mobile: { enabled: boolean; backend: string };
}

export interface CaptchaPairView {
  site_key: string;
  has_secret: boolean;
  cam_secret_id?: string;
  has_cam_secret?: boolean;
}

export interface CaptchaSettings {
  active: string;
  available: string[];
  providers: Record<string, CaptchaPairView>;
  source: "settings" | "env";
  v3_min_score: number;
}

export type CaptchaPairBody = {
  site_key?: string;
  secret?: string;
  cam_secret_id?: string;
  cam_secret?: string;
} | null;

export interface CaptchaSettingsPut {
  active?: string;
  providers?: Record<string, CaptchaPairBody>;
}

export const ydszSettingsApi = {
  timezone: () => request<YdszTimezoneSettings>("/settings/timezone"),
  upload: () => request<YdszUploadSettings>("/settings/upload"),
  hitl: (agentId?: string | null) =>
    request<YdszHitlSettings>("/settings/hitl", {
      headers: bridgeAgentHeaders(agentId),
    }),
  capabilities: () =>
    request<YdszCapabilitiesSettings>("/settings/capabilities", {
      cache: "no-store",
    }),
  captcha: () => request<CaptchaSettings>("/settings/captcha"),
  putCaptcha: (body: CaptchaSettingsPut) =>
    request<CaptchaSettings>("/settings/captcha", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

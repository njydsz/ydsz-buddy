import { request } from "../request";
import type {
  YdszCronRow,
  YdszCronCreateBody,
  YdszCronPatchBody,
} from "../types";

export interface YdszCronSettings {
  timezone: string;
}

export interface CronTaskExamples {
  zh?: string[];
  en?: string[];
}

export const ydszCronApi = {
  settings: () => request<YdszCronSettings>("/cron/settings"),

  list: (agentId: string) => request<YdszCronRow[]>(`/agents/${agentId}/cron`),

  create: (agentId: string, body: YdszCronCreateBody) =>
    request<YdszCronRow>(`/agents/${agentId}/cron`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  get: (agentId: string, cronId: string) =>
    request<YdszCronRow>(`/agents/${agentId}/cron/${cronId}`),

  patch: (agentId: string, cronId: string, body: YdszCronPatchBody) =>
    request<YdszCronRow>(`/agents/${agentId}/cron/${cronId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (agentId: string, cronId: string) =>
    request<void>(`/agents/${agentId}/cron/${cronId}`, { method: "DELETE" }),

  runNow: (agentId: string, cronId: string) =>
    request<void>(`/agents/${agentId}/cron/${cronId}/run-now`, {
      method: "POST",
    }),
};

/** @deprecated Use ydszCronApi instead. */
export { ydszCronApi as octopCronApi };

// FILE: ModelChannelPicker.tsx
// Purpose: Renders a service-channel (model-gateway) list inside the provider
//          picker so users can toggle third-party API channels on/off.
// Layer: Chat composer presentation

import { memo, useCallback, useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import {
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "../ui/menu";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import * as Schema from "effect/Schema";
import { ChevronRightIcon } from "~/lib/icons";

// ------------------------------------------------------------------
// Data model
// ------------------------------------------------------------------

export type ModelChannelId =
  | "deepseek"
  | "siliconflow"
  | "volcano"
  | "tongyi"
  | "kimi"
  | "minimax";

export type ModelChannel = {
  readonly id: ModelChannelId;
  readonly name: string;
  readonly nameEn: string;
  readonly subtitle: string;
  readonly subtitleEn: string;
  readonly icon: React.ReactNode;
  readonly balance?: string;
};

const ChannelSlugs = Schema.Array(Schema.String);

const CHANNELS: ReadonlyArray<ModelChannel> = [
  {
    id: "deepseek",
    name: "DeepSeek",
    nameEn: "DeepSeek",
    subtitle: "æ·±åº¦æ±‚ç´??Â· DeepSeek",
    subtitleEn: "DeepSeek",
    balance: "Â¥177.52",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#4D6BFA" />
        <path d="M7 12L12 7L17 12L12 17L7 12Z" fill="white" />
      </svg>
    ),
  },
  {
    id: "siliconflow",
    name: "ç¡…åŸºæµåŠ??",
    nameEn: "SiliconFlow",
    subtitle: "ç¡…åŸºæµåŠ??Â· SiliconFlow",
    subtitleEn: "SiliconFlow",
    balance: "Â¥110.87",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#6366F1" />
        <rect x="6" y="10" width="12" height="4" rx="2" fill="white" />
      </svg>
    ),
  },
  {
    id: "volcano",
    name: "ç«å±±æ–¹èˆ??",
    nameEn: "Volcano Ark",
    subtitle: "å­—èŠ‚è·³åŠ??Â· ç«å±±æ–¹èˆ??",
    subtitleEn: "ByteDance Volcano Ark",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#3B82F6" />
        <path d="M12 6L18 18H6L12 6Z" fill="white" />
      </svg>
    ),
  },
  {
    id: "tongyi",
    name: "é€šä¹‰åƒé—??",
    nameEn: "Tongyi Qianwen",
    subtitle: "é˜é‡Œï??Â· ç™¾ç‚¼å¹³å??",
    subtitleEn: "Alibaba Cloud BaiLian",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#F97316" />
        <circle cx="12" cy="12" r="5" fill="white" />
      </svg>
    ),
  },
  {
    id: "kimi",
    name: "Kimi",
    nameEn: "Kimi",
    subtitle: "æœˆä¹‹æš—é??Â· Kimi",
    subtitleEn: "Moonshot AI",
    balance: "Â¥13.96",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#1F2937" />
        <circle cx="12" cy="12" r="4" fill="white" />
      </svg>
    ),
  },
  {
    id: "minimax",
    name: "MiniMax",
    nameEn: "MiniMax",
    subtitle: "MiniMax Â· æµ·èžº AI",
    subtitleEn: "MiniMax HaiLuo AI",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#10B981" />
        <path d="M7 14C7 10 9 8 12 8C15 8 17 10 17 14" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function ChannelToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!enabled);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "relative ms-auto inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        enabled ? "bg-[hsl(var(--primary))]" : "bg-muted-foreground/25"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-[13px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}

function ChannelListItem({
  channel,
  enabled,
  onToggle,
}: {
  channel: ModelChannel;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-2 transition-colors",
        "hover:bg-(--color-background-elevated-secondary)"
      )}
    >
      {channel.icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-sm font-medium">
          {channel.name}
          {channel.balance ? (
            <span className="text-xs font-normal text-emerald-500">
              ä½™é¢??{channel.balance}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">{channel.subtitle}</span>
      </div>
      <ChannelToggle enabled={enabled} onChange={onToggle} />
    </div>
  );
}

// ------------------------------------------------------------------
// Main exported component (inline section for the model-picker popup)
// ------------------------------------------------------------------

export const ModelChannelSection = memo(function ModelChannelSection() {
  const [enabledIds, setEnabledIds] = useLocalStorage(
    "remi-claw:enabled-model-channels:v1",
    ["deepseek", "siliconflow", "volcano", "tongyi", "kimi", "minimax"],
    ChannelSlugs
  );

  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);

  const toggleChannel = useCallback(
    (id: ModelChannelId) => {
      setEnabledIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return Array.from(next);
      });
    },
    [setEnabledIds]
  );

  const enabledCount = enabledSet.size;
  const totalCount = CHANNELS.length;

  return (
    <>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel className="flex items-center justify-between px-2 py-1.5">
          <span className="font-medium text-muted-foreground text-xs">
            æœåŠ¡æ¸ é???          </span>
          <span className="text-[11px] text-muted-foreground/70">
            ({enabledCount}/{totalCount} å·²å¯ï½?
          </span>
        </MenuGroupLabel>
        <div className="space-y-0.5 px-1 py-1">
          {CHANNELS.map((channel) => (
            <ChannelListItem
              key={channel.id}
              channel={channel}
              enabled={enabledSet.has(channel.id)}
              onToggle={() => toggleChannel(channel.id)}
            />
          ))}
        </div>
      </MenuGroup>
    </>
  );
});

// ------------------------------------------------------------------
// Stand-alone picker (if we ever want a separate trigger/button)
// ------------------------------------------------------------------

export const ModelChannelPicker = memo(function ModelChannelPicker({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange]
  );

  const [enabledIds] = useLocalStorage(
    "remi-claw:enabled-model-channels:v1",
    ["deepseek", "siliconflow", "volcano", "tongyi", "kimi", "minimax"],
    ChannelSlugs
  );

  return (
    <MenuSub open={isOpen} onOpenChange={setIsOpen}>
      <MenuSubTrigger
        className="flex items-center gap-2 px-2 py-1.5 text-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground/60 transition-transform",
            isOpen && "rotate-90"
          )}
        />
        <span className="flex-1">æœåŠ¡æ¸ é</span>
        <span className="text-[11px] text-muted-foreground/70">
          ({enabledIds.length}/{CHANNELS.length} å·²å¯ï½?
        </span>
      </MenuSubTrigger>
      <MenuSubPopup className="[--available-height:min(24rem,70vh)] w-72">
        <ModelChannelSection />
      </MenuSubPopup>
    </MenuSub>
  );
});

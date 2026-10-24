/**
 * Models — admin-only provider management page.
 *
 * Admins can create, edit, enable/disable, test, and delete providers.
 * All providers are globally available to every agent.
 *
 * Layout:
 *  1. Preset providers (from /providers/presets) — shows configured ones via
 *     ProviderCard, unconfigured ones as "click to set up" cards.
 *  2. Custom providers — any configured provider whose name doesn't match a preset.
 */
import { useMemo, useState } from "react";
import { Button, Empty, Typography } from "antd";
import {
  Cloud,
  HardDrive,
  Images,
  MessageSquareText,
  Mic2,
  Plus,
  RefreshCw,
  Scale,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import PageShell from "../../../layouts/PageShell";
import TabBar, { type TabBarItem } from "../../../components/TabLabel/TabBar";
import StreamSetupGuide from "../../../components/StreamSetupGuide/StreamSetupGuide";
import { YdEmptyMascot } from "../../../components/EmptyState/YdEmptyMascot";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { userCan } from "../../../utils/permissions";
import { useProviders, type ProviderRow } from "./useProviders";
import { useSettingsHeader } from "../../../layouts/SettingsWindow/SettingsHeaderContext";
import {
  groupPresets,
  isLocalPreset,
  isPresetProvider,
  partitionCloudPresets,
} from "./presetUtils";
import type { PresetGroup } from "./presetUtils";
import type { ProviderPreset } from "./useProviders";
import {
  CustomProviderModal,
  ActiveModelPool,
  LoadingState,
  PresetGroupCard,
  PresetProviderCard,
  ProviderCard,
} from "./components";
import styles from "./index.module.less";
import { MediaGenerationSettingsPanel } from "../MediaGeneration";
import { VoiceSettingsPanel } from "../Voice";
import { SearchSettingsPanel } from "../SearchConfig";
import { DecisionSettingsPanel } from "./components/DecisionSettingsPanel";

type ModelCategory = "chat" | "generation" | "voice" | "search" | "decision";

function resolveModelCategory(
  requestedTab: string | null,
  canChat: boolean,
  canProviders: boolean,
  canVoice: boolean,
  canSearch: boolean,
): ModelCategory {
  if (requestedTab === "generation" && canProviders) return "generation";
  if (requestedTab === "decision" && canProviders) return "decision";
  if (requestedTab === "voice" && canVoice) return "voice";
  if (requestedTab === "search" && canSearch) return "search";
  if ((requestedTab === "chat" || requestedTab === null) && canChat) {
    return "chat";
  }
  if (canChat) return "chat";
  if (canVoice) return "voice";
  if (canSearch) return "search";
  if (canProviders) return "generation";
  return "chat";
}

const { Title } = Typography;

const MODEL_TABS: TabBarItem<ModelCategory>[] = [
  { key: "chat", labelKey: "models.chatModelsTab", icon: MessageSquareText },
  { key: "generation", labelKey: "models.generationModelsTab", icon: Images },
  { key: "voice", labelKey: "models.voiceModelsTab", icon: Mic2 },
  { key: "decision", labelKey: "models.decisionModelsTab", icon: Scale },
  { key: "search", labelKey: "models.searchModelsTab", icon: Search },
];

const PRESET_TABS: TabBarItem<"cloud" | "local">[] = [
  { key: "cloud", labelKey: "models.presetCloud", icon: Cloud },
  { key: "local", labelKey: "models.presetLocal", icon: HardDrive },
];

export default function ModelsPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const canProviders = userCan(user, "providers");
  const canOllama = userCan(user, "ollama_models");
  const canOnnx = userCan(user, "onnx_models");
  const canVoice = userCan(user, "voice");
  const canSearch = userCan(user, "search");
  const canChat = canProviders || canOllama || canOnnx;
  const {
    providers,
    presets,
    resolvedModels,
    activeModel,
    modelReasoning,
    loading,
    error,
    fetchAll,
  } = useProviders();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const modelCategory = resolveModelCategory(
    searchParams.get("tab"),
    canChat,
    canProviders,
    canVoice,
    canSearch,
  );
  const setModelCategory = (next: string) => {
    const updated = new URLSearchParams(searchParams);
    if (
      next === "generation" ||
      next === "voice" ||
      next === "search" ||
      next === "decision"
    ) {
      updated.set("tab", next);
    } else updated.delete("tab");
    setSearchParams(updated, { replace: true });
  };

  /*
   * When rendered inside a SettingsWindow, lift the page title/subtitle/
   * actions up into the window chrome (A区域). PageShell then renders its
   * own title row empty to avoid duplication. Outside SettingsWindow
   * (route /admin/models) PageShell retains its title row as-is.
   */
  const standaloneTitle = t("pageShell.models.title");
  const standaloneSubtitle = t("pageShell.models.subtitle");
  const standaloneActions =
    modelCategory === "chat" ? (
      <Button icon={<RefreshCw size={14} />} onClick={() => void fetchAll()}>
        {t("common.refresh")}
      </Button>
    ) : null;
  const inSettings = useSettingsHeader(
    {
      title: standaloneTitle,
      subtitle: standaloneSubtitle,
      actions: standaloneActions,
    },
    [modelCategory, standaloneTitle],
  );

  const {
    featured: cloudFeatured,
    more: cloudMore,
    moreCount: moreProvidersCount,
  } = useMemo(
    () =>
      partitionCloudPresets(
        presets.filter((p) => !isLocalPreset(p)),
        providers,
      ),
    [presets, providers],
  );
  const localPresets = useMemo(
    () =>
      groupPresets(
        presets.filter((p) => {
          if (!isLocalPreset(p)) return false;
          if (p.id === "onnx") return canOnnx;
          if (p.id === "ollama") return canOllama;
          return canOllama || canOnnx;
        }),
      ),
    [presets, canOllama, canOnnx],
  );
  const showCloudTab = canProviders;
  const showLocalTab =
    (canOllama || canOnnx) &&
    (localPresets.grouped.length > 0 || localPresets.ungrouped.length > 0);
  const showPresetSection = showCloudTab || showLocalTab;
  const [presetTab, setPresetTab] = useState<"cloud" | "local">(
    showCloudTab ? "cloud" : "local",
  );

  const renderPresetCards = (
    grouped: PresetGroup[],
    singles: ProviderPreset[],
  ) => (
    <>
      {grouped.map((group) => (
        <PresetGroupCard
          key={group.groupKey}
          group={group}
          providers={providers}
          onSaved={fetchAll}
          isHover={hoveredCard === `group-${group.groupKey}`}
          onMouseEnter={() => setHoveredCard(`group-${group.groupKey}`)}
          onMouseLeave={() => setHoveredCard(null)}
        />
      ))}
      {singles.map((preset) => (
        <PresetProviderCard
          key={preset.id}
          preset={preset}
          providers={providers}
          onSaved={fetchAll}
          isHover={hoveredCard === `preset-${preset.id}`}
          onMouseEnter={() => setHoveredCard(`preset-${preset.id}`)}
          onMouseLeave={() => setHoveredCard(null)}
        />
      ))}
    </>
  );

  const renderPresetGrid = (
    grouped: PresetGroup[],
    singles: ProviderPreset[],
  ) => {
    if (grouped.length === 0 && singles.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("models.noPresetProvidersInTab")}
        />
      );
    }
    return (
      <div className={styles.providerCards}>
        {renderPresetCards(grouped, singles)}
      </div>
    );
  };

  const renderCloudPresetGrid = () => {
    const hasFeatured =
      cloudFeatured.grouped.length > 0 || cloudFeatured.ungrouped.length > 0;
    const hasMore = moreProvidersCount > 0;
    if (!hasFeatured && !hasMore) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("models.noPresetProvidersInTab")}
        />
      );
    }
    return (
      <>
        {(hasFeatured || showMoreProviders) && (
          <div className={styles.providerCards}>
            {renderPresetCards(cloudFeatured.grouped, cloudFeatured.ungrouped)}
            {showMoreProviders &&
              renderPresetCards(cloudMore.grouped, cloudMore.ungrouped)}
          </div>
        )}
        {hasMore && (
          <Button
            type="link"
            size="small"
            className={styles.showMoreProvidersBtn}
            onClick={() => setShowMoreProviders((v) => !v)}
          >
            {showMoreProviders
              ? t("models.hideMoreProviders")
              : t("models.showMoreProviders", { count: moreProvidersCount })}
          </Button>
        )}
      </>
    );
  };

  // Custom providers: configured rows not already shown under a preset card
  const customProviders = useMemo<ProviderRow[]>(() => {
    return providers
      .filter((p) => !isPresetProvider(p, presets))
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.id - b.id;
      });
  }, [providers, presets]);

  const hasContent = presets.length > 0 || providers.length > 0;

  const visibleModelTabs = MODEL_TABS.filter((tab) => {
    if (tab.key === "chat") return canChat;
    if (tab.key === "generation") return canProviders;
    if (tab.key === "voice") return canVoice;
    if (tab.key === "decision") return canProviders;
    if (tab.key === "search") return canSearch;
    return false;
  });

  return (
    <PageShell.Tabbed
      title={standaloneTitle}
      subtitle={standaloneSubtitle}
      actions={standaloneActions}
      hideTitle={inSettings}
      tabBar={
        <TabBar<ModelCategory>
          tabs={visibleModelTabs}
          activeKey={modelCategory}
          onChange={(key) => setModelCategory(key)}
        />
      }
    >
      {modelCategory === "generation" ? (
        <MediaGenerationSettingsPanel />
      ) : modelCategory === "voice" ? (
        <VoiceSettingsPanel />
      ) : modelCategory === "search" ? (
        <SearchSettingsPanel />
      ) : modelCategory === "decision" ? (
        <DecisionSettingsPanel
          openRouterKey={
            providers.find(
              (provider) =>
                provider.api_key &&
                (provider.name === "openrouter" ||
                  (provider.base_url ?? "").includes("openrouter.ai")),
            )?.api_key
          }
        />
      ) : loading ? (
        <LoadingState message={t("models.loadingProviders")} />
      ) : error ? (
        <LoadingState message={error} error onRetry={() => void fetchAll()} />
      ) : !hasContent ? (
        <StreamSetupGuide
          icon={<YdEmptyMascot />}
          title={t("models.noProvidersHint")}
          wide
          plain
        />
      ) : (
        <>
          <ActiveModelPool
            resolvedModels={resolvedModels}
            activeModel={activeModel}
            modelReasoning={modelReasoning}
            providers={providers}
            onSaved={fetchAll}
          />

          {showPresetSection && (
            <>
              <Title level={5} style={{ marginBottom: 12, marginTop: 24 }}>
                {t("models.presetProviders")}
              </Title>
              <TabBar<"cloud" | "local">
                tabs={PRESET_TABS.filter((tab) => {
                  if (tab.key === "cloud") return showCloudTab;
                  if (tab.key === "local") return showLocalTab;
                  return false;
                })}
                activeKey={presetTab}
                onChange={(key) => setPresetTab(key)}
              />
              {presetTab === "cloud"
                ? renderCloudPresetGrid()
                : renderPresetGrid(
                    localPresets.grouped,
                    localPresets.ungrouped,
                  )}
            </>
          )}

          {canProviders && (
            <>
              {(presets.length > 0 || customProviders.length > 0) && (
                <div style={{ height: 24 }} />
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  {t("models.customProviders")}
                </Title>
                <Button
                  type="primary"
                  size="small"
                  icon={<Plus size={13} />}
                  onClick={() => setAddOpen(true)}
                >
                  {t("models.addCustomProvider")}
                </Button>
              </div>
              {customProviders.length > 0 ? (
                <div className={styles.providerCards}>
                  {customProviders.map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      onSaved={fetchAll}
                      isHover={hoveredCard === String(p.id)}
                      onMouseEnter={() => setHoveredCard(String(p.id))}
                      onMouseLeave={() => setHoveredCard(null)}
                      apiPrefix="/admin/providers"
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("models.noCustomProvidersHint")}
                />
              )}
            </>
          )}
        </>
      )}

      {modelCategory === "chat" && (
        <CustomProviderModal
          open={addOpen && canProviders}
          onClose={() => setAddOpen(false)}
          onSaved={fetchAll}
          apiPrefix="/admin/providers"
        />
      )}
    </PageShell.Tabbed>
  );
}

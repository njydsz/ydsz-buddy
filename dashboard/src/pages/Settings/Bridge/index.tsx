import { useTranslation } from "react-i18next";
import PageShell from "../../../layouts/PageShell";
import { useSettingsHeader } from "../../../layouts/SettingsWindow/SettingsHeaderContext";
import BridgeSettingsPanel from "../AdvancedSettings/BridgeSettings";

/** User-scoped remote bridge settings (Settings → under Knowledge Bases). */
export default function BridgePage() {
  const { t } = useTranslation();
  const inSettings = useSettingsHeader(
    {
      title: t("pageShell.bridge.title"),
      subtitle: t("pageShell.bridge.subtitle"),
    },
    [t],
  );
  return (
    <PageShell
      title={t("pageShell.bridge.title")}
      subtitle={t("pageShell.bridge.subtitle")}
      hideTitle={inSettings}
    >
      <BridgeSettingsPanel asPage />
    </PageShell>
  );
}

import { ButtonItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useState } from "react";
import { selfTest, setSettings, type SelfTest, type Settings as SettingsType } from "./api";
import { t } from "./i18n";
import { getStoreSettings, setStoreSettings, useSettings } from "./store";

export function SettingsPanel() {
  const settings = useSettings();
  const [test, setTest] = useState<SelfTest | null>(null);
  const [testing, setTesting] = useState(false);

  const update = async (patch: Partial<SettingsType>) => {
    setStoreSettings(await setSettings(patch));
  };

  const runSelfTest = async () => {
    setTesting(true);
    try {
      setTest(await selfTest());
    } finally {
      setTesting(false);
    }
  };

  return (
    <PanelSection title={t("section.settings")}>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.aur")}
          description={t("settings.aurDesc")}
          checked={settings.enable_aur}
          onChange={(v) => update({ enable_aur: v })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.flatpak")}
          description={t("settings.flatpakDesc")}
          checked={settings.enable_flatpak}
          onChange={(v) => update({ enable_flatpak: v })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.fwupd")}
          description={t("settings.fwupdDesc")}
          checked={settings.enable_fwupd}
          onChange={(v) => update({ enable_fwupd: v })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.autoCheck")}
          description={t("settings.autoCheckDesc")}
          checked={settings.auto_check}
          onChange={(v) => update({ auto_check: v })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.notify")}
          checked={settings.notify_on_updates}
          onChange={(v) => update({ notify_on_updates: v })}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" disabled={testing} onClick={runSelfTest}>
          {testing ? t("btn.testing") : t("btn.selfTest")}
        </ButtonItem>
      </PanelSectionRow>

      {test && (
        <PanelSectionRow>
          <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
            <div style={{ color: test.root ? "#8bd98b" : "#ff8080" }}>
              {test.root ? t("selftest.rootOk") : t("selftest.rootBad")}
            </div>
            <div style={{ opacity: 0.8 }}>
              {t("selftest.user", { user: test.decky_user || "?" })}
            </div>
            <div style={{ opacity: 0.8 }}>
              {t("selftest.kernel", { kernel: test.kernel })}
            </div>
            {test.pacman_busy && (
              <div style={{ color: "#ffd280" }}>{t("selftest.pacmanBusy")}</div>
            )}
            <div style={{ marginTop: "4px" }}>
              {Object.entries(test.tools).map(([name, info]) => (
                <div key={name} style={{ color: info.found ? "#d0d0d0" : "#a0a0a0" }}>
                  {info.found ? "OK  " : "--  "}
                  {name}
                  {info.version ? ` (${info.version})` : ""}
                </div>
              ))}
            </div>
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

/** Read once at plugin start so the panel renders the real values immediately. */
export function primeSettings(next: SettingsType) {
  if (JSON.stringify(next) !== JSON.stringify(getStoreSettings())) {
    setStoreSettings(next);
  }
}

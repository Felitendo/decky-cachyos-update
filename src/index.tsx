import {
  ButtonItem,
  ConfirmModal,
  Field,
  PanelSection,
  PanelSectionRow,
  ProgressBarWithInfo,
  showModal,
  staticClasses,
} from "@decky/ui";
import { addEventListener, definePlugin, removeEventListener, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaSyncAlt } from "react-icons/fa";

import {
  checkUpdates,
  getSettings,
  getState,
  reboot,
  startUpdate,
  type BackendState,
  type Status,
} from "./api";
import { t, tid } from "./i18n";
import { appendLog, clearLog, clearStatus, patchState, replaceState, useStore } from "./store";
import { primeSettings, SettingsPanel } from "./Settings";
import { UpdateLog } from "./UpdateLog";

function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return t("time.never");
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (seconds < 60) return t("time.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hours", { n: hours });
  return t("time.days", { n: Math.floor(hours / 24) });
}

function breakdown(state: BackendState): string {
  return (["pacman", "aur", "flatpak", "fwupd"] as const)
    .filter((key) => state.counts[key] > 0)
    .map((key) => `${state.counts[key]} ${t(`category.${key}` as const)}`)
    .join(" · ");
}

function statusLine(state: BackendState): { text: string; color: string } {
  switch (state.status) {
    case "checking":
      return { text: t("status.checking"), color: "#d0d0d0" };
    case "updating":
      return { text: tid("phase", state.phase) || t("status.updating"), color: "#7ec8ff" };
    case "error":
      return {
        text: state.failed_phases.length
          ? t("status.failedPhases", {
              phases: state.failed_phases.map((p) => tid("phase", p)).join(", "),
            })
          : state.error_text || t("status.failed"),
        color: "#ff8080",
      };
    case "done":
      return { text: t("status.done"), color: "#8bd98b" };
    default:
      if (state.total > 0) {
        return {
          text:
            state.total === 1
              ? t("status.updatesAvailableOne")
              : t("status.updatesAvailable", { n: state.total }),
          color: "#ffd280",
        };
      }
      return { text: t("status.upToDate"), color: "#8bd98b" };
  }
}

function Content() {
  const state = useStore();
  const [showLog, setShowLog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [reasonId, setReasonId] = useState("");

  // The panel remounts every time the user opens Quick Access, so re-sync
  // with the backend, which is the source of truth.
  useEffect(() => {
    void (async () => {
      try {
        replaceState(await getState());
        primeSettings(await getSettings());
      } catch {
        /* backend not ready yet */
      }
    })();
  }, []);

  const running = state.status === "checking" || state.status === "updating";
  const status = statusLine(state);

  const onCheck = async () => {
    setReasonId("");
    patchState({ status: "checking" });
    try {
      replaceState(await checkUpdates());
    } catch (e) {
      patchState({ status: "error", error_text: String(e) });
    }
  };

  const onUpdate = async () => {
    setReasonId("");
    clearLog();
    clearStatus();
    const result = await startUpdate(false);
    if (!result.started) {
      setReasonId(result.reason_id);
      return;
    }
    setShowLog(true);
  };

  const onReboot = () => {
    showModal(
      <ConfirmModal
        bDestructiveWarning
        strTitle={t("reboot.title")}
        strDescription={t("reboot.description")}
        strOKButtonText={t("reboot.ok")}
        strCancelButtonText={t("reboot.cancel")}
        onOK={() => {
          void reboot();
        }}
      />,
    );
  };

  return (
    <>
      <PanelSection title={t("section.title")}>
        <PanelSectionRow>
          <Field
            label={status.text}
            description={
              state.status === "idle" && state.total > 0
                ? breakdown(state)
                : t("time.lastChecked", { when: relativeTime(state.last_check) })
            }
            focusable={false}
            bottomSeparator="none"
          >
            <div style={{ color: status.color, fontWeight: 600 }}>
              {state.status === "idle" && state.total > 0 ? state.total : ""}
            </div>
          </Field>
        </PanelSectionRow>

        {state.status === "updating" && (
          <PanelSectionRow>
            <ProgressBarWithInfo
              nProgress={state.progress}
              sOperationText={tid("phase", state.phase)}
              indeterminate={state.progress <= 0}
            />
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ButtonItem layout="below" disabled={running} onClick={onUpdate}>
            {state.status === "updating" ? t("btn.updating") : t("btn.updateNow")}
          </ButtonItem>
        </PanelSectionRow>

        <PanelSectionRow>
          <ButtonItem layout="below" disabled={running} onClick={onCheck}>
            {t("btn.checkNow")}
          </ButtonItem>
        </PanelSectionRow>

        {state.status === "updating" && (
          <PanelSectionRow>
            <div style={{ fontSize: "11px", opacity: 0.65 }}>{t("update.noCancel")}</div>
          </PanelSectionRow>
        )}

        {reasonId && (
          <PanelSectionRow>
            <div style={{ fontSize: "12px", color: "#ffd280" }}>
              {tid("reason", reasonId)}
            </div>
          </PanelSectionRow>
        )}

        {state.hint_id && (
          <PanelSectionRow>
            <div style={{ fontSize: "12px", color: "#ffd280" }}>
              {tid("hint", state.hint_id)}
            </div>
          </PanelSectionRow>
        )}

        {state.warnings.map((warning) => (
          <PanelSectionRow key={warning}>
            <div style={{ fontSize: "12px", color: "#ffd280" }}>
              {tid("warning", warning)}
            </div>
          </PanelSectionRow>
        ))}

        {state.reboot_required && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={onReboot} description={t("reboot.needed")}>
              {t("btn.reboot")}
            </ButtonItem>
          </PanelSectionRow>
        )}

        {state.pacnew.length > 0 && (
          <PanelSectionRow>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>
              {state.pacnew.length === 1
                ? t("pacnew.one")
                : t("pacnew.many", { n: state.pacnew.length })}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {state.total > 0 && state.status === "idle" && (
        <PanelSection title={t("section.availableUpdates")}>
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? t("btn.hideList") : t("btn.showList")}
            </ButtonItem>
          </PanelSectionRow>
          {showDetails && (
            <PanelSectionRow>
              <div style={{ fontSize: "11px", fontFamily: "monospace", lineHeight: 1.5 }}>
                {(["pacman", "aur", "flatpak", "fwupd"] as const)
                  .filter((key) => state.details[key].length > 0)
                  .map((key) => (
                    <div key={key} style={{ marginBottom: "6px" }}>
                      <div style={{ opacity: 0.6 }}>{t(`category.${key}` as const)}</div>
                      {state.details[key].map((item, index) => (
                        <div key={index}>{item}</div>
                      ))}
                    </div>
                  ))}
              </div>
            </PanelSectionRow>
          )}
        </PanelSection>
      )}

      <PanelSection title={t("section.details")}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setShowLog(!showLog)}>
            {showLog ? t("btn.hideLog") : t("btn.showLog")}
          </ButtonItem>
        </PanelSectionRow>
        {showLog && (
          <PanelSectionRow>
            <UpdateLog lines={state.log} />
          </PanelSectionRow>
        )}
      </PanelSection>

      <SettingsPanel />
    </>
  );
}

export default definePlugin(() => {
  // Registered once at plugin load, not per panel mount: the backend keeps
  // streaming while the Quick Access menu is closed.
  const onLog = (line: string) => appendLog(line);

  const onProgress = (progress: number, phase: string) =>
    patchState({ progress, phase });

  const onStatus = (status: string) => patchState({ status: status as Status });

  const onFinished = (ok: boolean, failedPhases: string[], rebootRequired: boolean) => {
    patchState({ failed_phases: failedPhases, reboot_required: rebootRequired });
    // The backend clears its counters after a successful run; pull the
    // authoritative state instead of guessing.
    void getState().then(replaceState).catch(() => undefined);

    const body = ok
      ? t("status.done")
      : t("status.failedPhases", {
          phases: failedPhases.map((p) => tid("phase", p)).join(", "),
        });
    toaster.toast({
      title: ok ? t("toast.doneTitle") : t("toast.failedTitle"),
      body: rebootRequired ? `${body} ${t("toast.rebootSuffix")}` : body,
      critical: !ok,
    });
  };

  const onAvailable = (total: number) => {
    void getState().then(replaceState).catch(() => undefined);
    toaster.toast({
      title: t("toast.availableTitle"),
      body:
        total === 1
          ? t("toast.availableBodyOne")
          : t("toast.availableBody", { n: total }),
    });
  };

  addEventListener<[string]>("cachyos_update_log", onLog);
  addEventListener<[number, string]>("cachyos_update_progress", onProgress);
  addEventListener<[string]>("cachyos_update_state", onStatus);
  addEventListener<[boolean, string[], boolean]>("cachyos_update_finished", onFinished);
  addEventListener<[number]>("cachyos_update_available", onAvailable);

  // Prime the panel so the first open already shows real numbers.
  void getState().then(replaceState).catch(() => undefined);
  void getSettings().then(primeSettings).catch(() => undefined);

  return {
    name: "CachyOS Update",
    titleView: <div className={staticClasses.Title}>{t("section.title")}</div>,
    content: <Content />,
    icon: <FaSyncAlt />,
    onDismount() {
      removeEventListener("cachyos_update_log", onLog);
      removeEventListener("cachyos_update_progress", onProgress);
      removeEventListener("cachyos_update_state", onStatus);
      removeEventListener("cachyos_update_finished", onFinished);
      removeEventListener("cachyos_update_available", onAvailable);
    },
  };
});

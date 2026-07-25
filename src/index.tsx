import {
  ButtonItem,
  ConfirmModal,
  PanelSection,
  PanelSectionRow,
  ProgressBar,
  showModal,
  staticClasses,
} from "@decky/ui";
import { addEventListener, definePlugin, removeEventListener, toaster } from "@decky/api";
import { useEffect, useReducer, useState } from "react";
import { FaSyncAlt } from "react-icons/fa";

import {
  checkUpdates,
  getSettings,
  getState,
  reboot,
  startUpdate,
  type BackendState,
  type ProgressEvent,
  type Status,
} from "./api";
import { t, tid } from "./i18n";
import { appendLog, clearLog, clearStatus, patchState, replaceState, useStore } from "./store";
import { primeSettings, SettingsPanel } from "./Settings";
import { UpdateLog } from "./UpdateLog";

const ACCENT = "#7ec8ff";
const OK = "#8bd98b";
const WARN = "#ffd280";
const BAD = "#ff8080";

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

/** mm:ss, or h:mm:ss once it gets that far. */
function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Re-renders once a second so the elapsed clock keeps ticking. */
function useTicker(active: boolean) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);
}

function headline(state: BackendState): { text: string; color: string } {
  switch (state.status) {
    case "checking":
      return { text: t("status.checking"), color: ACCENT };
    case "updating":
      return { text: tid("phase", state.phase) || t("status.updating"), color: ACCENT };
    case "error":
      return {
        text: state.failed_phases.length
          ? t("status.failedPhases", {
              phases: state.failed_phases.map((p) => tid("phase", p)).join(", "),
            })
          : state.error_text || t("status.failed"),
        color: BAD,
      };
    case "done":
      return { text: t("status.done"), color: OK };
    default:
      if (state.total > 0) {
        return {
          text:
            state.total === 1
              ? t("status.updatesAvailableOne")
              : t("status.updatesAvailable", { n: state.total }),
          color: WARN,
        };
      }
      return { text: t("status.upToDate"), color: OK };
  }
}

/** Second line: what is going on right now, or when we last looked. */
function subline(state: BackendState): string {
  if (state.status === "updating") {
    const parts: string[] = [];
    if (state.update_started) {
      parts.push(
        t("update.elapsed", {
          time: duration(Date.now() / 1000 - state.update_started),
        }),
      );
    } else {
      parts.push(t("update.starting"));
    }
    if (state.download_mib > 0) {
      parts.push(t("update.downloading", { size: Math.round(state.download_mib) }));
    }
    return parts.join(" · ");
  }

  if (state.status === "idle" && state.total > 0) {
    return (["pacman", "aur", "flatpak", "fwupd"] as const)
      .filter((key) => state.counts[key] > 0)
      .map((key) => `${state.counts[key]} ${t(`category.${key}` as const)}`)
      .join(" · ");
  }

  return t("time.lastChecked", { when: relativeTime(state.last_check) });
}

function StatusHeader({ state }: { state: BackendState }) {
  const head = headline(state);
  return (
    <div style={{ padding: "2px 0 6px" }}>
      <div
        style={{
          color: head.color,
          fontSize: "17px",
          fontWeight: 700,
          lineHeight: 1.25,
        }}
      >
        {head.text}
      </div>
      <div style={{ fontSize: "12px", opacity: 0.6, marginTop: "2px" }}>
        {subline(state)}
      </div>
    </div>
  );
}

function Note({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: "12px",
        lineHeight: 1.4,
        color: color ?? "inherit",
        opacity: color ? 1 : 0.6,
        padding: "2px 0",
      }}
    >
      {children}
    </div>
  );
}

function Content() {
  const state = useStore();
  const [showLog, setShowLog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [reasonId, setReasonId] = useState("");

  const running = state.status === "checking" || state.status === "updating";
  useTicker(state.status === "updating");

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
      <PanelSection>
        <PanelSectionRow>
          <StatusHeader state={state} />
        </PanelSectionRow>

        {state.status === "updating" && (
          <PanelSectionRow>
            {/* No label on the bar itself: the header above already says what
                is happening, and Steam clips long strings inside the bar. */}
            <ProgressBar
              nProgress={state.progress}
              indeterminate={state.downloading || state.progress <= 0}
              nTransitionSec={1}
            />
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ButtonItem layout="below" disabled={running} onClick={onUpdate}>
            {state.status === "updating" ? t("btn.updating") : t("btn.updateNow")}
          </ButtonItem>
        </PanelSectionRow>

        {state.status !== "updating" && (
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={running} onClick={onCheck}>
              {t("btn.checkNow")}
            </ButtonItem>
          </PanelSectionRow>
        )}

        {state.status === "updating" && (
          <PanelSectionRow>
            <Note>{t("update.noCancel")}</Note>
          </PanelSectionRow>
        )}

        {reasonId && (
          <PanelSectionRow>
            <Note color={WARN}>{tid("reason", reasonId)}</Note>
          </PanelSectionRow>
        )}

        {state.hint_id && (
          <PanelSectionRow>
            <Note color={WARN}>{tid("hint", state.hint_id)}</Note>
          </PanelSectionRow>
        )}

        {state.warnings.map((warning) => (
          <PanelSectionRow key={warning}>
            <Note color={WARN}>{tid("warning", warning)}</Note>
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
            <Note>
              {state.pacnew.length === 1
                ? t("pacnew.one")
                : t("pacnew.many", { n: state.pacnew.length })}
            </Note>
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
              <div style={{ fontSize: "11px", lineHeight: 1.5 }}>
                {(["pacman", "aur", "flatpak", "fwupd"] as const)
                  .filter((key) => state.details[key].length > 0)
                  .map((key) => (
                    <div key={key} style={{ marginBottom: "8px" }}>
                      <div
                        style={{
                          opacity: 0.5,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "2px",
                        }}
                      >
                        {t(`category.${key}` as const)}
                      </div>
                      {state.details[key].map((item, index) => (
                        <div
                          key={index}
                          style={{ fontFamily: "monospace", wordBreak: "break-word" }}
                        >
                          {item}
                        </div>
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

  const onProgress = (event: ProgressEvent) => patchState(event);

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
  addEventListener<[ProgressEvent]>("cachyos_update_progress", onProgress);
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

import { ButtonItem, ConfirmModal, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { toaster } from "@decky/api";
import { pacnewDiff, resolvePacnew } from "./api";
import { t } from "./i18n";
import { patchState } from "./store";

/** "/etc/pacman.conf.pacnew" -> "/etc/pacman.conf" */
function targetPath(pacfile: string): string {
  return pacfile.replace(/\.(pacnew|pacsave)$/, "");
}

function DiffView({ text, truncated }: { text: string; truncated: boolean }) {
  if (!text.trim()) {
    return <div style={{ fontSize: "13px" }}>{t("pacnew.noDiff")}</div>;
  }
  return (
    <div>
      <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "6px" }}>
        {t("pacnew.legend")}
      </div>
      <div
        style={{
          maxHeight: "45vh",
          overflowY: "auto",
          background: "rgba(0, 0, 0, 0.35)",
          borderRadius: "4px",
          padding: "8px",
        }}
      >
        {text.split("\n").map((line, index) => (
          <div
            key={index}
            style={{
              fontFamily: "monospace",
              fontSize: "12px",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: diffColor(line),
            }}
          >
            {line}
          </div>
        ))}
      </div>
      {truncated && (
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "6px" }}>
          {t("pacnew.truncated")}
        </div>
      )}
    </div>
  );
}

function diffColor(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "#a0a0a0";
  if (line.startsWith("@@")) return "#7ec8ff";
  if (line.startsWith("+")) return "#8bd98b";
  if (line.startsWith("-")) return "#ff8080";
  return "#d0d0d0";
}

async function apply(pacfile: string, action: "keep" | "apply") {
  const result = await resolvePacnew(pacfile, action);
  if (!result.ok) {
    toaster.toast({ title: t("pacnew.failed"), body: result.error, critical: true });
    return;
  }
  patchState({ pacnew: result.pacnew });
}

async function openDiff(pacfile: string) {
  const result = await pacnewDiff(pacfile);
  showModal(
    <ConfirmModal
      strTitle={targetPath(pacfile)}
      strDescription={<DiffView text={result.diff} truncated={result.truncated} />}
      strOKButtonText={t("pacnew.apply")}
      strMiddleButtonText={t("pacnew.keep")}
      strCancelButtonText={t("pacnew.cancel")}
      onOK={() => void apply(pacfile, "apply")}
      onMiddleButton={() => void apply(pacfile, "keep")}
    />,
  );
}

/**
 * Lets configuration updates be resolved without leaving gamemode.
 *
 * When a package ships a new default for a file the user has changed, pacman
 * writes it alongside as .pacnew instead of overwriting. Which one to keep is
 * a judgement call, so each file is shown with its differences and decided
 * individually - never automatically.
 */
export function PacnewManager({ files }: { files: string[] }) {
  if (!files.length) return null;

  return (
    <PanelSection title={t("pacnew.section")}>
      <PanelSectionRow>
        <div style={{ fontSize: "12px", opacity: 0.6, padding: "2px 0" }}>
          {files.length === 1
            ? t("pacnew.introOne")
            : t("pacnew.intro", { n: files.length })}
        </div>
      </PanelSectionRow>
      {files.map((file) => (
        <PanelSectionRow key={file}>
          <ButtonItem layout="below" onClick={() => void openDiff(file)}>
            {targetPath(file)}
          </ButtonItem>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}

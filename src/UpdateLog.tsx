import { Focusable } from "@decky/ui";
import { t } from "./i18n";

interface Props {
  lines: string[];
}

/**
 * Live log that stays pinned to the newest line.
 *
 * `flex-direction: column-reverse` makes the browser treat the bottom as the
 * scroll origin, so new output stays visible without any scripted scrolling.
 * That matters: calling scrollIntoView() here also scrolled the surrounding
 * Quick Access panel, yanking the whole page down on every line.
 */
export function UpdateLog({ lines }: Props) {
  if (!lines.length) {
    return (
      <div style={{ fontSize: "12px", opacity: 0.6, padding: "4px 0" }}>
        {t("log.empty")}
      </div>
    );
  }

  return (
    <Focusable
      // @ts-ignore - Focusable forwards unknown props onto its div
      style={{
        display: "flex",
        flexDirection: "column-reverse",
        overflowY: "auto",
        height: "220px",
        background: "rgba(0, 0, 0, 0.35)",
        borderRadius: "4px",
        padding: "6px 8px",
      }}
      noFocusRing
    >
      <div>
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              fontFamily: "monospace",
              fontSize: "11px",
              lineHeight: "1.4",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: logColor(line),
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </Focusable>
  );
}

function logColor(line: string): string {
  if (line.startsWith("$ ")) return "#7ec8ff";
  if (line.startsWith("!!")) return "#ff8080";
  const lower = line.toLowerCase();
  if (lower.startsWith("error") || lower.includes(" error:")) return "#ff8080";
  if (lower.startsWith("warning") || lower.startsWith("::")) return "#ffd280";
  return "#d0d0d0";
}

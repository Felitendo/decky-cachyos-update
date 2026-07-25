import { Focusable, ScrollPanelGroup } from "@decky/ui";
import { useEffect, useRef } from "react";
import { t } from "./i18n";

interface Props {
  lines: string[];
}

/**
 * Gamepad-scrollable live log.
 *
 * ScrollPanelGroup only scrolls with a controller when its children are
 * focusable, hence the inner Focusable with flow-children="column".
 */
export function UpdateLog({ lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  if (!lines.length) {
    return (
      <div style={{ fontSize: "12px", opacity: 0.6, padding: "4px 0" }}>
        {t("log.empty")}
      </div>
    );
  }

  return (
    <ScrollPanelGroup
      // @ts-ignore - Steam's scroll panel accepts style passthrough
      style={{
        height: "220px",
        background: "rgba(0, 0, 0, 0.35)",
        borderRadius: "4px",
        padding: "6px 8px",
      }}
    >
      <Focusable flow-children="column" noFocusRing>
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
        <div ref={bottomRef} />
      </Focusable>
    </ScrollPanelGroup>
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

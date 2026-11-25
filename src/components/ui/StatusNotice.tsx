import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";

export type StatusNoticeTone = "info" | "success" | "warning" | "error";

function toneStyles(c: ThemeColors, tone: StatusNoticeTone) {
  if (tone === "success") return { bg: c.successDim, fg: c.success, border: c.successDim };
  if (tone === "warning") return { bg: c.warningDim, fg: c.warning, border: c.warningDim };
  if (tone === "error") return { bg: c.dangerDim, fg: c.danger, border: c.dangerDim };
  return { bg: c.infoDim, fg: c.info, border: c.infoDim };
}

export default function StatusNotice({
  tone = "info",
  title,
  message,
  action,
  onDismiss,
  c,
}: {
  tone?: StatusNoticeTone;
  title?: string;
  message: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  c: ThemeColors;
}) {
  const palette = toneStyles(c, tone);
  return (
    <div
      className="flex flex-col gap-2 rounded-xl px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      role={tone === "error" ? "alert" : "status"}
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-sm font-semibold" style={{ color: palette.fg }}>
            {title}
          </p>
        )}
        <p className={`text-sm leading-relaxed ${title ? "mt-0.5" : ""}`} style={{ color: c.fgSub }}>
          {message}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 min-w-11 rounded-lg text-sm font-medium"
            style={{ color: c.fgMuted }}
            aria-label="关闭提示"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import type { ThemeColors, Theme } from "../../types";
import Modal from "./Modal";
import Button from "./Button";

export type MoreNavItem = { id: string; label: string; icon: ReactNode };

export default function MobileMoreSheet({
  open,
  onClose,
  c,
  theme,
  onThemeChange,
  onNavigate,
  onLogout,
  username,
  roleLabel,
  moduleItems,
  adminItems,
  activePageId,
}: {
  open: boolean;
  onClose: () => void;
  c: ThemeColors;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onNavigate: (pageId: string) => void;
  onLogout: () => void;
  username: string;
  roleLabel: string;
  moduleItems: MoreNavItem[];
  adminItems: MoreNavItem[];
  activePageId: string;
}) {
  function go(pageId: string) {
    onNavigate(pageId);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} label="更多" c={c} maxWidthClassName="max-w-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="type-title" style={{ color: c.fg }}>
            更多
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: c.fgMuted }}>
            {username} · {roleLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="type-title grid min-h-11 min-w-11 place-items-center rounded-xl"
          style={{ background: c.inputBg, color: c.fgMuted }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      {moduleItems.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-xs font-semibold tracking-wide" style={{ color: c.fgDim }}>
            功能模块
          </p>
          <div className="grid gap-1">
            {moduleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition hover:brightness-95"
                style={{
                  background: activePageId === item.id ? c.active : "transparent",
                  color: activePageId === item.id ? c.fg : c.fgSub,
                }}
              >
                <span style={{ color: activePageId === item.id ? c.accent : c.fgMuted }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {adminItems.length > 0 && (
        <section className="mt-5 border-t pt-5" style={{ borderColor: c.borderSub }}>
          <p className="mb-2 text-xs font-semibold tracking-wide" style={{ color: c.fgDim }}>
            管理
          </p>
          <div className="grid gap-1">
            {adminItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition hover:brightness-95"
                style={{
                  background: activePageId === item.id ? c.active : "transparent",
                  color: activePageId === item.id ? c.fg : c.fgSub,
                }}
              >
                <span style={{ color: activePageId === item.id ? c.accent : c.fgMuted }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 border-t pt-5 space-y-2" style={{ borderColor: c.borderSub }}>
        <p className="mb-2 text-xs font-semibold tracking-wide" style={{ color: c.fgDim }}>
          账户与外观
        </p>
        <Button
          type="button"
          variant="secondary"
          c={c}
          className="w-full justify-between"
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
        >
          <span>主题模式</span>
          <span style={{ color: c.fgMuted }}>{theme === "dark" ? "深色 · 切到浅色" : "浅色 · 切到深色"}</span>
        </Button>
        <Button type="button" variant="ghost" c={c} className="w-full" onClick={() => { onClose(); void onLogout(); }}>
          退出登录
        </Button>
      </section>
    </Modal>
  );
}

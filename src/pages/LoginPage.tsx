import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { UserProfile } from "@shared/schemas";
import { api } from "../lib/api";
import type { ThemeColors } from "../types";
import { Button, Card } from "../components/ui";
import { uiFieldClassName, uiFieldStyle } from "../components/ui/styles";

export default function LoginPage({
  c,
  onAuthenticated,
}: {
  c: ThemeColors;
  onAuthenticated: (user: UserProfile) => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.auth.login(username, password)
          : await api.auth.register(username, password);
      onAuthenticated(res.user);
      navigate("/words", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-6 zen-page-enter"
      style={{ background: c.bg, color: c.fg }}
    >
      <Card c={c} wash={c.accentDim} className="w-full max-w-[400px]">
        <form onSubmit={handleSubmit} className="p-6 md:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl grid place-items-center font-bold text-sm shrink-0"
              style={{ background: c.accentDim, color: c.accent }}
            >
              E
            </div>
            <div>
              <p
                className="type-caption font-semibold tracking-[0.14em] uppercase"
                style={{ color: c.accent }}
              >
                ENGLISH STUDIO
              </p>
              <h2 className="type-page leading-tight" style={{ color: c.fg }}>
                {mode === "login" ? "登录账号" : "注册账号"}
              </h2>
            </div>
          </div>
          <p className="type-secondary" style={{ color: c.fgMuted }}>
            登录后可跨设备同步词卡进度、语块本与练习记录。
          </p>

          {error && (
            <p
              className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
              style={{ background: c.dangerDim, color: c.danger }}
            >
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium" style={{ color: c.fgSub }}>
              用户名
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="至少 3 个字符"
              className={uiFieldClassName()}
              style={uiFieldStyle(c)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium" style={{ color: c.fgSub }}>
              密码（至少 8 位）
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className={uiFieldClassName()}
              style={uiFieldStyle(c)}
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <Button type="submit" variant="primary" c={c} disabled={busy} className="w-full">
              {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              c={c}
              onClick={() => {
                setError("");
                setMode(mode === "login" ? "register" : "login");
              }}
              className="w-full"
            >
              {mode === "login" ? "没有账号？点击注册" : "已有账号？返回登录"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              c={c}
              onClick={() => navigate("/words")}
              className="w-full"
            >
              返回学习工作台
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

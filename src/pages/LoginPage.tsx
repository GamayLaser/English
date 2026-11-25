import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { UserProfile } from "@shared/schemas";
import { api } from "../lib/api";

export default function LoginPage({
  onAuthenticated,
}: {
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
      navigate("/cards", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-sm"
      >
        <div>
          <h2 className="text-xl font-bold">{mode === "login" ? "登录 English Studio" : "注册账号"}</h2>
          <p className="text-xs text-slate-500 mt-1">登录后可跨设备同步词卡进度、错题本与 AI 练习记录</p>
        </div>
        {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg">{error}</p>}
        <div className="space-y-1">
          <label className="text-xs font-medium">用户名</label>
          <input
            type="text"
            required
            minLength={3}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">密码（至少 8 位）</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="w-full text-xs text-slate-500 hover:text-indigo-600 cursor-pointer"
        >
          {mode === "login" ? "没有账号？点击注册" : "已有账号？返回登录"}
        </button>
      </form>
    </div>
  );
}

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import type { UserProfile } from "@shared/schemas";
import { activatePrivateWorkspaceStorage } from "../features/persistence/privateWorkspaceStore";
import { api } from "../lib/api";
import { buildTheme } from "../theme/palette";
import type { Theme } from "../types";
import AppShell from "./AppShell";

const TodayPage = lazy(() => import("../pages/TodayPage"));
const RoleplayPage = lazy(() => import("../pages/RoleplayPage"));
const CardsPage = lazy(() => import("../pages/CardsPage"));
const EnglishPage = lazy(() => import("../pages/EnglishPage"));
const ReadingPractice = lazy(() => import("../pages/ReadingPractice"));
const ListeningPractice = lazy(() => import("../pages/ListeningPractice"));
const WritingPractice = lazy(() => import("../pages/WritingPractice"));
const ContentLibrary = lazy(() => import("../pages/ContentLibrary"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const FloatingTranslator = lazy(() => import("../components/FloatingTranslator"));

function PageLoader() {
  return <div className="py-16 text-center text-sm opacity-60">正在加载页面…</div>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("workspace:theme-v1");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const colors = useMemo(() => buildTheme(theme), [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    try {
      localStorage.setItem("workspace:theme-v1", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    let active = true;
    (async () => {
      let namespace = "dev-user";
      try {
        const res = await api.auth.me();
        if (active && res.user) {
          setUser(res.user);
          namespace = res.user.id;
        }
      } catch {
        // Fallback to local dev workspace when unauthenticated
      }
      await activatePrivateWorkspaceStorage(namespace).catch((err) =>
        console.warn("Cloudflare D1 workspace init warning:", err),
      );
    })().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleAuthenticated(nextUser: UserProfile) {
    setUser(nextUser);
    await activatePrivateWorkspaceStorage(nextUser.id).catch((err) =>
      console.warn("Cloudflare D1 workspace switch warning:", err),
    );
  }

  async function handleLogout() {
    try {
      await api.auth.logout();
    } catch {}
    setUser(null);
    await activatePrivateWorkspaceStorage("dev-user").catch(() => {});
  }

  if (!ready) {
    return (
      <main
        className="min-h-screen grid place-items-center text-sm"
        style={{ background: colors.bg, color: colors.fgDim }}
      >
        正在连接 Cloudflare D1 数据库…
      </main>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/login"
            element={<LoginPage c={colors} onAuthenticated={(u) => void handleAuthenticated(u)} />}
          />
          <Route
            element={
              <AppShell
                theme={theme}
                colors={colors}
                user={user}
                onLogout={() => void handleLogout()}
                onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              />
            }
          >
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage c={colors} />} />
            <Route path="/words" element={<CardsPage mode="word" c={colors} />} />
            <Route path="/phrases" element={<CardsPage mode="phrase" c={colors} />} />
            <Route path="/sentences" element={<CardsPage mode="sentence" c={colors} />} />
            <Route path="/roleplay" element={<RoleplayPage c={colors} />} />
            <Route path="/practice" element={<EnglishPage c={colors} initialView="practice" />} />
            <Route path="/reading" element={<ReadingPractice c={colors} />} />
            <Route path="/listening" element={<ListeningPractice c={colors} />} />
            <Route path="/writing" element={<WritingPractice c={colors} />} />
            <Route path="/wrongbook" element={<EnglishPage c={colors} initialView="wrongbook" />} />
            <Route path="/reports" element={<EnglishPage c={colors} initialView="reports" />} />
            <Route path="/library" element={<ContentLibrary c={colors} />} />
            <Route path="*" element={<Navigate to="/words" replace />} />
          </Route>
        </Routes>
        <FloatingTranslator c={colors} />
      </Suspense>
    </BrowserRouter>
  );
}

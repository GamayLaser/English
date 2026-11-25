import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { activatePrivateWorkspaceStorage } from "../features/persistence/privateWorkspaceStore";
import { buildTheme } from "../theme/palette";
import type { Theme } from "../types";
import AppShell from "./AppShell";

const CardsPage = lazy(() => import("../pages/CardsPage"));
const EnglishPage = lazy(() => import("../pages/EnglishPage"));
const ReadingPractice = lazy(() => import("../pages/ReadingPractice"));
const ListeningPractice = lazy(() => import("../pages/ListeningPractice"));
const WritingPractice = lazy(() => import("../pages/WritingPractice"));
const ContentLibrary = lazy(() => import("../pages/ContentLibrary"));
const FloatingTranslator = lazy(() => import("../components/FloatingTranslator"));

function PageLoader() {
  return <div className="py-16 text-center text-sm opacity-60">正在加载页面…</div>;
}

export default function App() {
  const [ready, setReady] = useState(false);
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
    activatePrivateWorkspaceStorage("dev-user")
      .catch((err) => console.warn("Cloudflare D1 workspace init warning:", err))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

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
            element={
              <AppShell
                theme={theme}
                colors={colors}
                onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              />
            }
          >
            <Route index element={<Navigate to="/words" replace />} />
            <Route path="/words" element={<CardsPage mode="word" c={colors} />} />
            <Route path="/phrases" element={<CardsPage mode="phrase" c={colors} />} />
            <Route path="/sentences" element={<CardsPage mode="sentence" c={colors} />} />
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

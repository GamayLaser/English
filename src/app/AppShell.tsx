import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import type { UserProfile } from "@shared/schemas";
import BrandLogo from "../components/ui/BrandLogo";
import { loadWrongBook } from "../features/english/storage";
import { loadVocabProgress } from "../features/vocab/vocabStore";
import type { Theme, ThemeColors } from "../types";

type NavItem = { to: string; label: string; icon: ReactNode };

const ICONS = {
  today: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  shows: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125" />
    </svg>
  ),
  reading: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  word: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
    </svg>
  ),
  phrase: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-7 8l3-3h9a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v13z" />
    </svg>
  ),
  sentence: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  practice: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  ),
  listening: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  ),
  writing: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  wrongbook: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  reports: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  library: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542" />
    </svg>
  ),
  sun: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  moon: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { to: "/today", label: "今日", icon: ICONS.today },
  { to: "/reading", label: "小说", icon: ICONS.reading },
  { to: "/shows", label: "美剧", icon: ICONS.shows },
  { to: "/words", label: "单词", icon: ICONS.word },
  { to: "/phrases", label: "词组", icon: ICONS.phrase },
  { to: "/sentences", label: "句子", icon: ICONS.sentence },
  { to: "/practice", label: "口译", icon: ICONS.practice },
  { to: "/listening", label: "听力", icon: ICONS.listening },
  { to: "/writing", label: "写作", icon: ICONS.writing },
  { to: "/wrongbook", label: "错题", icon: ICONS.wrongbook },
  { to: "/reports", label: "报告", icon: ICONS.reports },
  { to: "/library", label: "题库", icon: ICONS.library },
];

type AppShellProps = {
  theme: Theme;
  colors: ThemeColors;
  user?: UserProfile | null;
  onLogout?: () => void;
  onToggleTheme: () => void;
};

function readLearningStats() {
  const vocab = loadVocabProgress();
  const wrongPending = loadWrongBook().filter((item) => item.lastVerdict !== "acceptable").length;
  return {
    mastered: vocab.mastered.size,
    wrongPending,
  };
}

export default function AppShell({ theme, colors, user, onLogout, onToggleTheme }: AppShellProps) {
  const [stats, setStats] = useState(readLearningStats);

  useEffect(() => {
    const refresh = () => setStats(readLearningStats());
    refresh();
    window.addEventListener("workspace:stats-updated", refresh);
    return () => window.removeEventListener("workspace:stats-updated", refresh);
  }, [user?.id]);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: "var(--bg-canvas)", color: "var(--text-primary)" }}
    >
      {/* Minimal Top Navigation Bar */}
      <header
        className="no-print shrink-0 border-b px-4 md:px-6 zen-glass"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-[1440px] flex items-center justify-between gap-3 h-14">
          {/* Brand */}
          <NavLink to="/today" className="flex items-center gap-2.5 shrink-0">
            <BrandLogo size={28} />
            <span
              className="text-[19px] font-semibold tracking-tight leading-none -translate-y-[1px] hidden sm:inline"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text-primary)" }}
            >
              Cadence
            </span>
          </NavLink>

          {/* Horizontal Nav Links */}
          <nav className="flex items-center gap-0.5 overflow-x-auto zen-no-scrollbar py-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                    isActive ? "zen-nav-active" : "hover:opacity-85"
                  }`
                }
                style={({ isActive }) => (isActive ? undefined : { color: "var(--text-secondary)" })}
              >
                <span className="shrink-0 opacity-85">{item.icon}</span>
                <span>{item.label}</span>
                {item.to === "/wrongbook" && stats.wrongPending > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold zen-tnum leading-none"
                    style={{ background: "var(--accent-secondary-soft)", color: "var(--accent-secondary)" }}
                  >
                    {stats.wrongPending}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right Controls: Stats Pill, Theme Toggle, Auth */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium zen-tnum"
              style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              title="已掌握词卡数"
            >
              已掌握 {stats.mastered}
            </span>

            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:opacity-85 cursor-pointer"
              style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              title={theme === "dark" ? "切换到白昼英伦书房" : "切换到暗夜影院模式"}
              aria-label="切换主题"
            >
              {theme === "dark" ? ICONS.sun : ICONS.moon}
              <span className="hidden md:inline">{theme === "dark" ? "白昼" : "暗夜"}</span>
            </button>

            {user ? (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title={`当前账号：${user.username}`}
              >
                退出
              </button>
            ) : (
              <NavLink
                to="/login"
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-primary)" }}
              >
                登录
              </NavLink>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="w-full px-4 py-5 md:px-7 md:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

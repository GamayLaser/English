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
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4" />
    </svg>
  ),
  shows: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="14" rx="2.5" />
      <path d="M8 21h8M12 18v3M10 8.5l5 3-5 3v-6z" />
    </svg>
  ),
  reading: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  word: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="3" y="5" width="14" height="16" rx="2" />
      <path d="M7 5V3.5A1.5 1.5 0 0 1 8.5 2H19a2 2 0 0 1 2 2v13a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 11h6M7 15h4" />
    </svg>
  ),
  phrase: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  sentence: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ),
  practice: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </svg>
  ),
  listening: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  writing: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  wrongbook: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  reports: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  library: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  ),
  sun: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  moon: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
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
        className="app-shell-header no-print shrink-0 border-b px-4 md:px-6 zen-glass"
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

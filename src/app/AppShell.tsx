import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import type { Theme, ThemeColors } from "../types";

type NavItem = { to: string; label: string; icon: ReactNode };

const ICONS = {
  word: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
    </svg>
  ),
  phrase: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-7 8l3-3h9a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v13z" />
    </svg>
  ),
  sentence: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  practice: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  ),
  reading: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  listening: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  ),
  writing: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  wrongbook: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  reports: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  library: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  ),
  sun: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  moon: (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  ),
};

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "词句库",
    items: [
      { to: "/words", label: "单词", icon: ICONS.word },
      { to: "/phrases", label: "词组", icon: ICONS.phrase },
      { to: "/sentences", label: "句子", icon: ICONS.sentence },
    ],
  },
  {
    title: "AI 训练",
    items: [
      { to: "/practice", label: "句子翻译", icon: ICONS.practice },
      { to: "/reading", label: "阅读训练", icon: ICONS.reading },
      { to: "/listening", label: "听力训练", icon: ICONS.listening },
      { to: "/writing", label: "写作训练", icon: ICONS.writing },
      { to: "/wrongbook", label: "错题本", icon: ICONS.wrongbook },
      { to: "/reports", label: "历史报告", icon: ICONS.reports },
      { to: "/library", label: "题库管理", icon: ICONS.library },
    ],
  },
];

type AppShellProps = {
  theme: Theme;
  colors: ThemeColors;
  onToggleTheme: () => void;
};

export default function AppShell({ theme, colors, onToggleTheme }: AppShellProps) {
  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col md:flex-row"
      style={{ background: colors.bg, color: colors.fg }}
    >
      <aside
        className="no-print w-full md:w-[232px] shrink-0 border-b md:border-b-0 md:border-r px-3.5 py-3.5 md:py-5 flex flex-col justify-between"
        style={{ background: colors.sidebar, borderColor: colors.borderSub }}
      >
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl grid place-items-center font-bold text-sm"
                style={{ background: colors.accentDim, color: colors.accent }}
              >
                E
              </div>
              <div>
                <h1 className="text-[14px] font-semibold tracking-tight leading-tight">
                  English Studio
                </h1>
                <p className="text-[11px]" style={{ color: colors.fgMuted }}>
                  视觉词卡 · AI 训练
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg transition-colors hover:opacity-80 cursor-pointer"
              style={{ background: colors.inputBg, color: colors.fgDim }}
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              aria-label="切换主题"
            >
              {theme === "dark" ? ICONS.sun : ICONS.moon}
            </button>
          </div>

          <nav className="flex md:flex-col gap-4 overflow-x-auto pb-1 md:pb-0">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="flex md:flex-col gap-1 shrink-0">
                <p
                  className="hidden md:block px-2.5 pb-1 text-[11px] font-medium tracking-wider uppercase"
                  style={{ color: colors.fgMuted }}
                >
                  {group.title}
                </p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors ${
                        isActive ? "zen-nav-active" : "hover:opacity-90"
                      }`
                    }
                    style={({ isActive }) => (isActive ? undefined : { color: colors.fgDim })}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="hidden md:block zen-nav-bar" />}
                        <span className="shrink-0 opacity-90">{item.icon}</span>
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div
          className="hidden md:flex items-center justify-between px-2.5 pt-3 border-t text-[11px]"
          style={{ borderColor: colors.borderSub, color: colors.fgMuted }}
        >
          <span>Cloudflare D1</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: colors.success }}
            />
            已连接
          </span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="w-full px-4 py-5 md:px-7 md:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

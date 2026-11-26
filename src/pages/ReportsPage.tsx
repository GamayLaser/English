import { useState } from "react";
import { EnglishPageHeader, EnglishSegmentedTabs } from "../components/english/EnglishUi";
import { ERROR_LABELS } from "../components/english/RadarScoreCard";
import { Button, Card } from "../components/ui";
import { loadUserChunks } from "../features/chunks/chunksStore";
import { loadReports } from "../features/english/storage";
import { formatListeningReportTitle, loadListeningReports } from "../features/listening/listeningProgress";
import { loadReadingReports } from "../features/reading/readingProgress";
import { formatWritingReportTitle, loadWritingReports, type WritingReport } from "../features/writing/writingProgress";
import type { ThemeColors } from "../types";

const HISTORY_PAGE_SIZE = 5;

function HistoryPager({ page, total, onChange, c }: { page: number; total: number; onChange: (page: number) => void; c: ThemeColors }) {
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  if (pages <= 1) return null;
  const visible =
    pages <= 7
      ? Array.from({ length: pages }, (_, index) => index)
      : Array.from(new Set([0, 1, page - 1, page, page + 1, pages - 2, pages - 1]))
          .filter((item) => item >= 0 && item < pages)
          .sort((a, b) => a - b);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: c.borderSub }} aria-label="历史报告分页">
      <p className="text-xs" style={{ color: c.fgMuted }}>第 {page + 1} / {pages} 页 · 共 {total} 条</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0} className="rounded-lg px-3 py-2 text-xs disabled:opacity-40 cursor-pointer" style={{ background: c.card, color: c.fg }}>上一页</button>
        {visible.map((item, index) => (
          <span key={item} className="flex items-center gap-1">
            {index > 0 && item - visible[index - 1] > 1 && <span className="px-1 text-xs" style={{ color: c.fgMuted }}>…</span>}
            <button type="button" onClick={() => onChange(item)} className="min-w-8 rounded-lg px-2 py-2 text-xs font-semibold cursor-pointer" style={{ background: item === page ? c.accent : c.card, color: item === page ? c.accentFg : c.fg }}>{item + 1}</button>
          </span>
        ))}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page === pages - 1} className="rounded-lg px-3 py-2 text-xs disabled:opacity-40 cursor-pointer" style={{ background: c.card, color: c.fg }}>下一页</button>
      </div>
    </nav>
  );
}

function HistoryDetailHeader({ title, subtitle, onBack, c }: { title: string; subtitle: string; onBack: () => void; c: ThemeColors }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold" style={{ color: c.fg }}>{title}</h2>
        <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>{subtitle}</p>
      </div>
      <Button type="button" variant="secondary" c={c} onClick={onBack}>返回列表</Button>
    </div>
  );
}

function TranslationReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.createdAt === selectedAt);
  if (selected) return <TranslationReportDetail report={selected} onBack={() => setSelectedAt(null)} c={c} />;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return (
    <Card c={c}>
      <div className="p-5 md:p-6">
        <h2 className="text-base font-semibold" style={{ color: c.fg }}>翻译报告</h2>
        <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每页展示 5 组练习；点击进入独立详情，回看大量报告时更清晰。</p>
        {reports.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组练习后，这里会生成详细报告。</p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              {visibleReports.map((report) => {
                const correct = report.attempts.filter((item) => item.evaluation.verdict === "acceptable").length;
                const rate = Math.round((correct / Math.max(report.attempts.length, 1)) * 100);
                return (
                  <button
                    type="button"
                    key={report.createdAt}
                    onClick={() => setSelectedAt(report.createdAt)}
                    className="grid w-full grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] items-center gap-4 rounded-xl p-4 text-left transition-colors hover:brightness-95 cursor-pointer"
                    style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: c.fg }}>
                        {report.date} · {new Date(report.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{correct} / {report.attempts.length} 可接受</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: c.card }}>
                        <div className="h-full rounded-full" style={{ width: `${rate}%`, background: c.accent }} />
                      </div>
                      <span className="text-xs font-semibold zen-tnum" style={{ color: c.accent }}>{rate}%</span>
                    </div>
                    <span className="text-xs font-medium justify-self-end" style={{ color: c.accent }}>查看详情 →</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div>
          </>
        )}
      </div>
    </Card>
  );
}

function TranslationReportDetail({ report, onBack, c }: { report: ReturnType<typeof loadReports>[number]; onBack: () => void; c: ThemeColors }) {
  const correct = report.attempts.filter((item) => item.evaluation.verdict === "acceptable").length;
  return (
    <Card c={c}>
      <div className="p-6 md:p-8">
        <HistoryDetailHeader
          title={`${report.date} · 第 ${new Date(report.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 组`}
          subtitle={`${correct} / ${report.attempts.length} 可接受 · 正确率 ${Math.round((correct / Math.max(report.attempts.length, 1)) * 100)}%`}
          onBack={onBack}
          c={c}
        />
        <div className="mt-5 space-y-3">
          {report.attempts.map((item, attemptIndex) => (
            <div key={item.completedAt} className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>
                  第 {attemptIndex + 1} 题 · {item.question.direction === "en2zh" ? "英译汉" : "汉译英"}
                </p>
                <span className="text-sm font-semibold" style={{ color: item.evaluation.verdict === "acceptable" ? c.success : c.danger }}>
                  {item.evaluation.score} 分 · {item.evaluation.verdict === "acceptable" ? "可接受" : "需改进"}
                </span>
              </div>
              <p className="mt-3 text-base leading-relaxed" style={{ color: c.fg }}>
                {item.question.direction === "en2zh" ? item.question.sentence.en : item.question.sentence.zh}
              </p>
              <p className="mt-3 text-sm" style={{ color: c.fgSub }}>你的译文：{item.answer}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgMuted }}>{item.evaluation.feedback}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.evaluation.acceptedTranslations.map((t) => (
                  <span key={t} className="rounded-md px-2 py-1 text-xs" style={{ background: c.accentDim, color: c.accent }}>{t}</span>
                ))}
              </div>
              {item.evaluation.issues.map((issue, idx) => (
                <p key={idx} className="mt-3 border-l-2 pl-3 text-xs leading-relaxed" style={{ borderColor: c.danger, color: c.fgSub }}>
                  <b style={{ color: c.danger }}>{ERROR_LABELS[issue.category]}：</b>{issue.explanation} 建议：{issue.suggestion}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ListeningReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadListeningReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) {
    return (
      <Card c={c}>
        <div className="p-6 md:p-8">
          <HistoryDetailHeader title={formatListeningReportTitle(selected)} subtitle={new Date(selected.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} onBack={() => setSelectedAt(null)} c={c} />
          <div className="mt-5 space-y-5">
            <section>
              <p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的默写</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{selected.draft}</p>
            </section>
            <section className="rounded-xl p-4" style={{ background: c.inputBg }}>
              <p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>标准原文</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{selected.evaluation.transcript}</p>
            </section>
          </div>
        </div>
      </Card>
    );
  }
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return (
    <Card c={c}>
      <div className="p-6 md:p-8">
        <h2 className="text-base font-semibold" style={{ color: c.fg }}>听力记录</h2>
        <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>分页保存每次听力默写，可单独查看标准原文和评分。</p>
        {reports.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组听力练习后，这里会留下评分记录。</p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              {visibleReports.map((report) => (
                <button type="button" key={report.completedAt} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left cursor-pointer" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
                  <div>
                    <p className="font-semibold" style={{ color: c.fg }}>{formatListeningReportTitle(report)}</p>
                    <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <span className="text-sm" style={{ color: c.accent }}>查看详情</span>
                </button>
              ))}
            </div>
            <div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div>
          </>
        )}
      </div>
    </Card>
  );
}

function WritingReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadWritingReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) return <WritingReportDetail report={selected} onBack={() => setSelectedAt(null)} c={c} />;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return (
    <Card c={c}>
      <div className="p-6 md:p-8">
        <h2 className="text-base font-semibold" style={{ color: c.fg }}>写作记录</h2>
        <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每次完成一篇作文都会归档，分页浏览后可进入独立详情。</p>
        {reports.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组写作练习后，这里会留下评分记录。</p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              {visibleReports.map((report) => (
                <button type="button" key={`${report.topic.id}-${report.completedAt}`} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left cursor-pointer" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: c.fg }}>{formatWritingReportTitle(report)}</p>
                    <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <span className="text-sm" style={{ color: c.accent }}>查看详情</span>
                </button>
              ))}
            </div>
            <div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div>
          </>
        )}
      </div>
    </Card>
  );
}

function WritingReportDetail({ report, onBack, c }: { report: WritingReport; onBack: () => void; c: ThemeColors }) {
  const scores: Array<[string, number]> = [["内容", report.evaluation.scores.content], ["语法", report.evaluation.scores.grammar], ["词汇", report.evaluation.scores.vocabulary], ["结构", report.evaluation.scores.structure]];
  return (
    <Card c={c}>
      <div className="p-6 md:p-8">
        <HistoryDetailHeader title={formatWritingReportTitle(report)} subtitle={new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} onBack={onBack} c={c} />
        <div className="mt-5 space-y-5">
          <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>写作任务</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{report.topic.prompt}</p></section>
          <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的作文</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{report.draft}</p></section>
          <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>四项评分</p><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{scores.map(([label, score]) => <div key={label} className="rounded-xl px-3 py-2" style={{ background: c.inputBg }}><p className="text-xs" style={{ color: c.fgMuted }}>{label}</p><p className="mt-1 text-base font-semibold tabular-nums" style={{ color: c.fg }}>{score}/25</p></div>)}</div></section>
          <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>AI 解析</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{report.evaluation.feedback}</p></section>
          <section className="rounded-xl p-4" style={{ background: c.inputBg }}><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>参考润色稿</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{report.evaluation.revisedWriting}</p></section>
        </div>
      </div>
    </Card>
  );
}

function ReadingReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadReadingReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) {
    return (
      <Card c={c}>
        <div className="p-6 md:p-8">
          <HistoryDetailHeader title={selected.article.title} subtitle={`${new Date(selected.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} · ${selected.annotations.length} 条释义`} onBack={() => setSelectedAt(null)} c={c} />
          <div className="mt-5 space-y-5">
            <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>原文</p><p className="mt-2 type-english whitespace-pre-line" style={{ color: c.fg }}>{selected.article.content}</p></section>
            <section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的概述</p><p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ color: selected.summary ? c.fgSub : c.fgMuted }}>{selected.summary || "未填写概述"}</p></section>
          </div>
        </div>
      </Card>
    );
  }
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return (
    <Card c={c}>
      <div className="p-6 md:p-8">
        <h2 className="text-base font-semibold" style={{ color: c.fg }}>阅读记录</h2>
        <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每页展示 5 篇阅读记录，详情单独打开，不占用列表空间。</p>
        {reports.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一篇阅读文章后，这里会留下本组记录。</p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              {visibleReports.map((report) => (
                <button type="button" key={`${report.article.id}-${report.completedAt}`} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-4 rounded-xl p-4 text-left cursor-pointer" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
                  <div><p className="text-sm font-semibold" style={{ color: c.fg }}>{report.article.title}</p><p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} · {report.annotations.length} 条释义</p></div>
                  <span className="text-sm" style={{ color: c.accent }}>查看详情</span>
                </button>
              ))}
            </div>
            <div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function ReportsPage({ c }: { c: ThemeColors }) {
  const [historyTab, setHistoryTab] = useState<"translation" | "reading" | "writing" | "listening">("translation");
  const tabs = [
    { id: "translation", label: "翻译报告" },
    { id: "reading", label: "阅读记录" },
    { id: "writing", label: "写作记录" },
    { id: "listening", label: "听力记录" },
  ] as const;

  const translationReports = loadReports();
  const totalGroups =
    translationReports.length +
    loadReadingReports().length +
    loadWritingReports().length +
    loadListeningReports().length;
  const recent7Days = translationReports.filter((r) => Date.now() - r.createdAt <= 7 * 86400_000);
  const recentAttempts = recent7Days.flatMap((r) => r.attempts);
  const avgRate =
    recentAttempts.length > 0
      ? Math.round((recentAttempts.filter((a) => a.evaluation.verdict === "acceptable").length / recentAttempts.length) * 100)
      : 0;
  const chunksCount = loadUserChunks().length;

  return (
    <div className="container-focus space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="LEARNING REPORTS"
        title="历史报告"
        description="按模块归档每次练习的得分、AI 解析与详细记录。"
      >
        <EnglishSegmentedTabs
          tabs={[...tabs]}
          value={historyTab}
          onChange={(value) => setHistoryTab(value as typeof historyTab)}
          ariaLabel="历史报告类型"
          c={c}
        />
      </EnglishPageHeader>

      <div className="grid grid-cols-3 gap-3">
        <Card c={c} className="px-4 py-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>累计练习组数</p>
          <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--text-primary)" }}>{totalGroups} 组</p>
        </Card>
        <Card c={c} className="px-4 py-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>近 7 天正确率</p>
          <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--accent-primary)" }}>{avgRate}%</p>
        </Card>
        <Card c={c} className="px-4 py-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>个人语块库</p>
          <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--text-primary)" }}>{chunksCount} 条</p>
        </Card>
      </div>

      {historyTab === "translation" ? (
        <TranslationReportHistory c={c} />
      ) : historyTab === "reading" ? (
        <ReadingReportHistory c={c} />
      ) : historyTab === "writing" ? (
        <WritingReportHistory c={c} />
      ) : (
        <ListeningReportHistory c={c} />
      )}
    </div>
  );
}

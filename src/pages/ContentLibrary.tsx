import { useEffect, useRef, useState } from "react"

import { loadSentenceLearningStats } from "../features/english/learningStats"

import {
  importWorkbook,
  loadSentenceLibrary,
  saveSentenceLibrary,
} from "../features/english/sentenceLibrary"

import {
  importReadingWorkbook,
  loadReadingLibrary,
  saveReadingLibrary,
} from "../features/reading/readingLibrary"

import { removeImportedArticle } from "../features/reading/contentManagement"

import {
  importListeningWorkbook,
  loadListeningLibrary,
  saveListeningLibrary,
} from "../features/listening/listeningLibrary"

import type {
  ListeningArticle,
  ReadingArticle,
  Sentence,
} from "../features/english/types"

import type { ThemeColors } from "../types"
import { Button, Card, SearchField, cardWashStyle } from "../components/ui"
import { hueDimOf } from "../theme/palette"

import { EnglishFilterTabs } from "../components/english/EnglishUi"

type ContentTab = "sentences" | "articles" | "listening"

function ContentDrawer({
  title,
  content,
  c,
  onClose,
}: {
  title: string
  content: string
  c: ThemeColors
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 内容详情`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭内容详情"
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.24)" }}
      />
      <aside className="zen-card relative flex h-full w-full flex-col overflow-hidden md:max-w-[34rem]">
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-6"
          style={{ borderColor: c.border }}
        >
          <h2
            className="type-page"
            style={{ color: c.fg }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-9 place-items-center rounded-lg text-xl"
            style={{ background: c.inputBg, color: c.fgMuted }}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
          <p
            className="type-english whitespace-pre-line"
            style={{
              color: c.fgSub,
                          }}
          >
            {content}
          </p>
        </div>
      </aside>
    </div>
  )
}

export default function ContentLibrary({
  c,
  initialTab = "sentences",
  onTabChange,
  showTabs = true,
}: {
  c: ThemeColors
  initialTab?: string
  onTabChange?: (tab: ContentTab) => void
  showTabs?: boolean
}) {
  const validTab = (value: string): value is ContentTab =>
    value === "sentences" || value === "articles" || value === "listening"

  const [tab, setTab] = useState<ContentTab>(() =>
    validTab(initialTab) ? initialTab : "sentences",
  )

  useEffect(() => {
    if (validTab(initialTab)) setTab(initialTab)
  }, [initialTab])

  const tabs = [
    { id: "sentences", label: "句子" },
    { id: "articles", label: "阅读文章" },
    { id: "listening", label: "听力原文" },
  ]

  const selectTab = (value: string) => {
    if (!validTab(value)) return

    setTab(value)

    onTabChange?.(value)
  }

  return (
    <div className="container-wide space-y-5 pb-8 zen-page-enter">
      <Card c={c} wash={c.accentDim}>
        <div className="p-5 md:p-6 space-y-4">
          <div>
            <p
              className="type-caption font-semibold tracking-[0.14em] uppercase"
              style={{ color: c.accent }}
            >
              ENGLISH CONTENT
            </p>
            <h2 className="type-page mt-1" style={{ color: c.fg }}>
              内容库
            </h2>
            <p className="type-secondary mt-1" style={{ color: c.fgMuted }}>
              管理翻译、阅读和听力练习内容。
            </p>
          </div>
          {showTabs && (
            <EnglishFilterTabs
              tabs={tabs}
              value={tab}
              onChange={selectTab}
              ariaLabel="内容库类型"
              c={c}
            />
          )}
        </div>
      </Card>
      <Card c={c}>
        {tab === "sentences" ? (
          <SentenceContent c={c} />
        ) : tab === "articles" ? (
          <ArticleContent c={c} />
        ) : (
          <ListeningContent c={c} />
        )}
      </Card>
    </div>
  )
}

function ListeningContent({ c }: { c: ThemeColors }) {
  const [items, setItems] = useState(loadListeningLibrary),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<ListeningArticle | null>(null)
  const [visibleCount, setVisibleCount] = useState(24)
  const inputRef = useRef<HTMLInputElement>(null)
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    try {
      const r = await importListeningWorkbook(await f.arrayBuffer(), items),
        next = [...items, ...r.added]
      saveListeningLibrary(next)
      setItems(next)
      setMessage(
        `已新增 ${r.added.length} 篇；跳过重复 ${r.duplicates} 篇、无效 ${r.invalid} 篇。`,
      )
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Excel 导入失败，请重试。",
      )
    }
  }
  function remove(x: ListeningArticle) {
    const next = items.filter((i) => i.id !== x.id)
    saveListeningLibrary(next)
    setItems(next)
    if (selected?.id === x.id) setSelected(null)
  }
  return (
    <section className="p-5 md:p-8">
      <ContentHeader
        c={c}
        title="听力原文"
        description="点击卡片可在右侧查看完整原文；听力练习会用它生成音频。"
        format="标题、英文听力原文"
        inputRef={inputRef}
        onUpload={upload}
      />
      {message && (
        <p
          className="mt-3 text-sm"
          style={{ color: message.startsWith("已新增") ? c.success : c.danger }}
        >
          {message}
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, visibleCount).map((x) => (
          <article
            key={x.id}
            className="relative cursor-pointer overflow-hidden rounded-2xl p-5 text-left zen-card zen-card-wash zen-card-hover focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/40"
            style={cardWashStyle(hueDimOf(c, "teal"))}
          >
            <button type="button" aria-label={`查看${x.title}全文`} onClick={() => setSelected(x)} className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none relative flex justify-between gap-2">
              <div className="min-w-0 text-left">
                <span
                  className="text-xs"
                  style={{
                    color: x.source === "imported" ? c.accent : c.fgMuted,
                  }}
                >
                  {x.source === "imported" ? "导入" : "内置"}
                </span>
                <h3
                  className="mt-3 type-title leading-snug"
                  style={{ color: c.fg }}
                >
                  {x.title}
                </h3>
                <p className="mt-4 text-xs" style={{ color: c.fgMuted }}>
                  {x.content.match(/[A-Za-z]+/g)?.length ?? 0} 词 · 点击查看全文
                </p>
              </div>
              {x.source === "imported" && (
                <button
                  type="button"
                  onClick={() => remove(x)}
                  className="pointer-events-auto relative z-10 h-fit text-xs"
                  style={{ color: c.danger }}
                >
                  删除
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {items.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 24)} className="mt-5 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: c.inputBg, color: c.accent }}>加载更多听力原文</button>}
      {selected && (
        <ContentDrawer
          title={selected.title}
          content={selected.content}
          c={c}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function SentenceContent({ c }: { c: ThemeColors }) {
  const [sentences, setSentences] = useState(loadSentenceLibrary)
  const [visibleCount, setVisibleCount] = useState(24)

  const [query, setQuery] = useState("")

  const [message, setMessage] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)

  const stats = loadSentenceLearningStats()

  const visible = query.trim()
    ? sentences.filter((item) =>
        `${item.en} ${item.zh}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : sentences

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.target.value = ""

    if (!file) return

    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setMessage("请选择 .xlsx 格式的 Excel 文件。")
      return
    }

    try {
      const result = await importWorkbook(await file.arrayBuffer(), sentences)

      const next = [...sentences, ...result.added]

      saveSentenceLibrary(next)
      setSentences(next)

      setMessage(
        `已新增 ${result.added.length} 条；跳过重复 ${result.duplicates} 条、无效 ${result.invalid} 条。`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Excel 导入失败，请重试。",
      )
    }
  }

  return (
    <section className="p-5 md:p-8">
      <ContentHeader
        c={c}
        title="翻译内容"
        description="用于翻译练习；中文仅作为参考释义，不限制模型判定。"
        format="英文、中文"
        inputRef={inputRef}
        onUpload={upload}
      />
      <SearchField
        c={c}
        className="mt-6"
        value={query}
        onChange={(value) => { setQuery(value); setVisibleCount(24) }}
        placeholder="搜索英文或中文…"
        label="搜索翻译内容"
      />
      {message && (
        <p
          className="mt-3 text-sm"
          style={{ color: message.startsWith("已新增") ? c.success : c.danger }}
        >
          {message}
        </p>
      )}
      <div className="mt-5 columns-1 gap-4 md:columns-2 xl:columns-3">
        {visible.slice(0, visibleCount).map((item: Sentence) => {
          const stat = stats[item.id]
          return (
            <article
              key={item.id}
              className="mb-4 break-inside-avoid overflow-hidden rounded-2xl p-5 zen-card zen-card-wash"
              style={cardWashStyle(hueDimOf(c, "teal"))}
            >
              <div className="flex justify-between gap-3">
                <span
                  className="rounded-md px-2 py-1 text-xs font-semibold"
                  style={{
                    background:
                      item.source === "imported" ? `${c.accent}14` : c.card,
                    color: item.source === "imported" ? c.accent : c.fgMuted,
                  }}
                >
                  {item.source === "imported" ? "导入内容" : "内置内容"}
                </span>
                <span
                  className="text-right text-xs font-medium"
                  style={{ color: stat ? c.accent : c.fgMuted }}
                >
                  {stat
                    ? `练习 ${stat.attemptCount} 次\n最高 ${stat.bestScore} 分`
                    : "尚未练习"}
                </span>
              </div>
              <p
                className="mt-5 text-xl font-semibold leading-relaxed"
                style={{ color: c.fg }}
              >
                {item.en}
              </p>
              <div
                className="mt-4 border-t pt-3"
                style={{ borderColor: c.borderSub }}
              >
                <p className="text-xs" style={{ color: c.fgMuted }}>
                  参考翻译
                </p>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: c.fgSub }}
                >
                  {item.zh}
                </p>
              </div>
              {stat && (
                <p className="mt-4 text-xs" style={{ color: c.fgMuted }}>
                  最近练习：
                  {new Date(stat.lastAnsweredAt).toLocaleDateString("zh-CN")}
                </p>
              )}
            </article>
          )
        })}
      </div>
      {visible.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 24)} className="mt-5 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: c.inputBg, color: c.accent }}>加载更多句子</button>}
    </section>
  )
}

function ArticleContent({ c }: { c: ThemeColors }) {
  const [articles, setArticles] = useState(loadReadingLibrary)
  const [visibleCount, setVisibleCount] = useState(24)

  const [selected, setSelected] = useState<ReadingArticle | null>(null)

  const [query, setQuery] = useState("")

  const [message, setMessage] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)

  const visible = query.trim()
    ? articles.filter((item) =>
        `${item.title} ${item.content}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : articles

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.target.value = ""

    if (!file) return

    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setMessage("请选择 .xlsx 格式的 Excel 文件。")
      return
    }

    try {
      const result = await importReadingWorkbook(
        await file.arrayBuffer(),
        articles,
      )

      const next = [...articles, ...result.added]

      saveReadingLibrary(next)
      setArticles(next)

      setMessage(
        `已新增 ${result.added.length} 篇；跳过重复 ${result.duplicates} 篇、无效 ${result.invalid} 篇。`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Excel 导入失败，请重试。",
      )
    }
  }

  function remove(article: ReadingArticle) {
    const next = removeImportedArticle(articles, article.id)

    saveReadingLibrary(next)
    setArticles(next)
  }

  return (
    <section className="p-5 md:p-8">
      <ContentHeader
        c={c}
        title="阅读文章"
        description="点击卡片可在右侧查看完整文章，避免内容被截断。"
        format="标题、英文内容"
        inputRef={inputRef}
        onUpload={upload}
      />
      <SearchField
        c={c}
        className="mt-6"
        value={query}
        onChange={(value) => { setQuery(value); setVisibleCount(24) }}
        placeholder="搜索标题或文章内容…"
        label="搜索阅读文章"
      />
      {message && (
        <p
          className="mt-3 text-sm"
          style={{ color: message.startsWith("已新增") ? c.success : c.danger }}
        >
          {message}
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.slice(0, visibleCount).map((article) => (
          <article
            key={article.id}
            className="relative cursor-pointer overflow-hidden rounded-2xl p-5 text-left zen-card zen-card-wash zen-card-hover focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/40"
            style={cardWashStyle(hueDimOf(c, "teal"))}
          >
            <button type="button" aria-label={`查看${article.title}全文`} onClick={() => setSelected(article)} className="absolute inset-0 rounded-2xl" />
            <div className="pointer-events-none relative flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <span
                  className="text-xs"
                  style={{
                    color: article.source === "imported" ? c.accent : c.fgMuted,
                  }}
                >
                  {article.source === "imported" ? "导入" : "内置"}
                </span>
                <h3
                  className="mt-3 text-xl font-semibold leading-snug"
                  style={{ color: c.fg }}
                >
                  {article.title}
                </h3>
                <p className="mt-4 text-xs" style={{ color: c.fgMuted }}>
                  {article.content.match(/[A-Za-z]+/g)?.length ?? 0} 词 ·
                  点击查看全文
                </p>
              </div>
              {article.source === "imported" && (
                <button
                  type="button"
                  onClick={() => remove(article)}
                  className="pointer-events-auto relative z-10 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{ background: `${c.danger}12`, color: c.danger }}
                >
                  删除
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {visible.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 24)} className="mt-5 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: c.inputBg, color: c.accent }}>加载更多阅读文章</button>}
      {selected && (
        <ContentDrawer
          title={selected.title}
          content={selected.content}
          c={c}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function ContentHeader({
  c,
  title,
  description,
  format,
  inputRef,
  onUpload,
}: {
  c: ThemeColors
  title: string
  description: string
  format: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <h3 className="text-xl font-semibold" style={{ color: c.fg }}>
          {title}
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: c.fgMuted }}
        >
          {description}
        </p>
        <p className="mt-3 text-xs" style={{ color: c.fgMuted }}>
          Excel 第一行表头：<b style={{ color: c.fg }}>{format}</b>
          ；仅读取第一个工作表。
        </p>
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onUpload}
        />
        <Button type="button" variant="primary" c={c} onClick={() => inputRef.current?.click()}>导入 Excel</Button>
      </div>
    </div>
  )
}


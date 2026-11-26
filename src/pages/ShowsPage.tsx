import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { VocabEntry } from "@shared/schemas";
import { EnglishPageHeader } from "../components/english/EnglishUi";
import { placeVocabCard, VocabCardPopover, VocabLinkedText, type VocabCardAnchor } from "../components/english/VocabCardPopover";
import { Button, Card } from "../components/ui";
import { addUserChunk } from "../features/chunks/chunksStore";
import { formatTime, parseSubtitles, type SubtitleCue } from "../features/video/srtParser";
import { loadVocabMatcher, type VocabMatcher } from "../features/vocab/vocabMatcher";
import { loadVocabProgress, saveVocabBookmarks, saveVocabMastered, speakVocabText } from "../features/vocab/vocabStore";
import { api } from "../lib/api";
import type { ThemeColors } from "../types";

type ShowItem = {
  id: string;
  title: string;
  videoUrl: string;
  subtitleUrl: string | null;
  size: number;
  cropBottom: number;
};

type SubtitleMode = "bilingual" | "en" | "hidden";

const SPEEDS = [0.75, 0.85, 1.0, 1.15];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShowsPage({ c }: { c: ThemeColors }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [shows, setShows] = useState<ShowItem[]>([]);
  const [showsLoading, setShowsLoading] = useState(true);

  const [activeTitle, setActiveTitle] = useState("未选择视频");
  const [videoSrc, setVideoSrc] = useState("");
  const [cropBottom, setCropBottom] = useState(0);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subMode, setSubMode] = useState<SubtitleMode>("bilingual");
  const [speed, setSpeed] = useState(1.0);
  const [loopSentence, setLoopSentence] = useState(false);
  const [lockedCue, setLockedCue] = useState<SubtitleCue | null>(null);
  const [recording, setRecording] = useState(false);
  const [myRecordingUrl, setMyRecordingUrl] = useState<string | null>(null);
  const [savedCueIds, setSavedCueIds] = useState<Set<string>>(() => new Set());
  const [rightTab, setRightTab] = useState<"transcript" | "cloze">("transcript");
  const [clozeInputs, setClozeInputs] = useState<Record<string, string>>({});
  const [clozeChecked, setClozeChecked] = useState(false);
  const [vocabMatcher, setVocabMatcher] = useState<VocabMatcher | null>(null);
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");
  const [vocabBookmarks, setVocabBookmarks] = useState<Set<string>>(() => loadVocabProgress().bookmarked);
  const [vocabMastered, setVocabMastered] = useState<Set<string>>(() => loadVocabProgress().mastered);
  const [activeVocabCard, setActiveVocabCard] = useState<VocabCardAnchor | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVocabMatcher().then(setVocabMatcher).catch(() => {});
    api.health().then((health) => setCdnBaseUrl(health.cardsCdnUrl || "")).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/shows")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("无法读取片库"))))
      .then((data: { videos?: ShowItem[] }) => {
        if (active) setShows(data.videos ?? []);
      })
      .catch(() => {
        if (active) setStatusMessage("无法读取 public/shows 片库。");
      })
      .finally(() => {
        if (active) setShowsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCueIndex = useMemo(() => {
    return cues.findIndex((cue) => currentTime >= cue.startSec && currentTime <= cue.endSec);
  }, [cues, currentTime]);

  const activeCue = activeCueIndex >= 0 ? cues[activeCueIndex] : null;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed, videoSrc]);

  useEffect(() => {
    if (activeCueIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeCueIndex]);

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el) return;
    const t = el.currentTime;
    setCurrentTime(t);
    if (loopSentence && lockedCue && t >= lockedCue.endSec) {
      el.currentTime = lockedCue.startSec;
      void el.play().catch(() => {});
    }
  }

  function jumpToCue(cue: SubtitleCue) {
    const el = videoRef.current;
    if (!el) return;
    setLockedCue(cue);
    el.currentTime = cue.startSec + 0.01;
    void el.play().catch(() => {});
  }

  async function toggleShadowRecord() {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (myRecordingUrl) URL.revokeObjectURL(myRecordingUrl);
        const url = URL.createObjectURL(blob);
        setMyRecordingUrl(url);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setStatusMessage("无法访问麦克风，请检查浏览器权限。");
    }
  }

  function playShadowComparison() {
    if (!myRecordingUrl) return;
    const targetCue = lockedCue ?? activeCue;
    const vid = videoRef.current;
    if (vid && targetCue) {
      vid.currentTime = targetCue.startSec;
      void vid.play().catch(() => {});
      const ms = Math.max(800, (targetCue.endSec - targetCue.startSec) * 1000 / speed);
      window.setTimeout(() => {
        vid.pause();
        const audio = new Audio(myRecordingUrl);
        recordAudioRef.current?.pause();
        recordAudioRef.current = audio;
        void audio.play().catch(() => {});
      }, ms);
      return;
    }
    const audio = new Audio(myRecordingUrl);
    recordAudioRef.current?.pause();
    recordAudioRef.current = audio;
    void audio.play().catch(() => {});
  }

  function stepCue(delta: -1 | 0 | 1) {
    if (!cues.length) return;
    const base = activeCueIndex >= 0 ? activeCueIndex : 0;
    const targetIdx = Math.max(0, Math.min(cues.length - 1, base + delta));
    jumpToCue(cues[targetIdx]);
  }

  function openVocabCard(entry: VocabEntry, event: MouseEvent<HTMLElement>, sentence: string) {
    const card = placeVocabCard(entry, event, sentence);
    if (!card) return;
    setActiveVocabCard(card);
    speakVocabText(entry.audioText || entry.word, 0.95);
  }

  function toggleVocabCardBookmark(entry: VocabEntry, contextSentence: string) {
    const next = new Set(vocabBookmarks);
    if (next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      next.add(entry.id);
      addUserChunk({
        en: entry.word,
        zh: entry.definition,
        context: contextSentence.slice(0, 120),
        source: "shows",
        sourceRef: activeTitle,
      });
    }
    setVocabBookmarks(next);
    saveVocabBookmarks(next);
  }

  function toggleVocabCardMastered(entryId: string) {
    const next = new Set(vocabMastered);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setVocabMastered(next);
    saveVocabMastered(next);
  }

  async function selectShow(item: ShowItem) {
    setVideoSrc(item.videoUrl);
    setCropBottom(item.cropBottom || 0);
    setActiveTitle(item.title);
    setLockedCue(null);
    setCurrentTime(0);
    setCues([]);
    if (!item.subtitleUrl) return;
    try {
      const res = await fetch(item.subtitleUrl);
      if (!res.ok) return;
      setCues(parseSubtitles(await res.text()));
    } catch {
      setStatusMessage("字幕读取失败。");
    }
  }

  return (
    <div className="space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="TV SHOW STUDIO"
        title="美剧精听"
        description="片库来自 public/shows。同名字幕会自动配对；点击任意台词跳播、单句循环、切换无字幕盲听。"
      />

      {statusMessage && (
        <p
          className="rounded-xl px-4 py-2.5 text-sm"
          style={{ background: c.accentDim, color: c.accent }}
        >
          {statusMessage}
        </p>
      )}

      {/* Main Player + Transcript Grid */}
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        {/* Left: Video Player & Controls */}
        <Card c={c} className="overflow-hidden">
          <div
            className={`relative w-full overflow-hidden flex items-center justify-center ${videoSrc ? "bg-black" : "aspect-video bg-[#0F172A] p-6"}`}
            style={videoSrc ? { aspectRatio: cropBottom > 0 ? `16 / ${9 * (1 - cropBottom)}` : "16 / 9" } : undefined}
          >
            {videoSrc ? (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  className="h-full w-full bg-black"
                  style={{ objectFit: cropBottom > 0 ? "cover" : "contain", objectPosition: "center top" }}
                />
                {activeCue && subMode !== "hidden" && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-12 flex flex-col items-center text-center gap-1">
                    <span className="pointer-events-auto rounded-lg bg-black/75 px-3 py-1 text-sm md:text-base font-semibold text-white backdrop-blur-sm">
                      <VocabLinkedText
                        text={activeCue.en}
                        matcher={vocabMatcher}
                        excludedIds={vocabMastered}
                        hitClassName="novel-vocab-hit novel-vocab-hit-on-dark"
                        onOpen={openVocabCard}
                      />
                    </span>
                    {subMode === "bilingual" && activeCue.zh && (
                      <span className="rounded-md bg-black/70 px-2.5 py-0.5 text-xs text-slate-200 backdrop-blur-sm">
                        {activeCue.zh}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full rounded-xl border border-dashed border-slate-700/80 flex flex-col items-center justify-center text-center px-6 gap-2">
                <p className="text-sm font-medium text-slate-200">
                  尚未选择美剧片段
                </p>
                <p className="text-xs text-slate-400 max-w-sm">
                  从下方片库选择一集开始精听
                </p>
              </div>
            )}
          </div>

          <div className="p-4 md:p-5 space-y-3.5 border-t" style={{ borderColor: c.borderSub }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate" style={{ color: c.fg }}>
                {activeTitle}
              </p>
              {/* Segmented Control for Subtitle Modes */}
              <div
                role="tablist"
                aria-label="字幕显示模式"
                className="inline-flex items-center rounded-xl p-1 gap-1"
                style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
              >
                {(
                  [
                    { id: "bilingual", label: "中英双语" },
                    { id: "en", label: "仅看英文" },
                    { id: "hidden", label: "无字幕盲听" },
                  ] as const
                ).map((item) => {
                  const active = subMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSubMode(item.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer"
                      style={
                        active
                          ? { background: c.card, color: c.fg, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }
                          : { color: c.fgMuted }
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              {/* Navigation Group */}
              <div className="flex items-center gap-1.5">
                <Button c={c} variant="secondary" disabled={!cues.length} onClick={() => stepCue(-1)}>
                  ← 上一句
                </Button>
                <Button c={c} variant="secondary" disabled={!cues.length} onClick={() => stepCue(1)}>
                  下一句 →
                </Button>
                <Button
                  c={c}
                  variant="ghost"
                  onClick={() =>
                    setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])
                  }
                >
                  {speed}x
                </Button>
              </div>

              {/* Core Practice Group */}
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-xl p-1"
                style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
              >
                <Button c={c} variant="secondary" disabled={!cues.length} onClick={() => stepCue(0)}>
                  重听本句
                </Button>
                <Button
                  c={c}
                  variant={loopSentence ? "primary" : "secondary"}
                  disabled={!cues.length}
                  onClick={() => {
                    const next = !loopSentence;
                    setLoopSentence(next);
                    if (next && activeCue) setLockedCue(activeCue);
                  }}
                >
                  {loopSentence ? "单句循环中" : "单句循环"}
                </Button>
                <Button
                  c={c}
                  variant={recording ? "danger" : "secondary"}
                  onClick={() => void toggleShadowRecord()}
                >
                  {recording ? "停止录音" : "跟读录音"}
                </Button>
                {myRecordingUrl && (
                  <Button c={c} variant="primary" onClick={playShadowComparison}>
                    原声 → 我的对比
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Right: Interactive Subtitle Transcript / Cloze Dictation */}
        <Card c={c} className="flex flex-col h-[460px] lg:h-[520px]">
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-2"
            style={{ borderColor: c.borderSub }}
          >
            <div className="flex items-center gap-1.5 rounded-lg p-0.5" style={{ background: c.inputBg }}>
              <button
                type="button"
                onClick={() => setRightTab("transcript")}
                className="rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer"
                style={rightTab === "transcript" ? { background: c.card, color: c.fg } : { color: c.fgMuted }}
              >
                台词 ({cues.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightTab("cloze");
                  setClozeChecked(false);
                }}
                className="rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer"
                style={rightTab === "cloze" ? { background: c.card, color: c.fg } : { color: c.fgMuted }}
              >
                盲听填空
              </button>
            </div>
            <span className="text-xs" style={{ color: c.fgMuted }}>
              {rightTab === "transcript" ? "点击任意句跳播" : "填写空缺实词"}
            </span>
          </div>

          {rightTab === "cloze" ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cues.length === 0 ? (
                <p className="py-12 text-center text-sm" style={{ color: c.fgMuted }}>
                  从片库选择带字幕的一集后，这里会出现填空。
                </p>
              ) : (
                <>
                  {cues.slice(Math.max(0, activeCueIndex), Math.max(0, activeCueIndex) + 4).map((cue) => {
                    const tokens = cue.en.split(/\s+/).filter(Boolean);
                    const targetIdx = tokens.findIndex((t) => /^[a-zA-Z]{4,}$/.test(t.replace(/[.,!?;:'"]/g, "")));
                    return (
                      <div
                        key={cue.id}
                        className="rounded-xl p-3.5 space-y-2"
                        style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] zen-tnum" style={{ color: c.fgMuted }}>
                            {formatTime(cue.startSec)}
                          </span>
                          <button
                            type="button"
                            onClick={() => jumpToCue(cue)}
                            className="text-xs font-medium cursor-pointer"
                            style={{ color: c.accent }}
                          >
                            播放这句
                          </button>
                        </div>
                        <p className="text-sm leading-loose flex flex-wrap items-center gap-1.5" lang="en">
                          {tokens.map((tok, i) => {
                            if (i !== targetIdx) {
                              return (
                                <span key={i} style={{ color: c.fg }}>
                                  <VocabLinkedText
                                    text={tok}
                                    matcher={vocabMatcher}
                                    excludedIds={vocabMastered}
                                    onOpen={openVocabCard}
                                  />
                                </span>
                              );
                            }
                            const clean = tok.replace(/[.,!?;:'"]/g, "");
                            const key = `${cue.id}-${i}`;
                            const val = clozeInputs[key] ?? "";
                            const ok = val.trim().toLowerCase() === clean.toLowerCase();
                            return (
                              <input
                                key={i}
                                value={val}
                                onChange={(e) => {
                                  setClozeChecked(false);
                                  setClozeInputs((prev) => ({ ...prev, [key]: e.target.value }));
                                }}
                                placeholder={"_".repeat(Math.min(8, clean.length))}
                                className="w-24 rounded-md border-b-2 bg-transparent px-1.5 py-0.5 text-center text-sm font-semibold outline-none"
                                style={{
                                  borderColor: clozeChecked ? (ok ? c.success : c.danger) : c.accent,
                                  color: clozeChecked ? (ok ? c.success : c.danger) : c.fg,
                                }}
                              />
                            );
                          })}
                        </p>
                      </div>
                    );
                  })}
                  <div className="flex justify-end">
                    <Button c={c} variant="primary" onClick={() => setClozeChecked(true)}>
                      核对填空
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {cues.length === 0 ? (
              <div className="h-full grid place-items-center text-center px-4">
                <p className="text-sm" style={{ color: c.fgMuted }}>
                  这一集还没有同名字幕。
                </p>
              </div>
            ) : (
              cues.map((cue, idx) => {
                const isActive = idx === activeCueIndex;
                const isSaved = savedCueIds.has(cue.id);
                return (
                  <div
                    key={cue.id}
                    className="flex items-start gap-1.5 rounded-xl px-2.5 py-2 transition-colors"
                    style={{
                      background: isActive ? c.accentDim : "transparent",
                      border: `1px solid ${isActive ? `${c.accent}44` : "transparent"}`,
                    }}
                  >
                    <button
                      ref={isActive ? activeLineRef : null}
                      type="button"
                      onClick={() => jumpToCue(cue)}
                      className="flex-1 text-left cursor-pointer min-w-0"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="text-[11px] font-medium zen-tnum mt-0.5 shrink-0"
                          style={{ color: isActive ? c.accent : c.fgDim }}
                        >
                          {formatTime(cue.startSec)}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          {subMode !== "hidden" ? (
                            <p
                              className="text-[13.5px] leading-snug font-medium"
                              style={{ color: isActive ? c.accent : c.fg }}
                              lang="en"
                            >
                              <VocabLinkedText
                                text={cue.en}
                                matcher={vocabMatcher}
                                excludedIds={vocabMastered}
                                onOpen={openVocabCard}
                              />
                            </p>
                          ) : (
                            <p className="text-[13px] italic" style={{ color: c.fgMuted }}>
                              （盲听隐藏 · 点击可跳播）
                            </p>
                          )}
                          {subMode === "bilingual" && cue.zh && (
                            <p className="text-xs leading-snug" style={{ color: c.fgMuted }}>
                              {cue.zh}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addUserChunk({ en: cue.en, zh: cue.zh, context: activeTitle, source: "shows" });
                        setSavedCueIds((prev) => new Set(prev).add(cue.id));
                      }}
                      className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium cursor-pointer"
                      style={{
                        background: isSaved ? c.successDim : c.inputBg,
                        color: isSaved ? c.success : c.fgMuted,
                      }}
                      title="收藏到个人语块本"
                    >
                      {isSaved ? "已存" : "收藏"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          )}
        </Card>
      </div>

      {/* Local Folder Scanned Library */}
      <Card c={c}>
        <div className="p-5 md:p-6 space-y-4">
          <div>
            <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
              SHOW LIBRARY
            </p>
            <h3 className="type-title mt-1" style={{ color: c.fg }}>
              美剧片库 ({shows.length})
            </h3>
          </div>
          {showsLoading ? (
            <p className="text-sm" style={{ color: c.fgMuted }}>正在读取片库…</p>
          ) : shows.length === 0 ? (
            <p className="text-sm" style={{ color: c.fgMuted }}>
              public/shows 里还没有视频。把 .mp4 和同名 .srt 放进这个文件夹后刷新页面。
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shows.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl p-4 flex flex-col justify-between gap-3"
                  style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
                >
                  <div>
                    <p className="text-sm font-semibold truncate" style={{ color: c.fg }}>
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>
                      {formatBytes(item.size)} · {item.subtitleUrl ? "已配对字幕" : "无同名字幕"}
                    </p>
                  </div>
                  <Button c={c} variant="primary" onClick={() => void selectShow(item)}>
                    播放精听
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <VocabCardPopover
        c={c}
        card={activeVocabCard}
        bookmarked={activeVocabCard ? vocabBookmarks.has(activeVocabCard.entry.id) : false}
        mastered={activeVocabCard ? vocabMastered.has(activeVocabCard.entry.id) : false}
        cdnBaseUrl={cdnBaseUrl}
        onClose={() => setActiveVocabCard(null)}
        onToggleBookmark={toggleVocabCardBookmark}
        onToggleMastered={toggleVocabCardMastered}
      />
    </div>
  );
}

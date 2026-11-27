import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
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
  posterUrl?: string | null;
  size: number;
  cropBottom: number;
};

type SubtitleMode = "bilingual" | "en" | "hidden";

const SPEEDS = [0.75, 0.85, 1.0, 1.15];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type TranscriptRowProps = {
  cue: SubtitleCue;
  isActive: boolean;
  isSaved: boolean;
  subMode: SubtitleMode;
  c: ThemeColors;
  activeLineRef: RefObject<HTMLButtonElement | null>;
  vocabMatcher: VocabMatcher | null;
  vocabMastered: Set<string>;
  onJump: (cue: SubtitleCue) => void;
  onSave: (cue: SubtitleCue) => void;
  onOpenVocab: (entry: VocabEntry, event: MouseEvent<HTMLElement>, sentence: string) => void;
};

const TranscriptRow = memo(function TranscriptRow({
  cue,
  isActive,
  isSaved,
  subMode,
  c,
  activeLineRef,
  vocabMatcher,
  vocabMastered,
  onJump,
  onSave,
  onOpenVocab,
}: TranscriptRowProps) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-xl px-2.5 py-2 transition-colors"
      style={{
        background: isActive ? c.accentDim : "transparent",
        border: `1px solid ${isActive ? `${c.accent}44` : "transparent"}`,
      }}
    >
      <button
        ref={isActive ? activeLineRef : null}
        type="button"
        onClick={() => onJump(cue)}
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
                  onOpen={onOpenVocab}
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
        onClick={() => onSave(cue)}
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
});

export default function ShowsPage({ c }: { c: ThemeColors }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [shows, setShows] = useState<ShowItem[]>([]);
  const [showsLoading, setShowsLoading] = useState(true);

  const [activeTitle, setActiveTitle] = useState("未选择视频");
  const [videoSrc, setVideoSrc] = useState("");
  const [cropBottom, setCropBottom] = useState(0);
  const [videoAspect, setVideoAspect] = useState("16 / 9");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [activeCueIndex, setActiveCueIndex] = useState(-1);
  const activeCueIndexRef = useRef(-1);
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
    const idx = cues.findIndex((cue) => t >= cue.startSec && t <= cue.endSec);
    if (idx !== activeCueIndexRef.current) {
      activeCueIndexRef.current = idx;
      setActiveCueIndex(idx);
    }
    if (loopSentence && lockedCue && t >= lockedCue.endSec) {
      el.currentTime = lockedCue.startSec;
      void el.play().catch(() => {});
    }
  }

  const jumpToCue = useCallback(
    (cue: SubtitleCue) => {
      const el = videoRef.current;
      if (!el) return;
      setLockedCue(cue);
      const idx = cues.findIndex((cItem) => cItem.id === cue.id);
      if (idx >= 0) {
        activeCueIndexRef.current = idx;
        setActiveCueIndex(idx);
      }
      el.currentTime = cue.startSec + 0.01;
      void el.play().catch(() => {});
    },
    [cues],
  );

  const saveCue = useCallback(
    (cue: SubtitleCue) => {
      addUserChunk({ en: cue.en, zh: cue.zh, context: activeTitle, source: "shows" });
      setSavedCueIds((prev) => {
        if (prev.has(cue.id)) return prev;
        const next = new Set(prev);
        next.add(cue.id);
        return next;
      });
    },
    [activeTitle],
  );

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

  const openVocabCard = useCallback((entry: VocabEntry, event: MouseEvent<HTMLElement>, sentence: string) => {
    const card = placeVocabCard(entry, event, sentence);
    if (!card) return;
    setActiveVocabCard(card);
    speakVocabText(entry.audioText || entry.word, 0.95);
  }, []);

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
    setVideoAspect("16 / 9");
    setActiveTitle(item.title);
    setLockedCue(null);
    activeCueIndexRef.current = -1;
    setActiveCueIndex(-1);
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

  function backToLibrary() {
    videoRef.current?.pause();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    setRecording(false);
    setVideoSrc("");
    setActiveTitle("未选择视频");
    setCropBottom(0);
    setVideoAspect("16 / 9");
    setCues([]);
    setLockedCue(null);
    activeCueIndexRef.current = -1;
    setActiveCueIndex(-1);
    setActiveVocabCard(null);
    setClozeInputs({});
    setClozeChecked(false);
  }

  const activeShowIdx = shows.findIndex((s) => s.videoUrl === videoSrc);
  const prevShow = activeShowIdx > 0 ? shows[activeShowIdx - 1] : null;
  const nextShow = activeShowIdx >= 0 && activeShowIdx < shows.length - 1 ? shows[activeShowIdx + 1] : null;

  return (
    <div className="space-y-4 pb-8 zen-page-enter">
      {!videoSrc ? (
        <EnglishPageHeader
          c={c}
          eyebrow="TV SHOW STUDIO"
          title="美剧精听"
          description="片库来自 public/shows。点击任意剧集进入精听详情页。"
        />
      ) : (
        /* Slim Studio Top Bar */
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 zen-card"
          style={{ borderColor: c.borderSub }}
        >
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <Button c={c} variant="secondary" onClick={backToLibrary}>
              ← 返回片库
            </Button>
            <h1 className="type-title truncate max-w-[240px] sm:max-w-md" style={{ color: c.fg }}>
              {activeTitle}
            </h1>
            {cues.length > 0 && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium zen-tnum"
                style={{ background: c.inputBg, color: c.fgMuted }}
              >
                {activeCueIndex >= 0 ? `${activeCueIndex + 1} / ${cues.length} 句` : `${cues.length} 句`}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Subtitle Mode Segmented Control */}
            <div
              role="tablist"
              aria-label="字幕显示模式"
              className="inline-flex items-center rounded-xl p-1 gap-0.5"
              style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
            >
              {(
                [
                  { id: "bilingual", label: "中英双语" },
                  { id: "en", label: "仅看英文" },
                  { id: "hidden", label: "盲听" },
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

            {shows.length > 1 && (
              <div className="hidden sm:flex items-center gap-1">
                <Button c={c} variant="ghost" disabled={!prevShow} onClick={() => prevShow && void selectShow(prevShow)}>
                  上一集
                </Button>
                <Button c={c} variant="ghost" disabled={!nextShow} onClick={() => nextShow && void selectShow(nextShow)}>
                  下一集
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {statusMessage && (
        <p
          className="rounded-xl px-4 py-2.5 text-sm"
          style={{ background: c.accentDim, color: c.accent }}
        >
          {statusMessage}
        </p>
      )}

      {videoSrc ? (
        /* Main Player + Transcript Studio */
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] items-stretch">
        {/* Left: Video Player + Current Sentence Focus + Transport Dock */}
        <div className="flex flex-col gap-3.5 min-w-0">
          <Card c={c} className="overflow-hidden">
            <div
              className="relative w-full overflow-hidden flex items-center justify-center bg-black"
              style={{ aspectRatio: videoAspect }}
            >
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                onLoadedMetadata={(e) => {
                  const { videoWidth, videoHeight } = e.currentTarget;
                  if (videoWidth > 0 && videoHeight > 0) {
                    const h = cropBottom > 0 ? videoHeight * (1 - cropBottom) : videoHeight;
                    setVideoAspect(`${videoWidth} / ${h}`);
                  }
                }}
                onTimeUpdate={handleTimeUpdate}
                className="h-full w-full bg-black"
                style={{ objectFit: cropBottom > 0 ? "cover" : "contain", objectPosition: "center top" }}
              />
              {activeCue && subMode !== "hidden" && (
                <div className="pointer-events-none absolute inset-x-4 bottom-12 flex flex-col items-center text-center gap-1">
                  <span className="rounded-lg bg-black/80 px-3 py-1 text-sm md:text-base font-semibold text-white">
                    {activeCue.en}
                  </span>
                  {subMode === "bilingual" && activeCue.zh && (
                    <span className="rounded-md bg-black/75 px-2.5 py-0.5 text-xs text-slate-200">
                      {activeCue.zh}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Current Sentence Spotlight + Transport & Shadowing Dock */}
          <Card c={c} className="p-4 md:p-5 space-y-3.5">
            {cues.length > 0 && (
              <div
                className="rounded-xl px-4 py-3 flex items-start justify-between gap-3"
                style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: c.fgMuted }}>
                    <span className="zen-tnum">{activeCue ? formatTime(activeCue.startSec) : "00:00"}</span>
                    <span>·</span>
                    <span>{loopSentence ? "单句循环锁定中" : "当前精听句"}</span>
                  </div>
                  {subMode === "hidden" ? (
                    <p className="mt-1 text-sm italic" style={{ color: c.fgMuted }}>
                      无字幕盲听中 — 先听再对照右侧台词或切换字幕模式
                    </p>
                  ) : activeCue ? (
                    <p className="mt-1 text-base font-semibold leading-relaxed" style={{ color: c.fg }} lang="en">
                      {activeCue.en}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm" style={{ color: c.fgMuted }}>
                      播放视频或点击右侧任意一句开始精听
                    </p>
                  )}
                </div>
                {activeCue && (
                  <button
                    type="button"
                    onClick={() => {
                      addUserChunk({ en: activeCue.en, zh: activeCue.zh, context: activeTitle, source: "shows" });
                      setSavedCueIds((prev) => new Set(prev).add(activeCue.id));
                    }}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    style={{
                      background: savedCueIds.has(activeCue.id) ? c.successDim : c.card,
                      color: savedCueIds.has(activeCue.id) ? c.success : c.accent,
                      border: `1px solid ${c.borderSub}`,
                    }}
                  >
                    {savedCueIds.has(activeCue.id) ? "已存语块 ✓" : "收藏本句"}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Playback Group */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button c={c} variant="secondary" disabled={!cues.length} onClick={() => stepCue(-1)}>
                  ← 上一句
                </Button>
                <Button c={c} variant="secondary" disabled={!cues.length} onClick={() => stepCue(0)}>
                  重听本句
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

              {/* Shadowing Group */}
              <div className="flex flex-wrap items-center gap-1.5">
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
                  {loopSentence ? "单句循环 ✓" : "单句循环"}
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
          </Card>
        </div>

        {/* Right: Interactive Subtitle Transcript / Cloze Dictation */}
        <Card c={c} className="flex flex-col h-[500px] lg:h-[620px]">
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
              cues.map((cue, idx) => (
                <TranscriptRow
                  key={cue.id}
                  cue={cue}
                  isActive={idx === activeCueIndex}
                  isSaved={savedCueIds.has(cue.id)}
                  subMode={subMode}
                  c={c}
                  activeLineRef={activeLineRef}
                  vocabMatcher={vocabMatcher}
                  vocabMastered={vocabMastered}
                  onJump={jumpToCue}
                  onSave={saveCue}
                  onOpenVocab={openVocabCard}
                />
              ))
            )}
          </div>
          )}
        </Card>
      </div>
      ) : (
        /* Cinema Poster Show Library (2-layer: Canvas -> Poster Cards) */
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
              SHOW LIBRARY · {shows.length} 集
            </p>
          </div>

          {showsLoading ? (
            <p className="py-12 text-center text-sm" style={{ color: c.fgMuted }}>正在读取片库…</p>
          ) : shows.length === 0 ? (
            <Card c={c} className="p-8 text-center">
              <p className="text-sm" style={{ color: c.fgMuted }}>
                public/shows 里还没有视频。把 .mp4 和同名 .srt 放进这个文件夹后刷新页面。
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shows.map((item, idx) => (
                <Card
                  key={item.id}
                  c={c}
                  hover
                  className="group overflow-hidden cursor-pointer flex flex-col"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void selectShow(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void selectShow(item);
                      }
                    }}
                    className="flex flex-col h-full text-left outline-none"
                  >
                    {/* 16:9 Video Cover */}
                    <div className="relative aspect-video w-full overflow-hidden bg-[#0F172A]">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div
                          className="h-full w-full flex items-center justify-center"
                          style={{
                            background: "linear-gradient(135deg, rgba(28,69,50,0.85), rgba(15,23,42,0.95))",
                          }}
                        >
                          <span className="font-mono text-lg font-bold tracking-wider text-white/75">
                            {item.id}
                          </span>
                        </div>
                      )}

                      {/* Subtle Bottom Gradient */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: "linear-gradient(to top, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.08) 45%, transparent 100%)",
                        }}
                      />

                      {/* Top Badges */}
                      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2">
                        <span className="rounded-md bg-black/55 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">
                          EP {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="rounded-md px-2 py-0.5 text-[10.5px] font-medium backdrop-blur-sm"
                          style={{
                            background: item.subtitleUrl ? "rgba(28, 69, 50, 0.82)" : "rgba(0, 0, 0, 0.55)",
                            color: "#fff",
                          }}
                        >
                          {item.subtitleUrl ? "英文字幕" : "纯视频"}
                        </span>
                      </div>

                      {/* Center Hover Play Button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[#14171F] shadow-lg backdrop-blur-sm">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-0.5">
                            <polygon points="6 4 20 12 6 20 6 4" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Clean Card Footer */}
                    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold truncate" style={{ color: c.fg }}>
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs zen-tnum" style={{ color: c.fgMuted }}>
                          {formatBytes(item.size)} · {item.subtitleUrl ? "点击进入精听" : "无外挂字幕"}
                        </p>
                      </div>
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full transition-colors"
                        style={{ background: c.accentDim, color: c.accent }}
                        aria-hidden="true"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router";
import { EnglishPageHeader } from "../components/english/EnglishUi";
import { Button, Card, EmptyState } from "../components/ui";
import { addUserChunk } from "../features/chunks/chunksStore";
import { formatTime, parseSubtitles, type SubtitleCue } from "../features/video/srtParser";
import type { ThemeColors } from "../types";

type CloudVideoItem = {
  id: string;
  title: string;
  videoKey: string;
  subtitleKey: string | null;
  size: number;
  uploadedAt: string;
};

type LocalShowItem = {
  id: string;
  title: string;
  videoFile: File;
  subtitleFile: File | null;
};

type SubtitleMode = "bilingual" | "en" | "hidden";

const SPEEDS = [0.75, 0.85, 1.0, 1.15];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShowsPage({ c }: { c: ThemeColors }) {
  const [cloudVideos, setCloudVideos] = useState<CloudVideoItem[]>([]);
  const [cloudAuthRequired, setCloudAuthRequired] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [activeTitle, setActiveTitle] = useState("未选择视频");
  const [videoSrc, setVideoSrc] = useState("");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subMode, setSubMode] = useState<SubtitleMode>("bilingual");
  const [speed, setSpeed] = useState(1.0);
  const [loopSentence, setLoopSentence] = useState(false);
  const [lockedCue, setLockedCue] = useState<SubtitleCue | null>(null);
  const [recording, setRecording] = useState(false);
  const [myRecordingUrl, setMyRecordingUrl] = useState<string | null>(null);
  const [savedCueIds, setSavedCueIds] = useState<Set<string>>(() => new Set());
  const [localShows, setLocalShows] = useState<LocalShowItem[]>([]);
  const [rightTab, setRightTab] = useState<"transcript" | "cloze">("transcript");
  const [clozeInputs, setClozeInputs] = useState<Record<string, string>>({});
  const [clozeChecked, setClozeChecked] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoInputRef = useRef<HTMLInputElement | null>(null);
  const localSubInputRef = useRef<HTMLInputElement | null>(null);
  const localFolderInputRef = useRef<HTMLInputElement | null>(null);
  const cloudUploadInputRef = useRef<HTMLInputElement | null>(null);

  const fetchCloudVideos = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/videos");
      if (res.status === 401) {
        setCloudAuthRequired(true);
        setCloudVideos([]);
        return;
      }
      if (!res.ok) throw new Error("无法获取云端视频列表");
      const data = (await res.json()) as { videos?: CloudVideoItem[] };
      setCloudAuthRequired(false);
      setCloudVideos(data.videos ?? []);
    } catch {
      setCloudVideos([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchCloudVideos();
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, [fetchCloudVideos]);

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

  async function selectCloudVideo(item: CloudVideoItem) {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }
    setActiveTitle(item.title);
    setVideoSrc(`/api/videos/stream/${encodeURIComponent(item.videoKey)}`);
    setLockedCue(null);
    setCurrentTime(0);
    setStatusMessage("");
    if (item.subtitleKey) {
      try {
        const res = await fetch(`/api/videos/subtitle/${encodeURIComponent(item.subtitleKey)}`);
        if (res.ok) {
          setCues(parseSubtitles(await res.text()));
          return;
        }
      } catch {}
    }
    setCues([]);
  }

  async function handleCloudUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const oversized = files.find((f) => f.size > 95 * 1024 * 1024);
    if (oversized) {
      setStatusMessage(`「${oversized.name}」超过单次上传上限 95MB，建议先用 ffmpeg 切分为 3~5 分钟精听片段再上传。`);
      return;
    }

    setUploading(true);
    setStatusMessage("");
    try {
      for (const file of files) {
        const res = await fetch("/api/videos/upload", {
          method: "PUT",
          headers: { "x-file-name": encodeURIComponent(file.name) },
          body: file,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error || `上传 ${file.name} 失败`);
        }
      }
      setStatusMessage(`已成功上传 ${files.length} 个文件到 Cloudflare R2（同名视频与字幕会自动配对）。`);
      await fetchCloudVideos();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "上传失败，请重试。");
    } finally {
      setUploading(false);
    }
  }

  async function deleteCloudVideo(item: CloudVideoItem) {
    if (typeof window !== "undefined" && !window.confirm(`确定要从云端永久删除「${item.title}」吗？此操作不可撤销。`)) {
      return;
    }
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(item.videoKey)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeTitle === item.title) {
          setVideoSrc("");
          setCues([]);
          setActiveTitle("未选择视频");
        }
        await fetchCloudVideos();
      }
    } catch {}
  }

  function handleLocalVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setVideoSrc(url);
    setActiveTitle(file.name.replace(/\.[^.]+$/, ""));
    setLockedCue(null);
    setStatusMessage("");
  }

  async function handleLocalFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const videoMap = new Map<string, File>();
    const subMap = new Map<string, File>();
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const stem = file.name.replace(/\.[^.]+$/, "");
      if (/\.(mp4|webm|m4v|mov)$/.test(lower)) videoMap.set(stem, file);
      else if (/\.(srt|vtt)$/.test(lower)) subMap.set(stem, file);
    }

    const items: LocalShowItem[] = [...videoMap.entries()]
      .map(([stem, videoFile]) => ({
        id: stem,
        title: stem.replace(/[_-]+/g, " "),
        videoFile,
        subtitleFile: subMap.get(stem) ?? null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));

    setLocalShows(items);
    setStatusMessage(
      items.length
        ? `已扫描本地文件夹：共匹配 ${items.length} 个视频（其中 ${items.filter((i) => i.subtitleFile).length} 个已自动配对字幕）。`
        : "该文件夹下未找到 .mp4/.webm/.m4v/.mov 视频文件。",
    );
  }

  async function selectLocalShow(item: LocalShowItem) {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(item.videoFile);
    localUrlRef.current = url;
    setVideoSrc(url);
    setActiveTitle(item.title);
    setLockedCue(null);
    setCurrentTime(0);
    if (item.subtitleFile) {
      const text = await item.subtitleFile.text();
      setCues(parseSubtitles(text));
    } else {
      setCues([]);
    }
  }

  async function handleLocalSubtitle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const parsed = parseSubtitles(text);
    setCues(parsed);
    setStatusMessage(parsed.length ? `已载入 ${parsed.length} 句字幕。` : "未能识别该字幕文件中的时间轴。");
  }

  return (
    <div className="space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="TV SHOW STUDIO"
        title="美剧精听"
        description="支持 Cloudflare R2 云端片库与本地视频直放；点击任意台词跳播、单句循环、切换无字幕盲听。"
        aside={
          <>
            <input
              ref={localVideoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.m4v,.mov"
              onChange={handleLocalVideo}
              className="hidden"
            />
            <input
              ref={localSubInputRef}
              type="file"
              accept=".srt,.vtt"
              onChange={(e) => void handleLocalSubtitle(e)}
              className="hidden"
            />
            <input
              ref={localFolderInputRef}
              type="file"
              // @ts-expect-error non-standard folder picker attribute supported in Chromium/WebKit
              webkitdirectory=""
              multiple
              onChange={(e) => void handleLocalFolder(e)}
              className="hidden"
            />
            <input
              ref={cloudUploadInputRef}
              type="file"
              multiple
              accept=".mp4,.webm,.m4v,.mov,.srt,.vtt"
              onChange={(e) => void handleCloudUpload(e)}
              className="hidden"
            />
            <Button c={c} variant="secondary" onClick={() => localFolderInputRef.current?.click()}>
              扫描本地文件夹
            </Button>
            <Button c={c} variant="secondary" onClick={() => localVideoInputRef.current?.click()}>
              本地选视频
            </Button>
            <Button c={c} variant="secondary" onClick={() => localSubInputRef.current?.click()}>
              载入 SRT 字幕
            </Button>
            {!cloudAuthRequired && (
              <Button
                c={c}
                variant="secondary"
                disabled={uploading}
                onClick={() => cloudUploadInputRef.current?.click()}
              >
                {uploading ? "正在上传 R2…" : "上传到 Cloudflare R2"}
              </Button>
            )}
          </>
        }
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
          <div className={`relative aspect-video w-full flex items-center justify-center ${videoSrc ? "bg-black" : "bg-[#0F172A] p-6"}`}>
            {videoSrc ? (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full object-contain"
                />
                {activeCue && subMode !== "hidden" && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-12 flex flex-col items-center text-center gap-1">
                    <span className="rounded-lg bg-black/75 px-3 py-1 text-sm md:text-base font-semibold text-white backdrop-blur-sm">
                      {activeCue.en}
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
                  点击右上角「扫描本地文件夹」或「本地选视频」，也可从下方 Cloudflare R2 云端片库选片开始精听
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
                  请先载入视频与 SRT 字幕。
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
                            if (i !== targetIdx) return <span key={i} style={{ color: c.fg }}>{tok}</span>;
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
                  载入 `.srt` 或 `.vtt` 字幕后，这里会生成可点击跳播的台词列表。
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
                              {cue.en}
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
      {localShows.length > 0 && (
        <Card c={c}>
          <div className="p-5 md:p-6 space-y-4">
            <div>
              <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                LOCAL FOLDER LIBRARY
              </p>
              <h3 className="type-title mt-1" style={{ color: c.fg }}>
                本地美剧片库 ({localShows.length})
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {localShows.map((item) => (
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
                      {formatBytes(item.videoFile.size)} · {item.subtitleFile ? "已配对字幕" : "无同名字幕"}
                    </p>
                  </div>
                  <Button c={c} variant="primary" onClick={() => void selectLocalShow(item)}>
                    播放精听
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Cloudflare R2 Cloud Library */}
      <Card c={c}>
        <div className="p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                CLOUDFLARE R2 LIBRARY
              </p>
              <h3 className="type-title mt-1" style={{ color: c.fg }}>
                云端美剧片库（私有存储 · 仅本人可见）
              </h3>
            </div>
            {cloudAuthRequired && (
              <NavLink
                to="/login"
                className="rounded-xl px-3.5 py-2 text-[13px] font-semibold"
                style={{ background: c.accent, color: c.accentFg }}
              >
                登录后使用云端 R2
              </NavLink>
            )}
          </div>

          {cloudAuthRequired ? (
            <p className="text-sm" style={{ color: c.fgMuted }}>
              当前为本地访客模式，可直接使用上方「本地选视频」播放电脑里的美剧；登录个人账号后即可上传并在多设备间流式播放 Cloudflare R2 里的视频片段。
            </p>
          ) : loadingList ? (
            <p className="py-6 text-center text-sm" style={{ color: c.fgMuted }}>
              正在读取 Cloudflare R2 片库…
            </p>
          ) : cloudVideos.length === 0 ? (
            <EmptyState
              c={c}
              title="云端片库还是空的"
              description="把切好的美剧片段（如 friends-s01e01.mp4 和同名 friends-s01e01.srt）一起上传到 R2，系统会自动配对字幕。"
              action={
                <Button c={c} variant="primary" onClick={() => cloudUploadInputRef.current?.click()}>
                  立即上传视频与字幕
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cloudVideos.map((item) => (
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
                      {formatBytes(item.size)} · {item.subtitleKey ? "已配对字幕" : "无外挂字幕"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button c={c} variant="primary" onClick={() => void selectCloudVideo(item)}>
                      播放精听
                    </Button>
                    <Button c={c} variant="ghost" onClick={() => void deleteCloudVideo(item)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

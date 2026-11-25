export async function synthesizeReadingAudio(
  { text }: { text: string },
  request: typeof fetch = fetch,
): Promise<Blob> {
  const content = text.trim();
  if (!content) throw new Error("没有可朗读的内容。");
  let response: Response;
  try {
    response = await request("/api/english/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("朗读准备超时，请稍后重试。");
    }
    throw error;
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null) as { error?: unknown } | null)?.error;
    throw new Error(typeof detail === "string" ? detail : "朗读服务暂时不可用，请稍后重试。");
  }
  const audio = await response.blob();
  if (!audio.size) throw new Error("朗读服务未返回音频，请稍后重试。");
  return audio;
}
export type StreamingReadingAudio = {
  finished: Promise<void>;
  player: HTMLAudioElement;
  stop: () => void;
  url: string;
};

function waitForSourceOpen(mediaSource: MediaSource): Promise<void> {
  return new Promise((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
    mediaSource.addEventListener("error", () => reject(new Error("浏览器无法初始化音频播放。")), { once: true });
  });
}

function appendChunk(buffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const complete = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("音频数据无法解码。")); };
    const cleanup = () => {
      buffer.removeEventListener("updateend", complete);
      buffer.removeEventListener("error", fail);
    };
    buffer.addEventListener("updateend", complete, { once: true });
    buffer.addEventListener("error", fail, { once: true });
    try {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      buffer.appendBuffer(copy.buffer);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function startStreamingReadingAudio(
  { text }: { text: string },
  request: typeof fetch = fetch,
): Promise<StreamingReadingAudio> {
  const content = text.trim();
  if (!content) throw new Error("没有可朗读的内容。");
  if (!("MediaSource" in window)) {
    const blob = await synthesizeReadingAudio({ text: content }, request);
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    await player.play();
    return { player, url, stop: () => { player.pause(); URL.revokeObjectURL(url); }, finished: Promise.resolve() };
  }

  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  const player = new Audio(url);
  const controller = new AbortController();
  let firstChunkResolved = false;
  let resolveFirstChunk: () => void = () => undefined;
  let rejectFirstChunk: (error: unknown) => void = () => undefined;
  const firstChunk = new Promise<void>((resolve, reject) => {
    resolveFirstChunk = resolve;
    rejectFirstChunk = reject;
  });
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  const playPromise = player.play();
  const finished = (async () => {
    try {
      await waitForSourceOpen(mediaSource);
      const response = await request("/api/english/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null) as { error?: unknown } | null)?.error;
        throw new Error(typeof detail === "string" ? detail : "朗读服务暂时不可用，请稍后重试。");
      }
      if (!response.body) throw new Error("朗读服务未返回音频，请稍后重试。");
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        await appendChunk(sourceBuffer, value);
        if (!firstChunkResolved) {
          firstChunkResolved = true;
          window.clearTimeout(timeout);
          resolveFirstChunk();
        }
      }
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
      if (!firstChunkResolved) throw new Error("朗读服务未返回音频，请稍后重试。");
    } catch (error) {
      if (!firstChunkResolved) rejectFirstChunk(error);
      if (mediaSource.readyState === "open") mediaSource.endOfStream("network");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  void finished.catch(() => undefined);

  try {
    await firstChunk;
    await playPromise;
  } catch (error) {
    controller.abort();
    player.pause();
    URL.revokeObjectURL(url);
    throw error;
  }

  return {
    player,
    url,
    finished,
    stop: () => {
      controller.abort();
      player.pause();
      URL.revokeObjectURL(url);
    },
  };
}

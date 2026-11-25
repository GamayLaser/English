const namespace = "workspace";
const legacySnapshotKey = "state-v1";
const prefixes = ["workspace:", "todo:", "diary:", "ledger:", "fitness:", "english:", "reading:", "listening:", "writing:", "knowledge:", "expressions:", "dedao:", "intel:", "inspiration:", "mywork:"];
const recoveryKeyPrefix = "personal-workbench:pending-sync-v1:";

type StoredRecord = { key: string; value: unknown; version: number };
type WorkspaceEntries = { needsMigration: boolean; migrationValues: Record<string, string>; values: Record<string, string>; versions: Record<string, number> };
type SyncErrorListener = (message: string) => void;
type WorkspaceChangeListener = (keys: string[]) => void;
class SyncConflictError extends Error {}

let active = false;
let values = new Map<string, string>();
let versions = new Map<string, number>();
const dirty = new Map<string, string | null>();
const recovery = new Map<string, string | null>();
const timers = new Map<string, number>();
const saving = new Map<string, Promise<boolean>>();
const syncErrorListeners = new Set<SyncErrorListener>();
const changeListeners = new Set<WorkspaceChangeListener>();
const saveStatusListeners = new Set<(key: string) => void>();
const saveFailures = new Map<string, string>();
let pagehideListening = false;
let refreshPromise: Promise<boolean> | null = null;
let sessionGeneration = 0;
let recoveryUserId: string | null = null;

export function privateWorkspaceSaveErrorMessage(status: number): string {
  if (status === 401) return "登录已过期，请重新登录后再保存。";
  if (status === 403) return "当前请求被服务器拒绝，请刷新页面后重试。";
  if (status === 413) return "本次内容过大，未能保存。请拆分内容后重试。";
  if (status >= 500) return "服务器暂时无法保存数据，系统会自动重试。";
  return "云端数据保存失败，系统会自动重试。";
}

export function subscribePrivateWorkspaceSyncErrors(listener: SyncErrorListener) {
  syncErrorListeners.add(listener);
  return () => syncErrorListeners.delete(listener);
}

export function subscribePrivateWorkspaceChanges(listener: WorkspaceChangeListener) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function subscribePrivateWorkspaceSaveStatus(listener: (key: string) => void) {
  saveStatusListeners.add(listener);
  return () => { saveStatusListeners.delete(listener); };
}

export function getPrivateWorkspaceSaveStatus(key: string): { state: "saved" | "saving" | "error"; message?: string } {
  const message = saveFailures.get(key);
  if (message) return { state: "error", message };
  return { state: dirty.has(key) || saving.has(key) || recovery.has(key) ? "saving" : "saved" };
}

function notifySaveStatus(key: string) {
  for (const listener of saveStatusListeners) listener(key);
}

function notifySyncError(message: string) {
  for (const listener of syncErrorListeners) listener(message);
}

function recoveryStorageKey() {
  return recoveryUserId ? `${recoveryKeyPrefix}${recoveryUserId}` : null;
}

function writeRecoveryBackup() {
  const key = recoveryStorageKey();
  if (!key) return;
  try {
    if (recovery.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(recovery)));
  } catch {
    // Browser storage can be unavailable in private mode. Cloud sync remains active.
  }
}

function readRecoveryBackup(userId: string): Array<[string, string | null]> {
  try {
    const raw = localStorage.getItem(`${recoveryKeyPrefix}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed).filter((entry): entry is [string, string | null] =>
      isPrivateWorkspaceKey(entry[0]) && (typeof entry[1] === "string" || entry[1] === null));
  } catch {
    return [];
  }
}

export function hasPrivateWorkspaceRecoveryBackup(key: string): boolean {
  if (!recoveryUserId || !recovery.has(key)) return false;
  return readRecoveryBackup(recoveryUserId).some(([storedKey, value]) =>
    storedKey === key && value === recovery.get(key));
}

export function isPrivateWorkspaceKey(key: string) {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function legacyEntries(value: unknown): Record<string, string> {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = (value as { entries?: unknown }).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};
  return Object.fromEntries(Object.entries(entries).filter((entry): entry is [string, string] => isPrivateWorkspaceKey(entry[0]) && typeof entry[1] === "string"));
}

const validWorkspacePreferences: Record<string, readonly string[]> = {
  "workspace:theme-v1": ["light", "dark"],
  "workspace:page-v1": ["overview", "todos", "diary", "ledger", "fitness", "english", "expressions", "knowledge", "settings"],
  "workspace:mobile-tab-v1": ["overview", "todos", "diary", "expressions", "ledger", "fitness", "english", "knowledge", "ai"],
  "workspace:sidebar-collapsed-v1": ["true", "false"],
};

function normalizeDirectValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let normalized = typeof value === "string" ? value : JSON.stringify(value);
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (typeof parsed === "string") normalized = parsed;
  } catch {
    // The original string is already in the expected storage format.
  }
  const allowed = validWorkspacePreferences[key];
  return allowed && !allowed.includes(normalized) ? null : normalized;
}

export function workspaceEntriesFromRecords(records: StoredRecord[]): WorkspaceEntries {
  const snapshot = records.find((record) => record.key === legacySnapshotKey);
  const legacy = legacyEntries(snapshot?.value);
  const values: Record<string, string> = {};
  const versions: Record<string, number> = {};
  const migrationValues: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(legacy)) {
    const value = normalizeDirectValue(key, rawValue);
    if (value !== null) values[key] = value;
  }

  for (const record of records) {
    if (record.key === legacySnapshotKey || !isPrivateWorkspaceKey(record.key)) continue;
    const value = normalizeDirectValue(record.key, record.value);
    if (value === null) continue;
    values[record.key] = value;
    versions[record.key] = record.version;
    if (record.value !== value) migrationValues[record.key] = value;
  }

  for (const [key, rawValue] of Object.entries(legacy)) {
    const value = normalizeDirectValue(key, rawValue);
    if (value !== null && !(key in versions)) migrationValues[key] = value;
  }
  return { needsMigration: Object.keys(migrationValues).length > 0, migrationValues, values, versions };
}

async function fetchWithTimeout(url: string, request: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...request, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("连接云端数据超时，请刷新后重试。");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function listRemoteRecords(): Promise<StoredRecord[]> {
  const response = await fetchWithTimeout(`/api/private-records/${namespace}`, { credentials: "include" });
  if (!response.ok) throw new Error("无法读取你的云端工作台数据。");
  const body = await response.json() as { records?: StoredRecord[] };
  return body.records ?? [];
}

async function listRemoteVersions(): Promise<Array<{ key: string; version: number }>> {
  const response = await fetchWithTimeout(`/api/private-records/${namespace}/manifest`, { credentials: "include" });
  if (!response.ok) throw new Error("无法检查云端工作台数据。");
  const body = await response.json() as { records?: Array<{ key: string; version: number }> };
  return body.records ?? [];
}

async function getRemoteRecord(key: string): Promise<StoredRecord | null> {
  const response = await fetchWithTimeout(`/api/private-records/${namespace}/${encodeURIComponent(key)}`, { credentials: "include" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("无法读取更新后的云端数据。");
  const body = await response.json() as { record?: StoredRecord };
  return body.record ?? null;
}

async function saveRemoteValue(key: string, value: string | null, keepalive = false) {
  const request: RequestInit = {
    method: value === null ? "DELETE" : "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value === null ? { version: versions.get(key) ?? 0 } : { value, version: versions.get(key) ?? 0 }),
  };
  if (keepalive) request.keepalive = true;
  const response = await fetchWithTimeout(`/api/private-records/${namespace}/${encodeURIComponent(key)}`, request);
  if (response.status === 409) throw new SyncConflictError("另一台设备已修改这项数据。当前编辑已保留在本页，请不要关闭页面，先检查冲突。");
  if (!response.ok) throw new Error(privateWorkspaceSaveErrorMessage(response.status));
  if (value === null) {
    versions.delete(key);
    return;
  }
  const body = await response.json() as { record: { version: number } };
  versions.set(key, body.record.version);
}

function schedule(key: string, delay = 250) {
  if (!active) return;
  const previous = timers.get(key);
  if (previous !== undefined) window.clearTimeout(previous);
  timers.set(key, window.setTimeout(() => {
    timers.delete(key);
    void persistKey(key);
  }, delay));
}

function persistKey(key: string, keepalive = false): Promise<boolean> {
  if (!active) return Promise.resolve(!dirty.has(key));
  const inFlight = saving.get(key);
  if (inFlight) return inFlight;
  if (!dirty.has(key)) return Promise.resolve(true);
  saveFailures.delete(key);
  notifySaveStatus(key);
  const pending = (async () => {
    let conflictRetries = 0;
    try {
      while (dirty.has(key)) {
        const value = dirty.get(key) ?? null;
        dirty.delete(key);
        try {
          await saveRemoteValue(key, value, keepalive);
          if (!dirty.has(key) && recovery.get(key) === value) {
            recovery.delete(key);
            writeRecoveryBackup();
          }
          conflictRetries = 0;
        } catch (error) {
          // A version conflict is normal when the same account is used on two devices.
          // Refresh the record version and retry the user's latest local edit once.
          if (error instanceof SyncConflictError && conflictRetries < 2) {
            conflictRetries += 1;
            try {
              const remote = await getRemoteRecord(key);
              if (remote) versions.set(key, remote.version);
              else versions.delete(key);
              // If both devices already deleted the record, the requested deletion is complete.
              if (remote || value !== null) {
                if (!dirty.has(key)) dirty.set(key, value);
              }
              continue;
            } catch {
              // Fall through to the normal retry path below.
            }
          }
          // An edit made while this request was in flight must win over the failed payload.
          if (!dirty.has(key)) dirty.set(key, value);
          if (!(error instanceof SyncConflictError)) schedule(key, 1_500);
          const message = error instanceof Error ? error.message : "云端数据保存失败，系统会自动重试。";
          saveFailures.set(key, message);
          notifySyncError(message);
          return false;
        }
      }
      return true;
    } finally {
      saving.delete(key);
      notifySaveStatus(key);
    }
  })();
  saving.set(key, pending);
  return pending;
}

function queue(key: string, value: string | null) {
  saveFailures.delete(key);
  dirty.set(key, value);
  recovery.set(key, value);
  writeRecoveryBackup();
  schedule(key);
  notifySaveStatus(key);
}

export const workspaceStorage = {
  getItem(key: string): string | null {
    return values.get(key) ?? null;
  },
  removeItem(key: string) {
    if (!isPrivateWorkspaceKey(key)) throw new Error("不允许写入非工作台数据。");
    if (!values.has(key)) return;
    values.delete(key);
    queue(key, null);
  },
  setItem(key: string, value: string) {
    if (!isPrivateWorkspaceKey(key)) throw new Error("不允许写入非工作台数据。");
    const next = String(value);
    if (values.get(key) === next) return;
    values.set(key, next);
    queue(key, next);
  },
};

export async function activatePrivateWorkspaceStorage(userId = "anonymous"): Promise<void> {
  const generation = ++sessionGeneration;
  const remote = workspaceEntriesFromRecords(await listRemoteRecords());
  if (generation !== sessionGeneration) return;
  values = new Map(Object.entries(remote.values));
  versions = new Map(Object.entries(remote.versions));
  active = true;
  recoveryUserId = userId;
  for (const [key, value] of readRecoveryBackup(userId)) {
    recovery.set(key, value);
    dirty.set(key, value);
    if (value === null) values.delete(key);
    else values.set(key, value);
    schedule(key, 0);
  }
  if (!pagehideListening) { window.addEventListener("pagehide", flushWhenPageHides); pagehideListening = true; }
  if (remote.needsMigration) {
    for (const [key, value] of Object.entries(remote.migrationValues)) {
      // A newer recovered edit must not be replaced by normalization of an
      // older server record (e.g. ledger arrays written by background sync).
      if (!dirty.has(key) && !saving.has(key)) queue(key, value);
    }
    void flushPrivateWorkspaceStorage().then((saved) => {
      if (!saved) notifySyncError("旧版数据正在后台修复，暂时未能保存。");
    });
  }
}

export async function refreshPrivateWorkspaceStorage(): Promise<boolean> {
  if (!active) return false;
  if (refreshPromise) return refreshPromise;
  const generation = sessionGeneration;
  const refresh = async () => {
    const manifest = new Map((await listRemoteVersions())
      .filter((record) => isPrivateWorkspaceKey(record.key))
      .map((record) => [record.key, record.version]));
    if (!active || generation !== sessionGeneration) return false;
    let changed = false;
    const changedKeys: string[] = [];
    const staleKeys = [...manifest].filter(([key, version]) =>
      versions.get(key) !== version && !dirty.has(key) && !saving.has(key));
    const downloaded: Array<{ key: string; record: StoredRecord | null }> = [];
    for (let offset = 0; offset < staleKeys.length; offset += 6) {
      const batch = await Promise.all(staleKeys.slice(offset, offset + 6).map(async ([key]) =>
        ({ key, record: await getRemoteRecord(key) })));
      if (!active || generation !== sessionGeneration) return false;
      downloaded.push(...batch);
    }
    for (const { key, record } of downloaded) {
      if (dirty.has(key) || saving.has(key) || !record) continue;
      const value = normalizeDirectValue(key, record.value);
      if (value === null) continue;
      if (values.get(key) !== value) {
        changed = true;
        changedKeys.push(key);
      }
      values.set(key, value);
      versions.set(key, record.version);
    }
    for (const key of [...versions.keys()]) {
      if (manifest.has(key) || dirty.has(key) || saving.has(key)) continue;
      if (values.has(key)) {
        changed = true;
        changedKeys.push(key);
      }
      values.delete(key);
      versions.delete(key);
    }
    if (changedKeys.length) for (const listener of changeListeners) listener(changedKeys);
    return changed;
  };
  const pending = refresh();
  refreshPromise = pending;
  try { return await pending; }
  catch (error) {
    if (active && generation === sessionGeneration) {
      notifySyncError(error instanceof Error ? error.message : "无法检查云端工作台数据。");
    }
    throw error;
  }
  finally { if (refreshPromise === pending) refreshPromise = null; }
}

export async function flushPrivateWorkspaceStorage(options: { keepalive?: boolean } = {}): Promise<boolean> {
  for (const [key, timer] of timers) {
    window.clearTimeout(timer);
    timers.delete(key);
  }
  const keys = new Set([...dirty.keys(), ...saving.keys()]);
  const results = await Promise.all([...keys].map((key) => persistKey(key, options.keepalive)));
  return results.every(Boolean);
}

function flushWhenPageHides() {
  void flushPrivateWorkspaceStorage({ keepalive: true });
}

function clearPrivateWorkspaceMemory(clearRecovery: boolean) {
  if (pagehideListening) { window.removeEventListener("pagehide", flushWhenPageHides); pagehideListening = false; }
  sessionGeneration++;
  refreshPromise = null;
  active = false;
  values.clear();
  versions.clear();
  dirty.clear();
  saving.clear();
  saveFailures.clear();
  if (clearRecovery) {
    recovery.clear();
    writeRecoveryBackup();
  }
  recoveryUserId = null;
}

export async function deactivatePrivateWorkspaceStorage(): Promise<boolean> {
  if (!await flushPrivateWorkspaceStorage()) return false;
  clearPrivateWorkspaceMemory(true);
  return true;
}

export function abandonPrivateWorkspaceStorage() {
  clearPrivateWorkspaceMemory(false);
}

export function privateWorkspaceKeys(): string[] {
  return [...values.keys()];
}
export function resetPrivateWorkspaceMemoryForTests() {
  for (const timer of timers.values()) window.clearTimeout(timer);
  timers.clear();
  values.clear();
  versions.clear();
  dirty.clear();
  recovery.clear();
  saving.clear();
  active = false;
  recoveryUserId = null;
  sessionGeneration++;
  refreshPromise = null;
  changeListeners.clear();
  saveStatusListeners.clear();
  saveFailures.clear();
}


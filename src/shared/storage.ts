import type { CacheRecord, ExtensionConfig, SyncState } from "./types";
import { DEFAULT_ISSUE_COUNT_CACHE_MINUTES, MIN_ISSUE_COUNT_CACHE_MINUTES } from "./types";

const CONFIG_KEY = "config";
const SYNC_STATE_KEY = "sync-state";

export function workloadCacheKey(owner: string, repo: string, username: string): string {
  return `workload:${owner.toLowerCase()}:${repo.toLowerCase()}:${username.toLowerCase()}`;
}

export function isExpired(record: CacheRecord<unknown> | null | undefined, ttlMinutes: number): boolean {
  if (!record) {
    return true;
  }

  return Date.now() - record.fetchedAt > ttlMinutes * 60_000;
}

function storageArea(): chrome.storage.LocalStorageArea {
  return chrome.storage.local;
}

export async function getMany<T>(keys: string[]): Promise<Record<string, T | undefined>> {
  return (await storageArea().get(keys)) as Record<string, T | undefined>;
}

export async function getOne<T>(key: string): Promise<T | null> {
  const result = (await storageArea().get(key)) as Record<string, T | undefined>;
  return result[key] ?? null;
}

export async function setOne(key: string, value: unknown): Promise<void> {
  await storageArea().set({ [key]: value });
}

export async function removeKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await storageArea().remove(keys);
}

export async function loadConfig(): Promise<ExtensionConfig | null> {
  return getOne<ExtensionConfig>(CONFIG_KEY);
}

export async function saveConfig(config: ExtensionConfig): Promise<void> {
  await setOne(CONFIG_KEY, config);
}

export async function loadSyncState(): Promise<SyncState> {
  return (
    (await getOne<SyncState>(SYNC_STATE_KEY)) ?? {
      status: "config_error",
      message: "Extension is not configured yet.",
      updatedAt: Date.now()
    }
  );
}

export async function saveSyncState(syncState: SyncState): Promise<void> {
  await setOne(SYNC_STATE_KEY, syncState);
}

export function getIssueCountCacheMinutes(config?: Partial<ExtensionConfig> | null): number {
  return Math.max(
    MIN_ISSUE_COUNT_CACHE_MINUTES,
    Math.floor(config?.issueCountCacheMinutes ?? DEFAULT_ISSUE_COUNT_CACHE_MINUTES)
  );
}

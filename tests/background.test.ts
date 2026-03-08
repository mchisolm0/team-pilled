import { describe, expect, it, vi } from "vitest";
import { createBackgroundController } from "../src/background/index";
import { membershipCacheKey, workloadCacheKey } from "../src/shared/storage";
import type { CacheRecord, ExtensionConfig, SyncState } from "../src/shared/types";

type MemoryState = {
  config: ExtensionConfig | null;
  syncState: SyncState;
  cache: Record<string, unknown>;
};

function createStorage(state: MemoryState) {
  return {
    async getMany<T>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Object.fromEntries(keys.map((key) => [key, state.cache[key] as T | undefined]));
    },
    async getOne<T>(key: string): Promise<T | null> {
      return (state.cache[key] as T | undefined) ?? null;
    },
    async loadConfig(): Promise<ExtensionConfig | null> {
      return state.config;
    },
    async loadSyncState(): Promise<SyncState> {
      return state.syncState;
    },
    async saveConfig(config: ExtensionConfig): Promise<void> {
      state.config = config;
    },
    async saveSyncState(syncState: SyncState): Promise<void> {
      state.syncState = syncState;
    },
    async setOne(key: string, value: unknown): Promise<void> {
      state.cache[key] = value;
    }
  };
}

describe("background controller", () => {
  const config: ExtensionConfig = {
    org: "openai",
    githubToken: "ghp_test",
    refreshIntervalMinutes: 15,
    teams: [{ slug: "platform", label: "Platform", color: "blue" }]
  };

  it("falls back to cached workload data after a rate-limit error", async () => {
    const cacheKey = membershipCacheKey(config.org, "platform");
    const workloadKey = workloadCacheKey(config.org, "mchisolm0");
    const now = Date.now();
    const state: MemoryState = {
      config,
      syncState: {
        status: "ok",
        message: "ready",
        updatedAt: now
      },
      cache: {
        [cacheKey]: {
          value: ["mchisolm0"],
          fetchedAt: now
        } satisfies CacheRecord<string[]>,
        [workloadKey]: {
          value: 7,
          fetchedAt: now - 16 * 60_000
        } satisfies CacheRecord<number>
      }
    };

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/search/issues")) {
        return new Response(JSON.stringify({ message: "rate limited" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" }
        });
      }

      return new Response(JSON.stringify([{ login: "mchisolm0" }]), { status: 200 });
    });

    const controller = createBackgroundController({
      fetch: fetchMock,
      now: () => now,
      storage: createStorage(state),
      scheduleAlarm: vi.fn(),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"]);

    expect(response.status).toBe("degraded");
    expect(response.users.mchisolm0.openIssueCount).toBe(7);
    expect(response.users.mchisolm0.stale).toBe(true);
  });

  it("returns auth_error when team membership cannot be loaded and no cache exists", async () => {
    const state: MemoryState = {
      config,
      syncState: {
        status: "ok",
        message: "ready",
        updatedAt: Date.now()
      },
      cache: {}
    };

    const controller = createBackgroundController({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "forbidden" }), { status: 403 })
      ),
      now: () => Date.now(),
      storage: createStorage(state),
      scheduleAlarm: vi.fn(),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"]);

    expect(response.status).toBe("auth_error");
    expect(response.users).toEqual({});
  });
});

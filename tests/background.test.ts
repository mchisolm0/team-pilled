import { describe, expect, it, vi } from "vitest";
import { createBackgroundController } from "../src/background/index";
import { workloadCacheKey } from "../src/shared/storage";
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
  const repo = { owner: "openai", name: "team-pilled" };
  const config: ExtensionConfig = {
    showIssueCounts: true,
    issueCountCacheMinutes: 30,
    groups: [{ label: "Platform", color: "blue", usernames: ["mchisolm0"] }]
  };

  it("falls back to cached workload data after a rate-limit error", async () => {
    const workloadKey = workloadCacheKey(repo.owner, repo.name, "mchisolm0");
    const now = Date.now();
    const state: MemoryState = {
      config,
      syncState: {
        status: "ok",
        message: "ready",
        updatedAt: now
      },
      cache: {
        [workloadKey]: {
          value: 7,
          fetchedAt: now - 31 * 60_000
        } satisfies CacheRecord<number>
      }
    };

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response(JSON.stringify({ message: "rate limited" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" }
      });
    });

    const controller = createBackgroundController({
      fetch: fetchMock,
      now: () => now,
      storage: createStorage(state),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"], repo);

    expect(response.status).toBe("degraded");
    expect(response.users.mchisolm0.openIssueCount).toBe(7);
    expect(response.users.mchisolm0.stale).toBe(true);
  });

  it("returns group data without an issue-count pill when the public API is rate-limited and no cache exists", async () => {
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
        new Response(JSON.stringify({ message: "rate limited" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" }
        })
      ),
      now: () => Date.now(),
      storage: createStorage(state),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"], repo);

    expect(response.status).toBe("degraded");
    expect(response.users.mchisolm0.primaryTeam?.label).toBe("Platform");
    expect(response.users.mchisolm0.openIssueCount).toBeUndefined();
    expect(response.users.mchisolm0.stale).toBe(false);
  });

  it("skips public API calls when issue counts are disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const state: MemoryState = {
      config: {
        ...config,
        showIssueCounts: false
      },
      syncState: {
        status: "ok",
        message: "ready",
        updatedAt: Date.now()
      },
      cache: {}
    };

    const controller = createBackgroundController({
      fetch: fetchMock,
      now: () => Date.now(),
      storage: createStorage(state),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"], repo);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe("ok");
    expect(response.users.mchisolm0.primaryTeam?.label).toBe("Platform");
  });

  it("returns config_error for legacy config", async () => {
    const state: MemoryState = {
      config: { org: "openai" } as never,
      syncState: {
        status: "ok",
        message: "ready",
        updatedAt: Date.now()
      },
      cache: {}
    };

    const controller = createBackgroundController({
      fetch: vi.fn<typeof fetch>(),
      now: () => Date.now(),
      storage: createStorage(state),
      openOptionsPage: vi.fn()
    });

    const response = await controller.getUserBadgeData(["mchisolm0"], repo);

    expect(response.status).toBe("config_error");
    expect(response.users).toEqual({});
  });
});

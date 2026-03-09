import { buildIssueCountUrl, getPrimaryTeamForUser, GitHubApiError, parseGitHubJson } from "../shared/github";
import { MESSAGE_TYPES, type RuntimeMessage, type UserBadgeDataResponse } from "../shared/messages";
import {
  getMany,
  getIssueCountCacheMinutes,
  isExpired,
  loadConfig,
  loadSyncState,
  saveConfig,
  saveSyncState,
  setOne,
  workloadCacheKey
} from "../shared/storage";
import { type CacheRecord, type ExtensionConfig, type SyncState, validateConfig } from "../shared/types";

const DEFAULT_SYNC_MESSAGE = "Manual groups are up to date.";
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
};

type RepoContext = {
  owner: string;
  name: string;
};

type SearchIssuesResponse = {
  total_count: number;
};

type StorageAdapter = {
  getMany: typeof getMany;
  loadConfig: typeof loadConfig;
  loadSyncState: typeof loadSyncState;
  saveConfig: typeof saveConfig;
  saveSyncState: typeof saveSyncState;
  setOne: typeof setOne;
};

type BackgroundDeps = {
  fetch: typeof fetch;
  now: () => number;
  storage: StorageAdapter;
  openOptionsPage: () => Promise<void> | void;
};

type WorkloadResolution = {
  workloads: Map<string, number>;
  staleUsers: Set<string>;
  missingUsers: Set<string>;
  status: SyncState["status"];
  message?: string;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function dedupeUsernames(usernames: string[]): string[] {
  return [...new Set(usernames.map(normalizeUsername).filter(Boolean))];
}

function classifyError(error: unknown): { status: SyncState["status"]; message: string } {
  if (error instanceof GitHubApiError && error.isRateLimited) {
    return {
      status: "rate_limited",
      message: "GitHub rate-limited public issue counts. Showing cached counts when available."
    };
  }

  return {
    status: "degraded",
    message: "GitHub issue counts are temporarily unavailable. Showing cached counts when available."
  };
}

function mergeStatus(current: SyncState["status"], next: SyncState["status"]): SyncState["status"] {
  const priority: Record<SyncState["status"], number> = {
    ok: 0,
    degraded: 1,
    rate_limited: 2,
    config_error: 3
  };

  return priority[next] > priority[current] ? next : current;
}

async function fetchIssueCount(fetchFn: typeof fetch, repo: RepoContext, username: string): Promise<number> {
  const response = await fetchFn(buildIssueCountUrl(repo.owner, repo.name, username), {
    headers: GITHUB_API_HEADERS
  });
  const payload = await parseGitHubJson<SearchIssuesResponse>(response);
  return payload.total_count;
}

export function createBackgroundController(deps: BackgroundDeps) {
  async function setSyncState(status: SyncState["status"], message = DEFAULT_SYNC_MESSAGE): Promise<SyncState> {
    const state = {
      status,
      message,
      updatedAt: deps.now()
    } satisfies SyncState;
    await deps.storage.saveSyncState(state);
    return state;
  }

  async function resolveWorkloads(
    config: ExtensionConfig,
    repo: RepoContext,
    usernames: string[]
  ): Promise<WorkloadResolution> {
    if (!config.showIssueCounts || usernames.length === 0) {
      return {
        workloads: new Map<string, number>(),
        staleUsers: new Set<string>(),
        missingUsers: new Set<string>(),
        status: "ok",
        message: DEFAULT_SYNC_MESSAGE
      };
    }

    const ttlMinutes = getIssueCountCacheMinutes(config);
    const keys = usernames.map((username) => workloadCacheKey(repo.owner, repo.name, username));
    const cachedRecords = await deps.storage.getMany<CacheRecord<number>>(keys);
    const workloads = new Map<string, number>();
    const staleUsers = new Set<string>();
    const missingUsers = new Set<string>();
    let status: SyncState["status"] = "ok";
    let message = DEFAULT_SYNC_MESSAGE;
    let stopFetching = false;

    for (const username of usernames) {
      const key = workloadCacheKey(repo.owner, repo.name, username);
      const cached = cachedRecords[key];

      if (cached && !isExpired(cached, ttlMinutes)) {
        workloads.set(username, cached.value);
        continue;
      }

      if (stopFetching) {
        if (cached) {
          workloads.set(username, cached.value);
          staleUsers.add(username);
        } else {
          missingUsers.add(username);
        }
        continue;
      }

      try {
        const count = await fetchIssueCount(deps.fetch, repo, username);
        workloads.set(username, count);
        await deps.storage.setOne(key, {
          value: count,
          fetchedAt: deps.now()
        } satisfies CacheRecord<number>);
      } catch (error) {
        const classified = classifyError(error);
        status = mergeStatus(status, classified.status);
        message = classified.message;

        if (cached) {
          workloads.set(username, cached.value);
          staleUsers.add(username);
        } else {
          missingUsers.add(username);
        }

        if (classified.status === "rate_limited") {
          stopFetching = true;
        }
      }
    }

    return {
      workloads,
      staleUsers,
      missingUsers,
      status,
      message
    };
  }

  async function getUserBadgeData(usernames: string[], repo: RepoContext): Promise<UserBadgeDataResponse> {
    const rawConfig = await deps.storage.loadConfig();
    const validation = validateConfig(rawConfig);

    if (!validation.valid) {
      const syncState = await setSyncState("config_error", validation.message);
      return {
        status: syncState.status,
        message: syncState.message,
        users: {}
      };
    }

    const config = validation.config;
    const uniqueUsernames = dedupeUsernames(usernames);
    const matchedUsers = uniqueUsernames
      .map((username) => ({
        username,
        primaryTeam: getPrimaryTeamForUser(username, config.groups)
      }))
      .filter((entry): entry is { username: string; primaryTeam: ExtensionConfig["groups"][number] } => Boolean(entry.primaryTeam));

    if (matchedUsers.length === 0) {
      const syncState = await setSyncState("ok", DEFAULT_SYNC_MESSAGE);
      return {
        status: syncState.status,
        message: syncState.message,
        users: {}
      };
    }

    const workloads = await resolveWorkloads(
      config,
      repo,
      matchedUsers.map((entry) => entry.username)
    );

    let status = workloads.status;
    const users = Object.fromEntries(
      matchedUsers.map(({ username, primaryTeam }) => [
        username,
        {
          username,
          primaryTeam,
          ...(workloads.workloads.has(username) ? { openIssueCount: workloads.workloads.get(username) } : {}),
          stale: workloads.staleUsers.has(username)
        }
      ])
    );

    if (status === "rate_limited" && Object.keys(users).length > 0) {
      status = "degraded";
    }

    if (workloads.missingUsers.size > 0 && status === "ok") {
      status = "degraded";
    }

    const syncState = await setSyncState(status, workloads.message ?? DEFAULT_SYNC_MESSAGE);
    return {
      status: syncState.status,
      message: syncState.message,
      users
    };
  }

  async function handleMessage(message: RuntimeMessage): Promise<unknown> {
    switch (message.type) {
      case MESSAGE_TYPES.loadConfig:
        return deps.storage.loadConfig();
      case MESSAGE_TYPES.saveConfig: {
        const validation = validateConfig(message.payload);

        if (!validation.valid) {
          await setSyncState("config_error", validation.message);
          return {
            ok: false,
            message: validation.message
          };
        }

        await deps.storage.saveConfig(validation.config);
        await setSyncState("ok", "Configuration saved.");
        return {
          ok: true
        };
      }
      case MESSAGE_TYPES.getUserBadgeData:
        return getUserBadgeData(message.payload.usernames, message.payload.repo);
      case MESSAGE_TYPES.openOptionsPage:
        await deps.openOptionsPage();
        return {
          ok: true
        };
      case MESSAGE_TYPES.getSyncStatus:
        return deps.storage.loadSyncState();
    }
  }

  return {
    handleMessage,
    getUserBadgeData,
    resolveWorkloads
  };
}

const controller = createBackgroundController({
  fetch,
  now: () => Date.now(),
  storage: {
    getMany,
    loadConfig,
    loadSyncState,
    saveConfig,
    saveSyncState,
    setOne
  },
  openOptionsPage: () => chrome.runtime.openOptionsPage()
});

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    void controller.handleMessage(message).then(sendResponse);
    return true;
  });
}

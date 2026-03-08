import {
  buildIssueCountUrl,
  buildTeamMembersUrl,
  getPrimaryTeamForUser,
  GitHubApiError,
  parseGitHubJson
} from "../shared/github";
import { MESSAGE_TYPES, type RuntimeMessage, type UserBadgeDataResponse } from "../shared/messages";
import {
  getMany,
  getOne,
  getRefreshIntervalMinutes,
  isExpired,
  loadConfig,
  loadSyncState,
  membershipCacheKey,
  saveConfig,
  saveSyncState,
  setOne,
  workloadCacheKey
} from "../shared/storage";
import { type CacheRecord, type ExtensionConfig, type SyncState, validateConfig } from "../shared/types";

const MEMBERSHIP_REFRESH_ALARM = "membership-refresh";
const DEFAULT_SYNC_MESSAGE = "Team data is up to date.";
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
};

type TeamMember = {
  login: string;
};

type SearchIssuesResponse = {
  total_count: number;
};

type StorageAdapter = {
  getMany: typeof getMany;
  getOne: typeof getOne;
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
  scheduleAlarm: (minutes: number) => void;
  openOptionsPage: () => Promise<void> | void;
};

type MembershipResolution = {
  teamMembership: Map<string, Set<string>>;
  staleTeams: Set<string>;
  status: SyncState["status"];
  message?: string;
};

type WorkloadResolution = {
  workloads: Map<string, number>;
  staleUsers: Set<string>;
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
  if (error instanceof GitHubApiError) {
    if (error.isRateLimited) {
      return {
        status: "rate_limited",
        message: "GitHub API rate limit reached. Using cached data when available."
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: "auth_error",
        message: "GitHub token could not access the configured organization or issue search."
      };
    }
  }

  return {
    status: "degraded",
    message: "GitHub API request failed. Using cached data when available."
  };
}

function mergeStatus(current: SyncState["status"], next: SyncState["status"]): SyncState["status"] {
  const priority: Record<SyncState["status"], number> = {
    ok: 0,
    degraded: 1,
    rate_limited: 2,
    auth_error: 3,
    config_error: 4
  };

  return priority[next] > priority[current] ? next : current;
}

function authHeaders(token: string): HeadersInit {
  return {
    ...GITHUB_API_HEADERS,
    Authorization: `Bearer ${token}`
  };
}

async function fetchTeamMembers(fetchFn: typeof fetch, token: string, org: string, teamSlug: string): Promise<string[]> {
  const usernames: string[] = [];
  let page = 1;

  while (true) {
    const response = await fetchFn(`${buildTeamMembersUrl(org, teamSlug)}&page=${page}`, {
      headers: authHeaders(token)
    });
    const members = await parseGitHubJson<TeamMember[]>(response);

    usernames.push(...members.map((member) => normalizeUsername(member.login)));

    if (members.length < 100) {
      return usernames;
    }

    page += 1;
  }
}

async function fetchIssueCount(fetchFn: typeof fetch, token: string, org: string, username: string): Promise<number> {
  const response = await fetchFn(buildIssueCountUrl(org, username), {
    headers: authHeaders(token)
  });
  const payload = await parseGitHubJson<SearchIssuesResponse>(response);
  return payload.total_count;
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
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

  async function resolveMembership(config: ExtensionConfig, forceRefresh = false): Promise<MembershipResolution> {
    const ttlMinutes = getRefreshIntervalMinutes(config);
    const keys = config.teams.map((team) => membershipCacheKey(config.org, team.slug));
    const cachedRecords = await deps.storage.getMany<CacheRecord<string[]>>(keys);
    const teamMembership = new Map<string, Set<string>>();
    const staleTeams = new Set<string>();
    let status: SyncState["status"] = "ok";
    let message = DEFAULT_SYNC_MESSAGE;

    await mapLimit(config.teams, 5, async (team) => {
      const key = membershipCacheKey(config.org, team.slug);
      const cached = cachedRecords[key];

      if (!forceRefresh && cached && !isExpired(cached, ttlMinutes)) {
        teamMembership.set(team.slug, new Set(cached.value));
        return;
      }

      try {
        const usernames = await fetchTeamMembers(deps.fetch, config.githubToken, config.org, team.slug);
        teamMembership.set(team.slug, new Set(usernames));
        await deps.storage.setOne(key, {
          value: usernames,
          fetchedAt: deps.now()
        } satisfies CacheRecord<string[]>);
      } catch (error) {
        const classified = classifyError(error);

        if (cached) {
          teamMembership.set(team.slug, new Set(cached.value));
          staleTeams.add(team.slug);
          status = mergeStatus(status, "degraded");
          message = classified.message;
          return;
        }

        teamMembership.set(team.slug, new Set());
        status = mergeStatus(status, classified.status);
        message = classified.message;
      }
    });

    return {
      teamMembership,
      staleTeams,
      status,
      message
    };
  }

  async function resolveWorkloads(
    config: ExtensionConfig,
    usernames: string[]
  ): Promise<WorkloadResolution> {
    if (usernames.length === 0) {
      return {
        workloads: new Map<string, number>(),
        staleUsers: new Set<string>(),
        status: "ok",
        message: DEFAULT_SYNC_MESSAGE
      };
    }

    const ttlMinutes = getRefreshIntervalMinutes(config);
    const keys = usernames.map((username) => workloadCacheKey(config.org, username));
    const cachedRecords = await deps.storage.getMany<CacheRecord<number>>(keys);
    const workloads = new Map<string, number>();
    const staleUsers = new Set<string>();
    let status: SyncState["status"] = "ok";
    let message = DEFAULT_SYNC_MESSAGE;

    await mapLimit(usernames, 5, async (username) => {
      const key = workloadCacheKey(config.org, username);
      const cached = cachedRecords[key];

      if (cached && !isExpired(cached, ttlMinutes)) {
        workloads.set(username, cached.value);
        return;
      }

      try {
        const count = await fetchIssueCount(deps.fetch, config.githubToken, config.org, username);
        workloads.set(username, count);
        await deps.storage.setOne(key, {
          value: count,
          fetchedAt: deps.now()
        } satisfies CacheRecord<number>);
      } catch (error) {
        const classified = classifyError(error);

        if (cached) {
          workloads.set(username, cached.value);
          staleUsers.add(username);
          status = mergeStatus(status, "degraded");
          message = classified.message;
          return;
        }

        status = mergeStatus(status, classified.status);
        message = classified.message;
      }
    });

    return {
      workloads,
      staleUsers,
      status,
      message
    };
  }

  async function getUserBadgeData(usernames: string[]): Promise<UserBadgeDataResponse> {
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
    const membership = await resolveMembership(config);
    const matchedUsers = uniqueUsernames
      .map((username) => ({
        username,
        primaryTeam: getPrimaryTeamForUser(username, config.teams, membership.teamMembership)
      }))
      .filter((entry): entry is { username: string; primaryTeam: ExtensionConfig["teams"][number] } => Boolean(entry.primaryTeam));

    const workloads = await resolveWorkloads(
      config,
      matchedUsers.map((entry) => entry.username)
    );

    let status = mergeStatus(membership.status, workloads.status);
    const users = Object.fromEntries(
      matchedUsers.map(({ username, primaryTeam }) => [
        username,
        {
          username,
          primaryTeam,
          openIssueCount: workloads.workloads.get(username),
          stale: membership.staleTeams.has(primaryTeam.slug) || workloads.staleUsers.has(username)
        }
      ])
    );

    if (status === "auth_error" || status === "rate_limited") {
      const hasRenderableData = Object.keys(users).length > 0;

      if (hasRenderableData) {
        status = "degraded";
      }
    }

    const syncState = await setSyncState(status, workloads.message ?? membership.message ?? DEFAULT_SYNC_MESSAGE);
    return {
      status: syncState.status,
      message: syncState.message,
      users
    };
  }

  async function handleAlarm(): Promise<void> {
    const rawConfig = await deps.storage.loadConfig();
    const validation = validateConfig(rawConfig);

    if (!validation.valid) {
      await setSyncState("config_error", validation.message);
      return;
    }

    const membership = await resolveMembership(validation.config, true);
    await setSyncState(membership.status, membership.message ?? DEFAULT_SYNC_MESSAGE);
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
        deps.scheduleAlarm(getRefreshIntervalMinutes(validation.config));
        await setSyncState("ok", "Configuration saved.");
        return {
          ok: true
        };
      }
      case MESSAGE_TYPES.getUserBadgeData:
        return getUserBadgeData(message.payload.usernames);
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
    handleAlarm,
    handleMessage,
    getUserBadgeData,
    resolveMembership,
    resolveWorkloads
  };
}

const controller = createBackgroundController({
  fetch,
  now: () => Date.now(),
  storage: {
    getMany,
    getOne,
    loadConfig,
    loadSyncState,
    saveConfig,
    saveSyncState,
    setOne
  },
  scheduleAlarm: (minutes) => {
    chrome.alarms.create(MEMBERSHIP_REFRESH_ALARM, {
      delayInMinutes: minutes,
      periodInMinutes: minutes
    });
  },
  openOptionsPage: () => chrome.runtime.openOptionsPage()
});

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(async () => {
    const config = await loadConfig();
    const refreshMinutes = getRefreshIntervalMinutes(config);
    chrome.alarms.create(MEMBERSHIP_REFRESH_ALARM, {
      delayInMinutes: refreshMinutes,
      periodInMinutes: refreshMinutes
    });
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    void controller.handleMessage(message).then(sendResponse);
    return true;
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MEMBERSHIP_REFRESH_ALARM) {
      void controller.handleAlarm();
    }
  });
}

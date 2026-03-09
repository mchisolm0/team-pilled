export const TEAM_COLOR_OPTIONS = [
  "gray",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "pink"
] as const;

export type TeamColor = (typeof TEAM_COLOR_OPTIONS)[number];

export type TeamConfig = {
  label: string;
  color: TeamColor;
  usernames: string[];
};

export type ExtensionConfig = {
  groups: TeamConfig[];
  showIssueCounts: boolean;
  issueCountCacheMinutes: number;
};

export type UserBadgeData = {
  username: string;
  primaryTeam?: TeamConfig;
  openIssueCount?: number;
  stale: boolean;
};

export type SyncStatus = "ok" | "degraded" | "config_error" | "rate_limited";

export type SyncState = {
  status: SyncStatus;
  message?: string;
  updatedAt: number;
};

export type CacheRecord<T> = {
  value: T;
  fetchedAt: number;
};

export type ConfigValidationResult =
  | {
      valid: true;
      config: ExtensionConfig;
    }
  | {
      valid: false;
      message: string;
    };

export const DEFAULT_ISSUE_COUNT_CACHE_MINUTES = 30;
export const MIN_ISSUE_COUNT_CACHE_MINUTES = 5;

export function isTeamColor(value: string): value is TeamColor {
  return TEAM_COLOR_OPTIONS.includes(value as TeamColor);
}

function normalizeUsernames(usernames: string[] | null | undefined): string[] {
  return [...new Set((usernames ?? []).map((username) => username.trim().toLowerCase()).filter(Boolean))];
}

export function sanitizeConfig(input: Partial<ExtensionConfig> | null | undefined): ExtensionConfig {
  const groupsInput = Array.isArray((input as { groups?: unknown } | null | undefined)?.groups) ? input?.groups ?? [] : [];

  return {
    showIssueCounts: input?.showIssueCounts ?? true,
    issueCountCacheMinutes:
      input?.issueCountCacheMinutes && Number.isFinite(input.issueCountCacheMinutes)
        ? Math.max(MIN_ISSUE_COUNT_CACHE_MINUTES, Math.floor(input.issueCountCacheMinutes))
        : DEFAULT_ISSUE_COUNT_CACHE_MINUTES,
    groups: groupsInput.map((group) => ({
      label: group.label.trim(),
      color: isTeamColor(group.color) ? group.color : "gray",
      usernames: normalizeUsernames(group.usernames)
    }))
  };
}

export function validateConfig(input: Partial<ExtensionConfig> | null | undefined): ConfigValidationResult {
  if (input && "org" in input) {
    return {
      valid: false,
      message: "Legacy configuration detected. Re-enter your manual groups in the updated options page."
    };
  }

  const config = sanitizeConfig(input);

  if (config.groups.length === 0) {
    return { valid: false, message: "At least one group is required." };
  }

  for (const group of config.groups) {
    if (!group.label) {
      return { valid: false, message: "Each group needs a badge label." };
    }

    if (!isTeamColor(group.color)) {
      return { valid: false, message: `Invalid group color: ${group.color}.` };
    }

    if (group.usernames.length === 0) {
      return { valid: false, message: `Group "${group.label}" needs at least one GitHub username.` };
    }
  }

  return {
    valid: true,
    config
  };
}

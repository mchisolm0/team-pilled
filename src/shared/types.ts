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
  slug: string;
  label: string;
  color: TeamColor;
};

export type ExtensionConfig = {
  org: string;
  githubToken: string;
  refreshIntervalMinutes: number;
  teams: TeamConfig[];
};

export type UserBadgeData = {
  username: string;
  primaryTeam?: TeamConfig;
  openIssueCount?: number;
  stale: boolean;
};

export type SyncStatus =
  | "ok"
  | "degraded"
  | "config_error"
  | "auth_error"
  | "rate_limited";

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

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 15;
export const MIN_REFRESH_INTERVAL_MINUTES = 5;

export function isTeamColor(value: string): value is TeamColor {
  return TEAM_COLOR_OPTIONS.includes(value as TeamColor);
}

export function sanitizeConfig(input: Partial<ExtensionConfig> | null | undefined): ExtensionConfig {
  return {
    org: input?.org?.trim() ?? "",
    githubToken: input?.githubToken?.trim() ?? "",
    refreshIntervalMinutes:
      input?.refreshIntervalMinutes && Number.isFinite(input.refreshIntervalMinutes)
        ? Math.max(MIN_REFRESH_INTERVAL_MINUTES, Math.floor(input.refreshIntervalMinutes))
        : DEFAULT_REFRESH_INTERVAL_MINUTES,
    teams:
      input?.teams?.map((team) => ({
        slug: team.slug.trim(),
        label: team.label.trim(),
        color: isTeamColor(team.color) ? team.color : "gray"
      })) ?? []
  };
}

export function validateConfig(input: Partial<ExtensionConfig> | null | undefined): ConfigValidationResult {
  const config = sanitizeConfig(input);

  if (!config.org) {
    return { valid: false, message: "Organization is required." };
  }

  if (!config.githubToken) {
    return { valid: false, message: "GitHub token is required." };
  }

  if (config.teams.length === 0) {
    return { valid: false, message: "At least one team is required." };
  }

  const seenSlugs = new Set<string>();

  for (const team of config.teams) {
    if (!team.slug) {
      return { valid: false, message: "Each team needs a slug." };
    }

    if (!team.label) {
      return { valid: false, message: "Each team needs a label." };
    }

    if (!isTeamColor(team.color)) {
      return { valid: false, message: `Invalid team color: ${team.color}.` };
    }

    if (seenSlugs.has(team.slug)) {
      return { valid: false, message: `Duplicate team slug: ${team.slug}.` };
    }

    seenSlugs.add(team.slug);
  }

  return {
    valid: true,
    config
  };
}

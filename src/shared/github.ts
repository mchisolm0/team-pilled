import type { TeamConfig } from "./types";

export class GitHubApiError extends Error {
  status: number;
  isRateLimited: boolean;

  constructor(message: string, status: number, isRateLimited = false) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.isRateLimited = isRateLimited;
  }
}

export function buildIssueCountQuery(owner: string, repo: string, username: string): string {
  return `repo:${owner}/${repo} assignee:${username} is:open is:issue`;
}

export function buildIssueCountUrl(owner: string, repo: string, username: string): string {
  const query = encodeURIComponent(buildIssueCountQuery(owner, repo, username));
  return `https://api.github.com/search/issues?q=${query}&per_page=1`;
}

export function getPrimaryTeamForUser(username: string, teams: TeamConfig[]): TeamConfig | undefined {
  const normalized = username.toLowerCase();

  return teams.find((team) => team.usernames.includes(normalized));
}

export async function parseGitHubJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  const isRateLimited =
    response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.get("retry-after"));
  const message = `GitHub API request failed with status ${response.status}.`;

  throw new GitHubApiError(message, response.status, Boolean(isRateLimited));
}

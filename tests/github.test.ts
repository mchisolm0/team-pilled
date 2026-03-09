import { describe, expect, it } from "vitest";
import { buildIssueCountQuery, getPrimaryTeamForUser } from "../src/shared/github";
import { sanitizeConfig } from "../src/shared/types";

describe("GitHub helpers", () => {
  it("builds a repo-scoped issue query", () => {
    expect(buildIssueCountQuery("openai", "team-pilled", "mchisolm0")).toBe(
      "repo:openai/team-pilled assignee:mchisolm0 is:open is:issue"
    );
  });

  it("picks the first matching group by config order", () => {
    const config = sanitizeConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: [
        { label: "Platform", color: "blue", usernames: ["mchisolm0"] },
        { label: "Infra", color: "green", usernames: ["mchisolm0"] }
      ]
    });

    const team = getPrimaryTeamForUser("mchisolm0", config.groups);

    expect(team?.label).toBe("Platform");
  });

  it("matches usernames case-insensitively after sanitization", () => {
    const config = sanitizeConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: [{ label: "Platform", color: "blue", usernames: ["OctoCat"] }]
    });

    const team = getPrimaryTeamForUser("octocat", config.groups);

    expect(team?.label).toBe("Platform");
  });
});

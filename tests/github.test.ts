import { describe, expect, it } from "vitest";
import { buildIssueCountQuery, getPrimaryTeamForUser } from "../src/shared/github";

describe("GitHub helpers", () => {
  it("builds an org-scoped issue query", () => {
    expect(buildIssueCountQuery("openai", "mchisolm0")).toBe("org:openai assignee:mchisolm0 is:open is:issue");
  });

  it("picks the first matching team by config order", () => {
    const membership = new Map<string, Set<string>>([
      ["platform", new Set(["mchisolm0"])],
      ["infra", new Set(["mchisolm0"])]
    ]);

    const team = getPrimaryTeamForUser(
      "mchisolm0",
      [
        { slug: "platform", label: "Platform", color: "blue" },
        { slug: "infra", label: "Infra", color: "green" }
      ],
      membership
    );

    expect(team?.slug).toBe("platform");
  });
});

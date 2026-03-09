import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/shared/types";

describe("validateConfig", () => {
  it("accepts a valid manual-group config and clamps the cache TTL to the minimum", () => {
    const result = validateConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 3,
      groups: [{ label: "Platform", color: "blue", usernames: ["Octocat", " octocat ", "hubot"] }]
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.issueCountCacheMinutes).toBe(5);
      expect(result.config.groups[0].usernames).toEqual(["octocat", "hubot"]);
    }
  });

  it("rejects configs without groups", () => {
    const result = validateConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: []
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toContain("At least one group");
    }
  });

  it("rejects groups without a label or usernames", () => {
    const missingLabel = validateConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: [{ label: "", color: "blue", usernames: ["octocat"] }]
    });
    const missingUsers = validateConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: [{ label: "Platform", color: "blue", usernames: ["   "] }]
    });

    expect(missingLabel.valid).toBe(false);
    expect(missingUsers.valid).toBe(false);
  });

  it("accepts duplicate usernames across groups and rejects legacy config", () => {
    const duplicates = validateConfig({
      showIssueCounts: true,
      issueCountCacheMinutes: 30,
      groups: [
        { label: "Platform", color: "blue", usernames: ["octocat"] },
        { label: "Infra", color: "green", usernames: ["octocat"] }
      ]
    });
    const legacy = validateConfig({
      org: "openai"
    } as never);

    expect(duplicates.valid).toBe(true);
    expect(legacy.valid).toBe(false);
    if (!legacy.valid) {
      expect(legacy.message).toContain("Legacy configuration");
    }
  });
});

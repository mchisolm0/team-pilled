import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/shared/types";

describe("validateConfig", () => {
  it("accepts a valid config and clamps refresh interval to the minimum", () => {
    const result = validateConfig({
      org: "openai",
      githubToken: "ghp_test",
      refreshIntervalMinutes: 3,
      teams: [{ slug: "platform", label: "Platform", color: "blue" }]
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.refreshIntervalMinutes).toBe(5);
    }
  });

  it("rejects duplicate team slugs", () => {
    const result = validateConfig({
      org: "openai",
      githubToken: "ghp_test",
      refreshIntervalMinutes: 15,
      teams: [
        { slug: "platform", label: "Platform", color: "blue" },
        { slug: "platform", label: "Platform 2", color: "green" }
      ]
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toContain("Duplicate team slug");
    }
  });
});

import { describe, expect, it } from "vitest";
import { collectDiscussionUsernames, parseRepoContext, renderUserBadges, setStatusBanner } from "../src/content/dom";
import {
  dynamicCommentFixture,
  issueCommentFixture,
  modernActivityCommentFixture,
  modernIssueHeaderFixture,
  prBodyFixture,
  reviewCommentFixture
} from "./fixtures";

describe("content DOM rendering", () => {
  it("collects usernames from supported comment headers", () => {
    document.body.innerHTML = issueCommentFixture + prBodyFixture + reviewCommentFixture;
    expect(collectDiscussionUsernames(document)).toEqual(["mchisolm0", "octocat", "reviewer"]);
  });

  it("parses repository context from supported GitHub issue URLs", () => {
    expect(parseRepoContext({ pathname: "/openai/team-pilled/issues/42" })).toEqual({
      owner: "openai",
      name: "team-pilled"
    });
    expect(parseRepoContext({ pathname: "/openai/team-pilled/wiki" })).toBeNull();
  });

  it("inserts pills after existing badges and before the timestamp", () => {
    document.body.innerHTML = issueCommentFixture;

    const rendered = renderUserBadges(document, {
      mchisolm0: {
        username: "mchisolm0",
        primaryTeam: { label: "Platform", color: "blue", usernames: ["mchisolm0"] },
        openIssueCount: 12,
        stale: false
      }
    });

    const metaRow = document.querySelector(".timeline-comment-header .d-flex.flex-items-center.flex-wrap.gap-1");
    const group = metaRow?.querySelector<HTMLElement>("[data-team-pilled-group='true']");
    const collaborator = metaRow?.querySelector(".Label:not(.team-pilled-pill)");
    const timestamp = metaRow?.querySelector(".js-timestamp");

    expect(rendered).toBe(1);
    expect(group?.textContent).toContain("Platform");
    expect(group?.textContent).toContain("[12 issues]");
    expect(collaborator?.compareDocumentPosition(group as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group?.compareDocumentPosition(timestamp as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders only the group pill when the issue count is unavailable", () => {
    document.body.innerHTML = prBodyFixture;

    const rendered = renderUserBadges(document, {
      octocat: {
        username: "octocat",
        primaryTeam: { label: "Platform", color: "blue", usernames: ["octocat"] },
        stale: false
      }
    });

    const group = document.querySelector<HTMLElement>("[data-team-pilled-group='true']");

    expect(rendered).toBe(1);
    expect(group?.textContent).toContain("Platform");
    expect(group?.textContent).not.toContain("issues");
  });

  it("does not duplicate pills across repeated renders and handles dynamically added comments", () => {
    document.body.innerHTML = prBodyFixture;

    const users = {
      octocat: {
        username: "octocat",
        primaryTeam: { label: "Platform", color: "blue", usernames: ["octocat"] },
        openIssueCount: 3,
        stale: false
      },
      latecomer: {
        username: "latecomer",
        primaryTeam: { label: "Infra", color: "green", usernames: ["latecomer"] },
        stale: true
      }
    };

    renderUserBadges(document, users);
    renderUserBadges(document, users);

    document.body.insertAdjacentHTML("beforeend", dynamicCommentFixture);
    const rendered = renderUserBadges(document, users);

    expect(document.querySelectorAll("[data-team-pilled-group='true']")).toHaveLength(2);
    expect(rendered).toBe(2);
    expect(document.body.textContent).toContain("Infra");
  });

  it("renders into the modern issue viewer badge group and updates rate-limit banner copy", () => {
    document.body.innerHTML = modernIssueHeaderFixture;

    const rendered = renderUserBadges(document, {
      mchisolm0: {
        username: "mchisolm0",
        primaryTeam: { label: "Reviewers", color: "green", usernames: ["mchisolm0"] },
        openIssueCount: 4,
        stale: false
      }
    });
    setStatusBanner("rate_limited", "Rate limited.");

    const badgeGroup = document.querySelector("[class*='IssueBodyHeader-module__badgeGroup__']");
    const banner = document.getElementById("team-pilled-banner");

    expect(rendered).toBe(1);
    expect(collectDiscussionUsernames(document)).toEqual(["mchisolm0"]);
    expect(badgeGroup?.textContent).toContain("Reviewers");
    expect(badgeGroup?.textContent).toContain("[4 issues]");
    expect(banner?.textContent).toContain("public GitHub API rate limit");
  });

  it("renders badges into modern activity comment headers for every visible matching comment", () => {
    document.body.innerHTML = modernActivityCommentFixture + modernActivityCommentFixture.replaceAll("mchisolm0", "octocat");

    const rendered = renderUserBadges(document, {
      mchisolm0: {
        username: "mchisolm0",
        primaryTeam: { label: "Platform", color: "blue", usernames: ["mchisolm0"] },
        openIssueCount: 2,
        stale: false
      },
      octocat: {
        username: "octocat",
        primaryTeam: { label: "Infra", color: "green", usernames: ["octocat"] },
        stale: false
      }
    });

    const commentHeaders = document.querySelectorAll("[class*='ActivityHeader-module__activityHeader__']");
    const firstBadgeContainer = commentHeaders[0]?.querySelector("[class*='ActivityHeader-module__BadgesGroupContainer__']");
    const secondBadgeContainer = commentHeaders[1]?.querySelector("[class*='ActivityHeader-module__BadgesGroupContainer__']");

    expect(rendered).toBe(2);
    expect(collectDiscussionUsernames(document)).toEqual(["mchisolm0", "octocat"]);
    expect(firstBadgeContainer?.textContent).toContain("Platform");
    expect(firstBadgeContainer?.textContent).toContain("[2 issues]");
    expect(secondBadgeContainer?.textContent).toContain("Infra");
  });
});

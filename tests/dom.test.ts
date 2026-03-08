import { describe, expect, it } from "vitest";
import { collectDiscussionUsernames, renderUserBadges } from "../src/content/dom";
import {
  dynamicCommentFixture,
  issueCommentFixture,
  modernIssueHeaderFixture,
  prBodyFixture,
  reviewCommentFixture
} from "./fixtures";

describe("content DOM rendering", () => {
  it("collects usernames from supported comment headers", () => {
    document.body.innerHTML = issueCommentFixture + prBodyFixture + reviewCommentFixture;
    expect(collectDiscussionUsernames(document)).toEqual(["mchisolm0", "octocat", "reviewer"]);
  });

  it("inserts pills after existing badges and before the timestamp", () => {
    document.body.innerHTML = issueCommentFixture;

    const rendered = renderUserBadges(document, {
      mchisolm0: {
        username: "mchisolm0",
        primaryTeam: { slug: "platform", label: "Platform", color: "blue" },
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

  it("does not duplicate pills across repeated renders and handles dynamically added comments", () => {
    document.body.innerHTML = prBodyFixture;

    const users = {
      octocat: {
        username: "octocat",
        primaryTeam: { slug: "platform", label: "Platform", color: "blue" },
        openIssueCount: 3,
        stale: false
      },
      latecomer: {
        username: "latecomer",
        primaryTeam: { slug: "infra", label: "Infra", color: "green" },
        openIssueCount: 8,
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

  it("renders into the modern issue viewer badge group", () => {
    document.body.innerHTML = modernIssueHeaderFixture;

    const rendered = renderUserBadges(document, {
      mchisolm0: {
        username: "mchisolm0",
        primaryTeam: { slug: "reviewers", label: "Reviewers", color: "green" },
        openIssueCount: 4,
        stale: false
      }
    });

    const badgeGroup = document.querySelector("[class*='IssueBodyHeader-module__badgeGroup__']");

    expect(rendered).toBe(1);
    expect(collectDiscussionUsernames(document)).toEqual(["mchisolm0"]);
    expect(badgeGroup?.textContent).toContain("Reviewers");
    expect(badgeGroup?.textContent).toContain("[4 issues]");
  });
});

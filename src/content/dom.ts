import type { SyncStatus, TeamColor, UserBadgeData } from "../shared/types";

const SUPPORTED_PAGE_PATTERN = /^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/\d+$/;
const BANNER_ID = "team-pilled-banner";
const LEGACY_HEADER_SELECTOR = ".timeline-comment-header";
const MODERN_HEADER_SELECTOR = "[class*='IssueBodyHeader-module__IssueBodyHeaderContainer__']";
const MODERN_AUTHOR_SELECTOR = "[class*='IssueBodyHeaderAuthor-module__authorLoginLink__']";
const MODERN_BADGE_GROUP_SELECTOR = "[class*='IssueBodyHeader-module__badgeGroup__']";
const MODERN_BADGES_SECTION_SELECTOR = "[class*='IssueBodyHeader-module__badgesSection__']";
const MODERN_DATE_SELECTOR = "[class*='IssueBodyHeader-module__dateLink__']";
const MODERN_TITLE_SECTION_SELECTOR = "[class*='IssueBodyHeader-module__titleSection__']";

export const TEAM_COLOR_CLASS_MAP: Record<TeamColor, string> = {
  gray: "team-pilled-pill--gray",
  blue: "team-pilled-pill--blue",
  green: "team-pilled-pill--green",
  yellow: "team-pilled-pill--yellow",
  orange: "team-pilled-pill--orange",
  red: "team-pilled-pill--red",
  pink: "team-pilled-pill--pink"
};

export function isSupportedDiscussionPage(locationLike: Pick<Location, "pathname">): boolean {
  return SUPPORTED_PAGE_PATTERN.test(locationLike.pathname);
}

export function parseRepoContext(locationLike: Pick<Location, "pathname">): { owner: string; name: string } | null {
  const match = locationLike.pathname.match(SUPPORTED_PAGE_PATTERN);

  if (!match) {
    return null;
  }

  return {
    owner: decodeURIComponent(match[1]),
    name: decodeURIComponent(match[2])
  };
}

function getDiscussionHeaders(root: ParentNode): HTMLElement[] {
  return [
    ...new Set([
      ...root.querySelectorAll<HTMLElement>(LEGACY_HEADER_SELECTOR),
      ...root.querySelectorAll<HTMLElement>(MODERN_HEADER_SELECTOR)
    ])
  ];
}

export function collectDiscussionUsernames(root: ParentNode = document): string[] {
  const usernames = new Set<string>();

  for (const header of getDiscussionHeaders(root)) {
    const authorLink = findAuthorLink(header);
    const username = authorLink?.textContent?.trim().toLowerCase();

    if (username) {
      usernames.add(username);
    }
  }

  return [...usernames];
}

function isLegacyHeader(header: HTMLElement): boolean {
  return header.matches(LEGACY_HEADER_SELECTOR);
}

function findAuthorLink(header: HTMLElement): HTMLAnchorElement | null {
  if (isLegacyHeader(header)) {
    return header.querySelector<HTMLAnchorElement>("a.author.Link--primary");
  }

  return (
    header.querySelector<HTMLAnchorElement>(MODERN_AUTHOR_SELECTOR) ??
    header.querySelector<HTMLAnchorElement>("a[href^='https://github.com/']") ??
    header.querySelector<HTMLAnchorElement>("a[href^='/']")
  );
}

function findMetaRow(header: HTMLElement): HTMLElement | null {
  if (isLegacyHeader(header)) {
    return (
      header.querySelector<HTMLElement>("h3 .d-flex.flex-items-center.flex-wrap.gap-1") ??
      header.querySelector<HTMLElement>(".d-flex.flex-items-center.flex-wrap.gap-1")
    );
  }

  return (
    header.querySelector<HTMLElement>(MODERN_BADGE_GROUP_SELECTOR) ??
    header.querySelector<HTMLElement>(MODERN_BADGES_SECTION_SELECTOR) ??
    header.querySelector<HTMLElement>(MODERN_TITLE_SECTION_SELECTOR)
  );
}

function findModernBadgeContainer(header: HTMLElement): HTMLElement | null {
  return (
    header.querySelector<HTMLElement>(MODERN_BADGE_GROUP_SELECTOR) ??
    header.querySelector<HTMLElement>(MODERN_BADGES_SECTION_SELECTOR) ??
    header.querySelector<HTMLElement>(MODERN_TITLE_SECTION_SELECTOR)
  );
}

function insertAfter(node: Node, reference: Node): void {
  if (reference.parentNode) {
    reference.parentNode.insertBefore(node, reference.nextSibling);
  }
}

function createPill(label: string, variant: "team" | "workload", color?: TeamColor, stale?: boolean): HTMLElement {
  const pill = document.createElement("span");
  pill.className = `Label team-pilled-pill team-pilled-pill--${variant}`;

  if (variant === "team" && color) {
    pill.classList.add(TEAM_COLOR_CLASS_MAP[color]);
  }

  if (stale) {
    pill.classList.add("team-pilled-pill--stale");
    pill.title = "Cached public issue count shown because the latest GitHub API request failed.";
  }

  pill.textContent = label;
  return pill;
}

export function renderUserBadges(root: ParentNode, users: Record<string, UserBadgeData>): number {
  let rendered = 0;

  for (const header of getDiscussionHeaders(root)) {
    const authorLink = findAuthorLink(header);
    const username = authorLink?.textContent?.trim().toLowerCase();
    const metaRow = findMetaRow(header);

    header.querySelector("[data-team-pilled-group='true']")?.remove();

    if (!username || !metaRow) {
      continue;
    }

    const data = users[username];
    if (!data?.primaryTeam) {
      continue;
    }

    const group = document.createElement("span");
    group.className = "team-pilled-group";
    group.dataset.teamPilledGroup = "true";
    group.dataset.teamPilledUsername = username;
    group.append(createPill(data.primaryTeam.label, "team", data.primaryTeam.color, data.stale));

    if (typeof data.openIssueCount === "number") {
      group.append(createPill(`[${data.openIssueCount} issues]`, "workload", undefined, data.stale));
    }

    if (isLegacyHeader(header)) {
      const timestamp = metaRow.querySelector(".js-timestamp");
      const inlineLabels = [...metaRow.querySelectorAll<HTMLElement>(".Label:not(.team-pilled-pill)")];
      const anchor = inlineLabels.at(-1) ?? (authorLink.closest("strong") ?? authorLink);

      if (timestamp && anchor.compareDocumentPosition(timestamp) & Node.DOCUMENT_POSITION_FOLLOWING) {
        metaRow.insertBefore(group, timestamp);
      } else {
        insertAfter(group, anchor);
      }
    } else {
      const badgeGroup = findModernBadgeContainer(header);
      const dateLink = header.querySelector<HTMLElement>(MODERN_DATE_SELECTOR);
      const titleSection = header.querySelector<HTMLElement>(MODERN_TITLE_SECTION_SELECTOR);

      if (badgeGroup) {
        badgeGroup.append(group);
      } else if (titleSection && dateLink && titleSection.contains(dateLink)) {
        titleSection.insertBefore(group, dateLink);
      } else {
        insertAfter(group, authorLink);
      }
    }

    rendered += 1;
  }

  return rendered;
}

export function setStatusBanner(status: SyncStatus, message?: string): void {
  const existing = document.getElementById(BANNER_ID);
  const shouldRender = status === "config_error" || status === "rate_limited";

  if (!shouldRender) {
    existing?.remove();
    return;
  }

  const host = existing ?? document.createElement("div");
  host.id = BANNER_ID;
  host.className = `team-pilled-banner team-pilled-banner--${status}`;
  host.innerHTML = "";

  const title = document.createElement("strong");
  title.textContent =
    status === "config_error"
      ? "GitHub Team Visualizer is not configured."
      : "GitHub Team Visualizer hit the public GitHub API rate limit.";

  const body = document.createElement("span");
  body.textContent =
    message ??
    (status === "config_error"
      ? "Open the extension options and configure at least one manual group."
      : "Issue counts are temporarily unavailable, but manual group pills still render.");

  host.append(title, body);

  if (!existing) {
    document.body.prepend(host);
  }
}

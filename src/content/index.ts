import type { RuntimeMessage, UserBadgeDataResponse } from "../shared/messages";
import type { SyncState } from "../shared/types";
import { collectDiscussionUsernames, isSupportedDiscussionPage, renderUserBadges, setStatusBanner } from "./dom";

const MESSAGE_TYPES = {
  getUserBadgeData: "GET_USER_BADGE_DATA",
  getSyncStatus: "GET_SYNC_STATUS"
} as const;

let refreshScheduled = false;
let refreshInFlight = false;
let lastPathname = window.location.pathname;

function sendMessage<T>(message: RuntimeMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response as T);
    });
  });
}

async function refreshAnnotations(): Promise<void> {
  if (!isSupportedDiscussionPage(window.location)) {
    setStatusBanner("ok");
    return;
  }

  const usernames = collectDiscussionUsernames(document);

  if (usernames.length === 0) {
    const syncState = await sendMessage<SyncState>({ type: MESSAGE_TYPES.getSyncStatus });
    setStatusBanner(syncState.status, syncState.message);
    return;
  }

  const response = await sendMessage<UserBadgeDataResponse>({
    type: MESSAGE_TYPES.getUserBadgeData,
    payload: { usernames }
  });

  const rendered = renderUserBadges(document, response.users);
  setStatusBanner(rendered > 0 ? "ok" : response.status, response.message);
}

function scheduleRefresh(): void {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;
  window.requestAnimationFrame(() => {
    refreshScheduled = false;

    if (refreshInFlight) {
      return;
    }

    refreshInFlight = true;
    void refreshAnnotations()
      .catch((error) => {
        setStatusBanner("degraded", error instanceof Error ? error.message : "Unknown extension error.");
      })
      .finally(() => {
        refreshInFlight = false;
      });
  });
}

function installObservers(): void {
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname;
    }

    scheduleRefresh();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("turbo:render", scheduleRefresh);
  document.addEventListener("pjax:end", scheduleRefresh);
}

if (typeof window !== "undefined" && document.readyState !== "loading") {
  installObservers();
  scheduleRefresh();
} else {
  window.addEventListener("DOMContentLoaded", () => {
    installObservers();
    scheduleRefresh();
  });
}

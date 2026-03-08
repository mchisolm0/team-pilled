# GitHub Team Visualizer

GitHub Team Visualizer is a Chrome Manifest V3 extension that annotates GitHub issue and pull request discussions with:

- a primary team badge for users on configured GitHub teams
- an org-scoped open issue count pill for those users
- cached fallback behavior when GitHub API calls fail or hit rate limits

## Features

- Track one GitHub org and multiple teams within that org
- Show a GitHub-style team pill beside usernames in issue and PR comments
- Show `[N issues]` workload pills using `org:{org} assignee:{username} is:open is:issue`
- Refresh team membership on a configurable interval
- Observe dynamically added GitHub discussion content without page reloads

## Configuration

The options page stores this shape in `chrome.storage.local`:

```json
{
  "org": "mycompany",
  "githubToken": "ghp_...",
  "refreshIntervalMinutes": 15,
  "teams": [
    { "slug": "platform", "label": "Platform", "color": "blue" },
    { "slug": "infra", "label": "Infra", "color": "green" }
  ]
}
```

Rules:

- One org only in v1
- Multiple teams supported
- Team array order controls primary-team precedence
- Refresh interval minimum is `5`

## Token Guidance

Use the least-privilege token that can:

- read the configured org team membership
- search assigned issues in the target org

For private organizations, make sure the token can see the org and the repositories whose issues you want counted.

The token is stored locally in the browser extension's `chrome.storage.local`. It is not synced anywhere by this project.

## Development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Load Unpacked In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Choose Load unpacked.
5. Select the generated `dist/` directory.
6. Open the extension options page and enter your org, PAT, refresh interval, and tracked teams.

## Supported GitHub Pages

The content script only annotates discussion pages that match:

- `https://github.com/:owner/:repo/issues/:number`
- `https://github.com/:owner/:repo/pull/:number`

Version 1 targets comment-style headers using GitHub's `.timeline-comment-header` markup. Compact one-line timeline events are intentionally skipped.

## Failure Behavior

- If a user is not on a tracked team, no badge is shown.
- If the GitHub API fails and cached data exists, cached values render with stale styling.
- If the GitHub API fails and no cache exists, the page shows a clear error banner.
- Membership refresh is handled in the background service worker with `chrome.alarms`.

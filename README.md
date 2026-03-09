# GitHub Team Visualizer

GitHub Team Visualizer is a Chrome Manifest V3 extension that annotates GitHub issue and pull request discussions with:

- a manual group badge for configured GitHub usernames
- an optional current-repo open issue count pill for those users
- cached fallback behavior when the public GitHub API fails or rate-limits

## Features

- Configure multiple manual groups of GitHub usernames
- Show a GitHub-style group pill beside usernames in issue and PR comments
- Optionally show `[N issues]` workload pills using `repo:{owner}/{repo} assignee:{username} is:open is:issue`
- Cache public issue counts locally to reduce API churn
- Observe dynamically added GitHub discussion content without page reloads

## Configuration

The options page stores this shape in `chrome.storage.local`:

```json
{
  "showIssueCounts": true,
  "issueCountCacheMinutes": 30,
  "groups": [
    {
      "label": "Platform",
      "color": "blue",
      "usernames": ["octocat", "mona-lisa"]
    },
    {
      "label": "Infra",
      "color": "green",
      "usernames": ["hubot"]
    }
  ]
}
```

Rules:

- At least one group is required
- Group order controls precedence when the same username appears in more than one group
- Issue-count cache minimum is `5` minutes
- Legacy PAT/org/team-slug configs are not migrated automatically; after upgrading, GitHub pages show a configuration error banner and badge rendering stays blocked until you re-enter the new group-based settings, save them, and reload or reopen the discussion page

## Public API Notes

- No personal access token is required
- Issue counts are scoped to the repository of the page you are viewing
- Public GitHub API rate limits may temporarily suppress issue-count pills while group pills continue to render
- Cached counts are marked stale when the latest fetch fails and an older cached value is used

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
6. Open the extension options page and enter your manual groups and cache settings.

## Supported GitHub Pages

The content script only annotates discussion pages that match:

- `https://github.com/:owner/:repo/issues/:number`
- `https://github.com/:owner/:repo/pull/:number`

Version 1 targets comment-style headers using GitHub's `.timeline-comment-header` markup. Compact one-line timeline events are intentionally skipped.

## Failure Behavior

- No badge is shown when a user is not in a configured group.
- Cached counts render with stale styling when the GitHub API fails and cached counts exist.
- Only the group pill renders when the GitHub API fails and no cached count exists.
- A clear error banner is shown when the extension is not configured.

# GitHub repository grouping

## Problem

Hostname grouping puts every `github.com` tab into one window, even when the
tabs belong to unrelated repositories.

## Goal

When **Split GitHub tabs by repository** is selected during **Group Tabs by
Domain**, group `github.com` URLs with at least two path segments by their
owner/repository slug. The option is off by default. For example, all pages
below belong to the `github.com/octo-org/octo-repo` group:

```text
https://github.com/octo-org/octo-repo
https://github.com/octo-org/octo-repo/issues/1
https://github.com/octo-org/octo-repo/pull/2
```

Owner and repository matching is case-insensitive. Each unique normalized
`github.com/<owner>/<repository>` key gets a new window. First-seen group order
and tab order remain unchanged.

## Compatibility and non-goals

- Other hosts keep exact-hostname grouping, including GitHub subdomains such as
  `gist.github.com`.
- `github.com` URLs with fewer than two path segments stay in a general
  `github.com` group.
- The extension derives a slug from the URL. It does not call GitHub to verify
  that an owner or repository exists.
- Exact-URL duplicate detection remains global and unchanged.

## Acceptance criteria

- Different GitHub repositories produce different groups and windows.
- With repository splitting disabled, all `github.com` URLs use the general
  `github.com` group.
- Different pages within one GitHub repository produce one group and window.
- Owner and repository case differences do not split a group.
- Root and single-segment GitHub URLs use the general `github.com` group.
- Non-GitHub hosts and GitHub subdomains retain hostname grouping.

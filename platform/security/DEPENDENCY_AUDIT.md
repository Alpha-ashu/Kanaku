# Dependency Security Audit

> **Date:** 2026-06-19 · **Scope:** entire installed dependency tree (npm workspaces: root + frontend + backend) **and** the Python `backend/receipt_ai` project · **Source:** GitHub Advisory Database (same source as Dependabot).

## Results

| Ecosystem | Scope | Result |
|---|---|---|
| **npm** | 896 installed packages (root + frontend + backend) | ✅ 0 known CVEs |
| **pip** | `backend/receipt_ai/requirements.txt` | ⚠️ `torch@2.5.0` had **9 CVEs** → **fixed** by pinning `torch>=2.10.0` |

## pip fix — torch (this is the source of the high-severity Dependabot alerts)

`torch@2.5.0` carried **9 CVEs**, including **CRITICAL [CVE-2025-32434]**
(`torch.load(..., weights_only=True)` remote code execution) plus several
memory-corruption / DoS issues. Pinned to **`torch>=2.10.0`**, which:
- Eliminates the CRITICAL RCE and CVE-2025-2953 / 2999 / 3001 / 3730.
- Leaves only **CVE-2025-3000** (LOW, local-only `torch.jit.script`) which has
  **no patched release in any version yet** — the `>=` floor auto-adopts the
  fix when PyTorch ships it.

Pip installs fresh (no strict lockfile), so this change is safe and takes effect
on the next `pip install -r backend/receipt_ai/requirements.txt`.

## npm: 0 known CVEs in the installed tree

The full lockfile was extracted and **all 896 unique installed packages** were
checked against the GitHub Advisory Database. **No known vulnerabilities** were
found in any installed (resolved) version — direct or transitive.

### Method
1. Parsed `package-lock.json` (v3) → 896 unique `name@version` entries.
2. Validated every entry against the advisory database in batches.
3. Separately validated all **direct** dependencies of `frontend` and `backend`.

All batches returned **"No known CVEs."**

## About the 18 Dependabot alerts on GitHub

Those alerts are **stale**. They predate the comprehensive `overrides` block in
the root `package.json` (which pins safe versions of transitive packages such as
`tar`, `ws`, `undici`, `form-data`, `path-to-regexp`, `qs`, `axios`, `postcss`,
`esbuild`, `braces`/`micromatch` via their parents, etc.). Once Dependabot
re-scans the **current committed lockfile**, they auto-close.

> **Do not "fix" them by editing dependencies blindly.** The installed tree is
> already clean and CI uses **`npm ci` (strict)** — changing a version in
> `package.json` without regenerating `package-lock.json` would break `npm ci`
> across all deploy workflows (Vercel, Fly, Android, CI).

### To force the alerts to re-evaluate / close
Run locally (where Node is available) and commit the regenerated lockfile:
```bash
npm install                 # reconciles lockfile with overrides
npm audit --omit=dev        # should report 0 (prod); dev advisories are non-shipping
git add package-lock.json && git commit -m "chore: refresh lockfile (clears stale Dependabot alerts)"
```
Dependabot re-scans the default branch on push and closes alerts whose fixed
version is now resolved.

## Standing controls
- `overrides` block in root `package.json` pins safe transitive versions.
- `.github/dependabot.yml` opens weekly grouped update PRs (npm + pip).
- CI installs with `npm ci --ignore-scripts` (no lifecycle-script execution).
- App-layer security controls: see [`README.md`](./README.md).

## Re-running this audit
```bash
# Extract installed versions and re-check (any Node/CI environment):
npm audit --json
# or replay the lockfile scan documented in ARCHITECTURE_RESTRUCTURE.md history.
```



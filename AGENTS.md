# AGENTS.md

Single source of project guidance for AI coding agents and contributors. `CLAUDE.md` and `.github/copilot-instructions.md` point here.

## Language

- All deliverables are written in English: commit message descriptions, PR and Issue titles and bodies, review comments, code comments and JSDoc, and documentation (README, this file).
- Error messages are English.
- Exceptions kept as-is: end-user-facing text posted to external services (for example the fork-PR approval comment in `.github/workflows/docker.yml`), quotations, technical identifiers, generated files and external source text.
- Do not rewrite Git history to change the language of past commits.

## Overview

A TypeScript / Node.js tool that watches the likes of a Bluesky user and notifies Discord (webhook or bot) about liked posts that contain images.

- `src/main.ts`: entry point. Loads the config, fetches likes, filters out already-notified ones, then calls `processLikes`. The watched user (`hiratake.dev`) is hardcoded here.
- `src/bsky.ts`: Bluesky API client (`getUserLikes`, `getPosts`), post cache, and `fetchExternal` (bounded retry with backoff + jitter for transient network errors and 429 / 5xx).
- `src/process-likes.ts`: notification loop. An image post is recorded as notified only after the Discord send succeeds. On the first run (no `data/notified.json`) posts are only recorded, not sent.
- `src/notified.ts`: persists notified post URIs to `data/notified.json` (override with `NOTIFIED_FILE`).
- `src/config.ts`: `Configuration` (`ConfigFramework`) and its validation; the `IConfiguration` interface is the config schema.
- Runtime data lives under `data/`: `config.json`, `notified.json`, `post_cache/` (override with `POST_CACHE_PATH`). `entrypoint.sh` (Docker) runs `pnpm start` every 10 minutes.

## Commands

```bash
pnpm install          # install dependencies (pnpm only)
pnpm start            # run once
pnpm dev              # watch mode
pnpm test             # node:test via tsx (src/*.test.ts)
pnpm lint             # prettier + eslint + tsc
pnpm fix              # prettier + eslint autofix
pnpm generate-schema  # regenerate schema/Configuration.json from IConfiguration
```

## Rules

- Do not bypass type errors with `skipLibCheck`.
- Follow the existing error message style: English, prefixed with an emoji (for example `❌`, `💡`); keep using an emoji in new messages if the surrounding messages have one.
- Never commit secrets. `data/config.json` holds the Discord token / webhook URL; do not log these values or commit anything under `data/`.
- When changing `IConfiguration` in `src/config.ts`, run `pnpm generate-schema`. If the interface is renamed, update the reference in the `generate-schema` script in `package.json`.
- Notifications must go through the notified check (`src/notified.ts`); sending to Discord without it causes duplicate notifications.
- External API responses (Bluesky embed types, missing fields, empty arrays) must not crash the process. Take particular care with the type guards and branches in `src/bsky.ts` such as `isImagePost`.
- Add or update tests in `src/*.test.ts` for logic changes (retry behavior in `src/bsky.ts`, notification flow in `src/process-likes.ts`).
- Branches follow [Conventional Branch](https://conventional-branch.github.io) (`feat/`, `fix/`, ...); commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Do not add commits to PRs created by Renovate.
- Use a temporary directory when cloning other repositories for research.

## Known, intentional behavior

- The watched Bluesky user is hardcoded in `src/main.ts`; making it configurable is future work.
- `console.log` output in the notification flow is intentional progress logging.

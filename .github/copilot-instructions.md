# GitHub Copilot Instructions

Guidance for Copilot code review. Project rules, commands and architecture are in [AGENTS.md](../AGENTS.md); write review comments in English.

## Review focus

- Formatting, lint and type errors (`pnpm lint`); changes that bypass type errors with `skipLibCheck`.
- Crashes on unexpected external API responses (embed types, missing fields, empty arrays), especially in `src/bsky.ts`.
- Secrets: Discord token / webhook URL leaking into logs or commits, or `data/` being committed.
- `IConfiguration` changes without regenerating the schema (`pnpm generate-schema`) or updating the `generate-schema` script.
- Discord sends that bypass the notified check in `src/notified.ts`.
- Logic changes without matching tests in `src/*.test.ts`.

## Do not flag

- The hardcoded watched user in `src/main.ts` (known, future work).
- Intentional `console.log` progress output in the notification flow.

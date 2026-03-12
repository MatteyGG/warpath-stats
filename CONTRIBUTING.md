# Contributing

## Branch strategy
- `main`: production-ready only.
- `dev`: integration branch for completed features.
- `feature/*`: all medium/large tasks are developed here and merged into `dev` via PR.

## Recommended flow
1. Create a branch from `dev`: `feature/<short-name>`.
2. Do work and open PR to `dev`.
3. After QA/verification, merge `dev` into `main` via PR.

## Commit message convention
Use Conventional-style messages with module scope:
- `feat(Модуль): ...`
- `fix(Модуль): ...`
- `chore(Модуль): ...`

Example:
- `feat(API): add 2 lines in players dataset mapping`

## Pull request checklist
- Build passes: `pnpm build`
- API docs updated if endpoint/request/response changed
- No unrelated files included in PR
- For schema changes: run `prisma db push` in target environment before deployment

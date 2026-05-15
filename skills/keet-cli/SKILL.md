---
name: keet-cli
description: Safely operate and improve the Keet CLI project and Keet ↔ OpenClaw bridge. Use for read-only inspection, debugging, documentation, release checks, bridge supervision, and explicitly approved messaging workflows. Requires explicit user confirmation before any outbound message, invite action, chat creation, long-running bridge/daemon start, or Git push.
---

# Keet CLI

## Overview

Use this skill when operating or improving the `keet-cli` project for Keet Messenger and Keet ↔ OpenClaw bridge workflows.

Default to read-only inspection. Treat all live Keet profile data and private chat content as sensitive. Do not expose secrets, recovery material, private messages, invite/profile codes, or generated bridge state.

Project source to verify before use: `https://github.com/projectreturn/Keet-cli`.

## Required safety gates

Before any external or state-changing action, get explicit user confirmation for:

- exact Keet profile/storage path,
- exact target chat or room,
- exact outgoing message/action,
- whether a long-running process may remain active,
- exact Git repository, branch, and commit diff before pushing.

Never join invites, create chats, route additional chats, print recovery/account material, or push code unless the user explicitly asked for that exact action.

## Quick workflow

1. Locate the project repository. Common default: `/openclaw/workspace/keet-cli`.
2. Verify provenance and local state before using it:

```bash
git remote -v
git status --short --branch
npm run lint
node src/cli.js --help
```

3. Prefer read-only commands first.
4. Confirm the required safety gates before any send, bridge, daemon, invite, chat, or Git push action.
5. After edits, run `npm run lint` and inspect `git diff` before reporting completion.

## Read-only commands

Run from the repo root unless the user specifies another checkout.

```bash
npm run lint
node src/cli.js --help
node src/cli.js inspect
node src/cli.js rooms
node src/cli.js messages --limit 10
```

Override Keet storage only when the user provides or confirms the path:

```bash
KEET_APP_STORAGE=/confirmed/path/to/app-storage node src/cli.js inspect
```

## State-changing commands

Only run these after explicit confirmation of profile, target chat, and exact action:

```bash
node src/cli.js send 'confirmed message text'
node src/cli.js bridge
node src/cli.js daemon
node src/cli.js watch --interval 2000
```

For `watch`, `daemon`, supervisor, or bridge modes, tell the user whether the process will keep running and how to stop it.

## Sensitive data rules

- Treat Keet profile storage, account/recovery material, private keys, tokens, invite/profile codes, bridge state, and logs with private messages as sensitive.
- Do not commit live Keet profile storage, generated state files, logs, screenshots of private chats, or copied private messages.
- Avoid printing message contents unless the user asked to inspect those exact messages.
- Redact secrets and private message content in summaries and errors.
- In shared/group contexts, do not reveal user-specific chat names, keys, paths, message contents, or operational details.

## Storage lock model

Keet Desktop and `keet-cli` should not use the same live storage concurrently. Keet protects the database with a device-file/FD lock.

If commands fail due to locking:

1. Check whether Keet Desktop or another `keet-cli` process is already using the profile.
2. Prefer one explicitly approved long-running owner process via `daemon` or `bridge` instead of many separate commands.
3. Do not kill user processes unless explicitly approved.

## Daemon / REPL mode

Use daemon mode only when repeated reads/sends are needed and the user approved a long-running process:

```bash
node src/cli.js daemon
```

Common REPL commands:

```text
/messages 10
/send confirmed message text
/rooms
/quit
```

This avoids conflicts between separate `watch` and `send` processes.

## Watch mode

Use watch mode only after the user confirms the profile and chat scope:

```bash
node src/cli.js watch --interval 2000
```

By default it should ignore local/self messages. Use `--include-local` only when explicitly needed for debugging.

## Keet ↔ OpenClaw bridge

Run the bridge in foreground for debugging first:

```bash
node src/cli.js bridge
```

Use supervisor/container modes only after the user confirms a persistent process is wanted.

A safe bridge must:

- keep multi-room routing disabled by default,
- forward only explicitly approved chat(s) from a config allowlist,
- report invites/membership events without auto-joining or acting on them,
- fail closed when the target chat is ambiguous,
- ignore its own/local echo messages unless debugging requires them,
- persist enough state to avoid duplicate replies and the selected model mode,
- support explicit model switching commands such as `lokal`, `online`, and `modell status`,
- avoid logging private message contents or secrets,
- stop or provide a stop command when the task is complete.

## Release checklist

Before release or publishing:

```bash
npm run lint
git status --short --branch
git diff --stat
git log --oneline -5
```

Before any Git push, confirm the repository, branch, diff, and credential/identity that will be used. Do not embed private key paths or print private keys in public skill content.

---
name: keet-cli
description: Work with Keet Messenger through the keet-cli project: inspect local Keet storage, list rooms/messages, send messages, run watch/daemon modes, operate a Keet ↔ OpenClaw bridge, diagnose storage lock issues, and keep bridge/supervisor behavior safe. Use when asked to automate, debug, operate, document, or extend Keet CLI or Keet/OpenClaw bridge workflows.
---

# Keet CLI

## Overview

Use this skill when operating or improving the `keet-cli` project for Keet Messenger and Keet ↔ OpenClaw bridge workflows.

Prefer conservative behavior: inspect first, avoid unintended outbound messages, never expose secrets, and do not join invites or create chats unless explicitly approved by the user.

## Quick workflow

1. Locate the project repository. Common default: `/openclaw/workspace/keet-cli`.
2. Inspect current state before changing anything:

```bash
git status --short --branch
npm run lint
node src/cli.js --help
```

3. Choose the smallest relevant command for the task.
4. For sending or bridge actions, confirm the target chat/profile unless the user already made it explicit.
5. After edits, run `npm run lint` and inspect `git diff` before reporting completion.

## Core commands

Run from the repo root unless the user specifies another checkout.

```bash
npm install
npm run lint
node src/cli.js --help
node src/cli.js inspect
node src/cli.js rooms
node src/cli.js messages --limit 10
node src/cli.js send 'message text'
node src/cli.js watch --interval 2000
node src/cli.js daemon
node src/cli.js bridge
```

Override Keet storage when needed:

```bash
KEET_APP_STORAGE=/path/to/app-storage node src/cli.js inspect
```

## Safe operation rules

- Treat Keet profile storage, seeds, recovery phrases, private keys, tokens, invite/profile codes, bridge state, and logs containing private messages as sensitive.
- Do not commit live Keet profile storage or generated state files.
- Do not send messages, create chats, join invites, or modify external state unless the user asked for that exact action.
- Prefer read-only commands (`inspect`, `rooms`, `messages`) before write commands (`send`, `bridge`).
- When in a shared/group context, avoid leaking user-specific chat names, keys, paths, or message contents.

## Storage lock model

Keet Desktop and `keet-cli` should not use the same live storage concurrently. Keet protects the database with a device-file/FD lock.

If commands fail due to locking:

1. Check whether Keet Desktop or another `keet-cli` process is already using the profile.
2. Prefer one long-running owner process via `daemon` or `bridge` instead of many separate commands.
3. Do not kill user processes unless explicitly approved.

## Daemon / REPL mode

Use daemon mode when repeated reads and sends are needed without reopening Keet storage each time:

```bash
node src/cli.js daemon
```

Common REPL commands:

```text
/messages 10
/send hello from one long-running process
/rooms
/quit
```

This avoids conflicts between separate `watch` and `send` processes.

## Watch mode

Use watch mode for incoming message observation:

```bash
node src/cli.js watch --interval 2000
```

By default it ignores local/self messages. Use `--include-local` only when explicitly needed for debugging.

## Keet ↔ OpenClaw bridge

Run the bridge directly for foreground debugging:

```bash
node src/cli.js bridge
```

Use the supervisor for a non-systemd environment:

```bash
scripts/keet-bridge-supervisor.sh
```

Use the container entrypoint only when the container should supervise both OpenClaw availability and the bridge:

```bash
scripts/container-entrypoint.sh
```

Keep bridge routing conservative. A good bridge should:

- forward only the intended chat(s),
- ignore its own/local echo messages unless needed,
- persist enough state to avoid duplicate replies,
- fail closed when the target chat is ambiguous,
- log operational errors without dumping secrets.

## Release checklist

Before release or publishing:

```bash
npm run lint
git status --short --branch
git log --oneline -5
```

Then verify README status, known limitations, and safety notes match the current implementation.

For GitHub deploy-key pushes, prefer SSH with the specific identity when one is configured:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/projectreturn -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' git push git@github.com:OWNER/REPO.git main
```

Replace identity, owner, and repo with the actual project values. Do not print private keys.

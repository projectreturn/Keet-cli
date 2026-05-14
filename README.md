# keet-cli

Experimental terminal tooling for Keet Messenger.

Goal: build a console-first way to inspect and eventually operate a Keet profile without the Electron GUI.

## Current status

Very early research prototype.

- ✅ Repository scaffold
- ✅ OpenClaw/Codex usage guard script
- 🚧 Read-only local Keet storage inspection
- ⏳ Message send support
- ⏳ Real TUI

## Safety

Do **not** commit live Keet profile storage, seeds, recovery phrases, private keys, tokens, or invite/profile codes.

This project should start read-only. Writing/sending comes later after we understand the storage and `keet-core` APIs well enough not to corrupt anything.

## Usage guard

```bash
./oc-usage-check.sh
```

This checks OpenClaw/Codex context and quota windows so long-running work can pause before hitting limits.

## Local development

```bash
npm run lint
node src/cli.js --help
node src/cli.js inspect
```

By default it looks at:

```text
~/.config/Keet/app-storage
```

Override with:

```bash
KEET_APP_STORAGE=/path/to/app-storage node src/cli.js inspect
```

## Current CLI commands

```bash
node src/cli.js rooms
node src/cli.js messages --limit 10
node src/cli.js send 'hello from keet-cli'
```

These commands launch Keet's bundled core worker via `bare-sidecar` and speak to it through Keet's RPC client.

Current limitation: Keet Desktop and `keet-cli` cannot use the same live storage at the same time because Keet protects the database with a device-file/FD lock. Stop the GUI before using the CLI, or later run a dedicated CLI profile/session strategy.

### Watch mode

```bash
node src/cli.js watch --interval 2000
```

`watch` polls the latest messages and prints new messages as JSON lines. It intentionally ignores local/self messages unless `--include-local` is used.

Current lock limitation: only one `keet-cli` process can use the live Keet storage at a time. That means `watch` and a separate `send` command cannot run concurrently yet. The next architecture step is a single long-running CLI daemon/REPL that owns the Keet core sidecar and multiplexes `watch` + `send` in one process.

### Daemon / REPL mode

```bash
node src/cli.js daemon
```

The daemon keeps one Keet core sidecar open and accepts commands:

```text
/messages 10
/send hello from one long-running process
/rooms
/quit
```

This avoids the live-storage lock conflict between separate `watch` and `send` processes. In interactive TTY mode it also polls for incoming messages.

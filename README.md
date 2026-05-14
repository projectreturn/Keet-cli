# keet-cli

Terminal tooling for Keet Messenger profiles, chats, and OpenClaw bridge usage.

`keet-cli` is currently a practical v0.1.0 prototype: it can inspect rooms/messages, send messages, run a long-lived daemon, and operate a Keet ↔ OpenClaw bridge for one configured direct chat.

## Current status

- ✅ Local Keet storage inspection
- ✅ Room and message listing
- ✅ Message sending
- ✅ Daemon / REPL mode to avoid storage lock conflicts
- ✅ Watch mode for incoming messages
- ✅ Keet ↔ OpenClaw bridge prototype
- ✅ Lightweight supervisor and container entrypoint helpers
- 🚧 Multi-chat routing and invite handling are intentionally not automated yet
- 🚧 Real TUI is not implemented yet

## Safety

Do **not** commit live Keet profile storage, seeds, recovery phrases, private keys, tokens, invite/profile codes, or generated bridge state.

This tool works against local Keet data and can send messages. Use a dedicated profile/session where possible, and avoid running multiple processes against the same live storage at the same time.

## Install / development

```bash
npm install
npm run lint
node src/cli.js --help
```

By default it looks at:

```text
~/.config/Keet/app-storage
```

Override with:

```bash
KEET_APP_STORAGE=/path/to/app-storage node src/cli.js inspect
```

## CLI commands

```bash
node src/cli.js inspect
node src/cli.js rooms
node src/cli.js messages --limit 10
node src/cli.js send 'hello from keet-cli'
```

These commands launch Keet's bundled core worker via `bare-sidecar` and speak to it through Keet's RPC client.

### Watch mode

```bash
node src/cli.js watch --interval 2000
```

`watch` polls the latest messages and prints new messages as JSON lines. It intentionally ignores local/self messages unless `--include-local` is used.

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

This avoids live-storage lock conflicts between separate `watch` and `send` processes. In interactive TTY mode it also polls for incoming messages.

## Keet ↔ OpenClaw bridge

```bash
node src/cli.js bridge
```

The bridge watches the configured Keet chat, forwards incoming messages to OpenClaw, and sends OpenClaw's reply back to Keet.

For non-systemd environments, run it under the lightweight supervisor:

```bash
scripts/keet-bridge-supervisor.sh
```

It restarts `node src/cli.js bridge` if the process exits and writes `keet-bridge.log`.

If the OpenClaw Gateway must stay available in the surrounding host/session, use the separate watchdog:

```bash
scripts/openclaw-gateway-watchdog.sh
```

This is intentionally separate from the Keet bridge because the bridge itself uses `openclaw agent --local`.

## Container restart/autostart

This container does not run systemd as PID 1. To survive a Docker restart, make Docker start the repo entrypoint as the container command:

```bash
/root/.openclaw/workspace/keet-cli/scripts/container-entrypoint.sh
```

The entrypoint starts:

- OpenClaw Gateway watchdog
- Keet ↔ OpenClaw bridge supervisor

and keeps PID 1 alive while streaming logs to `docker logs`.

## Known limitations

- Keet Desktop and `keet-cli` cannot safely use the same live storage at the same time.
- Only one `keet-cli` process should own the live Keet sidecar/storage at once.
- Bridge routing is intentionally conservative; do not auto-join invites or create chats without explicit approval.
- This is not a polished public TUI yet.

## Usage guard

```bash
./oc-usage-check.sh
```

This checks OpenClaw/Codex context and quota windows so long-running work can pause before hitting limits.

## OpenClaw / ClawHub skill

The ClawHub skill source lives in:

```text
skills/keet-cli/SKILL.md
```

Upload/use the source skill file for ClawHub. Packaged `.skill` files are generated locally only when needed.

## Release

Current release: `v0.1.0`.

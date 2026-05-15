# keet-cli

Terminal tooling for Keet Messenger profiles, chats, and OpenClaw bridge usage.

`keet-cli` is currently a practical v0.2.0 prototype: it can inspect rooms/messages, send messages, run a long-lived daemon, use a basic TUI, and operate optional Keet ↔ OpenClaw bridge workflows.

## Current status

- ✅ Local Keet storage inspection
- ✅ Room and message listing
- ✅ Message sending
- ✅ Daemon / REPL mode to avoid storage lock conflicts
- ✅ Watch mode for incoming messages
- ✅ Keet ↔ OpenClaw bridge prototype
- ✅ Safe multi-room bridge routing via explicit allowlist
- ✅ Invite/membership event reporting without auto-join
- ✅ Lightweight supervisor and container entrypoint helpers
- ✅ Basic terminal TUI for room selection, message viewing, and sending

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
node src/cli.js tui
```

These commands launch Keet's bundled core worker via `bare-sidecar` and speak to it through Keet's RPC client.

### Watch mode

```bash
node src/cli.js watch --interval 2000
```

`watch` polls the latest messages and prints new messages as JSON lines. It intentionally ignores local/self messages unless `--include-local` is used.

### TUI mode

```bash
node src/cli.js tui
```

The TUI is dependency-free and intentionally simple: select a room, view recent messages, refresh, and send a message from one terminal screen. It still uses the same Keet storage, so do not run it at the same time as another live `keet-cli` owner unless you know the storage lock implications.

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
node src/cli.js bridge --config bridge.config.example.json
```

The bridge watches the configured Keet chat, forwards incoming messages to OpenClaw or the configured local Ollama model, and sends the reply back to Keet.

By default, multi-room routing is **off**. Enable it only with an explicit config allowlist:

```json
{
  "multiRoom": true,
  "allowedRooms": ["ROOM_ID_1", "ROOM_ID_2"],
  "allowedSenders": ["PR"],
  "reportInvites": true
}
```

Invites and membership events are reported only; they are not auto-joined or acted on.

Model switch commands inside the Keet chat:

```text
lokal
online
modell status
```

`lokal` uses `qwen2.5:3b-instruct` through Ollama. `online` uses OpenClaw's normal agent path.

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
- The TUI is functional but intentionally minimal; it is not a full curses-style client yet.

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

Current release: `v0.2.0`.

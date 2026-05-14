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

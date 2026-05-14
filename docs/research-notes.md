# Research notes

## Keet desktop layout observed on Linux AppImage

Installed AppImage extraction path:

```text
~/.local/opt/keet/squashfs-root
```

Bundled app path:

```text
~/.local/opt/keet/squashfs-root/resources/app
```

Observed important dependencies in the bundled app:

- `@holepunchto/keet-core ~4.14.1`
- `@holepunchto/keet-store ^6.14.26`
- `keet-identity-key`
- `pear-runtime`
- Hypercore/Holepunch stack

Local profile/app storage observed:

```text
~/.config/Keet/app-storage
~/.config/Keet/app-storage/0/db
~/.config/Keet/app-storage/profiles.json
~/.config/Keet/app-storage/app-preferences/db.json
```

The LevelDB log contained plaintext fragments for direct chat messages, but this is not a stable API. Treat it as diagnostic only.

## Initial approach

1. Build read-only tools first.
2. Identify official or semi-official API surface in bundled `@holepunchto/keet-core` / `@holepunchto/keet-store`.
3. Avoid writing to Keet storage until API usage is understood.
4. Then build a minimal watch daemon and eventually message sending.

## Keet core API surface

Bundled `@holepunchto/keet-core` exports:

- `@holepunchto/keet-core/client`
- `@holepunchto/keet-core/rpc/client`
- `@holepunchto/keet-core/rpc/server`
- schema exports

The client exposes useful high-level methods including:

- `viewIdentity()`
- `viewLobby({ start, end })`
- `viewChat({ roomKey, start, size, isBottom })`
- `addChatMessage(roomKey, message)`
- `createRoomInvitation(roomKey, permissions)`

Likely clean path: start or attach to the same core worker RPC transport, then use official client view APIs. Missing piece: desktop worker transport/boot wrapper, bundled/minified inside the Electron/Pear app.

For now this repo remains read-only and inspects local files only. Next milestone: a `core-probe`/`core-readonly` command that loads bundled app modules with the correct module path and attempts a read-only/offline boot using Keet's own APIs.

## Working CLI core path

`keet-cli` can now launch the bundled worker:

```text
resources/app/.webpack/main/workers/core/index.mjs
```

It wraps the sidecar IPC with `framed-stream`, creates a `tiny-buffer-rpc` instance, then uses `@holepunchto/keet-core/rpc/client`.

Confirmed working against live storage while Keet Desktop is stopped:

- `core.getVersion`
- `core.getIdentity`
- `core.getRecentRooms`
- `core.getRoomInfo`
- `core.getChatMessages`
- `core.addChatMessage`

The GUI and CLI cannot run against the same profile simultaneously because live storage is locked. Copying storage also fails intentionally via `device-file` (`Invalid device file, was moved unsafely`).

## Watch mode limitation

The first `watch` implementation works as a polling loop over `core.getChatMessages`. It keeps the core sidecar open, so it owns the storage lock. A second `keet-cli send` process cannot run concurrently because it cannot acquire Keet's storage lock.

Next design: one long-lived CLI daemon or REPL owns the sidecar and exposes commands/events, instead of spawning one sidecar per command.

## Daemon/REPL

A first daemon mode now keeps a single core sidecar open and multiplexes commands in one process. This is the preferred direction because Keet live storage permits only one holder at a time.

For non-TTY scripted input, polling is disabled so tests can run deterministically. For interactive TTY input, polling is enabled and emits incoming messages as JSON lines.

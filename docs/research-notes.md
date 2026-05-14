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

# Security Policy

## Sensitive data

Do not commit or publish live Keet profile storage, seeds, recovery phrases, private keys, tokens, invite/profile codes, bridge state, logs with private messages, or screenshots/copies of private chats.

If you accidentally exposed sensitive Keet or account material, rotate or revoke it immediately where possible and remove it from Git history before sharing the repository further.

## Supported versions

This project is an early prototype. Security fixes target the current `main` branch and the latest tagged release.

## Reporting a vulnerability

Please open a private security advisory on GitHub if available, or contact the repository owner directly.

Do not include real secrets, private keys, recovery phrases, or private chat contents in reports. Use redacted examples.

## Safe operation

Use a test/dedicated Keet profile where possible. Confirm the target profile, chat, and exact outgoing action before running send, bridge, daemon, invite, chat-creation, or release/push workflows.

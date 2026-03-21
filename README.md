# cx

Codex Marketplace & Plugins

## Local setup

Copy the repository marketplace to `~/.agents/plugins/marketplace.json` with absolute plugin paths:

```bash
bun run sync:marketplace
```

If you want to write somewhere other than your home directory, set `CX_AGENTS_HOME`:

```bash
CX_AGENTS_HOME=/tmp/cx-marketplace-test bun run sync:marketplace
```

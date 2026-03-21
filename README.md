# cx

Codex Marketplace & Plugins

## Local setup

Copy the repository marketplace to `~/.agents/plugins/marketplace.json` with home-relative plugin paths:

```bash
bun run sync:marketplace
```

If you want to use a different marketplace root, set `CX_AGENTS_HOME`. The target directory must still be an ancestor of this repository so that plugin paths can stay in `./...` form:

```bash
CX_AGENTS_HOME=/tmp/cx-marketplace-test bun run sync:marketplace
```

Sync installed plugins into the local Codex plugin store (`CODEX_HOME/plugins/cache/<marketplace>/<plugin>/local/`):

```bash
bun run sync:plugin-store
```

To test against another Codex home, override `CODEX_HOME`:

```bash
CODEX_HOME=/tmp/codex-home-test bun run sync:plugin-store
```

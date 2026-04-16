# cx

Codex Marketplace & Plugins

## Plugins

| Plugin       | Skills                                                                                                                                           | Description                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **git**      | `commit`, `review`, `pr-create`, `pr-update`, `pr-fix`, `pr-ci`, `pr-status`, `pr-explain`, `pr-review`, `pr-watch`, `wt`, `japanese-text-style` | Git / GitHub ワークフロー      |
| **codex**    | `init`, `update`, `create-rules`                                                                                                                 | AGENTS.md と repo ルールの整備 |
| **dev**      | `do`, `plan`, `comment`                                                                                                                          | 並列実行、計画、コメント支援   |
| **catch-up** | `tech-research`                                                                                                                                  | 技術調査とバージョン追従       |

## Directory structure

```
cx/
├── .agents/plugins/marketplace.json   # Marketplace 定義
├── plugins/
│   └── <name>/
│       ├── .codex-plugin/
│       │   └── plugin.json            # Plugin manifest
│       ├── skills/
│       │   └── <skill>/
│       │       ├── SKILL.md
│       │       └── references/        # (optional)
│       └── README.md
├── scripts/
│   ├── sync-marketplace.mjs
│   └── sync-plugin-store.mjs
└── package.json
```

## Setup

### Repo marketplace (推奨)

このリポジトリをクローンするだけで利用できます。Codex は `$REPO_ROOT/.agents/plugins/marketplace.json` を自動で認識し、`plugins/` 配下の plugin を読み込みます。追加の同期コマンドは不要です。

```bash
git clone https://github.com/ronnnnn/cx.git
cd cx
```

### Personal marketplace

別のリポジトリからこの plugin セットを使う場合は、personal marketplace への同期と plugin store へのコピーが必要です。

```bash
bun install
bun run sync:marketplace
bun run sync:plugin-store
```

`sync:marketplace` は marketplace 定義を `~/.agents/plugins/marketplace.json` に同期し、`sync:plugin-store` は plugin ファイルを `~/.codex/plugins/cache/cx/<plugin>/local/` にコピーします。

plugin を更新した場合は両方を再実行してください。

```bash
bun run sync:marketplace && bun run sync:plugin-store
```

同期先を変更する場合:

```bash
# marketplace の同期先を変更 (対象ディレクトリはこのリポジトリの祖先である必要あり)
CX_AGENTS_HOME=/tmp/cx-marketplace-test bun run sync:marketplace

# plugin store の同期先を変更
CODEX_HOME=/tmp/codex-home-test bun run sync:plugin-store
```

## License

[MIT](LICENSE)

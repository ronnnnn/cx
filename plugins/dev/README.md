# Dev Plugin

Codex での開発ワークフローと HTML ドキュメント生成を支援する plugin です。

## Skills

- `dev:comment`
- `dev:do`
- `dev:docs-html`
- `dev:feedback`
- `dev:plan`
- `dev:review`

## Notes

- 並列実行は、`update_plan`、`spawn_agent`、`multi_tool_use.parallel` を使い分けています。
- `spawn_agent` はユーザーが明示的に sub-agent / delegation を求めたときだけ使う前提です。
- `dev:feedback` は指摘を鵜呑みにせず、妥当性・スコープ・方針整合性を判定してから修正します。
- `dev:review` はローカル変更のレビューと自動修正を担当します。

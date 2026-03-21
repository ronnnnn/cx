# Dev Plugin

Codex での開発ワークフローを支援する plugin です。

## Skills

- `dev:comment`
- `dev:do`
- `dev:plan`

## Notes

- 並列実行は、`update_plan`、`spawn_agent`、`multi_tool_use.parallel` を使い分けています。
- `spawn_agent` はユーザーが明示的に sub-agent / delegation を求めたときだけ使う前提です。

# Repository Guidelines

## プロジェクト構成

このリポジトリは、Codex 向け marketplace と local plugin 群を管理します。marketplace 定義は `.agents/plugins/marketplace.json`、バージョン管理は `.agents/plugins/versions.json` にあります。各 plugin は `plugins/<name>/` 配下にまとまり、`.codex-plugin/plugin.json`、`README.md`、`skills/<skill>/SKILL.md`、必要に応じて `skills/*/references/*.md` を持ちます。repo-local の補助 skill は `.codex/skills/` に置きます。

## ビルド・検証・開発コマンド

- `bun run fmt`: Markdown、YAML、JSON、JSON5 を整形します。
- `bun prettier --write <path>`: 特定ファイルだけを整形します。
- `jq empty .agents/plugins/marketplace.json .agents/plugins/versions.json plugins/*/.codex-plugin/plugin.json`: marketplace と manifest の JSON を検証します。
- `rg 'references/' plugins .codex/skills`: skill から参照先への導線を spot check します。
- `git status --short`: 変更対象の plugin、skill、manifest を確認します。

この repo にはアプリ本体の build や unit test はありません。主な検証対象は文書整合性、参照整合性、manifest の妥当性です。

## 日本語使用時のスタイリング

- 技術用語や固有名詞は原文を維持します。
- 日本語と半角英数字、記号の間には半角スペースを入れます。
- 文体はですます調、句読点は「。」「、」を使います。
- 丸括弧は半角 `()` を使います。

例:

- Codex 向け plugin の manifest を更新します。
- `AGENTS.md` と `SKILL.md` の整合を確認します。

## コード参照

コードや文書の参照元・参照先は、まず `Grep`、`Read`、`Glob` で確認します。参照が多いときは `multi_tool_use.parallel` で並列に読みます。repo 全体の依存確認では、skill 名、reference 名、manifest path を文字列検索してから本文確認に進みます。

## 技術調査

優先順位は `deepwiki MCP` → `Gemini MCP` → `context7 MCP` → `WebSearch` です。ローカルの repo 状態で判定できる事項は、外部調査より先に `Grep`、`Read`、`Glob` で確認します。Gemini を使うときは、必要に応じて `mcp__gemini__ask-gemini` で `google_web_search` を併用します。

## コーディング規約と命名

`.editorconfig` に従い、UTF-8、LF、末尾改行、2 スペースインデントを使います。Markdown は短く、指示的に書きます。skill directory は `pr-review` や `create-rules` のような kebab-case を使います。plugin 名と skill 名は実際のディレクトリ名に合わせ、README、manifest、skill 本文で同じ表記を保ちます。

## 検証方針

変更時の最低限の確認は次の 3 点です。

1. `bun run fmt`
2. `jq empty` による JSON 検証
3. `rg` による参照先と旧表現の spot check

skill の挙動を変えるときは、対象の `SKILL.md` と関連する `references/` を一緒に読み、説明と実体がずれていないことを確認します。tool 契約を変えた場合は、旧ツール名や旧用語が残っていないことを `rg` で再確認します。

## コミットと PR

commit は Conventional Commits 前提です。`commitlint.config.mjs` で許可されている scope は `caffeine`、`catch-up`、`claude`、`dev`、`git`、`hookify` です。例: `docs(git): refine pr-review wording`

commit 前には `lefthook` が staged の Markdown / JSON 系ファイルを整形し、`commit-msg` で `commitlint` を実行します。PR では、どの plugin / skill を変更したか、ユーザー影響、実施した検証 (`bun run fmt`、`jq empty`、`rg` による spot check など) を簡潔に記載します。

## セキュリティと設定

secret、token、個人用設定は manifest や例に含めません。marketplace の path は repo root 基準の相対 path を維持し、plugin metadata、README、skill、reference を一緒に更新して整合を保ちます。`plugin.json` にない skill は README や他 skill から参照を残さないようにします。

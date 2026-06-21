---
name: tech-research
description: |
  このスキルは、「技術調査して」「ドキュメントを調べて」「使い方を教えて」「最新情報を調べて」「API の仕様を確認して」「ライブラリの使い方」「フレームワークのドキュメント」などのリクエスト、または技術・ツール・フレームワーク・ライブラリの調査が必要な場合に使用する。優先順位に基づく複数ソースからの構造化された技術調査アプローチを提供する。
---

# Tech Research Skill

技術やツール、フレームワークの使い方や最新情報を、信頼できるソースから優先順位に基づいて調査するためのガイダンス。

## 概要

技術調査はメインセッションで進め、独立した調査対象だけを必要に応じて `spawn_agent` に委譲する。調査対象に応じて適切なソースを優先順位に基づいて選択し、正確な情報を取得する。

## 調査ソースの優先順位

以下の優先順位でソースを使い分ける:

| 優先度 | ソース               | 用途                                       | ツール                                                                                                   |
| ------ | -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1      | ローカルコード調査   | コードベース内の定義・参照・呼び出しの調査 | `Grep`, `Read`, `Glob`                                                                                   |
| 2      | deepwiki MCP         | OSS リポジトリの Wiki・ドキュメント        | `mcp__deepwiki__read_wiki_structure`, `mcp__deepwiki__read_wiki_contents`, `mcp__deepwiki__ask_question` |
| 3      | Antigravity MCP      | 最新情報や外部知見の取得                   | `mcp__antigravity__ask-antigravity`                                                                      |
| 4      | context7 MCP         | ライブラリの公式ドキュメントとコード例     | `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`                                         |
| 5      | 必要時のみ WebFetch  | 公式サイト・GitHub・特定 URL の取得        | 必要時のみ WebFetch                                                                                      |
| 6      | 必要時のみ WebSearch | 最新情報・ブログ・リリースノートの検索     | 必要時のみ WebSearch                                                                                     |

**例外 (上記の優先順位より優先):**

- terraform に関する内容は terraform MCP (`mcp__terraform__*`) が最優先
- Google Cloud に関する内容は google-developer-knowledge MCP (`mcp__google-developer-knowledge__*`) が最優先

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "調査対象の分類", status: "pending" },
    { step: "subagent の起動", status: "pending" },
    { step: "ソースからの情報取得", status: "pending" },
    { step: "結果の構造化", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 調査手順

### 1. 調査対象の分類

調査リクエストを以下のカテゴリに分類する:

- **コードベース内の調査**: 関数の定義、参照元、呼び出し関係 → `Grep` / `Read` / `Glob` を使用
- **OSS ライブラリの仕組み**: 内部実装、アーキテクチャ → deepwiki MCP を使用
- **最新情報や外部知見**: リリース情報、公式発表、周辺調査 → Antigravity MCP を使用
- **ライブラリの使い方**: API、設定方法、コード例 → context7 MCP を使用
- **特定ページの情報**: 公式ドキュメント、GitHub Issues → 必要時のみ WebFetch を使用
- **最新情報・トレンド**: リリース情報、ベストプラクティス → 必要時のみ WebSearch を使用

### 2. 調査の進め方

- まずメインセッションで、ローカルコード・MCP・Web 系ソースのどれを使うかを決める
- 独立した複数の調査対象がある場合のみ、`multi_tool_use.parallel` または `spawn_agent` で並列化する
- `spawn_agent` を使う場合は、結果待ちで手が止まらない独立調査だけを委譲する

### 3. 各ソースの使い方

#### ローカルコード調査 (優先度 1)

コードベース内の調査に使用する。まず `Grep` で候補を絞り、`Read` で周辺文脈を確認し、必要なら `Glob` で関連ファイルを列挙する。

```
Grep: 関数名・シンボル名・エラーメッセージで候補を絞る
Read: 定義と呼び出し元の周辺コードを確認する
Glob: 命名規則やディレクトリ構造から関連ファイルを列挙する
```

#### deepwiki MCP (優先度 2)

OSS リポジトリの内部ドキュメントを調査する。

```
1. deepwiki MCP を直接使用
2. mcp__deepwiki__read_wiki_structure: リポジトリの Wiki 構造を確認
3. mcp__deepwiki__read_wiki_contents: 特定ページの内容を取得
4. mcp__deepwiki__ask_question: 特定の質問に回答を得る
```

リポジトリの指定形式: `owner/repo` (例: `facebook/react`, `vercel/next.js`)

#### Antigravity MCP (優先度 3)

最新の Web 情報や外部知見を取得する。

```
1. Antigravity MCP を直接使用
2. mcp__antigravity__ask-antigravity: プロンプトで調査対象と必要な観点を明示する
```

**重要**: プロンプトには調査対象、必要な鮮度、優先したいソース種別を含める。

```
mcp__antigravity__ask-antigravity:
  prompt: "<検索対象> の最新情報を調べ、公式ソースを優先して根拠付きで要約してください"
```

例:

- `"React 19 の最新リリース情報を公式ソース優先で調べてください"`
- `"Next.js 15 の新機能を公式ドキュメントとリリースノート優先で調べてください"`

主な用途:

- 最新リリース情報・バージョン確認
- 公式発表・ニュースの取得
- 最新のベストプラクティス・トレンド

#### context7 MCP (優先度 4)

ライブラリの公式ドキュメントとコード例を取得する。

```
1. context7 MCP を直接使用
2. mcp__context7__resolve-library-id: ライブラリ ID を解決
3. mcp__context7__query-docs: ドキュメントを検索・取得
```

#### 必要時のみ WebFetch (優先度 5)

特定の URL からコンテンツを取得する。

```
必要時のみ WebFetch:
  url: "<対象 URL>"
  prompt: "<抽出したい情報の説明>"
```

主な用途:

- 公式ドキュメントページの特定セクション
- GitHub Releases / Changelog
- API リファレンス

#### 必要時のみ WebSearch (優先度 6)

最新情報やトレンドを検索する。

```
必要時のみ WebSearch:
  query: "<検索クエリ>"
```

検索クエリのコツ:

- 年を含める (例: "React Server Components 2026")
- 公式ソースを優先 (site:github.com, site:docs.\*)
- 具体的なキーワードを使用

### 4. 結果の構造化

調査結果を以下の形式でまとめる:

```markdown
## 調査結果: <対象名>

### 概要

<1-2 文で要約>

### 詳細

<調査で得られた具体的な情報>

### ソース

- [ソース名](URL) - 取得した情報の概要
```

## ソース選択のフローチャート

```
調査対象は何か？
├── コードベース内の定義・参照 → ローカルコード調査 (`Grep` / `Read` / `Glob`)
├── OSS の内部実装・アーキテクチャ → deepwiki MCP
├── 最新情報や外部知見の取得 → Antigravity MCP
├── ライブラリの使い方・API → context7 MCP
├── 特定 URL のコンテンツ → 必要時のみ WebFetch
└── 最新情報・トレンド → 必要時のみ WebSearch
```

上位ソースで情報が不足する場合、次の優先度のソースにフォールバックする。

## Additional Resources

### Reference Files

詳細なプロンプトテンプレートやソースごとの使い分けガイド:

- **`references/source-guide.md`** - 各ソースの詳細な使い方と具体例

---
name: init
description: AGENTS.md を新規作成。プロジェクト分析、テンプレート生成、ユーザー承認後に書き込み。
---

# AGENTS.md 作成ワークフロー

プロジェクト構造を分析し、AGENTS.md ファイルを新規作成する。

## 重要な原則

1. **プロジェクト固有の情報のみ記載** - Codex が既知の一般的なベストプラクティスは含めない
2. **簡潔さ優先** - コンテキストウィンドウを消費するため、必要最小限の情報のみ
3. **必須セクションを含める** - 日本語スタイリング、コード参照、技術調査優先順位
4. **ユーザー承認を得てから書き込む**

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "プロジェクト構造の分析", status: "pending" },
    { step: "技術スタックの検出", status: "pending" },
    { step: "既存 AGENTS.md の確認", status: "pending" },
    { step: "テンプレート生成", status: "pending" },
    { step: "ユーザー承認", status: "pending" },
    { step: "ファイル書き込み", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. 作成場所の決定

- 引数が指定された場合: `$1/AGENTS.md`
- 引数がない場合: 現在のディレクトリの `AGENTS.md`

### 2. プロジェクト構造の分析

```bash
# パッケージマネージャー/ビルドツールを検出
ls -la package.json Cargo.toml go.mod pyproject.toml Makefile justfile 2>/dev/null
```

### 3. 技術スタックの検出

- `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml` 等からスタックを検出
- `Makefile`, `justfile`, `package.json scripts` からコマンドを抽出
- ディレクトリ構造を把握

### 4. 既存 AGENTS.md の確認

```bash
# 既存ファイルを確認
ls -la AGENTS.md 2>/dev/null
```

既存ファイルがある場合は確認後マージ。

### 5. テンプレート生成

以下のセクションを必須で含める:

<!-- prettier-ignore -->
```markdown
# [プロジェクト名]

[1-2 文のプロジェクト概要]

## コマンド

[検出したコマンド一覧]

## 日本語使用時のスタイリング

ドキュメントやコードコメントなど、特に指示がない限りは下記を厳守します。

- 技術用語や固有名詞は原文を維持
- スペース: 日本語と半角英数字記号間に半角スペース
- 文体: ですます調、句読点は「。」「、」
  - 箇条書きリストやチェックリストはこの限りではない
- 記号: 丸括弧は半角「()」、鉤括弧は全角「「」」

例:

- Terraform は、素晴らしい IaC (Infrastructure as Code) ツールです。
- Codex は、Anthropic 社が開発しているエージェント型 AI コーディングツールです。

## コード参照

参照元・参照先の調査は、まず `Grep`、`Read`、`Glob` を使用

## 技術調査

優先順位: deepwiki MCP → Gemini MCP → context7 MCP → 必要時のみ WebSearch

※ Gemini MCP は mcp__gemini__ask-gemini で google_web_search を使用
```

### 6. 最適化

- Codex が既知の一般的な内容は含めない
- 目標: 500-1,500 words

### 7. ユーザー承認

生成した内容を表示し、ユーザーへの短い確認 で承認を得る。

### 8. ファイル書き込み

承認後、Write ツールで AGENTS.md を作成。

### 9. 完了報告

```
## AGENTS.md 作成完了

- **ファイル:** <path>
- **文字数:** X words
- **セクション数:** N
```

## エラーハンドリング

### 既存ファイルがある場合

1. 既存内容を読み込み
2. マージ方法をユーザーに確認
3. 承認後に上書き or マージ

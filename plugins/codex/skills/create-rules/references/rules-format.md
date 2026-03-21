# AGENTS.md 配置ガイド

## 概要

`AGENTS.md` は、Codex に対してプロジェクト固有のガイダンスを与えるためのファイルです。Codex はホームディレクトリの `AGENTS.md` と、プロジェクトルートから現在の作業ディレクトリまでに存在する `AGENTS.md` / `AGENTS.override.md` を順に読み込みます。

このため、ガイダンスは `docs/agent-rules/` のような集約ディレクトリではなく、対象コードに近い場所へコロケーションするのが基本です。

## 探索順序

Codex はおおむね次の順でガイダンスを解決します。

1. `~/.codex/AGENTS.override.md` があればそれを使用、なければ `~/.codex/AGENTS.md`
2. プロジェクトルートから現在ディレクトリまで、各ディレクトリで `AGENTS.override.md`、次に `AGENTS.md` を確認
3. ルートに近いものから順に連結し、現在ディレクトリに近いものほど後ろに追加される

したがって、下位ディレクトリの `AGENTS.md` は、より広いスコープの指示を上書きする場所として使える。

## 配置パターン

### 1. リポジトリ全体のガイダンス

```text
repo/
└── AGENTS.md
```

用途:

- すべての plugin や skill に共通する検証手順
- 文体、命名、PR 記載ルール
- リポジトリ全体で有効な作業方針

### 2. 特定ディレクトリ向けのガイダンス

```text
repo/
├── AGENTS.md
└── plugins/
    └── codex/
        ├── AGENTS.md
        └── skills/
            └── create-rules/
```

用途:

- `plugins/codex/` 配下だけで有効な guidance
- 特定 plugin の manifest 更新ルール
- 特定サブツリーでの README / skill 更新規約

### 3. 一時的な上書き

```text
repo/
└── services/
    └── payments/
        ├── AGENTS.md
        └── AGENTS.override.md
```

用途:

- 一時的に通常ルールを上書きしたい場合
- 通常の `AGENTS.md` を消さずに、限定的な指示へ切り替えたい場合

常用は避け、本当に override が必要な場合だけ使う。

## 記述方針

### 基本フォーマット

```markdown
# Payments Service Guidelines

## 実装

- 外部 API 呼び出しは `client.ts` のラッパー経由に統一する
- 返却エラーは `PaymentError` に正規化する

## 検証

- 変更後は `make test-payments` を実行する
```

### 記述する内容

- そのディレクトリでのみ有効な具体的ルール
- Codex が実装時に迷いやすい判断基準
- その場で必要になるコマンドや検証手順
- 既存コードベースから読み取れる独自ルール

### 記述しない内容

- 言語やフレームワークの一般論
- 公式ドキュメントにある標準的な使い方
- repo 全体に関係ない別ディレクトリ向けのルール
- 抽象的で実装判断に使えない助言

## 分割と統合の判断

### root の `AGENTS.md` に残す

- リポジトリ全体で有効
- どのディレクトリでも参照される
- 文体、検証、commit / PR 方針などの共通ルール

### 下位ディレクトリへ移す

- そのサブツリーでのみ有効
- 近い場所に置いた方が探索時のノイズが減る
- root に置くと他ディレクトリでは冗長になる

### 既存ファイルへ統合する

- 同じディレクトリスコープに既存の `AGENTS.md` がある
- 新規ファイルを増やすより追記した方が探索順が明確
- 内容が既存見出しへ自然に収まる

## サンプル構成

### シンプルなリポジトリ

```text
repo/
└── AGENTS.md
```

### 中規模リポジトリ

```text
repo/
├── AGENTS.md
└── plugins/
    ├── AGENTS.md
    ├── codex/
    │   └── AGENTS.md
    └── git/
        └── AGENTS.md
```

### override を含む構成

```text
repo/
├── AGENTS.md
└── services/
    └── payments/
        ├── AGENTS.md
        └── AGENTS.override.md
```

## 実務上の注意

- 新しい `AGENTS.md` を作る前に、同じスコープの既存ファイルがないか確認する
- 変更対象ファイルに近い場所へ置くことを優先する
- root に何でも集約せず、必要なら下位ディレクトリへ分割する
- override は便利だが、通常の `AGENTS.md` より読解負荷が上がるため多用しない
- 追加後は、どのディレクトリでどのファイルが有効になるかを説明できる状態にする

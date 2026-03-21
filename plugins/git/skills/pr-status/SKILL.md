---
name: pr-status
description: |
  このスキルは、「PR のステータスを教えて」「PR の状況は?」「PR status」「PR どうなってる?」「PR マージできる?」「CI 通ってる?」「レビュー状況を確認」「PR の進捗は?」「PR の様子を見て」「check PR」「PR のステータスサマリ」「PR status check」「is the PR ready to merge」などのリクエスト、または PR の現在の状態 (CI、レビュー、マージ可否) を簡潔に確認したい際に使用する。PR の diff や実装内容の解説ではなく、ステータス情報に特化した報告を行う。
---

# PR ステータス報告ワークフロー

PR の現在の状態を簡潔かつ網羅的に報告する。実装内容の解説ではなく、**今 PR がどうなっているか**に特化する。

## 重要な原則

1. **報告は常に簡潔に** - 各セクションは要点のみ。冗長な説明は不要
2. **日本語で報告する** - 技術用語や固有名詞は原文のまま維持
3. **日本語の記述は `japanese-text-style` スキルに従う** - スペース、句読点、括弧のルールを適用
4. **失敗やブロッカーを目立たせる** - 問題がある箇所はユーザーがすぐ気づけるようにする
5. **次のアクションを提案する** - 報告だけでなく、何をすべきかも伝える
6. **情報収集は直接行う** - `gh` で PR のメタデータ、CI、レビュー、未解決コメント、マージ可否を取得する

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "PR の特定", status: "pending" },
    { step: "PR 情報の収集", status: "pending" },
    { step: "ステータス報告の作成", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. PR の特定

引数から PR を特定する。URL 形式、番号形式、引数なしの全パターンに対応する:

```bash
# 引数なし: 現在のブランチに紐づく PR を取得
gh pr view --json number,title,url --jq '{number, title, url}'

# 番号形式: 123 (引数から数値部分を抽出して使用)
gh pr view <number> --json number,title,url --jq '{number, title, url}'

# URL 形式: https://github.com/owner/repo/pull/123
# URL から owner, repo, number を抽出して使用
```

PR が見つからない場合はエラーハンドリングへ。

### 2. PR 情報の収集

以下を直接取得し、結果を整理する:

```bash
# PR メタデータ
gh pr view <number> --json number,title,url,author,isDraft,state,headRefName,baseRefName,createdAt,updatedAt,additions,deletions,changedFiles,mergeable,reviewDecision

# CI / checks
gh pr checks <number>

# review と comment
gh pr view <number> --json latestReviews,comments,reviews
```

必要に応じて次も補助的に使う:

- `gh api graphql` で review threads や unresolved comments を取得
- `gh pr diff <number> --stat` で変更規模を再確認

取得した結果を次のステップで使用する。

### 3. ステータス報告の作成

収集結果をもとに、以下のフォーマットで報告する:

```markdown
## PR #<number>: <title>

| 項目       | 値                                         |
| ---------- | ------------------------------------------ |
| 作成者     | @<author>                                  |
| ステータス | <Draft/Open/Merged/Closed>                 |
| ブランチ   | `<head>` -> `<base>`                       |
| 変更規模   | <files> files (+<additions>, -<deletions>) |
| 作成日     | <created_at>                               |
| 最終更新   | <updated_at>                               |

### CI ステータス

[CI チェックが全て成功の場合]
全 <N> チェック成功

[失敗がある場合はテーブルで表示]
| チェック名 | ステータス |
|-----------|-----------|
| <name> | <成功/失敗/進行中/スキップ> |

失敗したチェックのみ、または全チェックをテーブルで表示するかは件数で判断:

- 全て成功: 一行サマリ
- 失敗あり (失敗 3 件以下): 失敗のみテーブル + 成功数サマリ
- 失敗あり (失敗 4 件以上): 全件テーブル

### レビューステータス

レビュー決定: <APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED / 未レビュー>

**レビュアー:**

- @<reviewer>: <APPROVED / CHANGES_REQUESTED / COMMENTED / PENDING>

**未解決コメント (<N> 件):**

未解決コメントが 5 件以下の場合は各コメントの要約を表示:

- `<path>`: @<author> - <コメントの要約 (1 行)>

未解決コメントが 6 件以上の場合はファイル単位でグルーピング:

- `<path>` (<N> 件): <代表的な指摘の要約>

未解決コメントがない場合:
未解決コメントなし

### マージ可否

[マージ可能な場合]
マージ可能 - CI 成功、レビュー承認済み、コンフリクトなし

[マージ不可の場合、理由を列挙]
マージ不可:

- <理由 1: 例: CI 失敗 (2 件)>
- <理由 2: 例: レビュー未承認>
- <理由 3: 例: コンフリクトあり>

### 次のアクション

状況に応じた推奨アクションを 1-3 個提示:

- 例: 「`/git:pr-ci` で CI 失敗を修正してください」
- 例: 「`/git:pr-fix` でレビューコメントに対応してください」
- 例: 「レビュアーの承認を待ってください」
- 例: 「マージ可能な状態です。マージを進めてください」
- 例: 「コンフリクトを解消してください」
```

**報告の品質基準:**

- **一目で全体像が掴める** - テーブルを上から下に読むだけで状況がわかる
- **問題箇所が目立つ** - 失敗やブロッカーは明確にマークする
- **次にやるべきことがわかる** - 推奨アクションを必ず含める

## エラーハンドリング

### PR が見つからない場合

```
現在のブランチ (<branch>) に紐づく PR が見つかりません。
PR 番号または URL を指定してください。

例: /git:pr-status 123
例: /git:pr-status https://github.com/owner/repo/pull/123
```

### CI チェックがまだ登録されていない場合

CI チェックが空の場合はその旨を報告に含める:

```
CI チェックはまだ登録されていません (プッシュ直後の可能性があります)。
```

### 外部リポジトリの PR の場合

URL から owner/repo を抽出し、agent の prompt に含めて情報取得を委譲する。

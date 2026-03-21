---
name: pr-review
description: PR をレビューし、指摘箇所にコメントを投稿する。複数 AI (Claude/Codex/Gemini) で並列レビューし、結果を統合。
---

# PR レビューワークフロー

PR の変更を複数の AI でレビューし、指摘箇所に PR コメントを投稿する。

## 重要な原則

1. **複数の視点で並列レビューする** - メインセッション、Gemini、必要時の追加 reviewer を併用する
2. **結果を統合・重複排除する** - 同じ指摘は 1 つにマージ
3. **有用な指摘のみコメントする** - メインセッションが最終判断
4. **インラインコメントを優先する** - ファイル・行番号が明確な場合
5. **コメント投稿前に必ずユーザー承認を取る**
6. **コメントの言語は対象リポジトリに従う** - 既存の PR やコメント履歴を確認
7. **日本語でコメントを書く場合は `japanese-text-style` スキルに従う**

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "PR の特定", status: "pending" },
    { step: "PR 差分の取得", status: "pending" },
    { step: "アプローチ判定", status: "pending" },
    { step: "並列レビューの実行", status: "pending" },
    { step: "コメント案の作成", status: "pending" },
    { step: "ユーザー承認の取得", status: "pending" },
    { step: "コメントの投稿", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. PR の特定

引数で PR 番号/URL が指定されていない場合、現在のブランチから PR を特定する:

```bash
# 引数が URL の場合、PR 番号を抽出
echo "$ARGUMENTS" | grep -oE '[0-9]+$' || gh pr view --json number --jq '.number'
```

```bash
# PR 情報を取得 (headRefOid はコメント投稿時に必要)
gh pr view <number> --json number,title,url,baseRefName,headRefName,headRefOid
```

### 2. PR 差分の取得

```bash
# PR の差分を取得
gh pr diff <number>

# 変更ファイル一覧
gh pr diff <number> --name-only
```

### 3. アプローチ判定

差分の統計情報とユーザー要件に基づいて、レビューアプローチを選択する。

#### 3-1. 統計情報の取得

```bash
# 変更ファイル数
gh pr diff <number> --name-only | wc -l

# 変更行数 (追加 + 削除)
gh pr view <number> --json additions,deletions --jq '.additions + .deletions'
```

#### 3-2. 複数 agent の利用判断

- ユーザーが明示的に delegation / sub-agents / parallel agents を求めている場合のみ、**パターン B (複数 agent)** を検討する
- それ以外は **パターン A (単一 agent)** を基本とする

#### 3-3. アプローチの選択

複数 agent が利用可能な場合、以下の基準で**メインセッションが総合判断**する:

| 基準                  | パターン A (単一 agent)    | パターン B (複数 agent)                     |
| --------------------- | -------------------------- | ------------------------------------------- |
| **reviewer 間の議論** | 結果を集約するだけで十分   | 発見を共有・検証し合うことに価値がある      |
| **変更の複雑度**      | 単純な変更、少数ファイル   | 複数モジュール/レイヤーにまたがる複雑な変更 |
| **変更量**            | 小〜中規模                 | 大規模 (多数ファイル、大差分)               |
| **最適なケース**      | 結果だけが重要な集中タスク | 議論とコラボが必要な複雑タスク              |

**目安:**

- ファイル数 15 未満 かつ 変更行数 500 未満 かつ 単一モジュール → パターン A 推奨
- ファイル数 15 以上 または 変更行数 500 以上 → パターン B 推奨
- 複数モジュール/レイヤーにまたがる変更 → パターン B 推奨
- セキュリティ関連の変更 → パターン B 推奨 (複数視点が重要)

### 4. 並列レビューの実行

#### パターン A: 単一 agent

**必要なら `spawn_agent` を起動する。**

**重要:**

- ユーザーが明示的に delegation / sub-agents / parallel agents を求めていない場合は、メインセッションでレビューを完結する。
- `spawn_agent` を使う場合も、自動修正はメインセッションのみが実行する。
- Gemini MCP が使える場合は、メインセッションのレビューと並列に実行してよい。

```
spawn_agent({  description: "PR の並列レビュー",
  prompt: `あなたは code-reviewer です。PR #<number> の差分を複数 AI で並列レビューし、結果を統合してください。PR URL: <url>

## 手順

### 1. 差分の取得

\`\`\`bash
gh pr diff <number>
gh pr diff <number> --name-only
\`\`\`

### 2. 並列レビュー対象の決定

利用可能なレビュー手段を決める:
- メインセッションによるレビュー
- 利用可能なら `mcp__gemini__ask-gemini`
- 必要なら追加の `spawn_agent`

### 3. 並列レビューの実行

**メインセッションのレビュー (常に実行・フォアグラウンド):**

差分を直接分析し、以下の観点でレビューする:
- バグ: 論理エラー、off-by-one、null 参照
- セキュリティ: インジェクション、認証、機密情報
- パフォーマンス: N+1、不要なループ、メモリリーク
- 可読性: 命名、複雑度、コメント
- テスト: カバレッジ、エッジケース

**Gemini MCP レビュー (利用可能時):**
- `mcp__gemini__ask-gemini` を `prompt: "/code-review <PR の URL>"` で呼び出す

**追加 agent レビュー (必要時):**
- セキュリティやロジックなど、観点を分ける価値がある場合だけ `spawn_agent` で reviewer を追加する

**実行順序:**
メインセッションのレビューと利用可能な MCP レビューを単一メッセージ内で並列実行 (全てフォアグラウンド)

注: Pattern A では全てフォアグラウンドで MCP ツールを実行する前提のため、個々の MCP 呼び出しに対する明示的なタイムアウト制御は行わない。タイムアウトやリトライ制御が必要な長時間処理は Pattern B (複数 agent) で実装すること。

### 4. 結果の統合

**重複排除:**
1. ファイルパスと行番号で指摘をグループ化
2. 同じ問題への指摘は最も詳細な説明を採用
3. severity は最も高いものを採用

**severity 統一:**
- CRITICAL: セキュリティ脆弱性、データ損失リスク (即時修正必須)
- HIGH: バグ、重大なロジックエラー (修正推奨)
- MEDIUM: パフォーマンス問題、可読性 (検討推奨)
- LOW: スタイル、軽微な改善 (任意)

**Gemini 出力の severity マッピング:**
- critical, severe, security → CRITICAL
- bug, error, high → HIGH
- warning, medium → MEDIUM
- info, suggestion, nit → LOW

## 出力形式

\`\`\`markdown
## Aggregated Review Results

**Reviewed by:** メインセッション, Gemini, 追加 reviewer (利用したもののみ記載)
**Total Issues:** N

### Critical Issues (X)
1. **[CRITICAL]** [file:line] - 説明
   - 問題: ...
   - 推奨: ...
   - 検出元: メインセッション, Gemini

### High Priority Issues (Y)
...
### Medium Priority Issues (Z)
...
### Low Priority Issues (W)
...
\`\`\`

## 注意事項
- Gemini や追加 reviewer が利用できない場合はメインセッション単独でレビューを実行する
- スタイルのみの指摘 (linter で対応すべき)、好みの問題、曖昧な指摘は除外する
- 検出元 (メインセッション / Gemini / 追加 reviewer) を各指摘に付記する`
})
```

agent が以下を自動で実行する:

- Gemini や追加 reviewer の利用可否確認
- メインセッション自身のレビュー + 利用可能なレビュー手段への並列依頼
- 結果の統合・重複排除・severity 統一

→ ステップ 5 (指摘のフィルタリング) へ進む

#### パターン B: 複数 agent

各 reviewer に異なるレンズ (観点) を割り当て、独立したセッションで真に並列レビューを実行する。reviewer 間で発見を共有・検証し合うことで、単一 agent よりも深い分析が可能。

##### B-1. reviewer の起動準備

```
`spawn_agent`
```

##### B-2. reviewer の起動

以下の reviewer を**単一メッセージ内で並列に起動**する。起動後は返ってきた agent id を保持し、`wait_agent` で完了を待機する。

**security-reviewer:**

```
spawn_agent({  description: "セキュリティレビュー",
  prompt: `あなたは security-reviewer です。PR #<number> をセキュリティ観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
gh pr diff <number>
\`\`\`

### 2. セキュリティ観点でのレビュー
以下に集中してレビューする:
- インジェクション (SQL, XSS, コマンド等)
- 認証・認可の欠陥
- 機密情報の漏洩 (ハードコードされたシークレット、ログへの出力)
- 入力バリデーションの不足
- 安全でないデシリアライゼーション
- アクセス制御の問題

### 3. 他の reviewer の発見を検証
必要なら、メインセッションから共有された追加観点を踏まえて見直す。

### 4. 結果の送信
最終結果を メインセッションに 以下の形式で返す:

\`\`\`markdown
## Security Review Results

**Reviewer:** security-reviewer
**Issues Found:** N

1. **[SEVERITY]** [file:line] - 説明
   - 問題: ...
   - 推奨: ...
\`\`\`

### 5. タスク完了
変更したファイルと結果を明記して完了する。`
})
```

**logic-reviewer:**

```
spawn_agent({  description: "ロジックレビュー",
  prompt: `あなたは logic-reviewer です。PR #<number> をバグ・ロジック観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
gh pr diff <number>
\`\`\`

### 2. バグ・ロジック観点でのレビュー
以下に集中してレビューする:
- 論理エラー、off-by-one エラー
- null/undefined 参照
- 境界条件の処理漏れ
- 競合状態、デッドロック
- エラーハンドリングの不足
- パフォーマンス問題 (N+1 クエリ、不要なループ、メモリリーク)

### 3. 他の reviewer の発見を検証
必要なら、メインセッションから共有された追加観点を踏まえて見直す。

### 4. 結果の送信
最終結果を メインセッションに 以下の形式で返す:

\`\`\`markdown
## Logic Review Results

**Reviewer:** logic-reviewer
**Issues Found:** N

1. **[SEVERITY]** [file:line] - 説明
   - 問題: ...
   - 推奨: ...
\`\`\`

### 5. タスク完了
変更したファイルと結果を明記して完了する。`
})
```

**bestpractice-reviewer:**

```
spawn_agent({  description: "ベストプラクティスレビュー",
  prompt: `あなたは bestpractice-reviewer です。PR #<number> を使用ツール・FW・ライブラリ・言語のベストプラクティス観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
gh pr diff <number>
\`\`\`

### 2. ベストプラクティス観点でのレビュー
以下に集中してレビューする:
- 使用言語のイディオムに従っているか
- フレームワーク・ライブラリの推奨パターンに従っているか
- API の正しい使用方法
- 非推奨 API・パターンの使用
- テストのベストプラクティス (カバレッジ、エッジケース)
- 可読性・命名規則

### 3. 他の reviewer の発見を検証
必要なら、メインセッションから共有された追加観点を踏まえて見直す。

### 4. 結果の送信
最終結果を メインセッションに 以下の形式で返す:

\`\`\`markdown
## Best Practice Review Results

**Reviewer:** bestpractice-reviewer
**Issues Found:** N

1. **[SEVERITY]** [file:line] - 説明
   - 問題: ...
   - 推奨: ...
\`\`\`

### 5. タスク完了
変更したファイルと結果を明記して完了する。`
})
```

**gemini-reviewer:**

```
spawn_agent({
  description: "Gemini MCP レビュー",
  prompt: `あなたは gemini-reviewer です。Gemini MCP を使って PR #<number> をレビューしてください。

## 手順

### 1. Gemini MCP の実行
\`mcp__gemini__ask-gemini\` を \`prompt: \"/code-review <PR の URL>\"\` で呼び出す。

### 2. 結果の送信
Gemini の出力を severity をそろえた上で返す:
- critical, severe, security → CRITICAL
- bug, error, high → HIGH
- warning, medium → MEDIUM
- info, suggestion, nit → LOW

### 3. タスク完了
変更したファイルと結果を明記して完了する。`
})
```

##### B-3. 結果の収集

保持しておいた agent id を使い、`wait_agent` で reviewer の完了を待機する。必要なら複数 id をまとめて待機し、タイムアウトした reviewer は結果なしとして扱う。

##### B-4. 結果の統合

全 reviewer の結果を統合・重複排除する:

1. ファイルパスと行番号で指摘をグループ化
2. 同じ問題への指摘は最も詳細な説明を採用
3. severity は最も高いものを採用
4. 検出元 (security-reviewer, logic-reviewer, bestpractice-reviewer, Gemini) を付記

**severity 統一:**

- CRITICAL: セキュリティ脆弱性、データ損失リスク (即時修正必須)
- HIGH: バグ、重大なロジックエラー (修正推奨)
- MEDIUM: パフォーマンス問題、可読性 (検討推奨)
- LOW: スタイル、軽微な改善 (任意)

##### B-5. agent の終了

結果統合後、不要になった reviewer は `close_agent` で終了する。

##### フォールバック

- spawn_agent が失敗した場合 → パターン A (単一 agent) にフォールバック
- 一部の reviewer が失敗した場合 → 残りの reviewer の結果で続行
- 全 reviewer が失敗した場合 → パターン A にフォールバック

### 5. 指摘のフィルタリング

統合結果から、有用な指摘のみ採用する:

- バグや論理エラー
- セキュリティ脆弱性
- 明らかなパフォーマンス問題
- 重要な設計上の問題

**除外する指摘:**

- スタイルのみの指摘 (linter で対応すべき)
- 好みの問題
- 曖昧な指摘

### 6. コメント案の作成

統合結果から PR コメント案を作成する:

**インラインコメント** (ファイル・行番号が明確な場合):

```markdown
### コメント 1

- **ファイル:** src/api/users.ts
- **行:** 42
- **内容:** `user.id` が null の場合の処理が欠けています。null チェックを追加することを推奨します。
```

**一般コメント** (特定の行に紐付かない場合):

```markdown
### 一般コメント

- **内容:** エラーハンドリングが全体的に不足しています。try-catch ブロックの追加を検討してください。
```

### 7. ユーザー承認の取得

**必須:** コメント案をユーザーに提示し、投稿の承認を求める:

```markdown
## PR レビュー結果

**PR:** #<number> - <title>
**レビュー AI:** メインセッション, Gemini (または security-reviewer, logic-reviewer, bestpractice-reviewer, Codex, Gemini)

### 投稿予定のコメント (N 件)

#### インラインコメント (X 件)

1. **[src/api/users.ts:42]**

   > `user.id` が null の場合の処理が欠けています。

2. ...

#### 一般コメント (Y 件)

1. エラーハンドリングが全体的に不足しています。

---

これらのコメントを PR に投稿してよろしいですか？

- 特定のコメントを除外する場合は番号を指定してください
```

### 8. コメントの投稿

承認後、GitHub API でコメントを投稿する:

**インラインコメント:**

```bash
# レビューコメントを作成
# commit_id にはステップ 1 で取得した headRefOid を使用
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  -f body="コメント内容" \
  -f commit_id="<headRefOid>" \
  -f path="src/api/users.ts" \
  -F line=42 \
  -f side="RIGHT"
```

**一般コメント:**

```bash
# PR コメントを作成
gh pr comment <number> --body "コメント内容"
```

### 9. 完了報告

```markdown
## PR レビュー完了

- **PR:** #<number> - <title>
- **レビュー方式:** 単一 agent / 複数 agent
- **レビュー AI:** メインセッション, Gemini
- **投稿コメント数:** N 件
  - インラインコメント: X 件
  - 一般コメント: Y 件

PR URL: <url>
```

## エラーハンドリング

### gh CLI が使用できない場合

`gh api` コマンドで GitHub API に直接アクセスする:

```bash
gh api repos/{owner}/{repo}/pulls/<number>
```

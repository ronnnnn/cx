---
name: review
description: ローカルの変更 (staged/unstaged) をレビューし、指摘箇所を自動修正する。指摘がなくなるまで最大 3 回繰り返す。
---

# ローカルレビューワークフロー

ローカルの変更を複数の AI でレビューし、指摘箇所を自動修正する。

## 重要な原則

1. **複数の視点で並列レビューする** - メインセッション、Gemini、必要時の追加 reviewer を併用する
2. **結果を統合・重複排除する** - 同じ指摘は 1 つにマージ
3. **修正が必要なものは承認なしで自動修正する**
4. **レビュー・修正を繰り返す** - 修正がなくなるまで
5. **最終結果のサマリを報告する**
6. **自動修正は メインセッション のみが実行する** - 複数 agent 使用時も agent はファイル編集しない

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "ローカル差分の取得", status: "pending" },
    { step: "アプローチ判定", status: "pending" },
    { step: "並列レビューの実行", status: "pending" },
    { step: "自動修正の実行", status: "pending" },
    { step: "再レビュー", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. ローカル差分の取得

staged と unstaged の両方の変更を取得する:

```bash
# staged 変更
git diff --cached

# unstaged 変更
git diff

# 全変更 (staged + unstaged)
git diff HEAD

# 変更ファイル一覧
git diff HEAD --name-only
```

変更がない場合は終了:

```markdown
レビュー対象の変更がありません。
```

### 2. アプローチ判定

差分の統計情報とユーザー要件に基づいて、レビューアプローチを選択する。

#### 2-1. 統計情報の取得

```bash
# 変更ファイル数
git diff HEAD --name-only | wc -l

# 変更行数
git diff HEAD --stat | tail -1
# "N files changed, X insertions(+), Y deletions(-)" から X + Y を算出
```

#### 2-2. 複数 agent の利用判断

- ユーザーが明示的に delegation / sub-agents / parallel agents を求めている場合のみ、**パターン B (複数 agent)** を検討する
- それ以外は **パターン A (単一 agent)** を基本とする

#### 2-3. アプローチの選択

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

### 3. 並列レビューの実行

#### パターン A: 単一 agent

**必要なら `spawn_agent` を起動する。**

**重要:**

- ユーザーが明示的に delegation / sub-agents / parallel agents を求めていない場合は、メインセッションでレビューを完結する。
- `spawn_agent` を使う場合も、自動修正はメインセッションのみが実行する。
- Gemini MCP が使える場合は、メインセッションのレビューと並列に実行してよい。

```
spawn_agent({
  description: "ローカル変更の並列レビュー",
  prompt: `あなたは code-reviewer です。ローカルの変更差分を複数 AI で並列レビューし、結果を統合してください。

## 手順

### 1. 差分の取得

\`\`\`bash
git diff HEAD
git diff HEAD --name-only
\`\`\`

### 2. 並列レビュー対象の決定

利用可能なレビュー手段を決める:
- メインセッションによるレビュー
- 利用可能なら `mcp__gemini__ask-gemini`
- 必要なら追加の `spawn_agent`

### 3. 並列レビューの実行

利用可能な AI すべてに単一メッセージ内で並列にレビューを依頼する。

**メインセッションのレビュー (常に実行):**

差分を直接分析し、以下の観点でレビューする:
- バグ: 論理エラー、off-by-one、null 参照
- セキュリティ: インジェクション、認証、機密情報
- パフォーマンス: N+1、不要なループ、メモリリーク
- 可読性: 命名、複雑度、コメント
- テスト: カバレッジ、エッジケース

**Gemini MCP レビュー (利用可能時):**
- `mcp__gemini__ask-gemini` を `prompt: "/code-review <対象ディレクトリの絶対パス>"` で呼び出す

**追加 agent レビュー (必要時):**
- セキュリティやロジックなど、観点を分ける価値がある場合だけ `spawn_agent` で reviewer を追加する

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

**MCP 出力の severity マッピング:**
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

→ ステップ 4 (自動修正) へ進む

#### パターン B: 複数 agent

各 reviewer に異なるレンズ (観点) を割り当て、独立したセッションで真に並列レビューを実行する。reviewer 間で発見を共有・検証し合うことで、単一 agent よりも深い分析が可能。

**重要:** 複数 agent 使用時も**自動修正は メインセッション のみが実行**する。agent はファイル編集しない (並行編集の競合回避)。

##### B-1. チームの作成

```
`spawn_agent`
```

##### B-2. reviewer の起動

以下の reviewer を**単一メッセージ内で並列に起動**する。起動後は返ってきた agent id を保持し、`wait_agent` で完了を待機する。

**security-reviewer:**

```
spawn_agent({
  description: "セキュリティレビュー",
  prompt: `あなたは security-reviewer です。ローカルの変更差分をセキュリティ観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
git diff HEAD
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
spawn_agent({
  description: "ロジックレビュー",
  prompt: `あなたは logic-reviewer です。ローカルの変更差分をバグ・ロジック観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
git diff HEAD
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
spawn_agent({
  description: "ベストプラクティスレビュー",
  prompt: `あなたは bestpractice-reviewer です。ローカルの変更差分を使用ツール・FW・ライブラリ・言語のベストプラクティス観点でレビューしてください。

## 手順

### 1. 差分の取得
\`\`\`bash
git diff HEAD
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
  prompt: `あなたは gemini-reviewer です。Gemini MCP を使ってローカルの変更差分をレビューしてください。

## 手順

### 1. Gemini MCP の利用可能性確認
利用可否を確認: \`select:mcp__gemini__ask-gemini\`

Gemini MCP が利用できない場合は、その旨を明記して結果なしで完了する。

### 2. Gemini MCP でレビュー
\`mcp__gemini__ask-gemini\` を \`prompt: "/code-review <対象ディレクトリの絶対パス>"\` で呼び出す。

### 3. 結果の送信
Gemini の出力を severity をそろえた上で返す:
- critical, severe, security → CRITICAL
- bug, error, high → HIGH
- warning, medium → MEDIUM
- info, suggestion, nit → LOW

### 4. タスク完了
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

統合結果に基づき、修正可能性を判断する:

**自動修正対象:**

- 具体的な修正案がある
- ファイル・行番号が明確
- 機械的に修正可能

**自動修正しない指摘:**

- 設計レベルの変更が必要
- 複数ファイルにまたがる修正
- 判断が必要な修正

### 4. 自動修正の実行

修正が必要な指摘に対して、承認なしで自動修正を行う:

1. 対象ファイルを Read ツールで読み込む
2. Edit ツールで修正を適用
3. 修正内容をログ

```markdown
### 修正ログ

1. **src/api/users.ts:42** - null チェック追加
   - Before: `return user.id;`
   - After: `return user?.id ?? null;`

2. **src/utils/format.ts:15** - 型アノテーション追加
   ...
```

### 5. 再レビュー (必要な場合)

修正後、再度レビューを実行する。**再レビューは常にパターン A (単一 agent) を使用する** (修正後の差分は小さいため 複数 reviewer は不要)。

```bash
# 修正後の差分を確認
git diff HEAD
```

**繰り返し条件:**

- 新たな指摘がある場合 → ステップ 3 (パターン A) に戻る
- 指摘がない場合 → 完了報告へ

**最大繰り返し回数:** 3 回

3 回繰り返しても指摘がある場合:

```markdown
## 自動修正の限界

以下の指摘は手動での対応が必要です:

1. **[src/core/engine.ts:100-150]**
   - 問題: アーキテクチャレベルの変更が必要
   - 推奨: ...
```

### 6. 完了報告

```markdown
## ローカルレビュー完了

**レビュー方式:** 単一 agent / 複数 agent
**レビュー AI:** メインセッション, Gemini
**レビュー回数:** N 回

### 修正サマリ

| ファイル            | 修正数 | 内容                      |
| ------------------- | ------ | ------------------------- |
| src/api/users.ts    | 2      | null チェック追加、型修正 |
| src/utils/format.ts | 1      | 型アノテーション追加      |

**合計修正数:** X 件

### 残課題 (手動対応が必要)

なし / または以下:

- [file:line] - 説明
```

## エラーハンドリング

### 修正に失敗した場合

```markdown
## 修正失敗

以下のファイルの修正に失敗しました:

- **src/api/users.ts:42**
  - 理由: 該当行が見つかりません (ファイルが変更された可能性)
  - 対応: 手動での修正が必要
```

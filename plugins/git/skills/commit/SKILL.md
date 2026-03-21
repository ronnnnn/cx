---
name: commit
description: 全変更をステージングし、Conventional Commits 形式でコミットする。commitlint 設定があれば準拠。コミット前にユーザー承認を取る。
---

# コミットワークフロー

全変更 (staged + unstaged) をステージングし、Conventional Commits 形式でコミットする。

## 重要な原則

1. **コミットメッセージの言語は対象リポジトリに従う** - 既存のコミット履歴 (`git log`) を確認し、リポジトリで使用されている言語 (日本語/英語等) に合わせる
2. **日本語でコミットメッセージを書く場合は `japanese-text-style` スキルに従う** - スペース、句読点、括弧のルールを適用する
3. **全変更を一括でコミット** - unstaged も untracked も全てステージング
4. **コミットメッセージは commitlint 設定 / Conventional Commits に準拠する**
5. **pre-commit hook がある場合は、それに従う**
6. **機密情報 (.env, credentials 等) がステージングされていないか確認**

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "変更状態の確認", status: "pending" },
    { step: "全変更のステージング", status: "pending" },
    { step: "コミットメッセージ候補の生成", status: "pending" },
    { step: "コミット前の承認確認", status: "pending" },
    { step: "コミットの実行", status: "pending" },
    { step: "プッシュの判定", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. 変更状態の確認

```bash
# 現在の変更状態を確認
git status

# 変更がない場合は終了
```

**変更がない場合:**

```
コミットする変更がありません。
```

### 2. 全変更のステージング

```bash
# 全変更をステージング (unstaged + untracked)
git add -A

# ステージング結果を確認
git status
```

### 3. コミットメッセージ候補の生成

ステージング済みの変更から、コミットメッセージ候補を最大 3 つ作成する。

以下を順に実行して判断材料を集める:

- `git diff --cached` で変更差分を分析する
- `Glob` で `commitlint.config.*` と `.commitlintrc*` を探し、見つからなければ `Read` で `package.json` の `commitlint` キーを確認する
- 複数見つかった場合は `commitlint.config.*` → `.commitlintrc*` → `package.json` の順で優先し、最も具体的な設定を採用する
- 採用した設定を `Read` で開き、`type-enum`、`scope-enum`、`scope-empty`、`subject-case`、`header-max-length`、`extends` を抽出する
- `extends` が相対パスならそのファイルもたどる。`@commitlint/config-conventional` / `@commitlint/config-angular` は既知 preset として扱う
- 設定が見つからなければ `feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert` をデフォルト候補にする
- `git log` で既存コミットの言語・スタイルを確認する
- 必要に応じて `git diff --cached --stat` で変更規模を確認する

そのうえで、Conventional Commits 形式のメッセージ候補を最大 3 つ生成する。

### 4. コミット前の承認確認

**必須:** 生成した提案をユーザーに提示し、承認を求める。

**提示フォーマット:**

```
## コミットメッセージの確認

以下の変更をコミットします:

**変更ファイル:**
- path/to/file1.ts (+10, -5)
- path/to/file2.ts (+3, -1)

---

**コミットメッセージ候補** (推奨度順):

### 1. (推奨)
```

<type>(<scope>): <subject>

<body>
```

### 2.

```
<type>(<scope>): <subject>

<body>
```

### 3.

```
<type>(<scope>): <subject>

<body>
```

---

どのメッセージでコミットしますか？ (1/2/3、または修正案を入力)

````

**候補生成の考え方:**
- **候補 1 (推奨):** 変更内容を最も的確に表現するメッセージ
- **候補 2:** 別の観点 (異なる type や scope) からのメッセージ
- **候補 3:** より簡潔、または より詳細なメッセージ

ユーザーが修正案を入力した場合は、その内容でコミットを実行する。

### 5. コミットの実行

承認されたメッセージでコミットを実行:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>
EOF
)"
````

**例:**

```bash
git commit -m "$(cat <<'EOF'
feat(auth): ログイン機能を追加

- メール/パスワード認証を実装
- セッション管理を追加
EOF
)"
```

### 6. プッシュの判定

コミット完了後、現在のブランチに紐づく PR の有無でプッシュを自動判定する。

```bash
# 現在のブランチに紐づく PR を確認
gh pr view --json number 2>/dev/null
```

**PR がある場合:** 確認なしで自動プッシュする。

```bash
# upstream が既に設定されているか確認
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no-upstream"

# upstream が既に設定されている場合
git push

# upstream が設定されていない場合は -u を付与して設定
git push -u origin HEAD
```

**PR がない場合:** プッシュをスキップし、次のステップへ進む。

### 7. 完了報告

```bash
# コミット結果を確認
git log -1 --oneline
```

**報告フォーマット:**

```
## コミット完了

- **コミット:** <hash>
- **メッセージ:** <type>(<scope>): <subject>
- **変更ファイル数:** N
- **追加行数:** +X
- **削除行数:** -Y
- **プッシュ:** 済 / スキップ
```

## エラーハンドリング

### 変更がない場合

```
コミットする変更がありません。
```

### pre-commit hook が失敗した場合

1. hook のエラーメッセージを確認
2. 問題を修正
3. 再度 `git add -A` でステージング
4. コミットを再実行

### コンフリクトがある場合

```bash
# コンフリクトを解決後
git add -A
git commit
```

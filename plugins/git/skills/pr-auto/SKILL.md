---
name: pr-auto
description: |
  このスキルは、「PR を一気通貫で作成して監視して」「PR を作って即監視」「PR を自動でシップ」「pr-create と pr-watch を続けて実行」「ready for review の PR を作成して監視」などのリクエストで使用する。現在のブランチから ready for review の Pull Request を作成し、open 後は git:pr-watch の監視・自動修正ワークフローへ移行する。コミット、PR タイトル、description、ラベルはユーザー確認なしで自動生成・実行する。
---

# PR 自動化ワークフロー

現在のブランチから ready for review の Pull Request を作成し、open 後は `git:pr-watch` の監視・自動修正ワークフローへ移行する。`pr-create` と `pr-watch` を 1 コマンドで連結し、コミット、PR 本文生成、PR 公開、監視をユーザー確認なしで自律実行する。

## 重要な原則

1. **全工程ユーザー確認なし** - コミット、PR タイトル、description、ラベル選択、push、PR 作成を自動実行する
2. **PR は ready for review として作成する** - `pr-create` の Draft 作成と異なり、`--draft` は付けない。既存 Draft PR がある場合は `gh pr ready` で ready 化する
3. **PR タイトル・description の言語は対象リポジトリに従う** - 既存 PR やコミット履歴を確認し、リポジトリで使用されている言語に合わせる
4. **日本語で記述する場合は `git:japanese-text-style` スキルに従う** - スペース、句読点、丸括弧のルールを適用する
5. **PR タイトルとコミットメッセージは Conventional Commits に準拠する** - commitlint 設定があればそれを優先する
6. **PR テンプレートがある場合は必ず準拠する**
7. **ラベルはリポジトリに存在するもののみ使用する**
8. **機密候補ファイルを検知したら中止する** - `.env`、`*.pem`、`credentials*`、`*secret*` などはコミットしない
9. **open 後は `git:pr-watch` に監視を委譲する** - 監視ロジックを本スキル内に重複定義せず、既存の `pr-watch` 手順へ移行する

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "事前確認", status: "pending" },
    { step: "未コミット変更の自動コミット", status: "pending" },
    { step: "リモートへのプッシュ", status: "pending" },
    { step: "PR テンプレートの確認", status: "pending" },
    { step: "PR タイトル・description の生成", status: "pending" },
    { step: "ラベルの選択", status: "pending" },
    { step: "ready for review PR の作成", status: "pending" },
    { step: "git:pr-watch への引き継ぎ", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. 事前確認

以下を確認する:

```bash
git status
git branch --show-current
git remote show origin | grep 'HEAD branch'
git log origin/<base>..HEAD --oneline
```

`--base <branch>` 相当の引数が指定されている場合はその branch を使う。指定がなければ `origin` の HEAD branch を base とする。

**確認事項:**

- 現在のブランチ名
- 未コミット変更の有無
- 未プッシュコミットの有無
- base branch との差分の有無
- 既存 PR の有無 (`gh pr view --json number,state,isDraft,url`)

base branch との差分がなく、未コミット変更もない場合は PR 作成不可として終了する。

### 2. 未コミット変更の自動コミット

`git status --short` の結果から unstaged、untracked、staged の変更がある場合のみ実行する。変更がない場合はスキップする。

#### 2-1. 機密候補ファイルの確認

`git status --short` で変更対象を確認し、以下に該当する path が含まれる場合はコミットせず中止する:

- `.env`
- `.env.*`
- `*.pem`
- `*.key`
- `credentials*`
- `*secret*`
- `*token*`

中止時は該当 path を示し、コミット対象から除外して再実行するよう報告する。

#### 2-2. 全変更のステージング

```bash
git add -A
git status --short
```

#### 2-3. コミットメッセージの生成

以下を順に確認して、Conventional Commits 形式のコミットメッセージを 1 つ生成する:

- `git diff --cached --stat`
- `git diff --cached`
- `git log --oneline -5`
- `commitlint.config.*`、`.commitlintrc*`、`package.json` の `commitlint` 設定

commitlint 設定は `commitlint.config.*` → `.commitlintrc*` → `package.json` の順で優先する。設定が見つからない場合は `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`chore`、`build`、`ci`、`revert` を type 候補とする。

subject には実際の変更内容を具体的に記述し、「変更を反映」「レビュー対応」のような汎用表現は避ける。ユーザー承認は取らない。

#### 2-4. コミット実行

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>
EOF
)"
```

pre-commit hook が失敗した場合は、`--no-verify` でバイパスしない。失敗内容を確認し、修正可能なら修正して再度 `git add -A` と `git commit` を実行する。修正不可能な場合は中止する。

### 3. リモートへのプッシュ

未プッシュコミットがある場合、または現在のブランチが未追跡の場合に push する:

```bash
git push -u origin "$(git branch --show-current)"
```

upstream が設定済みの場合は `git push` を使う。

push 失敗時は以下を試行する:

```bash
git pull --rebase
git push
```

rebase が失敗した場合は `git rebase --abort` で元に戻し、コンフリクトとして報告して終了する。

### 4. PR テンプレートの確認

```bash
ls -la .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || \
ls -la .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null || \
ls -la docs/PULL_REQUEST_TEMPLATE.md 2>/dev/null
```

テンプレートが存在する場合は内容を読み、そのフォーマットに準拠した description を生成する。

### 5. PR タイトル・description の生成

ステップ 2 で新規コミットが追加された可能性があるため、必ず再取得する:

```bash
git log origin/<base>..HEAD --oneline
```

**コミットが 1 つの場合:** `git log origin/<base>..HEAD -1 --format='%s'` の subject を PR タイトルに使う。

**コミットが 2 つ以上の場合:** コミット履歴、diff stat、commitlint 設定から PR 全体を代表する Conventional Commits 形式のタイトルを自前で生成する。

**description の生成ルール:**

- PR テンプレートがある場合は準拠する
- テンプレートがない場合は概要、変更内容、動作確認を含む簡潔な構成にする
- コミットメッセージのコピーではなく、変更内容を整理して要約する
- 関連 Issue やユーザーが既に書いた情報がある場合は保持する
- ユーザー確認は取らずに採用する

### 6. ラベルの選択

```bash
gh label list --json name,description
```

変更内容に基づいて、存在するラベルのみを選択する。

| 変更タイプ       | 推奨ラベル               |
| ---------------- | ------------------------ |
| 新機能追加       | `enhancement`, `feature` |
| バグ修正         | `bug`, `fix`             |
| ドキュメント     | `documentation`, `docs`  |
| リファクタリング | `refactor`, `tech-debt`  |
| テスト追加       | `test`, `testing`        |
| 依存関係更新     | `dependencies`           |
| 破壊的変更       | `breaking-change`        |

一致するラベルがない場合はラベルなしで作成する。

### 7. ready for review PR の作成

#### 新規 PR を作成する場合

現在のブランチに紐づく PR が存在しない場合は、Draft を付けずに PR を作成する:

```bash
gh pr create \
  --title "<タイトル>" \
  --body "<説明>" \
  --base <ベースブランチ> \
  --assignee @me
```

ラベルを付ける場合のみ `--label "<ラベル1>,<ラベル2>"` を追加する。

#### 既存 PR がある場合

`gh pr view --json number,state,isDraft,url` で状態を確認する。既存 PR が Draft の場合は ready 化する:

```bash
gh pr ready <pr-number>
```

タイトル、description、ラベルが実態とずれている場合は `gh pr edit` で更新する。

#### PR 番号の取得

```bash
gh pr view --json number,url --jq '{number, url}'
```

取得した PR 番号を `PR_NUMBER` として保持する。

### 8. `git:pr-watch` への引き継ぎ

引き継ぎ前に一行で報告する:

```
PR #<number> を ready for review で作成しました: <url>
続けて git:pr-watch で監視を開始します。
```

その後、同じターンで `plugins/git/skills/pr-watch/SKILL.md` を読み、`PR_NUMBER` を引数として渡されたものとして `git:pr-watch` の手順を実行する。監視ロジック、レビュー対応、CI 修正、PR 更新、完了報告は `git:pr-watch` 側の指示を正とする。

`git:pr-watch` の実行に移れない場合は、以下を報告して部分成功扱いで終了する:

```
PR #<number> を ready for review で作成しましたが、git:pr-watch の起動に失敗しました。
監視が必要な場合は以下を手動で実行してください:

  /git:pr-watch <number>

PR URL: <url>
```

## エラーハンドリング

### gh CLI が使用できない場合

利用可能な GitHub MCP / connector があれば以下にフォールバックする:

- PR 作成 (`draft: false`)
- ラベル取得
- Draft → Ready 化

フォールバック手段もない場合は、`gh auth status` の結果と必要な対応を報告して終了する。

### 認証エラー

```bash
gh auth status
gh auth login
```

### ブランチが存在しない / 未プッシュ

```bash
git push -u origin "$(git branch --show-current)"
```

### コミットメッセージ生成に迷う場合

`git diff --cached --stat`、`git diff --cached`、`git log --oneline -5` を根拠に、最も具体的な変更内容を subject にする。commitlint 設定がある場合は必ず準拠する。

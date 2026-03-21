---
name: pr-ci
description: |
  このスキルは、「CI がこけている」「CI 失敗を修正」「CI を直して」「fix ci」「CI が赤い」「CI の原因を調べて」「CI を通して」「PR のチェックが失敗」などのリクエスト、または PR の CI/CD パイプライン失敗を調査・修正する際に使用する。失敗した job とログを直接分析し、コード修正とコミットまで行う。
---

# PR CI 失敗の調査・修正ワークフロー

PR の CI が失敗した際に、原因を調査し修正を行う。

## 重要な原則

1. **失敗した job とログを直接調査する** - `gh` で failed check とログを取得し、根本原因を分析する
2. **修正前に分析結果をユーザーに提示する** - 修正方針の承認を得る
3. **コミット前に必ずユーザーの承認を取る** - 自動でコミットしない
4. **コミットメッセージは自前で生成する** - Conventional Commits / commitlint 設定に準拠して作成する
5. **コミットメッセージ・返信コメントの言語は対象リポジトリに従う** - 既存の PR やコミット履歴を確認し、リポジトリで使用されている言語に合わせる
6. **日本語でコミットメッセージを書く場合は `japanese-text-style` スキルに従う**
7. **修正は CI を通すために必要な最小限に留める**

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "PR の特定", status: "pending" },
    { step: "CI 失敗の調査", status: "pending" },
    { step: "分析結果の提示と修正方針の承認", status: "pending" },
    { step: "コード修正の実行", status: "pending" },
    { step: "修正の検証", status: "pending" },
    { step: "変更のステージング", status: "pending" },
    { step: "コミットメッセージの生成", status: "pending" },
    { step: "コミット前の承認確認", status: "pending" },
    { step: "コミットの実行", status: "pending" },
    { step: "プッシュの実行", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. PR の特定

引数で PR 番号が指定されていない場合、現在のブランチから PR を特定する:

```bash
gh pr view --json number,title,headRefName --jq '{number, title, headRefName}'
```

### 2. CI 失敗の調査

失敗した check と job のログを直接取得し、原因を分析する。

```bash
gh pr checks <number>
gh run view <run-id> --log-failed
```

以下を整理して次のステップで使用する:

- 失敗した job 名
- 失敗ステップ
- 代表的なエラーメッセージ
- 根本原因の仮説
- 修正方針

### 3. 分析結果の提示と修正方針の承認

分析結果をユーザーに提示する:

```
## CI 失敗分析結果

[失敗した job、根本原因、修正方針の要約]

### 修正計画

1. [修正内容 1] - [対象ファイル]
2. [修正内容 2] - [対象ファイル]
...

### 自動修正不可能な項目 (該当する場合)

- [手動対応が必要な内容とその理由]

---

この計画で修正を進めますか？
```

**自動修正の可否判断:**

| エラー種別             | 自動修正 | 対応                             |
| ---------------------- | -------- | -------------------------------- |
| Lint/フォーマット      | 可能     | プロジェクトのフォーマッタを実行 |
| 型エラー・ビルドエラー | 可能     | コードを修正                     |
| テスト失敗             | 要確認   | テストコードまたは実装を修正     |
| 依存関係               | 可能     | パッケージ更新・追加             |
| 環境変数・secret       | 不可能   | ユーザーに設定方法を案内         |
| 権限・認証             | 不可能   | ユーザーに対応方法を案内         |

### 4. コード修正の実行

承認後、修正を実行する:

1. 対象ファイルを Read ツールで読み込む
2. Edit ツールで修正を適用
3. フォーマッタやリンタがある場合は実行する:
   ```bash
   # プロジェクトの設定に応じて適切なコマンドを使用
   # 例: bun fmt, npm run lint --fix, etc.
   ```

### 5. 修正の検証

ローカルで検証可能な場合、CI と同等のチェックを実行する:

```bash
# プロジェクトの設定に応じて適切なコマンドを使用
# package.json の scripts や Makefile を確認
# 例: bun fmt, bun run lint, bun run build, bun run test
```

検証が失敗した場合は、エラー内容を確認して追加修正を行う。

### 6. 変更のステージング

修正したファイルをステージングする:

```bash
git add <修正したファイルのパス>
```

### 7. コミットメッセージの生成

ステージング済みの変更に対して、コミットメッセージ候補を自前で生成する。

以下を順に確認する:

- `git diff --cached` で変更差分を分析する
- `Glob` で `commitlint.config.*` と `.commitlintrc*` を探し、見つからなければ `Read` で `package.json` の `commitlint` キーを確認する
- 複数見つかった場合は `commitlint.config.*` → `.commitlintrc*` → `package.json` の順で優先し、最も具体的な設定を採用する
- 採用した設定を `Read` で開き、`type-enum`、`scope-enum`、`scope-empty`、`subject-case`、`header-max-length`、`extends` を抽出する
- `extends` が相対パスならそのファイルもたどる。`@commitlint/config-conventional` / `@commitlint/config-angular` は既知 preset として扱う
- 設定が見つからなければ `feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert` をデフォルト候補にする
- `git log -5 --oneline` で既存コミットの言語とスタイルを確認する

そのうえで、CI 修正内容を具体的に表すメッセージ候補を作成する。

### 8. コミット前の承認確認

**必須:** 修正内容とコミットメッセージをユーザーに提示し、承認を求める:

```
## コミット内容の確認

以下の変更をコミットします:

**変更ファイル:**
- path/to/file1.ts (+5, -3)
- path/to/file2.ts (+2, -1)

**コミットメッセージ:**

fix(<scope>): CI 失敗を修正

- [修正内容 1]
- [修正内容 2]

---

この内容でコミットしてよろしいですか？
```

**type の選択基準:**

- Lint/フォーマット修正 → `style`
- ビルド・設定修正 → `fix` または `build`
- テスト修正 → `fix` または `test`
- 依存関係修正 → `deps` または `fix`

### 9. コミットの実行

承認後、コミットする:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body>
EOF
)"
```

### 10. プッシュの実行

コミット完了後、リモートにプッシュする:

```bash
git push
```

### 11. 完了報告

```
## CI 修正完了

- 修正コミット: <commit_hash>
- 修正ファイル数: N
- 修正内容: [要約]

PR URL: <url>

CI の再実行結果を確認してください。
```

## エラーハンドリング

### gh CLI が使用できない場合

`gh api` コマンドで GitHub API に直接アクセスする:

```bash
HEAD_SHA=$(gh api repos/{owner}/{repo}/pulls/<number> --jq '.head.sha')
gh api repos/{owner}/{repo}/actions/runs?head_sha=$HEAD_SHA&status=failure&per_page=100
```

### PR が見つからない場合

現在のブランチに PR がない可能性がある。ユーザーに確認する:

```
現在のブランチ (<branch>) に紐づく PR が見つかりません。
PR 番号を指定してください。
```

### CI が実行中の場合

```
CI がまだ実行中です。完了後に再度実行してください。

実行中の job:
- <job 名> (ステータス: IN_PROGRESS)
```

### 全ての CI が成功している場合

```
全ての CI チェックが成功しています。修正は不要です。

チェック結果:
- <check 名>: SUCCESS
- ...
```

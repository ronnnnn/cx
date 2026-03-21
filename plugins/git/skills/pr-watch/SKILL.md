---
name: pr-watch
description: |
  このスキルは、「PR を監視して」「PR をウォッチして」「PR を見張って」「watch PR」「monitor PR」「PR の監視を開始」「レビューと CI を自動修正して」「PR を自動で直して」「PR を自動修正して」などとリクエストした時に使用する。PR のレビューコメントと CI 失敗を 2 分間隔で定期監視し、自動で修正・コミット・プッシュ・返信を行う。pr-fix と pr-ci の機能を統合し、ユーザー確認なしに自律実行する。最大 30 分間監視する (活動検出時は最大 120 分)。
---

# PR 監視・自動修正ワークフロー

PR のレビューコメントと CI 失敗を定期監視し、検出次第自動で修正・コミット・プッシュ・返信を実行する。

## 重要な原則

1. **ユーザー確認は一切行わない** - 全ステップを自律的に実行する。修正ファイル数や変更規模に関わらず確認をスキップする
2. **レビュー修正を CI 修正より優先する** - 同時に検出した場合はレビューを先に処理する。レビュー修正のプッシュ後、CI 結果が更新されるのを待ってから CI 修正に取りかかる
3. **修正は最小限に留める** - レビュー指摘・CI エラーの修正に必要な変更のみ
4. **コミットメッセージは自前で生成する** - Conventional Commits / commitlint 設定に準拠
5. **コミットメッセージ・返信コメントの言語は対象リポジトリに従う** - 既存の PR やコミット履歴を確認し、使用されている言語に合わせる
6. **日本語でコミットメッセージ・返信コメントを書く場合は `japanese-text-style` スキルに従う**
7. **対応不要と判断したレビューコメントは理由を返信して resolve する**
8. **コンフリクトを検出したらユーザーに通知して監視を終了する**
9. **修正で PR の実態が変わった場合のみ、タイトル・description を自動更新する** - 軽微な修正 (typo、lint、フォーマット) では更新しない。テンプレートや既存フォーマットを維持する

## 監視ルール

| パラメータ   | 値                                                         |
| ------------ | ---------------------------------------------------------- |
| 監視間隔     | 2 分                                                       |
| アイドル上限 | 30 分 (レビュー/CI 失敗が一度も検出されなかった場合に終了) |
| 絶対上限     | 120 分 (`HAD_ACTIVITY` に関わらず強制終了)                 |
| 即時終了条件 | コンフリクト検出、PR クローズ/マージ済み                   |
| 修正発生時   | `START_TIME` をリセットせず引き続き監視を継続              |

## 状態管理

監視ループ全体で以下の状態を管理する:

- `PR_NUMBER`: PR 番号
- `OWNER`, `REPO`: リポジトリ情報
- `MY_LOGIN`: 自分の GitHub ユーザー名 (`gh api user --jq '.login'` で取得、自分のコメントを除外するため)
- `START_TIME`: 監視開始時刻 (UNIX タイムスタンプ)
- `HAD_ACTIVITY`: false (レビュー/CI 失敗を一度でも検出したら true にし、以降リセットしない)
- `UNFIXABLE_RUNS`: 修正不可能と判断した CI run ID のリスト (以降のサイクルで同じ失敗の再処理をスキップする)
- `CYCLE_COUNT`: 実行サイクル数
- `REVIEW_COMMITS`: レビュー修正コミット数
- `CI_COMMITS`: CI 修正コミット数
- `REPLIED_COMMENTS`: 返信済みコメント数
- `RESOLVED_THREADS`: resolve 済みスレッド数
- `PR_UPDATES`: PR タイトル・description の更新回数

## 作業開始前の準備

**必須:** 作業開始前に update_plan で残存タスクを確認し、存在する場合は全て `update_plan` で削除する。その後、`update_plan`で以下のタスクを登録する:

```
`update_plan`
`update_plan`
`update_plan`
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. PR の特定

引数で PR 番号が指定されていない場合、現在のブランチから PR を特定する:

```bash
gh pr view --json number,title,headRefName,state --jq '{number, title, headRefName, state}'
```

- PR が `MERGED` または `CLOSED` の場合は監視を開始せず終了する
- PR が見つからない場合は「現在のブランチに紐づく PR が見つかりません。PR 番号を指定して再実行してください。」と報告して終了する

状態変数を初期化する。初期化時に `MY_LOGIN=$(gh api user --jq '.login')` で自分の GitHub ユーザー名を取得し、監視ループ全体で保持する。

### 2. 監視ループ

以下のサイクルを繰り返す。各サイクルの先頭で経過時間を確認する:

- 120 分を超過 → 無条件で監視を終了する
- 30 分を超過 かつ `HAD_ACTIVITY` が false → 監視を終了する

#### 2a. PR 状態チェック

```bash
gh pr view <number> --json state,mergeable --jq '{state, mergeable}'
```

- `state` が `MERGED` / `CLOSED` → 監視終了
- `mergeable` が `CONFLICTING` → ユーザーに通知して監視終了

#### 2b. 未解決レビューコメントの取得

```bash
# <owner>, <repo>, <number> は実際の値に置き換える
gh api graphql -F query='
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <number>) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 10) {
            nodes {
              databaseId
              body
              path
              line
              author { login }
            }
          }
        }
      }
    }
  }
}'
```

**フィルタ条件:**

取得した `reviewThreads.nodes` に対して以下の条件でフィルタする:

1. `isResolved == false` のスレッドのみを対象とする
2. スレッドの最初のコメント (`comments.nodes[0].author.login`) が `MY_LOGIN` (ステップ 1 で取得済み) と一致するスレッドは除外する (自分によるコメントには返信・resolve しない)

除外後に未解決コメントがあれば `HAD_ACTIVITY = true` にする。

#### 2c. CI 失敗の確認

```bash
HEAD_SHA=$(gh pr view <number> --json headRefOid --jq '.headRefOid')
gh run list --commit "$HEAD_SHA" --json databaseId,status,conclusion,name --limit 50
```

- `conclusion` が `failure` の run があれば `HAD_ACTIVITY = true` にする
- `status` が `in_progress` の run がある場合、このサイクルでは CI 修正をスキップする (CI 結果が確定するのを待つ)
- run 結果が空 (プッシュ直後で CI 未開始) の場合も CI 修正をスキップする
- `UNFIXABLE_RUNS` に含まれる run ID はスキップする

#### 2d. レビュー修正の実行 (未解決コメントがある場合)

**妥当性判断の基準:**

| 指摘の種類                       | 判断       | 対応                                       |
| -------------------------------- | ---------- | ------------------------------------------ |
| コードの正確性に関する指摘       | 修正が必要 | コードを修正                               |
| セキュリティに関する指摘         | 修正が必要 | コードを修正                               |
| パフォーマンスに関する指摘       | 修正が必要 | コードを修正                               |
| スタイルや好みの問題 (`nits:`)   | 内容次第   | コードを修正または、理由を返信して resolve |
| 誤解に基づく指摘                 | 対応不要   | 説明を返信して resolve                     |
| 既に別のコミットで対応済みの指摘 | 対応不要   | 対応済みの旨を返信して resolve             |

**ファクトチェック (必須):**

レビューの指摘を鵜呑みにせず、技術的な主張や根拠が正しいか検証する。特に以下のケースでは必ずファクトチェックを行う:

- 言語仕様・ランタイムの挙動に関する指摘
- フレームワーク・ライブラリの API や推奨パターンに関する指摘
- セキュリティに関する指摘
- パフォーマンスに関する指摘
- 「〜すべき」「〜は非推奨」など規範的な主張

**ファクトチェックのソース優先順位:**

| 優先度 | ソース               | 用途                                     |
| ------ | -------------------- | ---------------------------------------- |
| 1      | LSP                  | コードベース内の定義・参照・型情報の確認 |
| 2      | deepwiki MCP         | OSS リポジトリの Wiki・ドキュメント      |
| 3      | Gemini MCP           | Google 検索による最新情報の取得          |
| 4      | context7 MCP         | ライブラリの公式ドキュメントとコード例   |
| 5      | 必要時のみ WebFetch  | 公式サイト・GitHub・特定 URL の確認      |
| 6      | 必要時のみ WebSearch | 最新情報・ブログ・リリースノートの検索   |

**例外 (上記の優先順位より優先):**

- terraform に関する内容は terraform MCP (`mcp__terraform__*`) が最優先
- Google Cloud に関する内容は google-developer-knowledge MCP (`mcp__google-developer-knowledge__*`) が最優先
- Codex に関する内容は 関連する Codex skill が最優先

ファクトチェックの結果、指摘が誤りだった場合はその根拠をソース付きで返信コメントに記載する。

**処理フロー:**

1. 各未解決コメントの妥当性を上記基準で判断し、ファクトチェックで検証する
2. 修正が必要なコメントに対してコードを修正する
3. 修正したファイルをステージングする: `git add <修正ファイル>`
4. コミットメッセージを自前で生成する:
   - `git diff --cached` で変更差分を確認する
   - `Glob` で `commitlint.config.*` と `.commitlintrc*` を探し、見つからなければ `Read` で `package.json` の `commitlint` キーを確認する
   - 複数見つかった場合は `commitlint.config.*` → `.commitlintrc*` → `package.json` の順で優先し、最も具体的な設定を採用する
   - 採用した設定を `Read` で開き、`type-enum`、`scope-enum`、`scope-empty`、`subject-case`、`header-max-length`、`extends` を抽出する
   - `extends` が相対パスならそのファイルもたどる。`@commitlint/config-conventional` / `@commitlint/config-angular` は既知 preset として扱う
   - 設定が見つからなければ `feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert` をデフォルト候補にする
   - `git log -5 --oneline` で既存コミットの言語とスタイルを確認する
   - subject には実際の変更内容を具体的に記述し、「レビュー指摘に基づく修正」のような汎用表現は使わない

5. 推奨メッセージでコミットする

   ```bash
   # <type>, <scope>, <subject>, <body> は上で生成した内容に置き換える
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <subject>

   <body>
   EOF
   )"
   ```

6. `git push` でリモートに反映する
7. 各コメントに返信・リアクション・resolve を実行する:

   ```bash
   # 元のコメントに +1 リアクション (databaseId 使用)
   gh api repos/{owner}/{repo}/pulls/comments/<databaseId>/reactions -f content="+1"

   # スレッドに返信 (GraphQL mutation、thread id 使用)
   # <thread_id>, <body> は実際の値に置き換える
   gh api graphql -F query='
   mutation {
     addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "<thread_id>", body: "<body>"}) {
       comment { id body }
     }
   }'

   # スレッドを resolve
   # <thread_id> は実際の値に置き換える
   gh api graphql -F query='
   mutation {
     resolveReviewThread(input: {threadId: "<thread_id>"}) {
       thread { isResolved }
     }
   }'
   ```

**処理順序:** リアクション追加 → 返信投稿 → resolve。エラーが発生しても続行し、失敗を記録する。

**返信テンプレート:**

| 対応タイプ | 返信例                                        |
| ---------- | --------------------------------------------- |
| 修正完了   | `修正しました。ご指摘ありがとうございます。`  |
| 対応しない | `[理由] のため、現状のままとさせてください。` |
| 対応済み   | `[コミット hash] で対応済みです。`            |

**ソース参照ルール:**

理由を添えて返信する場合 (対応しない、内容次第で対応不要と判断した場合など)、信頼できるソースの情報を参照できるときはコメントにも記載する。

- 公式ドキュメント (言語仕様、フレームワーク公式ドキュメント等) の URL
- プロジェクト内の既存コード・設定ファイルのパスと行番号
- lint ルールやコーディング規約の該当セクション
- RFC やセキュリティアドバイザリ等の公的な技術文書

**例:**

```
Go の仕様上、nil map への読み取りはゼロ値を返すためパニックしません。
ref: https://go.dev/ref/spec#Index_expressions

現状のままとさせてください。
```

カウンタを更新: `REVIEW_COMMITS`, `REPLIED_COMMENTS`, `RESOLVED_THREADS`。

#### 2e. CI 修正の実行 (失敗がある場合)

**処理フロー:**

1. 失敗した check と job のログを直接調査する:

   ```bash
   gh pr checks <number>
   gh run view <run-id> --log-failed
   ```

   失敗した job 名、失敗ステップ、代表的なエラーメッセージ、再現コマンドを整理してから修正に進む。

2. 自動修正可能なエラーのみ修正する

   | エラー種別             | 自動修正 |
   | ---------------------- | -------- |
   | Lint/フォーマット      | 可能     |
   | 型エラー・ビルドエラー | 可能     |
   | テスト失敗             | 可能     |
   | 依存関係               | 可能     |
   | 環境変数・secret       | **不可** |
   | 権限・認証             | **不可** |

3. 修正不可能なエラーの run ID を `UNFIXABLE_RUNS` に追加し、以降のサイクルで再処理をスキップする。完了報告で通知する
4. 修正したファイルをステージング: `git add <修正ファイル>`
5. コミットメッセージを生成する
6. 推奨メッセージでコミットする
7. `git push` でリモートに反映する

カウンタを更新: `CI_COMMITS`。

#### 2f. PR タイトル・description の更新判断 (修正コミットがあった場合)

このサイクルでレビュー修正または CI 修正のコミットをプッシュした場合のみ実行する。コミットがなかった場合はスキップする。

**判断手順:**

1. PR の全 diff と現在のタイトル・description を取得する:

   ```bash
   gh pr view <number> --json title,body,commits,files,additions,deletions
   gh pr diff <number> --stat
   ```

2. 以下の基準で更新の要否を判断する:

   | 条件                                                       | 判断 |
   | ---------------------------------------------------------- | ---- |
   | 修正で PR の type/scope が変わった (例: `feat` → `fix`)    | 更新 |
   | description に記載の変更内容が実態と矛盾している           | 更新 |
   | 修正で新しい機能追加や破壊的変更が加わった                 | 更新 |
   | 軽微な修正のみ (typo、lint、フォーマット、変数名変更)      | 不要 |
   | description が元々空、または情報量が少なく更新の意味がない | 不要 |
   | 既に同じサイクルの修正内容を反映済み                       | 不要 |

3. 更新不要と判断した場合はスキップする

**更新処理:**

1. PR テンプレートを確認する:

   ```bash
   ls -la .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || \
   ls -la .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null
   ```

   - テンプレートが存在する → テンプレートに準拠
   - テンプレートがない → 既存の description のフォーマットに準拠

2. コミット履歴に基づいてタイトルと description を作成する:

   ```bash
   git log origin/<base>..HEAD --pretty=format:"%h %s%n%b" --reverse
   ```

   - タイトルは Conventional Commits 形式。commitlint 設定があれば準拠する
   - description はコミットメッセージのコピーではなく、変更内容を要約・整理する
   - ユーザーが手動で追加した情報 (関連 Issue、スクリーンショット等) は保持する

3. 更新を実行する:

   ```bash
   gh pr edit <number> \
     --title "新しいタイトル" \
     --body "$(cat <<'EOF'
   [新しい description の内容]
   EOF
   )"
   ```

カウンタを更新: `PR_UPDATES`。

#### 2g. 次のサイクルへ

レビュー修正・CI 修正のいずれも不要だった場合、2 分間スリープする:

```bash
# Bash ツールの timeout パラメータ (ミリ秒) は安全マージンとして 180000 (180 秒) に設定し、実際のスリープは 120 秒とする
sleep 120
```

修正を行った場合はスリープせず即座に次のサイクルへ進む (プッシュ直後の CI 結果を早く確認するため)。ただし、CI が `in_progress` の場合はステップ 2c のスキップ条件により、新しい CI 結果が確定するまで待機する。

`CYCLE_COUNT` をインクリメントする。

### 3. 監視終了・完了報告

```
## PR 監視完了

- PR: #<number> (<title>)
- 監視時間: <elapsed> 分
- 監視サイクル数: N

### レビュー修正
- 修正コミット数: X
- 返信済みコメント数: Y
- resolve 済みスレッド数: Z

### CI 修正
- 修正コミット数: A
- 修正不可能だったエラー: (該当する場合のみ記載)

### PR タイトル・description 更新
- 更新回数: B (0 の場合はこのセクションを省略)

### 終了理由
<アイドルタイムアウト (30 分) / 絶対上限到達 (120 分) / PR マージ済み / PR クローズ済み / コンフリクト検出>

PR URL: <url>
```

**初回チェックでレビュー/CI 失敗がなく、全 CI が成功している場合:**

```
## PR 状態確認完了

全ての CI チェックが成功しており、未解決のレビューコメントもありません。
監視を開始しましたが、現時点で対応が必要な項目はありません。
30 分間の監視を継続します。新しいレビューや CI 失敗が発生次第、自動修正します。
```

## エラーハンドリング

### コンフリクト検出時

```
## コンフリクト検出 - 監視を終了します

PR #<number> でコンフリクトが検出されました。
手動でコンフリクトを解消してから、再度 `/pr-watch` を実行してください。
```

### gh CLI エラー時

`gh api` コマンドで GitHub API に直接アクセスする。それでも失敗する場合はエラーをログに記録して次のサイクルに進む。3 サイクル連続で GitHub API エラーが発生した場合は、ネットワーク障害と判断して監視を終了する。

### プッシュ失敗時

```bash
git pull --rebase origin <branch>
git push
```

rebase が失敗した場合はコンフリクトとして扱い、監視を終了する。

### 生成・分析が難しい場合

- **コミットメッセージ生成に迷う場合:** `git diff --cached --stat` と `git log --oneline -5` を参考にし、subject には実際の変更内容を具体的に記述する
- **CI の失敗原因が分かりにくい場合:** `gh run view <run-id> --log-failed` を再取得し、失敗した job 名、失敗ステップ、代表的なエラーメッセージを分解して分析する

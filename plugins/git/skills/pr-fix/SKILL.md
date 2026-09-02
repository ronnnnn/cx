---
name: pr-fix
description: PR のレビューコメントに基づいて修正を行う。未解決のインラインコメントに加え、inline コメントを伴わないレビュー本文 (review body) も対象とし (自分のコメント・レビューは除外)、妥当性を判断して修正。コミット・返信前に必ずユーザー承認を取る。
---

# PR レビュー修正ワークフロー

PR のレビューコメントを確認し、必要な修正を行う。

## 重要な原則

1. **未解決 (unresolved) のインラインコメントと、未対応のレビュー本文 (inline コメントを伴わない review body) を対象とする (自分のコメント・レビューは除外)** - レビュー本文は自分が 👍 リアクションを付けたものを対応済みとみなす
2. **レビューの妥当性を判断し、修正が必要なもののみ修正する**
3. **コミット前に必ずユーザーの承認を取る** - 自動でコミットしない
4. **返信コメント前に必ずユーザーの承認を取る** - 自動で返信を投稿しない
5. **コミットメッセージは自前で Conventional Commits / commitlint 設定に準拠して生成する**
6. **コミットメッセージ・返信コメントの言語は対象リポジトリに従う** - 既存の PR やコミット履歴を確認し、リポジトリで使用されている言語 (日本語/英語等) に合わせる
7. **日本語でコミットメッセージ・返信コメントを書く場合は `japanese-text-style` スキルに従う** - スペース、句読点、括弧のルールを適用する
8. **修正は最小限に留める** - レビュー指摘以外の変更は含めない
9. **返信は丁寧かつ簡潔に**

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "PR の特定", status: "pending" },
    { step: "未対応のレビューを取得", status: "pending" },
    { step: "レビューコメントの分析とファクトチェック", status: "pending" },
    { step: "修正計画の提示", status: "pending" },
    { step: "コード修正の実行", status: "pending" },
    { step: "変更のステージング", status: "pending" },
    { step: "コミットメッセージの生成", status: "pending" },
    { step: "コミット前の承認確認", status: "pending" },
    { step: "コミットの実行", status: "pending" },
    { step: "プッシュの実行", status: "pending" },
    { step: "返信コメントの作成", status: "pending" },
    { step: "返信・resolve の承認確認", status: "pending" },
    { step: "返信の投稿・スレッド resolve", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. PR の特定

引数で PR 番号が指定されていない場合、現在のブランチから PR を特定する:

```bash
# 現在のブランチに関連する PR を取得
gh pr list --head $(git branch --show-current) --json number,title,state --jq '.[0]'

# または現在のブランチの PR 番号を取得
gh pr view --json number --jq '.number'
```

### 2. 未対応のレビューを取得

```bash
# 自分の GitHub ユーザー名を取得 (自分のコメントを除外するため)
MY_LOGIN=$(gh api user --jq '.login')

# レビュースレッドとレビュー本文の状態を確認 (GraphQL)
# 注意: id (スレッド resolve 用) と databaseId (リアクション API 用) の両方を取得する
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
      reviews(last: 100) {
        pageInfo {
          hasPreviousPage
          startCursor
        }
        nodes {
          id
          databaseId
          state
          body
          url
          author { login }
          comments(first: 1) {
            totalCount
          }
          reactionGroups {
            content
            viewerHasReacted
          }
        }
      }
    }
  }
}'
```

**フィルタ条件 (インラインコメント):**

取得した `reviewThreads.nodes` に対して以下の条件でフィルタする:

1. `isResolved == false` のスレッドのみを対象とする
2. スレッドの最初のコメント (`comments.nodes[0].author.login`) が `MY_LOGIN` と一致するスレッドは除外する (自分によるコメントには返信・resolve しない)

**フィルタ条件 (レビュー本文):**

inline コメントに紐づかない指摘 (PR 画面で `#pullrequestreview-<id>` として表示されるレビュー本文) も対象とする。取得した `reviews.nodes` に対して以下の条件でフィルタする:

1. `state` が `PENDING` または `DISMISSED` のレビューは除外する
2. `body` が空のレビューは除外する (本文なしの approve / comment 等)
3. `author` が null のレビューは除外する (削除ユーザー等。返信時のメンション先が存在しないため)
4. `author.login` が `MY_LOGIN` と一致するレビューは除外する
5. `comments.totalCount > 0` (inline コメントを伴うレビュー) は除外する (指摘の実体は inline スレッド側で対応するため。二重返信を防ぐ)
6. 自分が 👍 リアクション済み (`reactionGroups` の `content == "THUMBS_UP"` かつ `viewerHasReacted == true`) のレビューは対応済みとして除外する

**取得件数の注意:** `reviews` は作成日時の昇順で返るため、最新側を優先する `last: 100` を使用する。レビューが 100 件を超える PR では `pageInfo.hasPreviousPage` を確認し、`startCursor` を `before` に渡して前のページも取得して全件確認する。

### 3. レビューコメントの分析とファクトチェック

各未解決コメント・未対応のレビュー本文について、以下を判断する。レビュー本文に複数の指摘が含まれる場合は指摘ごとに分解して判断する:

| 判断カテゴリ   | 対応                   |
| -------------- | ---------------------- |
| **修正が必要** | コードを修正する       |
| **議論が必要** | ユーザーに確認を求める |
| **対応不要**   | 理由を説明して resolve |

**レビュー本文の場合:** スレッドが存在しないため、上表の resolve は行わない。「修正が必要」「対応不要」の場合は PR コメントで返信し、👍 リアクションで対応済み扱いとする。「議論が必要」(議論継続中) の場合は返信のみとし、👍 マークは付けない (マークすると以降の実行で検出されなくなるため、議論完了後に付ける)。詳細はステップ 12・13。

**妥当性判断の基準:**

- コードの正確性に関する指摘 → 修正が必要
- セキュリティに関する指摘 → 修正が必要
- パフォーマンスに関する指摘 → 検討が必要
- スタイルや好みの問題 (`nits:`) → 対応は任意
- 誤解に基づく指摘 → 説明で対応

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
| 3      | Antigravity MCP      | 最新情報や外部知見の取得                 |
| 4      | context7 MCP         | ライブラリの公式ドキュメントとコード例   |
| 5      | 必要時のみ WebFetch  | 公式サイト・GitHub・特定 URL の確認      |
| 6      | 必要時のみ WebSearch | 最新情報・ブログ・リリースノートの検索   |

**例外 (上記の優先順位より優先):**

- terraform に関する内容は terraform MCP (`mcp__terraform__*`) が最優先
- Google Cloud に関する内容は google-developer-knowledge MCP (`mcp__google-developer-knowledge__*`) が最優先
- Codex に関する内容は 関連する Codex skill が最優先

ファクトチェックの結果は修正計画の提示 (ステップ 4) に含め、指摘が誤りだった場合はその根拠をソース付きで示す。

### 4. 修正計画の提示

分析結果をユーザーに提示する:

**レビューコメントの翻訳:** 引用するレビューコメントが英語の場合は、日本語に翻訳して表示する。原文を併記する必要はなく、翻訳後の日本語のみを表示する。

**レビュー本文の表示:** インラインコメントは `[path/to/file.ts:42]`、レビュー本文は `[レビュー本文 #<review_databaseId>]` として表示する (複数のレビュー本文がある場合でも一意に識別できるようにする)。

```
## レビューコメント分析結果

### 修正が必要なコメント (N 件)

1. **[path/to/file.ts:42]** @reviewer
   > コメント内容

   **対応:** [修正内容の説明]

2. ...

### 議論が必要なコメント (M 件)

1. **[path/to/file.ts:100]** @reviewer
   > コメント内容

   **判断:** [なぜ議論が必要か]

### 対応不要と判断したコメント (K 件)

1. **[path/to/file.ts:200]** @reviewer
   > コメント内容

   **理由:** [対応不要の理由]

---

この計画で修正を進めますか？
```

### 5. コード修正の実行

ユーザーの承認後、修正を実行する:

1. 対象ファイルを Read ツールで読み込む
2. Edit ツールで修正を適用
3. 修正内容を確認

```bash
# 修正後の差分を確認
git diff
```

### 6. 変更のステージング

修正したファイルをステージングする:

```bash
git add -A
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

subject には「レビュー指摘に基づく修正」のような汎用表現ではなく、実際に何を変更したかを具体的に記述する。

### 8. コミット前の承認確認

**必須:** 修正内容をユーザーに提示し、コミットの承認を求める。

**コミットメッセージは commitlint 設定 (または Conventional Commits) に準拠する:**

```
## コミット内容の確認

以下の変更をコミットします:

**変更ファイル:**
- path/to/file1.ts (+5, -3)
- path/to/file2.ts (+2, -1)

**コミットメッセージ:** (commitlint 設定: <設定ファイル or デフォルト>)
```

<type>(<scope>): <実際の変更内容を具体的に記述>

- [修正内容 1]
- [修正内容 2]

```

例: `fix(auth): トークン検証に null チェックを追加`、`refactor(api): エラーレスポンスの型定義を厳格化`

この内容でコミットしてよろしいですか？
```

**type の選択基準:**

- レビュー指摘でバグを修正 → `fix`
- レビュー指摘でリファクタリング → `refactor`
- レビュー指摘でスタイル修正 → `style`
- レビュー指摘でドキュメント修正 → `docs`

### 9. コミットの実行

承認後、コミットを実行:

```bash
# subject には実際の変更内容を記述する (「レビュー指摘に基づく修正」のような汎用表現は使わない)
git commit -m "<type>(<scope>): <実際の変更内容>

- [修正内容 1]
- [修正内容 2]"
```

### 10. プッシュの実行

コミット完了後、リモートにプッシュ:

```bash
git push
```

### 11. 返信コメントの作成

各レビューコメント・レビュー本文への返信を作成する。

**レビュー本文への返信:** レビュー本文にはスレッド返信 API が存在しないため、PR コメント (issue comment) として返信する。レビュワーへのメンションと元のレビュー本文の引用を含める。

**返信テンプレート:**

| 対応タイプ     | 返信例                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| 修正完了       | `修正しました。ご指摘ありがとうございます。`                                  |
| 議論結果で修正 | `ご指摘の通り修正しました。[補足説明]`                                        |
| 対応しない     | `[理由] のため、現状のままとさせてください。ご意見があればお知らせください。` |

**ソース参照ルール:**

理由を添えて返信する場合 (対応しない、議論結果で修正など)、信頼できるソースの情報を参照できるときはコメントにも記載する。

- 公式ドキュメント (言語仕様、フレームワーク公式ドキュメント、API ドキュメント等) の URL
- プロジェクト内の既存コード・設定ファイルのパスと行番号
- lint ルールやコーディング規約の該当セクション
- RFC やセキュリティアドバイザリ等の公的な技術文書

**例:**

```
現在の実装は React 公式ドキュメントの推奨パターンに沿っています。
ref: https://react.dev/reference/react/useEffect#removing-unnecessary-object-dependencies

現状のままとさせてください。ご意見があればお知らせください。
```

### 12. 返信・resolve の承認確認

**必須:** 返信内容と resolve 対象をユーザーに提示し、承認を求める:

```
## 返信コメントと resolve の確認

以下の返信を投稿し、スレッドを resolve します:

### 1. [path/to/file.ts:42] への返信 ✅ resolve 予定
> 元のコメント: ...

**返信:** 修正しました。ご指摘ありがとうございます。

### 2. [path/to/file.ts:100] への返信 ✅ resolve 予定
> 元のコメント: ...

**返信:** [理由] のため、現状のままとさせてください。

---

**resolve 対象:** N 件 (修正: X 件、対応不要: Y 件)

これらの返信を投稿し、スレッドを resolve してよろしいですか？
- resolve しない場合は「返信のみ」と回答してください
```

**resolve 対象の判定基準:**

| 対応タイプ             | resolve 対象 |
| ---------------------- | ------------ |
| 修正が完了したコメント | ✅           |
| 対応不要と判断         | ✅           |
| 議論継続中             | ❌           |

**レビュー本文の場合:** スレッドが存在しないため resolve は行わない。代わりに対応完了 (修正完了または対応不要の返信済み) のレビュー本文へ 👍 リアクションを追加して対応済みマークとする。議論継続中のレビュー本文は返信のみとし、👍 マークは付けない (resolve 対象外のスレッドと同様の扱い)。承認確認では「👍 マーク予定」「返信のみ」を区別して提示する。

### 13. 返信の投稿・スレッド resolve

承認後、リアクション追加・返信投稿・スレッド resolve を実行する。

**返信は GraphQL mutation を使用する** (REST API はエンドポイントの URL 構造が複雑でエラーを起こしやすいため):

```bash
# 元のコメントに 👍 リアクションを追加 (REST API)
# databaseId はステップ 2 の GraphQL クエリで取得した値を使用
gh api repos/{owner}/{repo}/pulls/comments/<databaseId>/reactions \
  -f content="+1"

# レビュースレッドへの返信 (GraphQL mutation)
# thread_id はステップ 2 で取得した reviewThreads の id を使用
# <thread_id>, <body> は実際の値に置き換える
gh api graphql -F query='
mutation {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "<thread_id>", body: "<body>"}) {
    comment {
      id
      body
    }
  }
}'
```

**レビュー本文への対応 (スレッドが存在しない場合):**

信頼できないレビュー本文を含むため、シェルを介さずファイル編集ツールで返信本文を一時ファイルに書き出し、`--body-file` でそのパスを渡す。シェル補間 (`--body "..."`) や heredoc は、本文中の `$()`・バッククォート・デリミタと同一の行によってローカルでコマンド実行され得るため使用しない。

まずファイル編集ツールで `/tmp/pr-<number>-review-reply-<review_databaseId>.md` に以下の形式で書き出す:

```markdown
@<reviewer>

> <元のレビュー本文の引用 (長い場合は要約)>

<返信本文>
```

次に書き出したファイルのパスを渡して投稿し、👍 リアクションで対応済みマークを付ける:

```bash
# 返信: PR コメントとして投稿
gh pr comment <number> --body-file /tmp/pr-<number>-review-reply-<review_databaseId>.md

# 対応済みマーク: レビュー本文に 👍 リアクションを追加 (GraphQL mutation)
# REST の reactions API はレビュー本文に対応していないため GraphQL を使用する
# <review_id> はステップ 2 で取得した reviews の id (GraphQL node ID) を使用
gh api graphql -F query='
mutation {
  addReaction(input: {subjectId: "<review_id>", content: THUMBS_UP}) {
    reaction { content }
  }
}'
```

**ユーザーが resolve を承認した場合:**

```bash
# スレッドを resolve (GraphQL mutation)
# <thread_id> は実際の値に置き換える
gh api graphql -F query='
mutation {
  resolveReviewThread(input: {threadId: "<thread_id>"}) {
    thread {
      isResolved
    }
  }
}'
```

**処理順序:**

1. 元のコメントに 👍 リアクションを追加 (`databaseId` を使用)
2. スレッドに返信を投稿 (`id` (GraphQL node ID) を使用)
3. resolve を実行 (承認された場合のみ、`id` を使用)
4. レビュー本文への返信を PR コメントとして投稿し、対応完了したものに 👍 リアクションを追加 (`review_id` を使用。👍 マークに失敗した場合は再試行し、なお失敗する場合は完了報告に記載する。未マークのままだと次回実行で重複返信されるため、手動での対応済みマークを依頼する)
5. エラーが発生した場合は続行し、完了報告で失敗したスレッド・レビューを報告

### 14. 完了報告

```
## 修正完了

- 修正コミット: <commit_hash>
- 修正ファイル数: N
- 返信済みコメント数: M
- resolve 済みスレッド数: K
- 対応済みレビュー本文数: R (👍 マーク済み。0 の場合は省略)

PR URL: <url>
```

**resolve に失敗したスレッドがある場合:**

```
## 修正完了 (一部エラーあり)

- 修正コミット: <commit_hash>
- 修正ファイル数: N
- 返信済みコメント数: M
- resolve 済みスレッド数: K

**resolve 失敗:**
- [path/to/file.ts:42]: エラー内容

PR URL: <url>
```

## エラーハンドリング

### gh CLI が使用できない場合

GitHub MCP ツールにフォールバック:

- `mcp__github__get_pull_request` で PR 情報取得
- `mcp__github__list_pull_request_comments` でコメント取得

### 未解決コメント・未対応レビュー本文がない場合

```
未解決のレビューコメント・未対応のレビュー本文はありません。
```

### コンフリクトがある場合

```bash
git fetch origin
git rebase origin/main
# コンフリクト解決後
git push --force-with-lease
```

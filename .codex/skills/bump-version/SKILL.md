---
name: bump-version
description: |
  このスキルは、「plugin version を更新して」「プラグインのバージョンを上げて」「bump version」「bump git 1.2.0」「変更差分から plugin version を更新」などのリクエストで使用する。cx リポジトリの `plugins/<name>/.codex-plugin/plugin.json` の `version` を semver で更新する project-local skill。
---

# cx Plugin Version 更新ワークフロー

cx リポジトリ内の plugin manifest version を更新する。Codex の project-local skill として `.codex/config.toml` の `skills.config` から読み込まれる前提で動く。

## 重要な原則

1. **更新対象は plugin manifest のみ** - `plugins/<plugin>/.codex-plugin/plugin.json` の `version` を更新する
2. **marketplace に version を追加しない** - Codex の marketplace は plugin catalog、source、install policy を管理する。plugin 自体の semver は各 plugin manifest の `version` で管理する
3. **semver 形式を使う** - 通常は `X.Y.Z` 形式。指定された場合のみ pre-release / build metadata を扱う
4. **引数がない場合は差分から推測する** - 変更 path と内容から対象 plugin と bump level を判断する
5. **JSON は構造化データとして更新する** - 手作業の文字列置換だけに頼らない
6. **commit や push は行わない** - この skill の責務は version 更新まで。ユーザーから明示された場合のみ別 skill または通常手順で実行する

## 引数

形式:

```text
<target> <version>
```

- `<target>`: plugin 名 (`git`, `codex`, `dev`, `catch-up` など)
- `<version>`: 新しい semver (`1.2.3` 形式)

引数は省略可能。省略時は git diff から target と bump level を推測する。

## 作業開始前の準備

**必須:** 作業開始時に `update_plan` で実行ステップを整理し、以下のステップを登録する:

```
update_plan({
  plan: [
    { step: "対象 plugin と version の特定", status: "pending" },
    { step: "現在 version の確認", status: "pending" },
    { step: "marketplace の確認", status: "pending" },
    { step: "plugin manifest の更新", status: "pending" },
    { step: "整形と JSON 検証", status: "pending" },
    { step: "完了報告", status: "pending" },
  ]
})
```

各ステップの開始時に `update_plan` で `in_progress` にし、完了時に `completed` に更新する。

## 実行手順

### 1. 対象 plugin と version の特定

#### 引数がある場合

`<target> <version>` が指定されている場合は、その値を使う。

検証:

- `plugins/<target>/.codex-plugin/plugin.json` が存在すること
- `<version>` が `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$` に一致すること
- 現在 version と同じではないこと

#### 引数がない場合

以下で変更ファイルを取得する:

```bash
git diff --cached --name-only
git diff --name-only
git ls-files --others --exclude-standard
```

変更 path から対象 plugin を推測する:

- `plugins/<name>/` 配下の変更 → `<name>`
- 複数 plugin が変更されている場合 → 各 plugin を対象にする
- plugin 配下の変更がない場合 → version 更新対象なしとして終了

version は変更内容から推測する:

| 変更内容                                     | bump level |
| -------------------------------------------- | ---------- |
| 破壊的変更、既存 skill の契約変更            | major      |
| 新 skill 追加、default prompt 追加、機能追加 | minor      |
| 文言修正、bug fix、検証手順修正、typo        | patch      |

判断材料:

```bash
git diff --stat
git diff -- plugins/<target>/
git status --short -- plugins/<target>/
```

推測だけで十分な根拠がある場合は確認せず実行する。判断に迷う場合のみ、候補と根拠を短く示してユーザーに確認する。

### 2. 現在 version の確認

対象ごとに現在 version を確認する:

```bash
jq -r '.version' plugins/<target>/.codex-plugin/plugin.json
```

semver の増分:

- major: `X.Y.Z` → `(X+1).0.0`
- minor: `X.Y.Z` → `X.(Y+1).0`
- patch: `X.Y.Z` → `X.Y.(Z+1)`

pre-release や build metadata が含まれる version は、指定 version がある場合のみ扱う。自動推測では通常の `X.Y.Z` に正規化する。

### 3. marketplace の確認

`.agents/plugins/marketplace.json` を確認し、対象 plugin が marketplace に存在することだけを検証する。version は追加・更新しない。

```bash
jq -r '.plugins[].name' .agents/plugins/marketplace.json
```

対象 plugin が marketplace に存在しない場合も、manifest が存在するなら version 更新は続行する。完了報告で marketplace 未登録であることを補足する。

### 4. plugin manifest の更新

対象 plugin の `version` だけを更新する。JSON は構造化データとして扱い、手作業の文字列置換だけに頼らない。

例:

```bash
node -e '
const fs = require("fs");
const path = process.argv[1];
const version = process.argv[2];
const json = JSON.parse(fs.readFileSync(path, "utf8"));
json.version = version;
fs.writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
' plugins/<target>/.codex-plugin/plugin.json <version>
```

複数 plugin が対象の場合は、各 manifest を順に更新する。

### 5. 整形と JSON 検証

必ず実行する:

```bash
bun run fmt
jq empty .agents/plugins/marketplace.json plugins/*/.codex-plugin/plugin.json
```

変更対象と version を確認する:

```bash
git diff -- plugins/*/.codex-plugin/plugin.json
```

### 6. 完了報告

以下を簡潔に報告する:

- 更新した plugin
- old version → new version
- bump level と根拠
- marketplace 登録の有無
- 実行した検証

## エラーハンドリング

### plugin が見つからない場合

```
plugins/<target>/.codex-plugin/plugin.json が見つかりません。
対象 plugin 名を確認してください。
```

### version が semver ではない場合

```
指定された version は semver 形式ではありません: <version>
例: 1.2.3
```

### 差分から対象を推測できない場合

```
変更差分から version 更新対象の plugin を特定できませんでした。
対象 plugin と version を指定してください。

例: bump-version git 1.2.0
```

## 補足

- `.agents/plugins/marketplace.json` は plugin の並び、source path、install policy の catalog。plugin version 更新では通常変更しない。
- Codex の local plugin install cache では version directory が `local` になる。これは plugin manifest の semver とは別の install cache 表現。
- plugin 名は `plugins/<name>/` の実ディレクトリ名に合わせる。
- `package.json` の version はこの repo の plugin version ではないため更新しない。
- commit や push は、この skill の責務外。ユーザーから明示された場合だけ別途実行する。

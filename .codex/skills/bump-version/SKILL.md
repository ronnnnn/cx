---
name: 'bump-version'
description: '`cx` リポジトリ内の plugin または marketplace のバージョンを更新するときに使用します。`git`、`codex`、`catch-up`、`dev`、`marketplace` が対象です。'
---

# バージョン更新

この Codex marketplace リポジトリのバージョン台帳を更新します。

## 対象

- `git`
- `codex`
- `catch-up`
- `dev`
- `marketplace`

引数形式は `<target> <version>` です。

## 更新対象ファイル

- バージョン台帳: `.agents/plugins/versions.json`
- リポジトリ概要: `README.md`

## 手順

1. 明示引数があればそれを使い、なければ現在の git diff から対象を推定します。
2. `.agents/plugins/versions.json` から現在のバージョンを読み取ります。
3. 指定された entry を更新します。
4. `README.md` にバージョン表記があれば整合性を保ちます。
5. `marketplace` 指定の場合は marketplace の version も更新します。
6. 更新後の JSON が正しく parse できることを確認します。

## 注意

- セマンティックバージョニングを使います。
- バージョン台帳と実際の plugin ディレクトリ構成を一致させます。
- 存在しない target は暗黙に作らず、そのまま報告します。

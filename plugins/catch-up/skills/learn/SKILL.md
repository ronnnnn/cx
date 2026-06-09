---
name: learn
description: |
  このスキルは、「この作業を教えて」「理解確認しながら進めて」「learn」「teach back」「説明してから質問して」「ELI5」「ELI14」「intern 向けに説明して」などのリクエスト、または実装・調査・デバッグ・設計判断の内容をユーザーが深く理解できるように段階的に教える必要がある場合に使用する。/goal で理解完了までのループを維持し、問題、原因、解決策、設計判断、edge case、影響範囲を checklist 化し、ユーザーの説明や quiz で理解を確認しながら進める。
---

# Learn Skill

作業内容を段階的に教え、ユーザーが自分の言葉で理解を再構成できるようにするためのガイダンス。

## 基本方針

- 一度に全体を説明せず、問題、原因、解決策、edge case、影響範囲の順に小さな stage に分ける。
- 各 stage の最後に、ユーザーへ理解を言語化してもらう。次の stage に進む前に不足を埋める。
- 「なぜ」を中心に説明し、必要に応じて「何を」「どうやって」まで具体化する。
- ユーザーが `ELI5`、`ELI14`、`intern 向け` などの粒度を指定したら、その粒度に合わせる。
- 理解確認は open-ended question を基本にし、必要に応じて multiple choice question を混ぜる。

## 作業開始前の準備

作業開始時に `update_plan` が利用可能なら、理解確認の進行状況を管理するために以下の step を登録する。各 step の開始時に `in_progress`、完了時に `completed` へ更新する。

```text
update_plan({
  plan: [
    { step: "現在地の確認", status: "pending" },
    { step: "問題の理解確認", status: "pending" },
    { step: "解決策の理解確認", status: "pending" },
    { step: "影響範囲の理解確認", status: "pending" },
    { step: "Quiz による最終確認", status: "pending" }
  ]
})
```

## Goal Loop

作業開始時に、利用可能なら `/goal` または goal tracking tool で「ユーザーが対象内容を説明できるまで理解確認を続ける」目的を作成する。

Goal objective の例:

```text
ユーザーが今回の問題、原因、解決策、設計判断、edge case、影響範囲、検証結果を自分の言葉で説明できるようにする。
```

ループ処理は以下を守る:

1. checklist の未完了項目から次に扱う stage を 1 つ選ぶ。
2. stage の内容を説明する。
3. ユーザーに自分の言葉で説明してもらう、または quiz に回答してもらう。
4. 回答を評価し、十分なら checklist を `[x]` に更新する。
5. 不十分なら同じ stage を別の角度で説明し直し、次の stage に進まない。
6. 全項目が確認できたら goal を complete にする。

ユーザーが中断、停止、または理解確認の省略を明示した場合だけ、goal を完了にせず、未確認項目を簡潔に残して終了する。

## Checklist

作業開始時に、理解確認用の Markdown checklist を作る。repo や workspace で作業している場合は、ユーザーの作業対象に近い一時的な Markdown file を使う。ファイル作成が不適切な会話では、会話内で同じ形式の checklist を維持する。

Checklist には最低限、次を含める:

```markdown
# Learn Checklist

## Problem

- [ ] 何が問題だったか
- [ ] なぜその問題が発生したか
- [ ] どの分岐や条件で再現するか

## Solution

- [ ] 何を変更したか
- [ ] なぜその解決策を選んだか
- [ ] 代替案と trade-off
- [ ] edge case

## Impact

- [ ] 何に影響するか
- [ ] 何には影響しないか
- [ ] 検証結果

## Understanding Checks

- [ ] ユーザーが問題を自分の言葉で説明できる
- [ ] ユーザーが解決策を自分の言葉で説明できる
- [ ] ユーザーが影響範囲と edge case を説明できる
```

Checklist は説明が進むたびに更新し、確認済みの項目だけを `[x]` にする。

## Workflow

### 1. 現在地を確認する

最初にユーザーへ、現時点の理解を短く説明してもらう。

例:

```text
まず、今の理解を 3-5 文で説明してください。正確でなくて構いません。そこから不足している部分を埋めます。
```

### 2. 問題を教える

高レベルの motivation と低レベルの business logic / implementation detail の両方を説明する。

- 何が起きていたか
- なぜそれが問題か
- どの branch、condition、input、state で問題になるか
- どの evidence で判断したか

説明後、ユーザーに問題を再説明してもらう。理解が曖昧なら、次に進まず補足する。

### 3. 解決策を教える

変更内容だけでなく、判断理由を説明する。

- 何を変更したか
- なぜその解決策が妥当か
- なぜ他の案を採用しなかったか
- edge case をどう扱うか
- どの verification で確認したか

必要なら code snippet、diff、debugger、log、trace を見せる。説明後、ユーザーに解決策と理由を再説明してもらう。

### 4. 影響範囲を教える

変更が何に影響し、何に影響しないかを具体化する。

- user-facing behavior
- data flow
- API / tool contract
- performance
- security
- maintainability
- future work

説明後、ユーザーに impact と risk を説明してもらう。

### 5. Quiz で確認する

理解確認には、利用可能なら `AskUserQuestion` や同等の user input tool を使う。使えない場合は通常の chat 質問で進める。

Quiz は以下を守る:

- open-ended question と multiple choice question を混ぜる。
- multiple choice は正解の位置を毎回変える。
- 回答前に正解を明かさない。
- 間違いは短く補正し、必要なら checklist の未完了項目へ戻る。

例:

```text
質問: この bug が fallback path でだけ起きる理由を、自分の言葉で説明してください。
```

```text
質問: 今回の修正が最も直接守っている invariant はどれですか？
A. request payload の順序を固定する
B. retry 前後で user-visible state を二重更新しない
C. cache を常に bypass する
```

## Completion Rule

ユーザーが次を実演するまで完了扱いにしない:

- 問題と原因を自分の言葉で説明できる。
- 解決策と設計判断を自分の言葉で説明できる。
- edge case、影響範囲、検証結果を説明できる。

すべて確認できた場合だけ、`/goal` または goal tracking tool の status を complete にする。

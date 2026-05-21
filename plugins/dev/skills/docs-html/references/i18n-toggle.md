# 日/英 言語切替 実装パターン

すべての生成 HTML はこの実装をそのまま採用する。日本語と英語の両方のテキストを HTML 内に保持し、ボタン操作で瞬時に切り替える (ページ再ロード不要)。

## 仕様

1. 初期言語は `localStorage.lang` を最優先、なければ `<html lang>` の初期値 (`ja`) を使用
2. 言語状態は `<html lang="ja|en">` に保持する
3. 切替ボタンを押すと `lang` を反転し `localStorage` に保存する
4. `<head>` 内の初期化スクリプトで `lang` を先に設定し、保存済み言語と初期 HTML のずれによる FOUT を防ぐ
5. プレーンテキストは **属性方式** で両言語を保持する (主流の方式)
6. HTML markup を含む翻訳は **隣接要素方式** を使い、`data-ja` / `data-en` 属性には入れない
7. ボタン名・aria-label・タイトルも両言語化する

## 初期言語の先行設定

`<head>` 内で `localStorage.lang` を読み、HTML の parse 中に `<html lang>` を更新する。JS が有効な場合だけ `js-i18n-pending` class を付け、body 末尾の i18n 初期化が完了するまで本文を隠す。これにより保存済み言語が `en` のときに日本語が一瞬表示される FOUT を防ぐ。

```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem('lang');
      var lang = saved || document.documentElement.getAttribute('lang') || 'ja';
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.classList.add('js-i18n-pending');
    } catch (e) {}
  })();
</script>
```

```css
html.js-i18n-pending body {
  visibility: hidden;
}

[lang='ja'] [data-lang='en'],
[lang='en'] [data-lang='ja'] {
  display: none !important;
}
```

## テキスト保持方式: `data-ja` / `data-en` 属性

JS で `lang` の値に応じて該当属性の値を要素の `textContent` に流し込む。`textContent` を使うため、属性値はプレーンテキスト専用とする。

```html
<h1 data-ja="使い方ガイド" data-en="How to use"></h1>
<p
  data-ja="このページは概念を説明します。"
  data-en="This page explains the concept."
></p>
<button data-ja="コピー" data-en="Copy">コピー</button>
```

属性内に HTML タグが必要な場合は属性ではなく **隣接要素方式** を使う。初期表示は CSS の `[lang] [data-lang]` ルールに任せるため、初期 HTML に `hidden` 属性は付けない:

```html
<div class="i18n">
  <div data-lang="ja">
    <p>これは <strong>重要な</strong> 注釈です。</p>
  </div>
  <div data-lang="en">
    <p>This is an <strong>important</strong> note.</p>
  </div>
</div>
```

## 必須属性の多言語化

```html
<html lang="ja">
  <head>
    <title data-ja="使い方ガイド" data-en="How to use">使い方ガイド</title>
  </head>
</html>
```

`aria-label`, `placeholder`, `alt`, `title` は同じく `data-ja-<attr>` / `data-en-<attr>` で対応する。

```html
<button
  id="lang-toggle"
  aria-label="言語切替"
  data-ja-aria-label="言語切替"
  data-en-aria-label="Toggle language"
>
  <span data-ja="EN" data-en="JA">EN</span>
</button>

<input
  type="search"
  data-ja-placeholder="検索…"
  data-en-placeholder="Search…"
  placeholder="検索…"
/>
```

## 切替ボタン

```html
<button
  id="lang-toggle"
  class="icon-btn"
  aria-label="言語切替"
  data-ja-aria-label="言語切替"
  data-en-aria-label="Toggle language"
>
  <span data-ja="EN" data-en="JA">EN</span>
</button>
```

ボタンのラベルは「次に切り替わる言語名」を表示するのが UX 上わかりやすい。

## 適用 JS

```js
(function () {
  const REWRITE_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang);
    // textContent 系
    document
      .querySelectorAll(`[data-${lang === 'ja' ? 'ja' : 'en'}]`)
      .forEach((el) => {
        const v = el.getAttribute(`data-${lang}`);
        if (v != null) el.textContent = v;
      });
    // 属性系
    REWRITE_ATTRS.forEach((attr) => {
      document.querySelectorAll(`[data-${lang}-${attr}]`).forEach((el) => {
        const v = el.getAttribute(`data-${lang}-${attr}`);
        if (v != null) el.setAttribute(attr, v);
      });
    });
    // ブロック切替 (隣接要素方式)
    document.querySelectorAll('[data-lang]').forEach((el) => {
      el.hidden = el.getAttribute('data-lang') !== lang;
    });
    document.documentElement.classList.remove('js-i18n-pending');
  }

  function initLang() {
    let saved = null;
    try {
      saved = localStorage.getItem('lang');
    } catch (e) {}
    const init = saved || document.documentElement.getAttribute('lang') || 'ja';
    applyLang(init);
    return init;
  }

  let cur = initLang();
  const btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      cur = cur === 'ja' ? 'en' : 'ja';
      applyLang(cur);
      try {
        localStorage.setItem('lang', cur);
      } catch (e) {}
    });
  }
})();
```

## 翻訳指針

- **技術用語/固有名詞は原語維持** (例: "Codex", "MCP", "PR", "diff")
- **数値・コードは翻訳しない** (両言語で同じ内容)
- **日付フォーマット** は両言語で揃える (`2026-05-21` または ISO 8601)
- **見出しは簡潔に** - 機械翻訳的にならず、両言語ネイティブとして自然な表現にする
- **コードコメント** は原則翻訳しない (元のコードと同じ)。説明として翻訳が必要な場合は `<aside>` で注釈
- **HTML markup を属性に入れない** - `<em>` や `<code>` を含む翻訳は `data-lang` の隣接要素方式で表現する
- **量の不一致に注意** - 英語の方が短くなりがちなので、レイアウトが崩れないか確認

## チェックリスト

- [ ] `<html lang>` が JS で書き換わるか
- [ ] `<title>` が言語連動するか
- [ ] すべてのボタン/リンク/見出し/段落が両言語化されているか
- [ ] aria-label, placeholder などの属性も切替対象か
- [ ] 切替が `localStorage` に保存され次回も維持されるか
- [ ] 翻訳漏れがないか (`data-ja` だけ / `data-en` だけは禁止)

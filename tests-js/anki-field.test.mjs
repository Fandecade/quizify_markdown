import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  decodeAnkiFieldHtml,
  readAnkiFieldSource
} from "../src/shared/anki-field.js";

test("Anki HTML-source fields are decoded before Markdown analysis and preview", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  assert.equal(
    decodeAnkiFieldHtml(
      "&gt; 引用<br><br>&gt; [!NOTE]<br>&gt; 提示 &amp; 说明",
      dom.window.document
    ),
    "> 引用\n\n> [!NOTE]\n> 提示 & 说明"
  );
});

test("preprocessed fields are read as inert text without re-parsing markup", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="safe"><!-- quizify-source:safe:front -->
      &lt;img src=x onerror="globalThis.compromised=true"&gt;
      **safe markdown**
    <!-- quizify-source:end:front --></section>
  </body>`);
  const field = dom.window.document.getElementById("safe");
  assert.match(readAnkiFieldSource(field, dom.window.document), /<img src=x onerror=/);
  assert.match(readAnkiFieldSource(field, dom.window.document), /\*\*safe markdown\*\*/);
  assert.equal(field.querySelector("img"), null);
  assert.equal(dom.window.compromised, undefined);
});

test("unprocessed mobile-compatible fields ignore transport comments", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="legacy"><!-- quizify-source:start:front -->&gt; quote<br>next<!-- quizify-source:end:front --></section>
  </body>`);
  const field = dom.window.document.getElementById("legacy");
  assert.equal(readAnkiFieldSource(field, dom.window.document), "> quote\nnext");
});

test("rich-text fields keep their line breaks on phones", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const documentRef = dom.window.document;

  // AnkiDroid/AnkiMobile wrap each line in a block element instead of using
  // <br>. Losing those breaks collapses every line-based Quizify block.
  assert.equal(
    decodeAnkiFieldHtml(
      "<div>&gt; 引用</div><div>&gt; [!NOTE]</div><div>&gt; 提示 &amp; 说明</div>",
      documentRef
    ),
    "> 引用\n> [!NOTE]\n> 提示 & 说明"
  );

  // Same content, two transports: the result must be identical so a card that
  // was last edited on a phone renders the same way as one edited on desktop.
  assert.equal(
    decodeAnkiFieldHtml(
      "<div>&gt; 引用</div><div>&gt; [!NOTE]</div><div>&gt; 提示 &amp; 说明</div>",
      documentRef
    ),
    decodeAnkiFieldHtml(
      "&gt; 引用<br>&gt; [!NOTE]<br>&gt; 提示 &amp; 说明",
      documentRef
    )
  );

  // The visual editor writes a blank line as an empty block holding a <br>.
  assert.equal(
    decodeAnkiFieldHtml(
      "<div>第一段</div><div><br></div><div>第二段</div>",
      documentRef
    ),
    "第一段\n\n第二段"
  );

  // Inline markup inside a line is not a line break.
  assert.equal(
    decodeAnkiFieldHtml(
      '<div>看图 <img src="a.png"><b>粗体</b></div><div>第二行</div>',
      documentRef
    ),
    '看图 <img src="a.png"><b>粗体</b>\n第二行'
  );
});

test("hand-written HTML in a field is never mistaken for editor transport", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const documentRef = dom.window.document;

  // A field that is nothing but top-level <div>/<p> blocks is transport markup
  // and is unwrapped; anything with content or real HTML of its own is left
  // untouched so the author's markup still reaches the renderer intact.
  for (const authored of [
    "<pre>$pre$</pre>",
    "<table><tr><td>a</td></tr></table>",
    "<div>block</div>说不清的文字",
    // A single wrapping <div> is not transport once it holds real markup: the
    // editor never puts <pre>/<textarea> inside one of its line blocks.
    '<div title="$attribute$"><pre>$pre$</pre><textarea>$textarea$</textarea></div>',
    "普通 **Markdown** 段落",
    '<p>one</p><p>two</p><ul><li>a</li></ul>'
  ]) {
    assert.equal(decodeAnkiFieldHtml(authored, documentRef), authored);
  }
});

test("inline text masks survive a rich-text round trip", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const source = decodeAnkiFieldHtml(
    "<div>面向连接的服务由 %%传输层%% 负责</div>" +
      "<div>可用 %%三次握手%% 建立连接</div>",
    dom.window.document
  );
  assert.equal(
    source,
    ["面向连接的服务由 %%传输层%% 负责", "可用 %%三次握手%% 建立连接"].join("\n")
  );
});

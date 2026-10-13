import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

/*
 * The card maker ships as four classic scripts plus an HTML shell because
 * `file://` refuses ES modules. This test loads exactly those build outputs in
 * the order `index.html` loads them, then drives the page the way a user does.
 */

const read = (name) => readFile(new URL(`../webmaker/${name}`, import.meta.url), "utf8");
const [html, catalogs, syntaxTools, previewBundle, appBundle] = await Promise.all([
  read("index.html"),
  read("quizify-i18n.js"),
  read("syntax-tools.js"),
  read("quizify-preview.js"),
  read("app.js")
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot() {
  const virtualConsole = new VirtualConsole();
  const problems = [];
  virtualConsole.on("jsdomError", (error) => problems.push(error.message));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://quizify.local/webmaker/",
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (value) => ({ width: String(value).length * 8 })
  });

  await new Promise((resolve) => {
    if (window.document.readyState === "complete") resolve();
    else window.addEventListener("load", resolve, { once: true });
    setTimeout(resolve, 2000);
  });

  window.eval(catalogs);
  window.eval(syntaxTools);
  window.eval(previewBundle);
  window.eval(appBundle);
  await wait(50);

  return { dom, window, document: window.document, problems };
}

// `Mod` resolves from the user agent exactly like the runtime does.
function modKey(window) {
  const mac = /Mac|iPhone|iPad|iPod/i.test(window.navigator.userAgent ?? "");
  return mac ? { metaKey: true } : { ctrlKey: true };
}

function press(window, node, init) {
  return node.dispatchEvent(
    new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  );
}

test("the build stays loadable from a bare file:// folder", async () => {
  // ES modules, fetch and @font-face files are all blocked from file://, so
  // the build has to be classic scripts with the fonts already inlined.
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /https?:\/\//, "the shell must not reach out to a CDN");
  for (const [name, source] of [
    ["app.js", appBundle],
    ["quizify-preview.js", previewBundle],
    ["syntax-tools.js", syntaxTools],
    ["quizify-i18n.js", catalogs]
  ]) {
    assert.doesNotMatch(source, /^\s*import\s+[\w{"'*]/m, `${name} still contains an import statement`);
    assert.doesNotMatch(source, /^\s*export\s+(default|const|function|\{)/m, `${name} still exports ES module syntax`);
  }

  const previewCss = await readFile(new URL("../webmaker/quizify-preview.css", import.meta.url), "utf8");
  assert.match(previewCss, /data:font\/woff2;base64,/);
  assert.doesNotMatch(previewCss, /url\([^)]*\.woff2?\)/, "KaTeX fonts must not be external files");
  assert.doesNotMatch(previewCss, /@import/);

  for (const asset of ["app.css", "app.js", "syntax-tools.js", "quizify-i18n.js", "quizify-preview.js"]) {
    assert.match(html, new RegExp(asset.replace(".", "\\.")), `index.html should link ${asset}`);
  }
  // The preview stylesheet is attached to the shadow root at runtime, so it is
  // referenced from the bundle rather than from the shell.
  assert.match(previewBundle, /quizify-preview\.css/);

  for (const asset of ["app.css", "app.js", "syntax-tools.js", "quizify-i18n.js", "quizify-preview.js", "quizify-preview.css"]) {
    const info = await stat(new URL(`../webmaker/${asset}`, import.meta.url));
    assert(info.size > 500, `${asset} looks empty`);
  }
});

test("the built page boots every runtime it depends on", async () => {
  const { window, document, problems } = await boot();

  assert.equal(typeof window.QuizifySyntax, "object");
  assert.equal(typeof window.QuizifySyntax.analyzeQuizifySyntax, "function");
  assert.equal(typeof window.QuizifyPreview, "object");
  assert.equal(typeof window.Quizify, "object");
  assert.equal(typeof window.QuizifyMaker, "object");

  // 16 Markdown actions minus the retired local-image button, plus 7 snippets.
  const buttons = document.getElementById("toolbar").querySelectorAll("button");
  assert.equal(buttons.length, 22);
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 1);
  assert.equal(document.getElementById("shortcut-groups").querySelectorAll(".shortcut-row").length > 30, true);

  assert.deepEqual(problems, []);
  window.close();
});

test("editing a field renders the same card runtime in the preview", async () => {
  const { window, document } = await boot();
  const front = document.getElementById("field-front");
  front.value = "## 网络分层\n\n%%应用层%% 负责什么？\n\n{{OSI 七层}}";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(400);

  const shadow = document.getElementById("preview-host").shadowRoot;
  assert.ok(shadow, "preview renders into a shadow root");
  assert.equal(shadow.querySelectorAll("h2").length, 1);
  assert.equal(shadow.querySelectorAll(".quizify-mask").length, 1);
  assert.equal(shadow.querySelectorAll(".math-block, .quizify-inline-math").length, 0);

  const mask = shadow.querySelector(".quizify-mask");
  assert.equal(mask.getAttribute("aria-expanded"), "false");
  mask.click();
  await wait(30);
  assert.equal(mask.getAttribute("aria-expanded"), "true");

  assert.equal(document.getElementById("structure-summary").textContent, "文字遮盖 1 · 填空 1");
  assert.equal(document.getElementById("diagnostics-summary").dataset.state, "ok");
  assert.match(document.getElementById("byte-summary").textContent, /^正面 \d+ B · 背面 0 B$/);
  window.close();
});

test("Quizify snippet shortcuts wrap the selection exactly like the Anki editor", async () => {
  const { window, document } = await boot();
  const front = document.getElementById("field-front");
  front.focus();
  front.value = "应用层";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  front.focus();
  front.setSelectionRange(0, 3);

  press(window, front, { ...modKey(window), altKey: true, code: "Digit7", key: "\u00a1" });
  assert.equal(front.value, "%%应用层%%");

  // A multi-line snippet lands on its own line when the caret sits mid-line.
  front.value = "标题";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  front.focus();
  front.setSelectionRange(2, 2);
  press(window, front, { ...modKey(window), altKey: true, code: "Digit5", key: "\u00a1" });
  assert.equal(front.value, "标题\n::: 标题\n内容\n:::\n");

  // Selecting the whole line and applying the same snippet unwraps nothing:
  // the selected text replaces the placeholder instead.
  front.value = "折叠";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  front.focus();
  front.setSelectionRange(0, 2);
  press(window, front, { ...modKey(window), altKey: true, code: "Digit5", key: "\u00a1" });
  assert.equal(front.value, "::: 折叠\n内容\n:::\n");
  window.close();
});

test("Markdown shortcuts use physical punctuation keys", async () => {
  const { window, document } = await boot();
  const front = document.getElementById("field-front");
  front.value = "x2";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  front.focus();
  front.setSelectionRange(1, 2);

  press(window, front, { ...modKey(window), shiftKey: true, code: "Period", key: ">" });
  assert.equal(front.value, "x^2^");

  // The wrapped text stays selected, so the next action applies to it again.
  press(window, front, { ...modKey(window), shiftKey: true, code: "KeyX", key: "X" });
  assert.equal(front.value, "x^~~2~~^");
  window.close();
});

test("card operations, undo and the exported CSV work from the UI", async () => {
  const { window, document } = await boot();

  press(window, document.body, { altKey: true, code: "KeyN", key: "\u00f1" });
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 2);

  press(window, document.body, { altKey: true, code: "Backspace", key: "Backspace" });
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 1);
  assert.equal(document.getElementById("btn-undo").hidden, false);

  press(window, document.body, { altKey: true, code: "KeyZ", key: "z" });
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 2);

  press(window, document.body, { altKey: true, code: "ArrowLeft", key: "ArrowLeft" });
  const front = document.getElementById("field-front");
  front.focus();
  front.value = "网络分层";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(50);

  const blobs = [];
  const downloads = [];
  window.URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return "blob:test";
  };
  window.URL.revokeObjectURL = () => {};
  const nativeClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  try {
    document.getElementById("btn-export").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  } finally {
    window.HTMLAnchorElement.prototype.click = nativeClick;
  }

  assert.equal(blobs.length, 1);
  assert.match(downloads[0], /^quizify-学习-网络-\d{8}-\d{4}\.csv$/);
  const csv = await blobs[0].text();
  assert.match(csv, /#notetype:Quizify Markdown/);
  assert.match(csv, /#deck:学习::网络/);
  assert.match(csv, /#guid column:4/);
  assert.match(csv, /^网络分层,,"",""|^网络分层,,,/m);
  assert.equal(csv.trimEnd().split("\n").at(-1).split(",")[0], "");
  window.close();
});

test("each row can be deleted on its own and 清空 asks once before wiping the deck", async () => {
  const { window, document } = await boot();
  const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  click(document.getElementById("btn-new-card"));
  click(document.getElementById("btn-new-card"));
  assert.equal(document.querySelectorAll(".card-item").length, 3);
  assert.equal(document.querySelectorAll(".card-remove").length, 3);

  click(document.querySelectorAll(".card-remove")[1]);
  assert.equal(document.querySelectorAll(".card-item").length, 2);

  press(window, document.body, { altKey: true, code: "KeyZ", key: "z" });
  assert.equal(document.querySelectorAll(".card-item").length, 3);

  const clear = document.getElementById("btn-clear-cards");
  click(clear);
  assert.equal(clear.dataset.confirm, "1");
  assert.equal(document.querySelectorAll(".card-item").length, 3);

  click(clear);
  assert.equal(clear.dataset.confirm, undefined);
  assert.equal(document.querySelectorAll(".card-item").length, 1);
  assert.equal(document.getElementById("card-count").textContent, "1");

  press(window, document.body, { altKey: true, code: "KeyZ", key: "z" });
  assert.equal(document.querySelectorAll(".card-item").length, 3);

  window.close();
});

test("rows are draggable and the deck order follows the drop", async () => {
  const { window, document } = await boot();
  const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  click(document.getElementById("btn-new-card"));
  click(document.getElementById("btn-new-card"));

  const list = document.getElementById("card-list");
  const rows = () => [...list.querySelectorAll(".card-row")];
  const ids = () => rows().map((row) => row.dataset.id);
  const before = ids();
  assert.equal(before.length, 3);
  assert.ok(before.every(Boolean), "every row carries its card id");

  // jsdom does no layout, so hand the rows a 30px band each.
  const layout = () =>
    rows().forEach((row, index) => {
      const top = index * 30;
      row.getBoundingClientRect = () => ({
        top,
        bottom: top + 30,
        height: 30,
        left: 0,
        right: 120,
        width: 120,
        x: 0,
        y: top
      });
    });
  layout();

  const item = rows()[2].querySelector(".card-item");
  const fire = (type, init) =>
    item.dispatchEvent(
      new window.PointerEvent(type, { bubbles: true, cancelable: true, ...init })
    );

  fire("pointerdown", { pointerId: 1, clientX: 5, clientY: 75 });
  layout();
  fire("pointermove", { pointerId: 1, clientX: 5, clientY: 4 });
  fire("pointerup", { pointerId: 1, clientX: 5, clientY: 4 });

  assert.deepEqual(ids(), [before[2], before[0], before[1]]);
  // Array.from keeps the ids in this realm: the page's arrays are a different
  // realm's prototype, which deepStrictEqual rejects.
  assert.deepEqual(
    Array.from(window.QuizifyMaker.store.cards, (card) => card.id),
    [before[2], before[0], before[1]]
  );
  assert.equal(document.getElementById("btn-undo").hidden, false);

  window.close();
});

test("the tab bar switches panes and keeps the card count on its badge", async () => {
  const { window, document } = await boot();
  const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const workspace = document.getElementById("workspace");
  const tabs = [...document.querySelectorAll(".pane-tab")];

  assert.deepEqual(
    tabs.map((tab) => tab.dataset.pane),
    ["list", "editor", "preview"]
  );
  assert.equal(workspace.dataset.pane, "editor");
  assert.equal(tabs[1].getAttribute("aria-current"), "true");
  assert.equal(document.getElementById("pane-tab-count").textContent, "1");

  click(tabs[0]);
  assert.equal(workspace.dataset.pane, "list");
  assert.equal(tabs[0].getAttribute("aria-current"), "true");
  assert.equal(tabs[1].getAttribute("aria-current"), "false");

  click(document.getElementById("btn-new-card"));
  assert.equal(workspace.dataset.pane, "editor", "new cards land in the editor");
  assert.equal(document.getElementById("pane-tab-count").textContent, "2");

  click(tabs[2]);
  assert.equal(workspace.dataset.pane, "preview");
  window.close();
});

test("a compact viewport opens the editor when a card is picked", async () => {
  const { window, document } = await boot();
  const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  // jsdom ships no matchMedia, so the page reports "not compact" until a phone
  // sized viewport is simulated here.
  window.matchMedia = (query) => ({
    matches: query === "(max-width: 900px)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {}
  });

  const workspace = document.getElementById("workspace");
  const listTab = document.querySelector('.pane-tab[data-pane="list"]');
  click(listTab);
  assert.equal(workspace.dataset.pane, "list");

  click(document.querySelectorAll(".card-item")[0]);
  assert.equal(workspace.dataset.pane, "editor");
  window.close();
});

test("the compact layout and mobile meta tags ship in the build", async () => {
  const [builtHtml, builtCss] = await Promise.all([read("index.html"), read("app.css")]);

  assert.match(builtHtml, /viewport-fit=cover/);
  assert.match(builtHtml, /name="theme-color"/);
  assert.match(builtHtml, /class="pane-tabs"/);

  // Minified sheets drop the space after the colon, so find the breakpoint
  // with a pattern instead of a literal.
  const breakpoint = builtCss.search(/max-width:\s*900px/);
  assert.ok(breakpoint > 0, "the 900px breakpoint ships in the stylesheet");
  const compact = builtCss.slice(breakpoint);
  assert.match(compact, /\.pane-tabs\s*\{\s*display:\s*flex/);
  // Release builds minify the sheet, and esbuild drops the quotes inside
  // attribute selectors, so both spellings have to pass.
  assert.match(compact, /\.workspace\[data-pane="?editor"?\]\s*>\s*\.pane-editor/);
  assert.match(compact, /\.workspace\[data-pane="?list"?\]\s*>\s*\.pane-list/);
  assert.match(builtCss, /@media\s*\(max-width:\s*600px\)/);
});

test("import accepts tool JSON and exported CSV without duplicating notes", async () => {
  const { window, document } = await boot();
  const textarea = document.getElementById("import-text");

  textarea.value = "Front,Back,tags,guid\n甲,乙,,g-a\n丙,丁,tag1,g-b\n";
  document.getElementById("btn-import-append").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 3);

  textarea.value = JSON.stringify({
    version: 1,
    settings: { deck: "工程牌组", tags: "工程" },
    cards: [{ front: "只有一张", back: "", tags: [] }]
  });
  document.getElementById("btn-import-replace").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 1);
  assert.equal(document.getElementById("deck-input").value, "工程牌组");
  assert.equal(document.getElementById("global-tags-input").value, "工程");

  textarea.value = "not,a,card";
  document.getElementById("btn-import-replace").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("card-list").querySelectorAll(".card-item").length, 1);
  window.close();
});

test("the work in progress is autosaved and restored on the next visit", async () => {
  const { window, document } = await boot();
  const front = document.getElementById("field-front");
  front.value = "自动保存的卡片";
  front.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(600);

  const stored = window.localStorage.getItem("quizify.webmaker.v1");
  assert.ok(stored, "the store should have written a project snapshot");
  assert.equal(JSON.parse(stored).cards[0].front, "自动保存的卡片");
  assert.notEqual(document.getElementById("save-state").dataset.state, "error");
  window.close();
});

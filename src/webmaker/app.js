/*
 * The offline card maker shell.
 *
 * Three panes — card list, fields, live preview — are wired to the very same
 * render pipeline the Anki card uses, so what you see here is what the phone
 * will show. Everything has to work from `file://`, so the build inlines this
 * module graph into one classic script and the preview loads its stylesheet
 * (KaTeX fonts included, as data URLs) from the same folder.
 */

import { byId, clear, debounce, el } from "./dom.js";
import { exportCsv, exportIssues, parseCsvCards } from "./csv.js";
import { createCard, createStore } from "./store.js";
import { createRowReorder } from "./drag.js";
import { createShortcutRunner, displayKeySpec, isMacPlatform } from "./shortcuts.js";
import { markdownSelection, snippetInsertion } from "../editor/text-commands.js";

const THEMES = [
  { id: "kaiwu", label: "开务" },
  { id: "gezhi", label: "格致" }
];

const MARKDOWN_KEYS = {
  bold: "Mod+B",
  italic: "Mod+I",
  "inline-code": "Mod+E",
  link: "Mod+Shift+K",
  strikethrough: "Mod+Shift+X",
  highlight: "Mod+Shift+H",
  superscript: "Mod+Shift+.",
  subscript: "Mod+Shift+,",
  "github-alert": "Mod+Alt+A",
  heading: "Mod+Alt+T",
  blockquote: "Mod+Alt+Q",
  "unordered-list": "Mod+Alt+U",
  "ordered-list": "Mod+Alt+O",
  "code-block": "Mod+Alt+C"
};

// The local photo ribbon is deliberately absent: this template is meant to be
// synchronised as text, and a path to a local file never travels with it.
const HIDDEN_MARKDOWN_ACTIONS = new Set(["image"]);

const SYNTAX_MISSING =
  "语法模块没加载成功：请确认 index.html 与 syntax-tools.js、quizify-i18n.js 在同一目录。";

const view = {
  activeField: "front",
  previewSide: "front",
  previewWidth: "auto",
  pane: "editor",
  query: ""
};

const store = createStore();
const previewItemsCache = new Map();
let renderedCardId = null;
let toastTimer = 0;
let clearConfirmTimer = 0;

// The tab bar is CSS-hidden on wide screens, but the same state drives both, so
// jsdom (no matchMedia) simply reports "not compact".
const COMPACT_QUERY = "(max-width: 900px)";

function isCompactLayout() {
  return Boolean(globalThis.matchMedia?.(COMPACT_QUERY)?.matches);
}

const syntax = () => globalThis.QuizifySyntax;
const preview = () => globalThis.QuizifyPreview;

/* ---------- small helpers ---------- */

function isTextTarget(node) {
  const tag = node?.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return !["button", "checkbox", "radio", "submit", "range", "file"].includes(
    String(node.type || "text").toLowerCase()
  );
}

function isFieldTarget(node) {
  return Boolean(node?.dataset?.field);
}

function formatBytes(count) {
  return count < 1024 ? `${count} B` : `${(count / 1024).toFixed(1)} KB`;
}

function firstLine(text) {
  return String(text ?? "").split("\n").find((line) => line.trim()) ?? "";
}

function isBlankCard(card) {
  return !firstLine(card.front) && !firstLine(card.back);
}

function newCard() {
  store.addCard();
  setPane("editor");
  renderAll({ force: true });
  frontField().focus();
}

function removeCard(id) {
  if (!store.removeCard(id)) {
    toast("至少要保留一张卡片。", "warning");
    return false;
  }
  renderAll({ force: true });
  toast("已删除，Alt+Z 或点右下角可撤销。");
  return true;
}

function clearCards() {
  const removed = store.clearAll();
  if (!removed) {
    toast("卡片本来就是空的。");
    return false;
  }
  renderAll({ force: true });
  toast(`已清空 ${removed} 张卡片，Alt+Z 或点右下角可撤销。`);
  return true;
}

function toast(message, kind = "info") {
  const node = byId("toast");
  node.textContent = message;
  node.dataset.kind = kind;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, kind === "error" ? 4600 : 2600);
}

function resetClearButton() {
  const button = byId("btn-clear-cards");
  if (!button) return;
  delete button.dataset.confirm;
  button.textContent = "清空";
}

function saveState(label, state = "idle") {
  const node = byId("save-state");
  if (!node) return;
  node.textContent = label;
  node.dataset.state = state;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes())
  ].join("");
}

function previewItems(text) {
  const key = String(text ?? "");
  if (previewItemsCache.has(key)) return previewItemsCache.get(key);
  const items = syntax()?.collectQuizifyPreview(key) ?? [];
  if (previewItemsCache.size > 400) previewItemsCache.clear();
  previewItemsCache.set(key, items);
  return items;
}

/* ---------- panes (phone / tablet) ---------- */

function syncPaneTabs() {
  byId("workspace").dataset.pane = view.pane;
  for (const tab of document.querySelectorAll(".pane-tab")) {
    tab.setAttribute("aria-current", tab.dataset.pane === view.pane ? "true" : "false");
  }
}

function setPane(pane) {
  if (view.pane === pane) return;
  view.pane = pane;
  syncPaneTabs();
  // The preview was rendered while its pane could be hidden, so re-measure on
  // the way in.
  if (pane === "preview") renderPreview();
}

/* ---------- fields ---------- */

function frontField() {
  return byId("field-front");
}

function backField() {
  return byId("field-back");
}

function tagsField() {
  return byId("card-tags");
}

function markdownField() {
  return view.activeField === "back" ? backField() : frontField();
}

function insertText(node, start, end, text, selection) {
  node.setRangeText(text, start, end, "end");
  if (typeof node.setSelectionRange === "function") {
    const from = selection ? start + selection.start : start + text.length;
    const to = selection ? start + selection.end : start + text.length;
    node.setSelectionRange(from, to);
    node.selectionStart = from;
    node.selectionEnd = to;
  }
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

function applySnippet(template, placeholder) {
  const node = markdownField();
  if (!node) return;
  const start = Number(node.selectionStart) || 0;
  const end = Number(node.selectionEnd) || 0;
  const selected = node.value.slice(start, end);
  const result = snippetInsertion(template, placeholder, selected);
  if (!result) {
    toast("这个片段没有可填充的位置，已跳过。", "warning");
    return;
  }
  let { value, selection } = result;
  const lineStart = node.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  if (/\n/.test(value) && node.value.slice(lineStart, start).trim()) {
    value = `\n${value}`;
    selection = selection
      ? { start: selection.start + 1, end: selection.end + 1 }
      : null;
  }
  node.focus();
  insertText(node, start, end, value, selection);
}

function applyMarkdownAction(action) {
  const node = markdownField();
  if (!node) return;
  const start = Number(node.selectionStart) || 0;
  const end = Number(node.selectionEnd) || 0;
  const selected = node.value.slice(start, end);
  const value = syntax()?.formatMarkdownAction(action, selected) ?? selected;
  const selection = markdownSelection(action, selected, value);
  node.focus();
  insertText(node, start, end, value, selection);
}

function setActiveField(fieldId) {
  view.activeField = fieldId === "back" ? "back" : "front";
  view.previewSide = view.activeField;
  syncPreviewControls();
  renderPreview();
}

/* ---------- toolbar ---------- */

function toolbarButton({ label, title, onClick }) {
  return el("button", {
    class: "toolbar-button",
    type: "button",
    title,
    text: label,
    onclick: (event) => {
      event.preventDefault();
      onClick();
    }
  });
}

function buildToolbar() {
  const host = byId("toolbar");
  clear(host);
  const api = syntax();
  if (!api) {
    host.append(el("span", { class: "toolbar-group-label", text: SYNTAX_MISSING }));
    return;
  }

  const markdown = el("div", { class: "toolbar-group" }, [
    el("span", { class: "toolbar-group-label", text: "Markdown" }),
    ...api.markdownActions
      .filter((action) => !HIDDEN_MARKDOWN_ACTIONS.has(action.id))
      .map((action) =>
        toolbarButton({
          label: action.button,
          title: MARKDOWN_KEYS[action.id]
            ? `${action.label} · ${displayKeySpec(MARKDOWN_KEYS[action.id])} · ${action.shortcut}`
            : action.label,
          onClick: () => applyMarkdownAction(action)
        })
      )
  ]);

  const quizify = el("div", { class: "toolbar-group" }, [
    el("span", { class: "toolbar-group-label", text: "Quizify" }),
    ...api.snippets.map((snippet, index) =>
      toolbarButton({
        label: snippet[0],
        title: `${snippet[0]} · ${displayKeySpec(`Mod+Alt+${index + 1}`)}`,
        onClick: () => applySnippet(snippet[1], snippet[2])
      })
    )
  ]);

  host.append(markdown, quizify);
}

/* ---------- card list ---------- */

const listRefs = new Map();

function cardSnippet(card) {
  const text = firstLine(card.front) || firstLine(card.back);
  return text || "（空白卡片）";
}

function cardBadge(card) {
  const items = previewItems(`${card.front}\n${card.back}`);
  if (!items.length) return null;
  const masks = items.filter((item) => item.kind === "mask").length;
  return {
    text: masks ? `${items.length}·遮${masks}` : String(items.length),
    kind: "structure"
  };
}

function visibleCards() {
  const query = view.query.trim().toLowerCase();
  const entries = store.cards.map((card, index) => ({ card, index }));
  if (!query) return entries;
  return entries.filter(({ card }) =>
    `${card.front}\n${card.back}\n${card.tags.join(" ")}`
      .toLowerCase()
      .includes(query)
  );
}

function updateListItem(card) {
  const refs = listRefs.get(card.id);
  if (!refs) return;
  const snippet = cardSnippet(card);
  refs.snippet.textContent = snippet;
  refs.snippet.classList.toggle("is-empty", !firstLine(card.front) && !firstLine(card.back));
  const badge = cardBadge(card);
  refs.item.dataset.structures = badge ? badge.text : "";
  if (refs.badge) {
    refs.badge.hidden = !badge;
    if (badge) refs.badge.textContent = badge.text;
  }
}

function renderCardList() {
  const host = byId("card-list");
  clear(host);
  listRefs.clear();
  const entries = visibleCards();

  if (!entries.length) {
    host.append(el("li", { class: "empty-note", text: "没有匹配的卡片。" }));
    byId("card-count").textContent = String(store.cards.length);
    return;
  }

  for (const { card, index } of entries) {
    const isEmpty = isBlankCard(card);
    const badge = cardBadge(card);
    const snippet = el("span", {
      class: `card-snippet${isEmpty ? " is-empty" : ""}`,
      text: cardSnippet(card)
    });
    const badgeNode = el("span", {
      class: "card-badge",
      hidden: badge ? null : true,
      text: badge ? badge.text : ""
    });
    const grip = el("span", {
      class: "card-grip",
      title: "拖动调整顺序",
      "aria-hidden": "true",
      text: "\u28ff"
    });
    const item = el(
      "button",
      {
        class: "card-item",
        type: "button",
        "aria-current": card.id === store.state.currentId ? "true" : null,
        onclick: () => {
          store.select(card.id);
          if (isCompactLayout()) setPane("editor");
        }
      },
      [
        el("span", { class: "card-index", text: String(index + 1) }),
        snippet,
        badgeNode
      ]
    );
    const remove = el("button", {
      class: "card-remove",
      type: "button",
      title: "删除这张卡片",
      "aria-label": `删除第 ${index + 1} 张卡片`,
      text: "×",
      onclick: (event) => {
        event.stopPropagation();
        removeCard(card.id);
      }
    });
    listRefs.set(card.id, { item, snippet, badge: badgeNode });
    host.append(
      el(
        "li",
        { class: "card-row", dataset: { id: card.id } },
        [grip, item, remove]
      )
    );
  }
  byId("card-count").textContent = String(store.cards.length);
  const tabCount = byId("pane-tab-count");
  if (tabCount) tabCount.textContent = String(store.cards.length);
  listRefs.get(store.state.currentId)?.item.scrollIntoView?.({ block: "nearest" });
}

/* ---------- fields ---------- */

function renderFields({ force = false } = {}) {
  const card = store.current();
  if (!force && card.id === renderedCardId) return;
  renderedCardId = card.id;
  frontField().value = card.front;
  backField().value = card.back;
  tagsField().value = card.tags.join(" ");
  updateListItem(card);
}

/* ---------- preview ---------- */

function renderPreview() {
  const host = byId("preview-host");
  const api = preview();
  if (!api) {
    host.textContent = "预览模块没加载成功：请确认 quizify-preview.js 与 index.html 在同一目录。";
    return;
  }
  const card = store.current();
  const side = view.previewSide;
  api.render(host, {
    source: side === "back" ? card.back : card.front,
    side,
    theme: store.settings.theme,
    night: store.settings.night,
    emptyLabel: side === "back" ? "（背面为空）" : "（正面为空）"
  });
}

function syncPreviewControls() {
  for (const button of byId("preview-side").querySelectorAll("[data-side]")) {
    button.setAttribute("aria-pressed", String(button.dataset.side === view.previewSide));
  }
  for (const button of byId("preview-width").querySelectorAll("[data-width]")) {
    button.setAttribute("aria-pressed", String(button.dataset.width === view.previewWidth));
  }
  byId("preview-frame").dataset.width = view.previewWidth;
  const theme = THEMES.find((entry) => entry.id === store.settings.theme) ?? THEMES[0];
  byId("btn-theme").textContent = theme.label;
  byId("btn-night").textContent = store.settings.night ? "☾" : "☀";
  byId("btn-night").title = store.settings.night ? "切到浅色" : "切到深色";
}

/* ---------- status bar ---------- */

function renderStatus() {
  const card = store.current();
  const api = syntax();
  const diagnosticNode = byId("diagnostics-summary");

  if (!api) {
    diagnosticNode.dataset.state = "error";
    diagnosticNode.textContent = "语法模块缺失";
    diagnosticNode.title = SYNTAX_MISSING;
    byId("structure-summary").textContent = "";
    byId("byte-summary").textContent = "";
    return;
  }

  const diagnostics = [
    ...api.analyzeQuizifySyntax(card.front).map((item) => ({
      ...item,
      message: `正面：${item.message}`
    })),
    ...api.analyzeQuizifySyntax(card.back).map((item) => ({
      ...item,
      message: `背面：${item.message}`
    }))
  ];
  const state = diagnostics.some((item) => item.severity === "error")
    ? "error"
    : diagnostics.some((item) => item.severity === "warning")
      ? "warning"
      : "ok";
  diagnosticNode.dataset.state = state;
  diagnosticNode.textContent = api.summarizeDiagnostics(diagnostics);
  diagnosticNode.title = diagnostics.length
    ? diagnostics.map((item) => `第 ${item.line} 行 · ${item.message}`).join("\n")
    : "正面和背面都没有发现语法问题。";

  const counts = new Map();
  for (const item of [...previewItems(card.front), ...previewItems(card.back)]) {
    counts.set(item.title, (counts.get(item.title) ?? 0) + 1);
  }
  const structure = byId("structure-summary");
  structure.textContent = counts.size
    ? [...counts].map(([title, count]) => `${title} ${count}`).join(" · ")
    : "";
  structure.title = counts.size ? "这张卡里可交互结构的数量" : "";

  const size = (text) => preview()?.sizeOf(text) ?? String(text ?? "").length;
  byId("byte-summary").textContent = `正面 ${formatBytes(size(card.front))} · 背面 ${formatBytes(
    size(card.back)
  )}`;

  byId("btn-undo").hidden = !store.canUndo();
}

/* ---------- render orchestration ---------- */

function renderAll({ force = false } = {}) {
  renderCardList();
  renderFields({ force });
  syncPreviewControls();
  renderStatus();
  renderPreview();
}

const refreshSoon = debounce(() => {
  renderStatus();
  renderPreview();
}, 240);

/* ---------- header ---------- */

function syncHeaderInputs() {
  byId("deck-input").value = store.settings.deck;
  byId("global-tags-input").value = store.settings.tags;
}

function cycleTheme() {
  const index = THEMES.findIndex((entry) => entry.id === store.settings.theme);
  const next = THEMES[(index + 1) % THEMES.length];
  store.updateSettings({ theme: next.id });
  toast(`主题：${next.label}`);
}

/* ---------- import / export ---------- */

function csvCardsFrom(source) {
  return source.map((item) => {
    const card = createCard();
    card.front = item.front ?? "";
    card.back = item.back ?? "";
    card.tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
    if (item.guid) card.guid = String(item.guid);
    return card;
  });
}

function applyImport(text, { append }) {
  const source = String(text ?? "").trim();
  if (!source) {
    toast("没有可导入的内容。", "warning");
    return false;
  }

  let cards = [];
  let deck = "";
  let tags = "";
  let notes = [];

  if (source.startsWith("{") || source.startsWith("[")) {
    let parsed = null;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      toast(`JSON 解析失败：${error.message}`, "error");
      return false;
    }
    const project = Array.isArray(parsed) ? { cards: parsed } : parsed || {};
    cards = csvCardsFrom(Array.isArray(project.cards) ? project.cards : []);
    deck = project.settings?.deck ?? "";
    tags = project.settings?.tags ?? "";
    notes = ["工程 JSON"];
  } else {
    const parsed = parseCsvCards(source);
    cards = csvCardsFrom(parsed.cards);
    deck = parsed.deck;
    tags = parsed.tags;
    notes = [parsed.cards.length ? "CSV" : "CSV（没有解析出卡片）"];
    for (const warning of parsed.warnings) {
      if (warning.severity === "error") {
        toast(warning.message, "error");
        return false;
      }
    }
  }

  if (!cards.length) {
    toast("没有解析出任何卡片。", "warning");
    return false;
  }

  const existing = append ? store.toProject().cards : [];
  store.replaceAll({
    settings: {
      ...store.settings,
      deck: deck || store.settings.deck,
      tags: tags || store.settings.tags
    },
    cards: [...existing, ...cards],
    currentId: null
  });
  syncHeaderInputs();
  renderAll({ force: true });
  toast(`已导入 ${cards.length} 张卡片（${notes.join("、")}）。`);
  return true;
}

function openImport() {
  byId("import-text").value = "";
  openDialog(byId("modal-import"));
  byId("import-text").focus();
}

function runExport() {
  const cardList = store.cards.map((card) => ({
    front: card.front,
    back: card.back,
    tags: card.tags,
    guid: card.guid
  }));
  const issues = exportIssues({
    deck: store.settings.deck,
    tags: store.settings.tags,
    cards: cardList
  });
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) {
    toast(errors[0].message, "error");
    return;
  }
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const csv = exportCsv({
    deck: store.settings.deck,
    tags: store.settings.tags,
    cards: cardList
  });
  const deckPart = store.settings.deck.trim().replace(/[::/\\]+/g, "-") || "quizify";
  download(`quizify-${deckPart}-${timestamp()}.csv`, csv);
  if (warnings.length) {
    toast(`已导出 ${cardList.length} 张，但有 ${warnings.length} 处提醒：${warnings[0].message}`);
  } else {
    toast(`已导出 ${cardList.length} 张卡片。`);
  }
}

/* ---------- shortcuts ---------- */

function shortcutLabel(keys) {
  if (!keys?.length) return "";
  return keys.map((key) => displayKeySpec(key)).join(" / ");
}

function buildCommands() {
  const api = syntax();
  const commands = [];

  for (const action of api?.markdownActions ?? []) {
    const keys = MARKDOWN_KEYS[action.id];
    if (!keys) continue;
    commands.push({
      id: `markdown.${action.id}`,
      group: "文本格式",
      title: action.label,
      keys: [keys],
      when: (event) => isFieldTarget(event?.target),
      run: () => applyMarkdownAction(action)
    });
  }

  (api?.snippets ?? []).forEach((snippet, index) => {
    const spec = `Mod+Alt+${index + 1}`;
    const alias = `Ctrl+Alt+${index + 1}`;
    commands.push({
      id: `snippet.${index + 1}`,
      group: "Quizify 语法（与 Anki 编辑器一致）",
      title: snippet[0],
      keys: [spec, alias],
      keyLabel: `${displayKeySpec(spec)} / ${displayKeySpec(alias)}`,
      when: (event) => isFieldTarget(event?.target),
      run: () => applySnippet(snippet[1], snippet[2])
    });
  });

  const cardCommands = [
    {
      id: "card.new",
      title: "新建卡片",
      keys: ["Alt+N"],
      when: (event) => !isTextTarget(event?.target),
      run: () => newCard()
    },
    {
      id: "card.next",
      title: "保存并新建下一张",
      keys: ["Mod+Enter"],
      run: () => newCard()
    },
    {
      id: "card.duplicate",
      title: "复制当前卡片",
      keys: ["Alt+D"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        store.duplicateCard();
        renderAll({ force: true });
        toast("已复制当前卡片。");
      }
    },
    {
      id: "card.delete",
      title: "删除当前卡片",
      keys: ["Alt+Backspace"],
      when: (event) => !isTextTarget(event?.target),
      run: () => removeCard(store.state.currentId)
    },
    {
      id: "card.clear",
      title: "清空全部卡片",
      keys: ["Alt+Shift+Backspace"],
      when: (event) => !isTextTarget(event?.target),
      run: clearCards
    },
    {
      id: "card.undo",
      title: "撤销删除",
      keys: ["Alt+Z"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        if (!store.undo()) {
          toast("没有可撤销的操作。", "warning");
          return;
        }
        renderAll({ force: true });
      }
    },
    {
      id: "card.prev",
      title: "上一张卡片",
      keys: ["Alt+ArrowLeft"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        if (store.step(-1)) renderAll({ force: true });
      }
    },
    {
      id: "card.nextCard",
      title: "下一张卡片",
      keys: ["Alt+ArrowRight"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        if (store.step(1)) renderAll({ force: true });
      }
    },
    {
      id: "card.moveUp",
      title: "在列表中上移",
      keys: ["Alt+ArrowUp"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        if (store.moveCard(store.state.currentId, -1)) renderAll({ force: true });
      }
    },
    {
      id: "card.moveDown",
      title: "在列表中下移",
      keys: ["Alt+ArrowDown"],
      when: (event) => !isTextTarget(event?.target),
      run: () => {
        if (store.moveCard(store.state.currentId, 1)) renderAll({ force: true });
      }
    },
    {
      id: "focus.front",
      title: "聚焦正面",
      keys: ["Alt+1"],
      run: () => {
        frontField().focus();
        setActiveField("front");
      }
    },
    {
      id: "focus.back",
      title: "聚焦背面",
      keys: ["Alt+2"],
      run: () => {
        backField().focus();
        setActiveField("back");
      }
    },
    {
      id: "focus.tags",
      title: "聚焦标签",
      keys: ["Alt+3"],
      run: () => tagsField().focus()
    },
    {
      id: "preview.side",
      title: "预览切换正/背",
      keys: ["Alt+P"],
      run: () => {
        view.previewSide = view.previewSide === "front" ? "back" : "front";
        syncPreviewControls();
        renderPreview();
      }
    },
    {
      id: "preview.width",
      title: "预览切换手机宽度",
      keys: ["Alt+W"],
      run: () => {
        view.previewWidth = view.previewWidth === "auto" ? "phone" : "auto";
        syncPreviewControls();
      }
    },
    {
      id: "preview.reveal",
      title: "预览：全部揭示",
      keys: ["Alt+R"],
      run: () => {
        const count = preview()?.revealAll(byId("preview-host"), true) ?? 0;
        if (!count) toast("当前没有可揭示的遮盖。", "warning");
      }
    },
    {
      id: "preview.reset",
      title: "预览：复位遮盖与交互",
      keys: ["Alt+Shift+R"],
      run: () => {
        preview()?.reset(byId("preview-host"));
        toast("预览已复位。");
      }
    },
    {
      id: "preview.theme",
      title: "切换主题（开务 / 格致）",
      keys: ["Alt+Shift+G"],
      run: cycleTheme
    },
    {
      id: "preview.night",
      title: "切换明暗",
      keys: ["Alt+Shift+D"],
      run: () => {
        store.updateSettings({ night: !store.settings.night });
        toast(store.settings.night ? "深色预览" : "浅色预览");
      }
    },
    {
      id: "file.export",
      title: "导出 CSV",
      keys: ["Mod+S"],
      run: runExport
    },
    {
      id: "file.import",
      title: "导入 CSV / JSON",
      keys: ["Mod+O"],
      run: openImport
    },
    {
      id: "help.shortcuts",
      title: "命令与快捷键",
      keys: ["Mod+/", "Shift+/"],
      keyLabel: isMacPlatform() ? "⌘/ · ?" : "Ctrl+/ · ?",
      run: openShortcuts
    },
    {
      id: "help.palette",
      title: "命令面板",
      keys: ["Mod+K"],
      run: openShortcuts
    }
  ];

  for (const command of cardCommands) {
    commands.push({ group: groupFor(command.id), ...command });
  }

  return commands;
}

function groupFor(id) {
  if (id.startsWith("focus.")) return "焦点";
  if (id.startsWith("preview.")) return "预览";
  if (id.startsWith("file.")) return "文件";
  if (id.startsWith("help.")) return "帮助";
  return "卡片";
}

const GROUP_ORDER = [
  "文本格式",
  "Quizify 语法（与 Anki 编辑器一致）",
  "卡片",
  "焦点",
  "预览",
  "文件",
  "帮助"
];

function renderShortcutDialog(commands) {
  const host = byId("shortcut-groups");
  clear(host);
  for (const group of GROUP_ORDER) {
    const items = commands.filter((command) => command.group === group);
    if (!items.length) continue;
    const rows = items.map((command) =>
      el(
        "button",
        {
          class: "shortcut-row",
          type: "button",
          dataset: { command: command.id, search: `${command.title} ${command.keyLabel ?? ""}` },
          onclick: () => {
            closeDialog(byId("modal-shortcuts"));
            runCommand(command);
          }
        },
        [
          el("span", {
            class: "shortcut-keys",
            text: command.keyLabel ?? shortcutLabel(command.keys)
          }),
          el("span", { class: "shortcut-title", text: command.title })
        ]
      )
    );
    host.append(
      el("section", { class: "shortcut-group" }, [
        el("h3", { text: group }),
        ...rows
      ])
    );
  }
  host.append(el("p", { class: "shortcut-empty", hidden: true, text: "没有匹配的命令。" }));
}

function filterShortcutDialog(query) {
  const needle = String(query ?? "").trim().toLowerCase();
  const host = byId("shortcut-groups");
  let visible = 0;
  for (const row of host.querySelectorAll(".shortcut-row")) {
    const hit = !needle || row.dataset.search.toLowerCase().includes(needle);
    row.hidden = !hit;
    if (hit) visible += 1;
  }
  for (const group of host.querySelectorAll(".shortcut-group")) {
    group.hidden = !group.querySelector(".shortcut-row:not([hidden])");
  }
  const empty = host.querySelector(".shortcut-empty");
  if (empty) empty.hidden = visible > 0;
}

function runCommand(command) {
  try {
    command.run();
  } catch (error) {
    toast(String(error?.message || error), "error");
  }
}

function openDialog(dialog) {
  if (typeof dialog?.showModal === "function") dialog.showModal();
  else if (dialog) dialog.open = true;
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.open = false;
}

function openShortcuts() {
  const dialog = byId("modal-shortcuts");
  const filter = byId("shortcut-filter");
  filter.value = "";
  filterShortcutDialog("");
  openDialog(dialog);
  filter.focus();
}

/* ---------- wiring ---------- */

function bindEvents() {
  byId("deck-input").addEventListener("input", (event) => {
    store.updateSettings({ deck: event.target.value });
  });
  byId("global-tags-input").addEventListener("input", (event) => {
    store.updateSettings({ tags: event.target.value });
  });

  byId("card-search").addEventListener("input", (event) => {
    view.query = event.target.value;
    renderCardList();
  });

  byId("btn-new-card").addEventListener("click", () => {
    store.addCard();
    setPane("editor");
    renderAll({ force: true });
    frontField().focus();
  });

  createRowReorder({
    list: byId("card-list"),
    isEnabled: () => !view.query && store.cards.length > 1,
    onReorder: (ids) => {
      if (store.reorderCards(ids)) toast("顺序已更新，Alt+Z 可撤销。");
    }
  });

  byId("btn-clear-cards").addEventListener("click", () => {
    const button = byId("btn-clear-cards");
    if (button.dataset.confirm !== "1") {
      const onlyBlankCard =
        store.cards.length === 1 && isBlankCard(store.cards[0]) && !store.cards[0].tags.length;
      if (onlyBlankCard) {
        toast("卡片本来就是空的。");
        return;
      }
      button.dataset.confirm = "1";
      button.textContent = "确认清空？";
      clearTimeout(clearConfirmTimer);
      clearConfirmTimer = setTimeout(resetClearButton, 3000);
      return;
    }
    clearTimeout(clearConfirmTimer);
    resetClearButton();
    clearCards();
  });

  for (const tab of document.querySelectorAll(".pane-tab")) {
    tab.addEventListener("click", () => setPane(tab.dataset.pane));
  }

  byId("btn-undo").addEventListener("click", () => {
    if (store.undo()) renderAll({ force: true });
  });

  for (const node of [frontField(), backField()]) {
    node.addEventListener("focus", () => setActiveField(node.dataset.field));
    node.addEventListener("input", () => {
      store.setField(node.dataset.field, node.value);
    });
  }
  tagsField().addEventListener("input", (event) => {
    store.setCardTags(event.target.value);
  });

  for (const button of byId("preview-side").querySelectorAll("[data-side]")) {
    button.addEventListener("click", () => {
      view.previewSide = button.dataset.side;
      syncPreviewControls();
      renderPreview();
    });
  }
  for (const button of byId("preview-width").querySelectorAll("[data-width]")) {
    button.addEventListener("click", () => {
      view.previewWidth = button.dataset.width;
      syncPreviewControls();
    });
  }

  byId("btn-theme").addEventListener("click", cycleTheme);
  byId("btn-night").addEventListener("click", () => {
    store.updateSettings({ night: !store.settings.night });
  });
  byId("btn-preview-reset").addEventListener("click", () => {
    preview()?.reset(byId("preview-host"));
  });
  byId("btn-preview-reveal").addEventListener("click", () => {
    const count = preview()?.revealAll(byId("preview-host"), true) ?? 0;
    if (!count) toast("当前没有可揭示的遮盖。", "warning");
  });

  byId("btn-export").addEventListener("click", runExport);
  byId("btn-import").addEventListener("click", openImport);
  byId("btn-shortcuts").addEventListener("click", openShortcuts);

  byId("btn-import-append").addEventListener("click", () => {
    if (applyImport(byId("import-text").value, { append: true })) {
      closeDialog(byId("modal-import"));
    }
  });
  byId("btn-import-replace").addEventListener("click", () => {
    if (applyImport(byId("import-text").value, { append: false })) {
      closeDialog(byId("modal-import"));
    }
  });

  const fileInput = byId("file-input");
  byId("btn-pick-file").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      byId("import-text").value = await file.text();
      toast(`已读取 ${file.name}，请选择追加或替换。`);
    } catch (error) {
      toast(`读取文件失败：${error.message}`, "error");
    }
  });

  const filter = byId("shortcut-filter");
  filter.addEventListener("input", (event) => filterShortcutDialog(event.target.value));
  filter.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = byId("shortcut-groups").querySelector(".shortcut-row:not([hidden])");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
}

function subscribeStore() {
  store.subscribe((reason) => {
    if (reason === "saved") {
      saveState("已自动保存", "saved");
      return;
    }
    if (reason === "save-failed") {
      saveState("无法自动保存", "error");
      return;
    }
    if (reason === "field") {
      updateListItem(store.current());
      refreshSoon();
      return;
    }
    if (reason === "settings") {
      syncPreviewControls();
      renderPreview();
      return;
    }
    if (reason === "select") {
      renderCardsAndFields(reason);
      return;
    }
    if (reason === "cards") {
      renderCardsAndFields(reason);
    }
  });
}

function renderCardsAndFields(reason) {
  renderCardList();
  renderFields({ force: reason === "cards" || reason === "select" });
  renderStatus();
  renderPreview();
}

function main() {
  store.load();
  syncHeaderInputs();
  buildToolbar();

  const commands = buildCommands();
  renderShortcutDialog(commands);
  subscribeStore();

  const runner = createShortcutRunner({
    commands,
    isBlocked: () => Boolean(document.querySelector("dialog[open]"))
  });
  document.addEventListener("keydown", (event) => runner.handle(event));

  if (runner.conflicts.length) {
    console.warn("Quizify 制卡台：快捷键冲突", runner.conflicts);
  }

  // A small console handle: `QuizifyMaker.store.toProject()` dumps the whole
  // deck as JSON when something needs to be inspected by hand.
  globalThis.QuizifyMaker = {
    store,
    commands,
    run: (id) => {
      const command = commands.find((entry) => entry.id === id);
      if (command) runCommand(command);
    }
  };

  bindEvents();
  syncPaneTabs();
  renderAll({ force: true });
  saveState("就绪");

  const mod = isMacPlatform() ? "\u2318" : "Ctrl+";
  byId("shortcut-hint").innerHTML = "";
  byId("shortcut-hint").append(
    document.createTextNode("按 "),
    el("kbd", { text: `${mod}/` }),
    document.createTextNode(" 或 "),
    el("kbd", { text: "?" }),
    document.createTextNode(" 查看全部命令 · "),
    el("kbd", { text: `${mod}K` }),
    document.createTextNode(" 命令面板")
  );

  if (!syntax()) toast(SYNTAX_MISSING, "error");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

export { applyImport, buildCommands, filterShortcutDialog };

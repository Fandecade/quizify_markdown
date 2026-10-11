(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/shared/i18n.js
  var DEFAULT_LOCALE = "en";
  var SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN", "ru"]);
  var emptyCatalogs = Object.freeze({
    en: Object.freeze({}),
    "zh-CN": Object.freeze({}),
    ru: Object.freeze({})
  });
  function catalogs() {
    const value = globalThis.QuizifyI18nCatalogs;
    return value && typeof value === "object" ? value : emptyCatalogs;
  }
  function normalizeLocale(value) {
    const raw = String(value || "").trim().replace(/_/g, "-").split(/[.@]/, 1)[0].toLowerCase();
    if (raw === "ru" || raw.startsWith("ru-")) return "ru";
    if (raw === "zh" || raw.startsWith("zh-")) return "zh-CN";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    return DEFAULT_LOCALE;
  }
  function scriptLocale(root) {
    var _a;
    const scripts = Array.from(((_a = root == null ? void 0 : root.document) == null ? void 0 : _a.scripts) || []);
    for (const script of scripts.reverse()) {
      try {
        const url = new URL(script.src, root.document.baseURI);
        if (!/(?:^|\/)(?:_quizify|syntax-tools|editor(?:-preview)?)\.js$/i.test(url.pathname)) {
          continue;
        }
        const value = url.searchParams.get("lang");
        if (value) return value;
      } catch {
      }
    }
    return "";
  }
  function detectLocale(root = globalThis) {
    var _a, _b, _c, _d, _e, _f;
    const explicit = (root == null ? void 0 : root.quizifyLocale) || scriptLocale(root);
    if (explicit) return normalizeLocale(explicit);
    const documentLocale = (_c = (_b = (_a = root == null ? void 0 : root.document) == null ? void 0 : _a.documentElement) == null ? void 0 : _b.getAttribute) == null ? void 0 : _c.call(_b, "lang");
    if (documentLocale) return normalizeLocale(documentLocale);
    const navigatorLocale = ((_e = (_d = root == null ? void 0 : root.navigator) == null ? void 0 : _d.languages) == null ? void 0 : _e[0]) || ((_f = root == null ? void 0 : root.navigator) == null ? void 0 : _f.language);
    return normalizeLocale(navigatorLocale);
  }
  var activeLocale = detectLocale();
  function setLocale(value) {
    activeLocale = normalizeLocale(value);
    return activeLocale;
  }
  function getLocale() {
    return activeLocale;
  }
  function messageFor(key, locale = activeLocale) {
    var _a, _b, _c, _d;
    const normalized = normalizeLocale(locale);
    const available = catalogs();
    return (_d = (_c = (_a = available[normalized]) == null ? void 0 : _a[key]) != null ? _c : (_b = available.en) == null ? void 0 : _b[key]) != null ? _d : key;
  }
  function format(message, values = {}) {
    return String(message).replace(
      /\{([A-Za-z0-9_]+)\}/g,
      (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
    );
  }
  function t(key, values = {}, locale = activeLocale) {
    var _a, _b;
    const message = messageFor(key, locale);
    if (message && typeof message === "object") {
      return format((_b = (_a = message.other) != null ? _a : Object.values(message)[0]) != null ? _b : key, values);
    }
    return format(message, values);
  }
  function pluralCategory(locale, count) {
    const normalized = normalizeLocale(locale);
    const number = Math.abs(Math.trunc(Number(count) || 0));
    if (normalized === "ru") {
      const mod10 = number % 10;
      const mod100 = number % 100;
      if (mod10 === 1 && mod100 !== 11) return "one";
      if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "few";
      return "many";
    }
    if (normalized === "en" && number === 1) return "one";
    return "other";
  }
  function tn(key, count, values = {}, locale = activeLocale) {
    var _a, _b, _c;
    let message = messageFor(key, locale);
    if (message && typeof message === "object") {
      const category = pluralCategory(locale, count);
      message = (_c = (_b = (_a = message[category]) != null ? _a : message.other) != null ? _b : Object.values(message)[0]) != null ? _c : key;
    }
    return format(message, { count, ...values });
  }

  // src/editor/runtime-config.js
  function scriptUrl(script) {
    try {
      return (script == null ? void 0 : script.src) ? new URL(script.src, document.baseURI) : null;
    } catch {
      return null;
    }
  }
  function isEditorBundle(url) {
    return Boolean(url && /\/web\/editor\.js$/.test(url.pathname));
  }
  function locateEditorBundle() {
    const current = scriptUrl(document.currentScript);
    if (isEditorBundle(current)) return current;
    const candidates = Array.from(document.scripts || []).map(scriptUrl).filter(isEditorBundle);
    const marked = candidates.find((url) => url.searchParams.get("quizify") === "1");
    if (marked) return marked;
    return candidates.length === 1 ? candidates[0] : null;
  }
  var editorBundleUrl = locateEditorBundle();
  var quizifyEditorLocale = setLocale(
    (editorBundleUrl == null ? void 0 : editorBundleUrl.searchParams.get("lang")) || getLocale()
  );
  var quizifyNotetypeId = (editorBundleUrl == null ? void 0 : editorBundleUrl.searchParams.get("ntid")) || "";
  function normalizeReviewTheme(value) {
    return value === "gezhi" || value === "kaiwu" ? value : "kaiwu";
  }
  var quizifyReviewTheme = normalizeReviewTheme(
    editorBundleUrl == null ? void 0 : editorBundleUrl.searchParams.get("theme")
  );
  var quizifyPlainTextIndices = new Set(
    ((editorBundleUrl == null ? void 0 : editorBundleUrl.searchParams.get("plain")) || "").split(",").map((value) => Number.parseInt(value, 10)).filter(Number.isInteger)
  );

  // src/editor/preview-loader.js
  var previewPromise = null;
  function previewBundleUrl() {
    if (!editorBundleUrl) return null;
    const previewUrl = new URL("editor-preview.js", editorBundleUrl);
    previewUrl.search = editorBundleUrl.search;
    return previewUrl.href;
  }
  globalThis.quizifyLoadEditorPreview = () => {
    if (globalThis.quizifyEditorPreviewReady) return Promise.resolve(true);
    if (previewPromise) return previewPromise;
    const source = previewBundleUrl();
    if (!source) return Promise.reject(new Error(t("editor.preview_url_missing")));
    previewPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => {
        previewPromise = null;
        reject(new Error(t("editor.preview_load_failed")));
      }, { once: true });
      document.head.appendChild(script);
    });
    return previewPromise;
  };

  // src/editor/anki-adapter.js
  function loadAnkiEditorAdapter(target = globalThis) {
    var _a, _b;
    const requireModule = typeof target.require === "function" ? target.require.bind(target) : typeof __require !== "undefined" ? __require : null;
    if (!requireModule) return null;
    try {
      const { loaded } = requireModule("anki/ui");
      const { instances: noteEditors } = requireModule("anki/NoteEditor");
      const {
        lifecycle: plainTextLifecycle,
        instances: plainTextInputs
      } = requireModule("anki/PlainTextInput");
      return Object.freeze({
        loaded,
        noteEditors,
        plainTextInputs,
        plainTextLifecycle
      });
    } catch (error) {
      (_b = (_a = target.console) == null ? void 0 : _a.warn) == null ? void 0 : _b.call(_a, "Quizify editor API is unavailable", error);
      return null;
    }
  }

  // src/editor/floating-panels.js
  var TOOLBAR_THEME_VARIABLES = [
    "--qt-surface",
    "--qt-surface-soft",
    "--qt-surface-raised",
    "--qt-text",
    "--qt-muted",
    "--qt-border",
    "--qt-border-strong",
    "--qt-primary",
    "--qt-primary-strong",
    "--qt-primary-soft",
    "--qt-accent",
    "--qt-blue",
    "--qt-green",
    "--qt-purple",
    "--qt-amber",
    "--qt-red",
    "--qt-shadow"
  ];
  function hasClassName(element, name) {
    return String((element == null ? void 0 : element.className) || "").split(/\s+/).includes(name);
  }
  function addClassName(element, name) {
    if (!element || hasClassName(element, name)) return;
    element.className = `${element.className || ""} ${name}`.trim();
  }
  function removeClassName(element, name) {
    if (!element) return;
    element.className = String(element.className || "").split(/\s+/).filter((item) => item && item !== name).join(" ");
  }
  function createFloatingPanelManager(root = globalThis, documentRef = document) {
    const registrations = /* @__PURE__ */ new Set();
    let eventsBound = false;
    function close(owner) {
      var _a, _b, _c;
      if (!owner) return;
      owner.open = false;
      const registration = Array.from(registrations).find((item) => item.owner === owner);
      const panel = registration == null ? void 0 : registration.panel;
      (_c = (_b = (_a = owner.querySelector) == null ? void 0 : _a.call(owner, "summary")) == null ? void 0 : _b.setAttribute) == null ? void 0 : _c.call(_b, "aria-expanded", "false");
      if (!panel) return;
      panel.hidden = true;
      removeClassName(panel, "quizify-panel-portal");
      if (owner.appendChild && panel.parentNode !== owner) owner.appendChild(panel);
    }
    function closeTop(focusAnchor = false) {
      var _a, _b, _c, _d;
      const registration = Array.from(registrations).filter(({ owner }) => owner.open).at(-1);
      if (!registration) return false;
      close(registration.owner);
      if (focusAnchor) (_d = (_c = (_b = (_a = registration.owner).querySelector) == null ? void 0 : _b.call(_a, "summary")) == null ? void 0 : _c.focus) == null ? void 0 : _d.call(_c);
      return true;
    }
    function position(owner, panel, preferredWidth) {
      var _a, _b, _c, _d, _e;
      const anchor = (_a = owner == null ? void 0 : owner.querySelector) == null ? void 0 : _a.call(owner, "summary");
      if (!(anchor == null ? void 0 : anchor.getBoundingClientRect) || !(panel == null ? void 0 : panel.style)) return;
      if (owner.isConnected === false) {
        close(owner);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const toolbar = (_b = owner.closest) == null ? void 0 : _b.call(owner, ".quizify-toolbar");
      const toolbarStyle = toolbar && ((_c = root.getComputedStyle) == null ? void 0 : _c.call(root, toolbar));
      if (toolbarStyle) {
        TOOLBAR_THEME_VARIABLES.forEach((name) => {
          panel.style.setProperty(name, toolbarStyle.getPropertyValue(name));
        });
        panel.style.fontFamily = toolbarStyle.fontFamily;
        panel.style.colorScheme = toolbarStyle.colorScheme;
      }
      const viewportWidth = ((_d = documentRef.documentElement) == null ? void 0 : _d.clientWidth) || root.innerWidth || 320;
      const viewportHeight = ((_e = documentRef.documentElement) == null ? void 0 : _e.clientHeight) || root.innerHeight || 320;
      const margin = 8;
      const gap = 7;
      const width = Math.min(preferredWidth, Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(
        margin,
        Math.min(rect.right - width, viewportWidth - width - margin)
      );
      const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const openAbove = below < 220 && above > below;
      const availableHeight = openAbove ? above : below;
      panel.style.position = "fixed";
      panel.style.left = `${Math.round(left)}px`;
      panel.style.right = "auto";
      panel.style.width = `${Math.round(width)}px`;
      panel.style.maxWidth = `${Math.round(Math.max(0, viewportWidth - margin * 2))}px`;
      panel.style.maxHeight = `${Math.round(availableHeight)}px`;
      if (openAbove) {
        panel.style.top = "auto";
        panel.style.bottom = `${Math.round(viewportHeight - rect.top + gap)}px`;
      } else {
        panel.style.top = `${Math.round(rect.bottom + gap)}px`;
        panel.style.bottom = "auto";
      }
    }
    function update() {
      registrations.forEach(({ owner, panel, preferredWidth }) => {
        if (owner.open && !panel.hidden) position(owner, panel, preferredWidth);
      });
    }
    function bindGlobalEvents() {
      var _a;
      if (eventsBound) return;
      eventsBound = true;
      (_a = root.addEventListener) == null ? void 0 : _a.call(root, "resize", update);
      documentRef.addEventListener("scroll", update, true);
      const closeOutside = (event) => {
        registrations.forEach(({ owner, panel }) => {
          var _a2, _b;
          if (!owner.open) return;
          const inOwner = (_a2 = owner.contains) == null ? void 0 : _a2.call(owner, event.target);
          const inPanel = (_b = panel.contains) == null ? void 0 : _b.call(panel, event.target);
          if (!inOwner && !inPanel) close(owner);
        });
      };
      documentRef.addEventListener("pointerdown", closeOutside, true);
      documentRef.addEventListener("focusin", closeOutside, true);
    }
    function focusFirstControl(panel) {
      var _a, _b;
      for (const selector of [
        "button:not([disabled])",
        "input:not([disabled])",
        "[tabindex='0']"
      ]) {
        const focusable = (_a = panel.querySelector) == null ? void 0 : _a.call(panel, selector);
        if (focusable == null ? void 0 : focusable.focus) {
          focusable.focus();
          return;
        }
      }
      (_b = panel == null ? void 0 : panel.focus) == null ? void 0 : _b.call(panel);
    }
    function bind(owner, panel, preferredWidth) {
      var _a, _b, _c, _d, _e, _f, _g;
      if (!owner || !panel || owner.__quizifyFloatingPanelBound) return;
      owner.__quizifyFloatingPanelBound = true;
      owner.__quizifyFloatingPanel = panel;
      panel.__quizifyFloatingOwner = owner;
      panel.hidden = true;
      panel.setAttribute("tabindex", "-1");
      const registration = { owner, panel, preferredWidth };
      registrations.add(registration);
      const anchor = (_a = owner.querySelector) == null ? void 0 : _a.call(owner, "summary");
      const panelId = `quizify-floating-panel-${registrations.size}`;
      panel.id = panelId;
      panel.setAttribute("role", "dialog");
      const explicitPanelLabel = String(((_b = panel.getAttribute) == null ? void 0 : _b.call(panel, "aria-label")) || "").trim();
      panel.setAttribute(
        "aria-label",
        explicitPanelLabel || ((_c = anchor == null ? void 0 : anchor.getAttribute) == null ? void 0 : _c.call(anchor, "aria-label")) || (anchor == null ? void 0 : anchor.textContent) || t("editor.tool_panel")
      );
      (_d = anchor == null ? void 0 : anchor.setAttribute) == null ? void 0 : _d.call(anchor, "aria-controls", panelId);
      (_e = anchor == null ? void 0 : anchor.setAttribute) == null ? void 0 : _e.call(anchor, "aria-haspopup", "dialog");
      (_f = anchor == null ? void 0 : anchor.setAttribute) == null ? void 0 : _f.call(anchor, "aria-expanded", "false");
      (_g = anchor == null ? void 0 : anchor.addEventListener) == null ? void 0 : _g.call(anchor, "keydown", (event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          owner.__quizifyOpenedByKeyboard = true;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            owner.open = true;
          }
        }
      });
      owner.addEventListener("toggle", () => {
        var _a2, _b2;
        (_a2 = anchor == null ? void 0 : anchor.setAttribute) == null ? void 0 : _a2.call(anchor, "aria-expanded", String(Boolean(owner.open)));
        if (owner.open) {
          registrations.forEach(({ owner: itemOwner }) => {
            if (itemOwner !== owner) close(itemOwner);
          });
          documentRef.body.appendChild(panel);
          panel.hidden = false;
          addClassName(panel, "quizify-panel-portal");
          position(owner, panel, preferredWidth);
          if (owner.__quizifyOpenedByKeyboard) {
            owner.__quizifyOpenedByKeyboard = false;
            (_b2 = root.setTimeout) == null ? void 0 : _b2.call(root, () => focusFirstControl(panel), 0);
          }
        } else {
          close(owner);
        }
      });
      bindGlobalEvents();
    }
    function closeAll() {
      registrations.forEach(({ owner }) => close(owner));
    }
    return Object.freeze({ bind, closeAll, closeTop, update });
  }

  // src/editor/text-commands.js
  function offsetPosition(start, value, offset) {
    if (!start || !Number.isInteger(start.line) || !Number.isInteger(start.ch)) return null;
    const before = String(value).slice(0, Math.max(0, offset)).split("\n");
    return before.length === 1 ? { line: start.line, ch: start.ch + before[0].length } : { line: start.line + before.length - 1, ch: before.at(-1).length };
  }
  function applyInsertedSelection(editor, start, value, selection) {
    if (!selection || !start) return;
    const from = offsetPosition(start, value, selection.start);
    const to = offsetPosition(start, value, selection.end);
    if (!from || !to) return;
    const doc = typeof (editor == null ? void 0 : editor.getDoc) === "function" ? editor.getDoc() : editor == null ? void 0 : editor.doc;
    if (typeof (editor == null ? void 0 : editor.setSelection) === "function") editor.setSelection(from, to);
    else if (typeof (doc == null ? void 0 : doc.setSelection) === "function") doc.setSelection(from, to);
  }
  function editorDocument(editor) {
    return typeof (editor == null ? void 0 : editor.getDoc) === "function" ? editor.getDoc() : editor == null ? void 0 : editor.doc;
  }
  function copyPosition(position) {
    if (!position || !Number.isInteger(position.line) || !Number.isInteger(position.ch)) {
      return null;
    }
    return { line: position.line, ch: position.ch };
  }
  function captureEditorSelection(editor) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (!editor) return null;
    if (editor.cm) return captureEditorSelection(editor.cm);
    const selection = (_b = (_a = editor.state) == null ? void 0 : _a.selection) == null ? void 0 : _b.main;
    if (selection) {
      const anchor2 = Number.isInteger(selection.anchor) ? selection.anchor : selection.from;
      const head2 = Number.isInteger(selection.head) ? selection.head : selection.to;
      if (Number.isInteger(anchor2) && Number.isInteger(head2)) {
        return { kind: "offset", anchor: anchor2, head: head2 };
      }
    }
    const doc = editorDocument(editor);
    const range = ((_d = (_c = doc == null ? void 0 : doc.listSelections) == null ? void 0 : _c.call(doc)) == null ? void 0 : _d[0]) || ((_f = (_e = editor.listSelections) == null ? void 0 : _e.call(editor)) == null ? void 0 : _f[0]);
    const anchor = copyPosition(range == null ? void 0 : range.anchor);
    const head = copyPosition(range == null ? void 0 : range.head);
    if (anchor && head) return { kind: "position", anchor, head };
    const from = copyPosition(
      ((_g = editor.getCursor) == null ? void 0 : _g.call(editor, "from")) || ((_h = doc == null ? void 0 : doc.getCursor) == null ? void 0 : _h.call(doc, "from"))
    );
    const to = copyPosition(((_i = editor.getCursor) == null ? void 0 : _i.call(editor, "to")) || ((_j = doc == null ? void 0 : doc.getCursor) == null ? void 0 : _j.call(doc, "to")));
    return from && to ? { kind: "position", anchor: from, head: to } : null;
  }
  function restoreEditorSelection(editor, snapshot) {
    if (!editor || !snapshot) return false;
    if (editor.cm) return restoreEditorSelection(editor.cm, snapshot);
    if (snapshot.kind === "offset" && typeof editor.dispatch === "function") {
      editor.dispatch({
        selection: { anchor: snapshot.anchor, head: snapshot.head },
        scrollIntoView: true
      });
      return true;
    }
    if (snapshot.kind !== "position") return false;
    const doc = editorDocument(editor);
    if (typeof editor.setSelection === "function") {
      editor.setSelection(snapshot.anchor, snapshot.head);
      return true;
    }
    if (typeof (doc == null ? void 0 : doc.setSelection) === "function") {
      doc.setSelection(snapshot.anchor, snapshot.head);
      return true;
    }
    return false;
  }
  function replaceEditorSelection(editor, value, selection = null) {
    var _a, _b, _c;
    if (!editor) return false;
    const doc = editorDocument(editor);
    const start = typeof editor.getCursor === "function" && editor.getCursor("from") || typeof (doc == null ? void 0 : doc.getCursor) === "function" && doc.getCursor("from") || null;
    if (typeof editor.replaceSelection === "function") {
      editor.replaceSelection(value);
      applyInsertedSelection(editor, start, value, selection);
      return true;
    }
    if (typeof (doc == null ? void 0 : doc.replaceSelection) === "function") {
      doc.replaceSelection(value);
      applyInsertedSelection(editor, start, value, selection);
      return true;
    }
    if (typeof ((_a = editor.cm) == null ? void 0 : _a.replaceSelection) === "function") {
      return replaceEditorSelection(editor.cm, value, selection);
    }
    const currentSelection = (_c = (_b = editor.state) == null ? void 0 : _b.selection) == null ? void 0 : _c.main;
    if (currentSelection && typeof editor.dispatch === "function") {
      const insertedSelection = selection || { start: value.length, end: value.length };
      editor.dispatch({
        changes: {
          from: currentSelection.from,
          to: currentSelection.to,
          insert: value
        },
        selection: {
          anchor: currentSelection.from + insertedSelection.start,
          head: currentSelection.from + insertedSelection.end
        },
        scrollIntoView: true
      });
      return true;
    }
    return false;
  }
  function readEditorSelection(editor) {
    var _a, _b, _c, _d, _e;
    if (typeof (editor == null ? void 0 : editor.getSelection) === "function") return editor.getSelection();
    const doc = editorDocument(editor);
    if (typeof (doc == null ? void 0 : doc.getSelection) === "function") return doc.getSelection();
    if (typeof ((_a = editor == null ? void 0 : editor.cm) == null ? void 0 : _a.getSelection) === "function") return editor.cm.getSelection();
    const selection = (_c = (_b = editor == null ? void 0 : editor.state) == null ? void 0 : _b.selection) == null ? void 0 : _c.main;
    if (selection && typeof ((_e = (_d = editor.state) == null ? void 0 : _d.doc) == null ? void 0 : _e.sliceString) === "function") {
      return editor.state.doc.sliceString(selection.from, selection.to);
    }
    return "";
  }
  function placeholderSelection(value, preferred = null) {
    const source = String(value || "");
    const preferredContent = String(preferred || "");
    const content = (preferredContent && source.includes(preferredContent) ? preferredContent : null) || [
      /\{\{([^{}\n]+)\}\}/,
      /\[\[([^|\]\n]+)\|\|/,
      /\[([^\]\n]+)\]\^\(/,
      /^:::\s+(.+)$/m,
      /^===\s+(.+)$/m,
      /!audio\[([^\]]+)\]/,
      /^::::\s+recite[^\n]*\n([^\n]+)/m,
      /^::::\s+occlusion[^\n]*url="([^"]+)"/m
    ].map((pattern) => {
      var _a;
      return (_a = pattern.exec(source)) == null ? void 0 : _a[1];
    }).find(Boolean);
    if (!content) return null;
    const start = source.indexOf(content);
    return start >= 0 ? { start, end: start + content.length } : null;
  }
  function snippetInsertion(snippet, placeholder = null, selection = "") {
    const template = String(snippet || "");
    const selected = String(selection != null ? selection : "");
    const target = placeholderSelection(template, placeholder);
    if (!selected) {
      return { value: template, selection: target };
    }
    if (!target) return null;
    return {
      value: `${template.slice(0, target.start)}${selected}${template.slice(target.end)}`,
      selection: {
        start: target.start,
        end: target.start + selected.length
      }
    };
  }
  function markdownSelection(action, selection, value) {
    const selected = String(selection || "");
    if ((action.id === "link" || action.id === "image") && selected) {
      const urlStart = value.lastIndexOf("url");
      return urlStart >= 0 ? { start: urlStart, end: urlStart + 3 } : null;
    }
    if (selected) {
      const selectedStart = value.indexOf(selected);
      return selectedStart >= 0 ? { start: selectedStart, end: selectedStart + selected.length } : { start: 0, end: value.trimEnd().length };
    }
    return placeholderSelection(value, selected || action.placeholder || "");
  }

  // src/shared/anki-field.js
  function decodeAnkiFieldHtml(html, documentRef = globalThis.document) {
    var _a;
    const text = String(html != null ? html : "").replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n");
    const decoder = ((_a = documentRef == null ? void 0 : documentRef.createElement) == null ? void 0 : _a.call(documentRef, "textarea")) || null;
    const fallback = () => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
    if (!decoder) return fallback();
    decoder.innerHTML = text;
    return typeof decoder.value === "string" ? decoder.value : fallback();
  }

  // node_modules/lucide/dist/esm/icons/audio-lines.mjs
  var AudioLines = [
    ["path", { d: "M2 10v3" }],
    ["path", { d: "M6 6v11" }],
    ["path", { d: "M10 3v18" }],
    ["path", { d: "M14 8v7" }],
    ["path", { d: "M18 5v13" }],
    ["path", { d: "M22 10v3" }]
  ];

  // node_modules/lucide/dist/esm/icons/badge-alert.mjs
  var BadgeAlert = [
    [
      "path",
      {
        d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      }
    ],
    ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
    ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }]
  ];

  // node_modules/lucide/dist/esm/icons/bold.mjs
  var Bold = [
    ["path", { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" }]
  ];

  // node_modules/lucide/dist/esm/icons/book-open-check.mjs
  var BookOpenCheck = [
    ["path", { d: "M12 5v16" }],
    ["path", { d: "m16 12 2 2 4-4" }],
    [
      "path",
      {
        d: "M22 6V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2h4.001A2 2 0 0022 17v-1.344"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/braces.mjs
  var Braces = [
    ["path", { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" }],
    ["path", { d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" }]
  ];

  // node_modules/lucide/dist/esm/icons/check.mjs
  var Check = [["path", { d: "M20 6 9 17l-5-5" }]];

  // node_modules/lucide/dist/esm/icons/chevron-down.mjs
  var ChevronDown = [["path", { d: "m6 9 6 6 6-6" }]];

  // node_modules/lucide/dist/esm/icons/circle-alert.mjs
  var CircleAlert = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
    ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }]
  ];

  // node_modules/lucide/dist/esm/icons/circle-check.mjs
  var CircleCheck = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m9 12 2 2 4-4" }]
  ];

  // node_modules/lucide/dist/esm/icons/circle-dot.mjs
  var CircleDot = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["circle", { cx: "12", cy: "12", r: "1" }]
  ];

  // node_modules/lucide/dist/esm/icons/circle-question-mark.mjs
  var CircleQuestionMark = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
    ["path", { d: "M12 17h.01" }]
  ];

  // node_modules/lucide/dist/esm/icons/circle-x.mjs
  var CircleX = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m15 9-6 6" }],
    ["path", { d: "m9 9 6 6" }]
  ];

  // node_modules/lucide/dist/esm/icons/code-xml.mjs
  var CodeXml = [
    ["path", { d: "m18 16 4-4-4-4" }],
    ["path", { d: "m6 8-4 4 4 4" }],
    ["path", { d: "m14.5 4-5 16" }]
  ];

  // node_modules/lucide/dist/esm/icons/code.mjs
  var Code = [
    ["path", { d: "m16 18 6-6-6-6" }],
    ["path", { d: "m8 6-6 6 6 6" }]
  ];

  // node_modules/lucide/dist/esm/icons/eye-off.mjs
  var EyeOff = [
    [
      "path",
      {
        d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
      }
    ],
    ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
    [
      "path",
      {
        d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
      }
    ],
    ["path", { d: "m2 2 20 20" }]
  ];

  // node_modules/lucide/dist/esm/icons/eye.mjs
  var Eye = [
    [
      "path",
      {
        d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
      }
    ],
    ["circle", { cx: "12", cy: "12", r: "3" }]
  ];

  // node_modules/lucide/dist/esm/icons/flip-horizontal-2.mjs
  var FlipHorizontal2 = [
    ["path", { d: "m3 7 5 5-5 5V7" }],
    ["path", { d: "m21 7-5 5 5 5V7" }],
    ["path", { d: "M12 20v2" }],
    ["path", { d: "M12 14v2" }],
    ["path", { d: "M12 8v2" }],
    ["path", { d: "M12 2v2" }]
  ];

  // node_modules/lucide/dist/esm/icons/focus.mjs
  var Focus = [
    ["circle", { cx: "12", cy: "12", r: "3" }],
    ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }],
    ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }],
    ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }]
  ];

  // node_modules/lucide/dist/esm/icons/heading-1.mjs
  var Heading1 = [
    ["path", { d: "M4 12h8" }],
    ["path", { d: "M4 18V6" }],
    ["path", { d: "M12 18V6" }],
    ["path", { d: "m17 12 3-2v8" }]
  ];

  // node_modules/lucide/dist/esm/icons/highlighter.mjs
  var Highlighter = [
    ["path", { d: "m9 11-6 6v3h9l3-3" }],
    ["path", { d: "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" }]
  ];

  // node_modules/lucide/dist/esm/icons/image.mjs
  var Image = [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
    ["circle", { cx: "9", cy: "9", r: "2" }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }]
  ];

  // node_modules/lucide/dist/esm/icons/info.mjs
  var Info = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }]
  ];

  // node_modules/lucide/dist/esm/icons/italic.mjs
  var Italic = [
    ["line", { x1: "19", x2: "10", y1: "4", y2: "4" }],
    ["line", { x1: "14", x2: "5", y1: "20", y2: "20" }],
    ["line", { x1: "15", x2: "9", y1: "4", y2: "20" }]
  ];

  // node_modules/lucide/dist/esm/icons/lightbulb.mjs
  var Lightbulb = [
    [
      "path",
      {
        d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
      }
    ],
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }]
  ];

  // node_modules/lucide/dist/esm/icons/link.mjs
  var Link = [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]
  ];

  // node_modules/lucide/dist/esm/icons/list-checks.mjs
  var ListChecks = [
    ["path", { d: "M13 5h8" }],
    ["path", { d: "M13 12h8" }],
    ["path", { d: "M13 19h8" }],
    ["path", { d: "m3 17 2 2 4-4" }],
    ["path", { d: "m3 7 2 2 4-4" }]
  ];

  // node_modules/lucide/dist/esm/icons/list-collapse.mjs
  var ListCollapse = [
    ["path", { d: "M10 5h11" }],
    ["path", { d: "M10 12h11" }],
    ["path", { d: "M10 19h11" }],
    ["path", { d: "m3 10 3-3-3-3" }],
    ["path", { d: "m3 20 3-3-3-3" }]
  ];

  // node_modules/lucide/dist/esm/icons/list-ordered.mjs
  var ListOrdered = [
    ["path", { d: "M11 5h10" }],
    ["path", { d: "M11 12h10" }],
    ["path", { d: "M11 19h10" }],
    ["path", { d: "M4 4h1v5" }],
    ["path", { d: "M4 9h2" }],
    ["path", { d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" }]
  ];

  // node_modules/lucide/dist/esm/icons/list.mjs
  var List = [
    ["path", { d: "M3 5h.01" }],
    ["path", { d: "M3 12h.01" }],
    ["path", { d: "M3 19h.01" }],
    ["path", { d: "M8 5h13" }],
    ["path", { d: "M8 12h13" }],
    ["path", { d: "M8 19h13" }]
  ];

  // node_modules/lucide/dist/esm/icons/loader-circle.mjs
  var LoaderCircle = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]];

  // node_modules/lucide/dist/esm/icons/message-square-text.mjs
  var MessageSquareText = [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
      }
    ],
    ["path", { d: "M7 11h10" }],
    ["path", { d: "M7 15h6" }],
    ["path", { d: "M7 7h8" }]
  ];

  // node_modules/lucide/dist/esm/icons/message-square-warning.mjs
  var MessageSquareWarning = [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
      }
    ],
    ["path", { d: "M12 15h.01" }],
    ["path", { d: "M12 7v4" }]
  ];

  // node_modules/lucide/dist/esm/icons/move.mjs
  var Move = [
    ["path", { d: "M12 2v20" }],
    ["path", { d: "m15 19-3 3-3-3" }],
    ["path", { d: "m19 9 3 3-3 3" }],
    ["path", { d: "M2 12h20" }],
    ["path", { d: "m5 9-3 3 3 3" }],
    ["path", { d: "m9 5 3-3 3 3" }]
  ];

  // node_modules/lucide/dist/esm/icons/panels-top-left.mjs
  var PanelsTopLeft = [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    ["path", { d: "M3 9h18" }],
    ["path", { d: "M9 21V9" }]
  ];

  // node_modules/lucide/dist/esm/icons/pause.mjs
  var Pause = [
    ["rect", { x: "14", y: "3", width: "5", height: "18", rx: "1" }],
    ["rect", { x: "5", y: "3", width: "5", height: "18", rx: "1" }]
  ];

  // node_modules/lucide/dist/esm/icons/play.mjs
  var Play = [
    [
      "path",
      { d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/quote.mjs
  var Quote = [
    [
      "path",
      {
        d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      }
    ],
    [
      "path",
      {
        d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/rotate-ccw.mjs
  var RotateCcw = [
    ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
    ["path", { d: "M3 3v5h5" }]
  ];

  // node_modules/lucide/dist/esm/icons/scan-eye.mjs
  var ScanEye = [
    ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }],
    ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }],
    ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }],
    ["circle", { cx: "12", cy: "12", r: "1" }],
    [
      "path",
      {
        d: "M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/shield-alert.mjs
  var ShieldAlert = [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      }
    ],
    ["path", { d: "M12 8v4" }],
    ["path", { d: "M12 16h.01" }]
  ];

  // node_modules/lucide/dist/esm/icons/shuffle.mjs
  var Shuffle = [
    ["path", { d: "m18 14 4 4-4 4" }],
    ["path", { d: "m18 2 4 4-4 4" }],
    ["path", { d: "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" }],
    ["path", { d: "M2 6h1.972a4 4 0 0 1 3.6 2.2" }],
    ["path", { d: "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" }]
  ];

  // node_modules/lucide/dist/esm/icons/square-check-big.mjs
  var SquareCheckBig = [
    ["path", { d: "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" }],
    ["path", { d: "m9 11 3 3L22 4" }]
  ];

  // node_modules/lucide/dist/esm/icons/square-code.mjs
  var SquareCode = [
    ["path", { d: "m10 9-3 3 3 3" }],
    ["path", { d: "m14 15 3-3-3-3" }],
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }]
  ];

  // node_modules/lucide/dist/esm/icons/square-dashed.mjs
  var SquareDashed = [
    ["path", { d: "M5 3a2 2 0 0 0-2 2" }],
    ["path", { d: "M19 3a2 2 0 0 1 2 2" }],
    ["path", { d: "M21 19a2 2 0 0 1-2 2" }],
    ["path", { d: "M5 21a2 2 0 0 1-2-2" }],
    ["path", { d: "M9 3h1" }],
    ["path", { d: "M9 21h1" }],
    ["path", { d: "M14 3h1" }],
    ["path", { d: "M14 21h1" }],
    ["path", { d: "M3 9v1" }],
    ["path", { d: "M21 9v1" }],
    ["path", { d: "M3 14v1" }],
    ["path", { d: "M21 14v1" }]
  ];

  // node_modules/lucide/dist/esm/icons/strikethrough.mjs
  var Strikethrough = [
    ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4" }],
    ["path", { d: "M14 12a4 4 0 0 1 0 8H6" }],
    ["line", { x1: "4", x2: "20", y1: "12", y2: "12" }]
  ];

  // node_modules/lucide/dist/esm/icons/subscript.mjs
  var Subscript = [
    ["path", { d: "m4 5 8 8" }],
    ["path", { d: "m12 5-8 8" }],
    [
      "path",
      {
        d: "M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/superscript.mjs
  var Superscript = [
    ["path", { d: "m4 19 8-8" }],
    ["path", { d: "m12 19-8-8" }],
    [
      "path",
      {
        d: "M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/table.mjs
  var Table = [
    ["path", { d: "M12 3v18" }],
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    ["path", { d: "M3 9h18" }],
    ["path", { d: "M3 15h18" }]
  ];

  // node_modules/lucide/dist/esm/icons/text-cursor-input.mjs
  var TextCursorInput = [
    ["path", { d: "M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6" }],
    ["path", { d: "M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7" }],
    ["path", { d: "M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1" }],
    ["path", { d: "M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1" }],
    ["path", { d: "M9 6v12" }]
  ];

  // node_modules/lucide/dist/esm/icons/triangle-alert.mjs
  var TriangleAlert = [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }]
  ];

  // node_modules/lucide/dist/esm/icons/x.mjs
  var X = [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }]
  ];

  // src/shared/icons.js
  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  var ROOT_ATTRIBUTES = Object.freeze({
    xmlns: SVG_NAMESPACE,
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false"
  });
  var ICON_NODES = Object.freeze({
    bold: Bold,
    italic: Italic,
    strikethrough: Strikethrough,
    "code-inline": Code,
    "inline-code": CodeXml,
    "code-block": SquareCode,
    link: Link,
    "heading-1": Heading1,
    quote: Quote,
    blockquote: Quote,
    highlight: Highlighter,
    superscript: Superscript,
    subscript: Subscript,
    alert: TriangleAlert,
    "github-alert": MessageSquareWarning,
    list: List,
    "unordered-list": List,
    "list-ordered": ListOrdered,
    "ordered-list": ListOrdered,
    image: Image,
    table: Table,
    fitb: TextCursorInput,
    choice: ListChecks,
    reveal: Eye,
    "reveal-card": CircleQuestionMark,
    annotation: MessageSquareText,
    collapse: ListCollapse,
    tabs: PanelsTopLeft,
    audio: AudioLines,
    recite: BookOpenCheck,
    occlusion: SquareDashed,
    preview: ScanEye,
    "status-ok": CircleCheck,
    "status-warning": CircleAlert,
    "status-error": CircleX,
    replay: RotateCcw,
    "rotate-ccw": RotateCcw,
    play: Play,
    pause: Pause,
    cancel: X,
    x: X,
    shuffle: Shuffle,
    info: Info,
    tip: Lightbulb,
    lightbulb: Lightbulb,
    important: BadgeAlert,
    caution: ShieldAlert,
    flip: FlipHorizontal2,
    "flip-horizontal-2": FlipHorizontal2,
    move: Move,
    loading: LoaderCircle,
    loader: LoaderCircle,
    focus: Focus,
    check: Check,
    eye: Eye,
    "eye-off": EyeOff,
    "circle-alert": CircleAlert,
    "triangle-alert": TriangleAlert,
    "chevron-down": ChevronDown,
    "check-square": SquareCheckBig,
    "panels-top-left": PanelsTopLeft,
    braces: Braces,
    "circle-dot": CircleDot,
    code: Code
  });
  var BRAND_NODES = Object.freeze([
    ["circle", Object.freeze({ cx: "11", cy: "11", r: "7.5" })],
    ["path", Object.freeze({ d: "m16.3 16.3 4.7 4.7" })],
    ["path", Object.freeze({ d: "m7.7 11.2 2.2 2.2 4.5-4.7" })]
  ]);
  var SAFE_ELEMENT_NAMES = /* @__PURE__ */ new Set([
    "circle",
    "ellipse",
    "line",
    "path",
    "polygon",
    "polyline",
    "rect"
  ]);
  var SAFE_NODE_ATTRIBUTES = /* @__PURE__ */ new Set([
    "cx",
    "cy",
    "d",
    "height",
    "points",
    "r",
    "rx",
    "ry",
    "width",
    "x",
    "x1",
    "x2",
    "y",
    "y1",
    "y2"
  ]);
  function normalizeClassName(className) {
    if (className === void 0 || className === null || className === "") return "";
    if (typeof className !== "string") {
      throw new TypeError("Icon className must be a string.");
    }
    const tokens = className.trim().split(/\s+/).filter(Boolean);
    if (tokens.some(
      (token) => !/^-?[_A-Za-z][_A-Za-z0-9-]*$/.test(token)
    )) {
      throw new TypeError("Icon className contains an unsafe CSS class token.");
    }
    return tokens.join(" ");
  }
  function getIconNodes(name) {
    if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(ICON_NODES, name)) {
      throw new RangeError(`Unknown Quizify icon: ${String(name)}`);
    }
    return ICON_NODES[name];
  }
  function checkedNode(node) {
    if (!Array.isArray(node) || node.length !== 2) {
      throw new TypeError("Invalid icon node.");
    }
    const [tagName, attributes] = node;
    if (!SAFE_ELEMENT_NAMES.has(tagName) || !attributes || typeof attributes !== "object") {
      throw new TypeError("Invalid icon node.");
    }
    for (const attributeName of Object.keys(attributes)) {
      if (!SAFE_NODE_ATTRIBUTES.has(attributeName)) {
        throw new TypeError(`Unsafe icon attribute: ${attributeName}`);
      }
    }
    return [tagName, attributes];
  }
  function rootAttributes(className) {
    const normalizedClassName = normalizeClassName(className);
    return normalizedClassName ? { ...ROOT_ATTRIBUTES, class: normalizedClassName } : ROOT_ATTRIBUTES;
  }
  function elementFromNodes(document2, nodes, className) {
    if (!document2 || typeof document2.createElementNS !== "function" && typeof document2.createElement !== "function") {
      throw new TypeError("A DOM document with an element factory is required.");
    }
    const usesNamespaceFactory = typeof document2.createElementNS === "function";
    const createElement = usesNamespaceFactory ? (tagName) => document2.createElementNS(SVG_NAMESPACE, tagName) : (tagName) => document2.createElement(tagName);
    const svg = createElement("svg");
    const attributes = rootAttributes(className);
    for (const [name, value] of Object.entries(attributes)) {
      svg.setAttribute(name, value);
    }
    if (!usesNamespaceFactory && attributes.class && typeof svg.className === "string") {
      svg.className = attributes.class;
    }
    for (const node of nodes) {
      const [tagName, attributes2] = checkedNode(node);
      const child = createElement(tagName);
      for (const [name, value] of Object.entries(attributes2)) {
        child.setAttribute(name, value);
      }
      if (typeof svg.append === "function") svg.append(child);
      else svg.appendChild(child);
    }
    return svg;
  }
  function createIconElement(document2, name, { className } = {}) {
    return elementFromNodes(document2, getIconNodes(name), className);
  }

  // src/editor/legacy-editor.js
  (() => {
    const adapter = loadAnkiEditorAdapter(globalThis);
    if (!adapter) {
      globalThis.quizifyEditorActivate = async () => {
        let notice = document.querySelector(".quizify-editor-unavailable");
        if (!notice) {
          notice = document.createElement("div");
          notice.className = "quizify-editor-unavailable";
          notice.setAttribute("lang", quizifyEditorLocale);
          notice.setAttribute("role", "alert");
          notice.textContent = t("editor.api_unavailable");
          (document.querySelector(".fields") || document.body).prepend(notice);
        }
        notice.hidden = false;
        return false;
      };
      globalThis.quizifyEditorDeactivate = async () => {
        const notice = document.querySelector(".quizify-editor-unavailable");
        if (notice) notice.hidden = true;
        return false;
      };
      return;
    }
    const {
      loaded,
      noteEditors: instances,
      plainTextLifecycle: lifecycle,
      plainTextInputs: plainTexts
    } = adapter;
    const active = () => document.body.classList.contains("quizify-editor-active");
    const syntax = globalThis.QuizifySyntax || {};
    const snippets = syntax.snippets || [];
    const markdownActions = syntax.markdownActions || [];
    const previewLimit = 80;
    const markdownButtonIcons = Object.freeze({ heading: "heading-1" });
    const snippetButtonIcons = Object.freeze([
      "fitb",
      "choice",
      "reveal",
      "annotation",
      "collapse",
      "tabs",
      "audio",
      "recite",
      "occlusion"
    ]);
    let validationTimer = null;
    let toolbarResizeObserver = null;
    let lastEditor = null;
    let lastFieldIndex = 0;
    let commandContext = null;
    let fieldNameCache = [];
    let shortcutsBound = false;
    let sessionVersion = 0;
    const managedFieldNames = /* @__PURE__ */ new Set(["Front", "Back"]);
    const boundEditors = /* @__PURE__ */ new WeakMap();
    const boundElements = /* @__PURE__ */ new WeakSet();
    const floatingPanelManager = createFloatingPanelManager(globalThis, document);
    function installPlainTextPolicy() {
      var _a;
      if (!quizifyNotetypeId) return false;
      if (((_a = globalThis.__quizifyPlainTextPolicyState) == null ? void 0 : _a.notetypeId) === quizifyNotetypeId) {
        return false;
      }
      const setMetadata = globalThis.setNotetypeMeta;
      const setPlainTexts = globalThis.setPlainTexts;
      if (typeof setMetadata !== "function" || typeof setPlainTexts !== "function" || setPlainTexts.__quizifyPlainTextPolicy) {
        return false;
      }
      let currentMetadata = null;
      let cacheGeneration = 0;
      const metadataPolicy = (metadata) => {
        currentMetadata = metadata;
        return setMetadata(metadata);
      };
      const plainTextPolicy = (values) => {
        var _a2, _b;
        if (String((_a2 = currentMetadata == null ? void 0 : currentMetadata.id) != null ? _a2 : "") !== quizifyNotetypeId) {
          return setPlainTexts(values);
        }
        const requested = Array.from(
          values || [],
          (value, index) => quizifyPlainTextIndices.has(index) ? true : value
        );
        const actual = currentMetadata;
        const cacheBreaker = {
          ...actual,
          modTime: `quizify:${String((_b = actual.modTime) != null ? _b : "unknown")}:${++cacheGeneration}`
        };
        setMetadata(cacheBreaker);
        try {
          return setPlainTexts(requested);
        } finally {
          setMetadata(actual);
        }
      };
      plainTextPolicy.__quizifyPlainTextPolicy = true;
      globalThis.__quizifyPlainTextPolicyState = {
        notetypeId: quizifyNotetypeId,
        plainTextIndices: quizifyPlainTextIndices
      };
      globalThis.setNotetypeMeta = metadataPolicy;
      globalThis.setPlainTexts = plainTextPolicy;
      return true;
    }
    installPlainTextPolicy();
    loaded.then(installPlainTextPolicy);
    async function noteFields() {
      const noteEditor = instances.find((instance) => instance == null ? void 0 : instance.fields) || instances[0];
      const noteFields2 = await (noteEditor == null ? void 0 : noteEditor.fields) || [];
      fieldNameCache = noteFields2.map((field) => (field == null ? void 0 : field.name) || "");
      return noteFields2;
    }
    function nextPaint() {
      if (typeof globalThis.requestAnimationFrame !== "function") {
        return Promise.resolve();
      }
      return new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
    }
    function setOption(name, value) {
      plainTexts.forEach((input) => setEditorOption(editorForInput(input), name, value));
    }
    function editorForInput(input) {
      return normalizeEditor((input == null ? void 0 : input.codeMirror) || (input == null ? void 0 : input.cm) || (input == null ? void 0 : input.editor) || input);
    }
    function looksLikeEditor(value) {
      var _a, _b, _c, _d;
      return Boolean(
        value && (typeof value.replaceSelection === "function" || typeof value.getValue === "function" || typeof value.getDoc === "function" || typeof ((_a = value.cm) == null ? void 0 : _a.replaceSelection) === "function" || typeof ((_b = value.cm) == null ? void 0 : _b.getValue) === "function" || typeof ((_d = (_c = value.state) == null ? void 0 : _c.doc) == null ? void 0 : _d.toString) === "function")
      );
    }
    function codeMirrorFromNode(node) {
      var _a, _b;
      return normalizeEditor((node == null ? void 0 : node.CodeMirror) || ((_b = (_a = node == null ? void 0 : node.closest) == null ? void 0 : _a.call(node, ".CodeMirror")) == null ? void 0 : _b.CodeMirror));
    }
    function normalizeEditor(value) {
      if (!value) return null;
      if (looksLikeEditor(value)) return value;
      const nested = [
        value.cm,
        value.editor,
        value.codeMirror,
        value.view,
        value.instance
      ];
      for (const item of nested) {
        if (looksLikeEditor(item)) return item;
      }
      const element = value.element || value.node || value.dom || value.wrapper || value.root;
      if (element == null ? void 0 : element.querySelector) {
        return codeMirrorFromNode(element.querySelector(".CodeMirror")) || codeMirrorFromNode(element);
      }
      return null;
    }
    function fieldContainers() {
      var _a;
      return Array.from(((_a = document.querySelectorAll) == null ? void 0 : _a.call(document, ".field-container[data-index]")) || []);
    }
    function fieldContainer(index) {
      return fieldContainers().find((element) => Number(element.dataset.index) === index) || fieldContainers()[index] || null;
    }
    function editorFromDom(index) {
      var _a;
      return codeMirrorFromNode((_a = fieldContainer(index)) == null ? void 0 : _a.querySelector(".CodeMirror"));
    }
    function editorForField(index) {
      return editorForInput(plainTexts[index]) || editorFromDom(index);
    }
    function domFieldName(index) {
      var _a, _b, _c;
      const container = fieldContainer(index);
      for (const selector of [".label-name", ".field-name", ".field-label", "label"]) {
        const text = (_c = (_b = (_a = container == null ? void 0 : container.querySelector) == null ? void 0 : _a.call(container, selector)) == null ? void 0 : _b.textContent) == null ? void 0 : _c.trim();
        if (text) return text;
      }
      return "";
    }
    function rawFieldName(index) {
      return domFieldName(index) || fieldNameCache[index] || "";
    }
    function fieldName(index) {
      return rawFieldName(index) || t("editor.field_index", { index: index + 1 });
    }
    function fieldDisplayName(entry) {
      if (!entry) return t("editor.field_none");
      const name = rawFieldName(entry.index);
      return name ? t("editor.field_named", { name }) : t("editor.field_index", { index: entry.index + 1 });
    }
    function isManagedEntry(entry) {
      return Boolean(entry && managedFieldNames.has(rawFieldName(entry.index)));
    }
    function allFieldEditors() {
      const count = Math.max(plainTexts.length, fieldContainers().length, fieldNameCache.length);
      return Array.from({ length: count }, (_, index) => ({
        field: index + 1,
        index,
        name: fieldName(index),
        editor: editorForField(index),
        container: fieldContainer(index)
      }));
    }
    function rememberEditor(editor, index = lastFieldIndex) {
      if (Number.isInteger(index)) lastFieldIndex = index;
      if (editor) lastEditor = editor;
    }
    function rememberCommandContext(entry = null) {
      const target = entry || currentFieldEntry();
      if (!isManagedEntry(target) || !(target == null ? void 0 : target.editor)) return null;
      rememberEditor(target.editor, target.index);
      commandContext = {
        editor: target.editor,
        index: target.index,
        selection: captureEditorSelection(target.editor)
      };
      return commandContext;
    }
    function commandEntry() {
      const context = commandContext;
      const entries = allFieldEditors();
      const entry = context ? entries.find(
        (item) => item.index === context.index && item.editor === context.editor
      ) : currentFieldEntry();
      if (!isManagedEntry(entry) || !(entry == null ? void 0 : entry.editor)) return null;
      if ((context == null ? void 0 : context.editor) === entry.editor) {
        restoreEditorSelection(entry.editor, context.selection);
      }
      rememberEditor(entry.editor, entry.index);
      return entry;
    }
    function bindCommandActivation(button, callback) {
      const preserve = () => rememberCommandContext();
      button.addEventListener("pointerdown", preserve);
      button.addEventListener("mousedown", (event) => {
        preserve();
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const entry = commandEntry();
        if (!entry) return;
        callback(entry);
        rememberCommandContext(entry);
      });
    }
    function bindPanelSelectionPreservation(summary) {
      const preserve = () => rememberCommandContext();
      summary.addEventListener("pointerdown", preserve);
      summary.addEventListener("mousedown", (event) => {
        preserve();
        event.preventDefault();
      });
    }
    function editorHasFocus(editor) {
      var _a, _b, _c, _d, _e;
      if (!editor) return false;
      if (typeof editor.hasFocus === "function") return editor.hasFocus();
      if (typeof editor.hasFocus === "boolean") return editor.hasFocus;
      if (typeof ((_a = editor.cm) == null ? void 0 : _a.hasFocus) === "function") return editor.cm.hasFocus();
      if (typeof editor.getWrapperElement === "function") {
        return ((_c = (_b = editor.getWrapperElement()) == null ? void 0 : _b.contains) == null ? void 0 : _c.call(_b, document.activeElement)) || false;
      }
      return ((_e = (_d = editor.dom) == null ? void 0 : _d.contains) == null ? void 0 : _e.call(_d, document.activeElement)) || false;
    }
    function currentFieldEntry() {
      const entries = allFieldEditors();
      const focused = entries.find((entry) => editorHasFocus(entry.editor));
      if (focused == null ? void 0 : focused.editor) {
        rememberEditor(focused.editor, focused.index);
        return focused;
      }
      const remembered = entries.find(
        (entry) => entry.index === lastFieldIndex && (entry.editor || entry.container)
      );
      if (remembered) {
        rememberEditor(remembered.editor, remembered.index);
        return remembered;
      }
      const fromLastEditor = entries.find((entry) => entry.editor && entry.editor === lastEditor);
      if (fromLastEditor) {
        rememberEditor(fromLastEditor.editor, fromLastEditor.index);
        return fromLastEditor;
      }
      const first = entries.find((entry) => entry.editor || entry.container);
      if (first == null ? void 0 : first.editor) rememberEditor(first.editor, first.index);
      return first || null;
    }
    function focusedEditor() {
      const entry = currentFieldEntry();
      if (entry == null ? void 0 : entry.editor) rememberEditor(entry.editor, entry.index);
      return (entry == null ? void 0 : entry.editor) || null;
    }
    function fieldEntryForTarget(target) {
      var _a;
      const container = (_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, ".field-container[data-index]");
      if (!container) return null;
      const index = Number(container.dataset.index);
      if (!Number.isInteger(index)) return null;
      const entry = allFieldEditors().find((item) => item.index === index) || null;
      if (entry == null ? void 0 : entry.editor) rememberEditor(entry.editor, entry.index);
      return entry;
    }
    function focusEditor(editor) {
      var _a;
      if (typeof editor.focus === "function") {
        editor.focus();
      } else if (typeof ((_a = editor.cm) == null ? void 0 : _a.focus) === "function") {
        editor.cm.focus();
      }
    }
    function editorValue(editor) {
      var _a, _b, _c, _d;
      if (typeof (editor == null ? void 0 : editor.getValue) === "function") return editor.getValue();
      if (typeof (editor == null ? void 0 : editor.getDoc) === "function" && typeof ((_a = editor.getDoc()) == null ? void 0 : _a.getValue) === "function") {
        return editor.getDoc().getValue();
      }
      if (typeof ((_b = editor == null ? void 0 : editor.cm) == null ? void 0 : _b.getValue) === "function") return editor.cm.getValue();
      if (typeof ((_d = (_c = editor == null ? void 0 : editor.state) == null ? void 0 : _c.doc) == null ? void 0 : _d.toString) === "function") {
        return editor.state.doc.toString();
      }
      return "";
    }
    function domEditorValue(container) {
      var _a;
      const lines = Array.from(((_a = container == null ? void 0 : container.querySelectorAll) == null ? void 0 : _a.call(container, ".CodeMirror-code pre")) || []);
      return lines.map((line) => line.textContent.replace(/\u200b/g, "")).join("\n").trimEnd();
    }
    function setEditorOption(editor, name, value) {
      var _a;
      if (typeof (editor == null ? void 0 : editor.setOption) === "function") return editor.setOption(name, value);
      if (typeof ((_a = editor == null ? void 0 : editor.cm) == null ? void 0 : _a.setOption) === "function") return editor.cm.setOption(name, value);
      return void 0;
    }
    function insertSnippet(snippet, targetEntry = null, placeholder = null) {
      var _a;
      if (!active()) return false;
      const entry = targetEntry || currentFieldEntry();
      if (!isManagedEntry(entry)) return false;
      const editor = (entry == null ? void 0 : entry.editor) || focusedEditor();
      if (!editor) return false;
      const insertion = snippetInsertion(
        snippet,
        placeholder,
        readEditorSelection(editor)
      );
      if (!insertion) return false;
      if (!replaceEditorSelection(editor, insertion.value, insertion.selection)) return false;
      rememberEditor(editor, (_a = entry == null ? void 0 : entry.index) != null ? _a : lastFieldIndex);
      focusEditor(editor);
      rememberCommandContext(entry);
      scheduleValidation();
      return true;
    }
    function insertMarkdownAction(action, targetEntry = null) {
      var _a;
      if (!active()) return false;
      const entry = targetEntry || currentFieldEntry();
      if (!isManagedEntry(entry)) return false;
      const editor = (entry == null ? void 0 : entry.editor) || focusedEditor();
      if (!editor) return false;
      const selection = readEditorSelection(editor);
      const value = typeof syntax.formatMarkdownAction === "function" ? syntax.formatMarkdownAction(action, selection) : `${action.prefix || ""}${selection || action.placeholder || ""}${action.suffix || ""}`;
      if (!replaceEditorSelection(editor, value, markdownSelection(action, selection, value))) return false;
      rememberEditor(editor, (_a = entry == null ? void 0 : entry.index) != null ? _a : lastFieldIndex);
      focusEditor(editor);
      rememberCommandContext(entry);
      scheduleValidation();
      return true;
    }
    function toolbarStatus() {
      return document.querySelector(".quizify-diagnostics-status");
    }
    function icon(name, className) {
      const element = createIconElement(document, name, { className });
      element.setAttribute("aria-hidden", "true");
      return element;
    }
    function updateDiagnosticsStatus(status, state, label) {
      const accessibleLabel = String(label || "");
      const labelNode = document.createElement("span");
      labelNode.className = "quizify-visually-hidden";
      labelNode.textContent = accessibleLabel;
      status.replaceChildren(
        icon(`status-${state}`, "quizify-command-icon quizify-status-icon"),
        labelNode
      );
      status.dataset.state = state;
      status.title = accessibleLabel;
      status.setAttribute("aria-label", accessibleLabel);
    }
    function diagnosticsList() {
      return document.querySelector(".quizify-diagnostics-list");
    }
    function previewList() {
      return document.querySelector(".quizify-preview-list");
    }
    function previewFieldLabel() {
      return document.querySelector(".quizify-preview-field");
    }
    function previewCountLabel() {
      return document.querySelector(".quizify-preview-count");
    }
    function entryValue(entry) {
      const value = (entry == null ? void 0 : entry.editor) ? editorValue(entry.editor) : domEditorValue(entry == null ? void 0 : entry.container);
      return decodeAnkiFieldHtml(value, document);
    }
    function updateCommandAvailability(entry) {
      const enabled = Boolean(active() && isManagedEntry(entry) && (entry == null ? void 0 : entry.editor));
      for (const selector of [".quizify-markdown-button", ".quizify-snippet-button"]) {
        document.querySelectorAll(selector).forEach((button) => {
          button.disabled = !enabled;
          button.setAttribute("aria-disabled", String(!enabled));
        });
      }
      const hint = document.querySelector(".quizify-command-hint");
      if (hint) {
        hint.hidden = enabled;
        hint.textContent = active() ? t("editor.focus_managed_field") : t("editor.deactivated");
      }
    }
    function focusDiagnostic(entry, item) {
      var _a, _b;
      const editor = entry == null ? void 0 : entry.editor;
      if (!editor) return;
      const line = Math.max(0, Number((item == null ? void 0 : item.line) || 1) - 1);
      const ch = Math.max(0, Number((item == null ? void 0 : item.column) || 1) - 1);
      const doc = typeof editor.getDoc === "function" ? editor.getDoc() : editor.doc;
      if (typeof editor.setCursor === "function") editor.setCursor({ line, ch });
      else if (typeof (doc == null ? void 0 : doc.setCursor) === "function") doc.setCursor({ line, ch });
      else if (typeof ((_b = (_a = editor.state) == null ? void 0 : _a.doc) == null ? void 0 : _b.line) === "function" && typeof editor.dispatch === "function") {
        const targetLine = editor.state.doc.line(
          Math.min(line + 1, editor.state.doc.lines || line + 1)
        );
        const anchor = Math.min(targetLine.to, targetLine.from + ch);
        editor.dispatch({ selection: { anchor }, scrollIntoView: true });
      }
      rememberEditor(editor, entry.index);
      focusEditor(editor);
      scheduleValidation();
    }
    function updateToolbarContext(entry) {
      const displayName = fieldDisplayName(entry);
      const toolbar = document.querySelector(".quizify-toolbar");
      if (toolbar) {
        toolbar.setAttribute("aria-label", t("editor.toolbar_aria", { field: displayName }));
      }
      const previewSummary = document.querySelector(".quizify-command-summary");
      if (previewSummary) {
        previewSummary.title = t("editor.preview_for_title", { field: displayName });
        previewSummary.setAttribute(
          "aria-label",
          t("editor.preview_for_aria", { field: displayName })
        );
      }
    }
    function updatePreviewFieldLabel(entry) {
      const previewLabel = previewFieldLabel();
      const displayName = fieldDisplayName(entry);
      if (previewLabel) previewLabel.textContent = displayName;
    }
    function validateEditors() {
      if (!active() || typeof syntax.analyzeQuizifySyntax !== "function") return;
      const status = toolbarStatus();
      const list = diagnosticsList();
      if (!status || !list) return;
      const entry = currentFieldEntry();
      updateToolbarContext(entry);
      updateCommandAvailability(entry);
      const managedEntries = allFieldEditors().filter(
        (item) => isManagedEntry(item) && (item.editor || item.container)
      );
      if (!managedEntries.length) {
        updateDiagnosticsStatus(status, "warning", t("editor.select_field"));
        list.replaceChildren();
        renderPreview([], null);
        return;
      }
      const diagnostics = managedEntries.flatMap(
        (managedEntry) => syntax.analyzeQuizifySyntax(entryValue(managedEntry)).map((item) => ({
          ...item,
          field: managedEntry.field,
          fieldName: fieldName(managedEntry.index),
          entry: managedEntry
        }))
      );
      const previewEntry = isManagedEntry(entry) ? entry : managedEntries[0];
      const value = entryValue(previewEntry);
      const preview = typeof syntax.collectQuizifyPreview === "function" ? syntax.collectQuizifyPreview(value).map((item) => ({
        ...item,
        field: previewEntry.field,
        fieldName: fieldName(previewEntry.index)
      })) : [];
      const summary = syntax.summarizeDiagnostics(diagnostics);
      const state = diagnostics.some((item) => item.severity === "error") ? "error" : diagnostics.length ? "warning" : "ok";
      updateDiagnosticsStatus(status, state, summary);
      list.replaceChildren();
      for (const item of diagnostics.slice(0, 8)) {
        const row = document.createElement("li");
        row.dataset.severity = item.severity;
        row.textContent = t("editor.diagnostic", {
          field: t("editor.field_named", { name: item.fieldName }),
          line: item.line,
          message: item.message
        });
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", t("editor.diagnostic_jump", {
          field: t("editor.field_named", { name: item.fieldName }),
          line: item.line,
          message: item.message
        }));
        row.addEventListener("click", () => focusDiagnostic(item.entry, item));
        row.addEventListener("keydown", (event) => {
          var _a;
          if (event.key !== "Enter" && event.key !== " ") return;
          (_a = event.preventDefault) == null ? void 0 : _a.call(event);
          focusDiagnostic(item.entry, item);
        });
        list.appendChild(row);
      }
      if (diagnostics.length > 8) {
        const row = document.createElement("li");
        row.textContent = tn("editor.more_diagnostics", diagnostics.length - 8);
        list.appendChild(row);
      }
      renderPreview(preview, previewEntry);
    }
    function describePreview(item) {
      const meta = item.meta || {};
      if (item.kind === "fitb") return t("editor.preview_meta.fitb", { answer: meta.answer });
      if (item.kind === "single" || item.kind === "multiple") {
        return t("editor.preview_meta.choice", { options: meta.options, answers: meta.answers });
      }
      if (item.kind === "reveal") {
        return t("editor.preview_meta.reveal", { question: meta.question, answer: meta.answer });
      }
      if (item.kind === "annotation") {
        return t("editor.preview_meta.annotation", { text: meta.text, note: meta.note });
      }
      if (item.kind === "audio") return `${meta.title} -> ${meta.url}`;
      if (item.kind === "recite") {
        return t("editor.preview_meta.recite", { mask: meta.mask, mode: meta.mode });
      }
      if (item.kind === "occlusion") {
        return t("editor.preview_meta.occlusion", { image: meta.image, regions: meta.regions });
      }
      if (item.kind === "collapse" || item.kind === "tab") return meta.title;
      return "";
    }
    function renderPreview(preview, entry) {
      const list = previewList();
      if (!list) return;
      const count = previewCountLabel();
      if (count) {
        count.textContent = preview.length ? tn("editor.structure_count", preview.length) : t("editor.no_structures");
      }
      updatePreviewFieldLabel(entry);
      list.replaceChildren();
      if (!preview.length) {
        const row = document.createElement("li");
        row.className = "quizify-preview-empty";
        row.textContent = entry ? t("editor.no_quizify_structures", { field: fieldDisplayName(entry) }) : t("editor.select_field_for_structure");
        list.appendChild(row);
        return;
      }
      for (const item of preview.slice(0, previewLimit)) {
        const row = document.createElement("li");
        row.dataset.kind = item.kind;
        const kind = document.createElement("span");
        kind.className = "quizify-preview-kind";
        kind.textContent = item.title;
        row.appendChild(kind);
        const title = document.createElement("strong");
        title.textContent = t("editor.line", { line: item.line });
        row.appendChild(title);
        const detail = document.createElement("span");
        detail.className = "quizify-preview-detail";
        detail.textContent = describePreview(item);
        row.appendChild(detail);
        list.appendChild(row);
      }
      if (preview.length > previewLimit) {
        const row = document.createElement("li");
        row.className = "quizify-preview-empty";
        row.textContent = tn("editor.more_structures", preview.length - previewLimit);
        list.appendChild(row);
      }
    }
    function scheduleValidation() {
      clearTimeout(validationTimer);
      validationTimer = setTimeout(validateEditors, 120);
    }
    function bindEditor(input, index = lastFieldIndex) {
      const editor = editorForInput(input);
      bindEditorObject(editor, index);
    }
    function fieldIndexForInput(input) {
      var _a, _b;
      const direct = plainTexts.indexOf(input);
      if (direct >= 0) return direct;
      const editor = editorForInput(input);
      const matched = allFieldEditors().find((entry) => entry.editor === editor);
      if (matched) return matched.index;
      const element = (input == null ? void 0 : input.element) || (input == null ? void 0 : input.node) || (input == null ? void 0 : input.dom) || (input == null ? void 0 : input.wrapper) || (input == null ? void 0 : input.root);
      const container = (_a = element == null ? void 0 : element.closest) == null ? void 0 : _a.call(element, ".field-container[data-index]");
      const index = Number((_b = container == null ? void 0 : container.dataset) == null ? void 0 : _b.index);
      return Number.isInteger(index) ? index : lastFieldIndex;
    }
    function bindEditorObject(editor, index = lastFieldIndex) {
      var _a;
      if (!editor) return;
      const existing = boundEditors.get(editor);
      if (existing) {
        if (Number.isInteger(index)) existing.index = index;
        return;
      }
      const binding = { index: Number.isInteger(index) ? index : lastFieldIndex };
      boundEditors.set(editor, binding);
      const remember = () => {
        rememberEditor(editor, binding.index);
        const entry = allFieldEditors().find((item) => item.index === binding.index);
        if (entry) rememberCommandContext(entry);
        scheduleValidation();
      };
      if (typeof editor.on === "function") {
        editor.on("change", scheduleValidation);
        editor.on("focus", remember);
        editor.on("cursorActivity", remember);
      } else if (typeof ((_a = editor.cm) == null ? void 0 : _a.on) === "function") {
        editor.cm.on("change", scheduleValidation);
        editor.cm.on("focus", remember);
        editor.cm.on("cursorActivity", remember);
      }
    }
    function bindFieldElement(container, index) {
      if (!container || boundElements.has(container)) return;
      boundElements.add(container);
      const remember = (event) => {
        const editor = editorFromDom(index) || editorForField(index);
        rememberEditor(editor, index);
        const entry = allFieldEditors().find((item) => item.index === index);
        if (entry) rememberCommandContext(entry);
        scheduleValidation();
      };
      for (const name of ["focusin", "mousedown", "keyup", "input", "paste", "cut"]) {
        container.addEventListener(name, remember, true);
      }
    }
    function bindVisibleEditors() {
      allFieldEditors().forEach((entry) => {
        bindEditorObject(entry.editor, entry.index);
        bindFieldElement(entry.container, entry.index);
        setEditorOption(entry.editor, "lineWrapping", true);
      });
    }
    function shortcutFor(index) {
      return `Ctrl+Alt+${index + 1}`;
    }
    function shortcutAriaLabel(index) {
      return `Control+Alt+${index + 1}`;
    }
    function shortcutIndexForEvent(event) {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return -1;
      const key = String(event.key || "");
      const codeMatch = /^(?:Digit|Numpad)([1-9])$/.exec(String(event.code || ""));
      const digit = /^[1-9]$/.test(key) ? key : codeMatch == null ? void 0 : codeMatch[1];
      if (!digit) return -1;
      const index = Number(digit) - 1;
      return index >= 0 && index < snippets.length ? index : -1;
    }
    function handleShortcut(event) {
      var _a, _b, _c, _d, _e, _f;
      if (event.key === "Escape" && floatingPanelManager.closeTop(true)) {
        (_a = event.preventDefault) == null ? void 0 : _a.call(event);
        (_b = event.stopPropagation) == null ? void 0 : _b.call(event);
        return;
      }
      if (!active() || event.defaultPrevented || event.isComposing) return;
      const targetEntry = fieldEntryForTarget(event.target);
      if (!isManagedEntry(targetEntry) || !(targetEntry == null ? void 0 : targetEntry.editor)) return;
      const markdownAction = markdownActions.find((action) => {
        if (!action.key && !action.code) return false;
        const primary = event.ctrlKey || event.metaKey;
        if (!primary || event.altKey) return false;
        if (Boolean(action.shift) !== Boolean(event.shiftKey)) return false;
        if (action.code) return event.code === action.code;
        return String(event.key || "").toLowerCase() === action.key;
      });
      if (markdownAction) {
        if (!insertMarkdownAction(markdownAction, targetEntry)) return;
        (_c = event.preventDefault) == null ? void 0 : _c.call(event);
        (_d = event.stopPropagation) == null ? void 0 : _d.call(event);
        return;
      }
      const index = shortcutIndexForEvent(event);
      if (index < 0) return;
      if (!insertSnippet(snippets[index][1], targetEntry, snippets[index][2])) return;
      (_e = event.preventDefault) == null ? void 0 : _e.call(event);
      (_f = event.stopPropagation) == null ? void 0 : _f.call(event);
    }
    function bindShortcuts() {
      if (shortcutsBound) return;
      if (typeof document.addEventListener !== "function") return;
      document.addEventListener("keydown", handleShortcut, true);
      shortcutsBound = true;
    }
    function hasClassName2(element, name) {
      return String((element == null ? void 0 : element.className) || "").split(/\s+/).includes(name);
    }
    function addClassName2(element, name) {
      if (!element || hasClassName2(element, name)) return;
      element.className = `${element.className || ""} ${name}`.trim();
    }
    function removeClassName2(element, name) {
      if (!element) return;
      element.className = String(element.className || "").split(/\s+/).filter((item) => item && item !== name).join(" ");
    }
    function nativeEditorToolbar() {
      return document.querySelector(".note-editor > .editor-toolbar") || document.querySelector(".editor-toolbar");
    }
    function stopObservingToolbarResize() {
      var _a;
      (_a = toolbarResizeObserver == null ? void 0 : toolbarResizeObserver.disconnect) == null ? void 0 : _a.call(toolbarResizeObserver);
      toolbarResizeObserver = null;
    }
    function observeToolbarResize(toolbar) {
      stopObservingToolbarResize();
      const ResizeObserverCtor = globalThis.ResizeObserver;
      if (!toolbar || typeof ResizeObserverCtor !== "function") return;
      const observer = new ResizeObserverCtor(() => {
        if (toolbarResizeObserver !== observer || !active() || toolbar.isConnected === false) {
          return;
        }
        floatingPanelManager.update();
      });
      toolbarResizeObserver = observer;
      observer.observe(toolbar);
      const nativeToolbar = nativeEditorToolbar();
      if (nativeToolbar && nativeToolbar !== toolbar) observer.observe(nativeToolbar);
    }
    function insertAfter(reference, element) {
      var _a;
      if (!reference || !element) return false;
      if (typeof reference.after === "function") {
        reference.after(element);
        return true;
      }
      if ((_a = reference.parentNode) == null ? void 0 : _a.insertBefore) {
        reference.parentNode.insertBefore(element, reference.nextSibling || null);
        return true;
      }
      return false;
    }
    function dockToolbar(toolbar) {
      var _a;
      const nativeToolbar = nativeEditorToolbar();
      const siblings = Array.from(((_a = nativeToolbar == null ? void 0 : nativeToolbar.parentNode) == null ? void 0 : _a.children) || []);
      const alreadyDocked = siblings[siblings.indexOf(nativeToolbar) + 1] === toolbar;
      if ((nativeToolbar == null ? void 0 : nativeToolbar.parentNode) && (alreadyDocked || insertAfter(nativeToolbar, toolbar))) {
        addClassName2(toolbar, "quizify-toolbar-docked");
        toolbar.dataset.docked = "native";
        return;
      }
      removeClassName2(toolbar, "quizify-toolbar-docked");
      toolbar.dataset.docked = "fields";
      const host = document.querySelector(".fields") || document.body;
      host.prepend(toolbar);
    }
    function ensureToolbar() {
      const existing = document.querySelector(".quizify-toolbar");
      if (existing) {
        existing.hidden = false;
        dockToolbar(existing);
        observeToolbarResize(existing);
        bindShortcuts();
        return;
      }
      const toolbar = document.createElement("div");
      toolbar.className = "quizify-toolbar";
      toolbar.hidden = false;
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("lang", quizifyEditorLocale);
      toolbar.setAttribute(
        "aria-label",
        t("editor.toolbar_aria", { field: t("editor.field_none") })
      );
      toolbar.setAttribute("aria-orientation", "horizontal");
      const inspector = document.createElement("details");
      inspector.className = "quizify-inspector";
      const status = document.createElement("summary");
      status.className = "quizify-tool-button quizify-diagnostics-status";
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
      updateDiagnosticsStatus(status, "ok", t("syntax.summary.valid"));
      bindPanelSelectionPreservation(status);
      inspector.appendChild(status);
      const commands = document.createElement("div");
      commands.className = "quizify-command-bar";
      commands.setAttribute("aria-label", t("editor.commands_aria"));
      const commandHint = document.createElement("span");
      commandHint.className = "quizify-command-hint";
      commandHint.setAttribute("role", "status");
      commandHint.setAttribute("aria-live", "polite");
      commandHint.textContent = t("editor.focus_managed_field");
      toolbar.appendChild(commandHint);
      function createMarkdownButton(action) {
        const button = document.createElement("button");
        const shortcut = String(action.shortcut || "").trim();
        button.type = "button";
        button.className = "quizify-tool-button quizify-markdown-button";
        button.title = shortcut ? `${action.label} (${shortcut})` : action.label;
        button.dataset.action = action.id;
        button.dataset.label = action.label;
        button.disabled = true;
        button.setAttribute(
          "aria-label",
          shortcut ? t("editor.markdown_action_shortcut", { action: action.label, shortcut }) : t("editor.markdown_action", { action: action.label })
        );
        if (shortcut) {
          button.setAttribute("aria-keyshortcuts", shortcut.replace("Ctrl", "Control"));
        }
        button.setAttribute("aria-disabled", "true");
        button.appendChild(
          icon(
            markdownButtonIcons[action.id] || action.id,
            "quizify-command-icon quizify-markdown-icon"
          )
        );
        bindCommandActivation(button, (entry) => insertMarkdownAction(action, entry));
        return button;
      }
      markdownActions.forEach((action) => commands.appendChild(createMarkdownButton(action)));
      snippets.forEach(([label, snippet, placeholder], index) => {
        const shortcut = shortcutFor(index);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quizify-tool-button quizify-snippet-button";
        button.title = `${label} (${shortcut})`;
        button.dataset.label = label;
        button.dataset.shortcut = shortcut;
        button.disabled = true;
        button.setAttribute(
          "aria-label",
          t("editor.snippet_shortcut", { label, shortcut })
        );
        button.setAttribute("aria-keyshortcuts", shortcutAriaLabel(index));
        button.setAttribute("aria-disabled", "true");
        button.appendChild(
          icon(
            snippetButtonIcons[index],
            "quizify-command-icon quizify-snippet-icon"
          )
        );
        const shortcutText = document.createElement("kbd");
        shortcutText.className = "quizify-shortcut";
        shortcutText.textContent = shortcut;
        button.appendChild(shortcutText);
        bindCommandActivation(
          button,
          (entry) => insertSnippet(snippet, entry, placeholder)
        );
        commands.appendChild(button);
      });
      const previewMenu = document.createElement("details");
      previewMenu.className = "quizify-command-menu quizify-preview-menu";
      const previewSummary = document.createElement("summary");
      previewSummary.className = "quizify-tool-button quizify-command-summary";
      previewSummary.title = t("editor.interactive_preview");
      previewSummary.setAttribute("aria-label", t("editor.open_current_preview"));
      previewSummary.appendChild(
        icon("preview", "quizify-command-icon quizify-preview-icon")
      );
      bindPanelSelectionPreservation(previewSummary);
      previewMenu.appendChild(previewSummary);
      const livePreviewPanel = document.createElement("div");
      livePreviewPanel.className = "quizify-live-preview-panel";
      livePreviewPanel.setAttribute("aria-label", t("editor.current_preview_aria"));
      livePreviewPanel.dataset.loadingLabel = t("editor.preview_preparing");
      previewMenu.appendChild(livePreviewPanel);
      previewMenu.addEventListener("toggle", () => {
        var _a;
        if (!previewMenu.open) return;
        (_a = globalThis.quizifyLoadEditorPreview) == null ? void 0 : _a.call(globalThis).catch((error) => {
          livePreviewPanel.textContent = (error == null ? void 0 : error.message) || t("editor.preview_load_failed");
        });
      });
      floatingPanelManager.bind(previewMenu, livePreviewPanel, 860);
      commands.appendChild(inspector);
      commands.appendChild(previewMenu);
      toolbar.appendChild(commands);
      const diagnostics = document.createElement("ul");
      diagnostics.className = "quizify-diagnostics-list";
      const preview = document.createElement("section");
      preview.className = "quizify-preview";
      const previewHeader = document.createElement("div");
      previewHeader.className = "quizify-preview-header";
      const previewTitle = document.createElement("strong");
      previewTitle.textContent = t("editor.structure_preview");
      previewHeader.appendChild(previewTitle);
      const previewMeta = document.createElement("span");
      previewMeta.className = "quizify-preview-meta";
      const previewField = document.createElement("span");
      previewField.className = "quizify-preview-field";
      previewField.textContent = t("editor.field_index", { index: 1 });
      previewMeta.appendChild(previewField);
      const previewCount = document.createElement("span");
      previewCount.className = "quizify-preview-count";
      previewCount.textContent = t("editor.no_structures");
      previewMeta.appendChild(previewCount);
      previewHeader.appendChild(previewMeta);
      preview.appendChild(previewHeader);
      const previewItems = document.createElement("ol");
      previewItems.className = "quizify-preview-list";
      preview.appendChild(previewItems);
      const inspectorPanel = document.createElement("div");
      inspectorPanel.className = "quizify-inspector-panel";
      inspectorPanel.setAttribute("aria-label", t("editor.inspector_aria"));
      inspectorPanel.appendChild(diagnostics);
      inspectorPanel.appendChild(preview);
      inspector.appendChild(inspectorPanel);
      floatingPanelManager.bind(inspector, inspectorPanel, 760);
      dockToolbar(toolbar);
      observeToolbarResize(toolbar);
      bindShortcuts();
    }
    globalThis.quizifyEditorCurrentField = () => {
      if (!active()) return null;
      const entry = currentFieldEntry();
      return isManagedEntry(entry) ? {
        index: entry.index,
        name: fieldDisplayName(entry),
        value: entryValue(entry)
      } : null;
    };
    globalThis.quizifyEditorActivate = async () => {
      const version = ++sessionVersion;
      await loaded;
      if (version !== sessionVersion) return false;
      const noteFieldList = await noteFields();
      if (version !== sessionVersion) return false;
      lastEditor = null;
      lastFieldIndex = 0;
      commandContext = null;
      document.body.classList.add("quizify-editor-active");
      await nextPaint();
      if (version !== sessionVersion) return false;
      setOption("lineWrapping", true);
      ensureToolbar();
      plainTexts.forEach((input, index) => bindEditor(input, index));
      bindVisibleEditors();
      scheduleValidation();
      return true;
    };
    globalThis.quizifyEditorDeactivate = async () => {
      const version = ++sessionVersion;
      clearTimeout(validationTimer);
      validationTimer = null;
      stopObservingToolbarResize();
      floatingPanelManager.closeAll();
      document.body.classList.remove("quizify-editor-active");
      const toolbar = document.querySelector(".quizify-toolbar");
      if (toolbar) toolbar.hidden = true;
      updateCommandAvailability(null);
      lastEditor = null;
      lastFieldIndex = 0;
      commandContext = null;
      return true;
    };
    lifecycle.onMount((input) => {
      if (!active()) return;
      const index = fieldIndexForInput(input);
      setEditorOption(editorForInput(input), "lineWrapping", true);
      bindEditor(input, index);
      bindVisibleEditors();
      scheduleValidation();
    });
  })();
})();
/*! Bundled license information:

lucide/dist/esm/icons/audio-lines.mjs:
lucide/dist/esm/icons/badge-alert.mjs:
lucide/dist/esm/icons/bold.mjs:
lucide/dist/esm/icons/book-open-check.mjs:
lucide/dist/esm/icons/braces.mjs:
lucide/dist/esm/icons/check.mjs:
lucide/dist/esm/icons/chevron-down.mjs:
lucide/dist/esm/icons/circle-alert.mjs:
lucide/dist/esm/icons/circle-check.mjs:
lucide/dist/esm/icons/circle-dot.mjs:
lucide/dist/esm/icons/circle-question-mark.mjs:
lucide/dist/esm/icons/circle-x.mjs:
lucide/dist/esm/icons/code-xml.mjs:
lucide/dist/esm/icons/code.mjs:
lucide/dist/esm/icons/eye-off.mjs:
lucide/dist/esm/icons/eye.mjs:
lucide/dist/esm/icons/flip-horizontal-2.mjs:
lucide/dist/esm/icons/focus.mjs:
lucide/dist/esm/icons/heading-1.mjs:
lucide/dist/esm/icons/highlighter.mjs:
lucide/dist/esm/icons/image.mjs:
lucide/dist/esm/icons/info.mjs:
lucide/dist/esm/icons/italic.mjs:
lucide/dist/esm/icons/lightbulb.mjs:
lucide/dist/esm/icons/link.mjs:
lucide/dist/esm/icons/list-checks.mjs:
lucide/dist/esm/icons/list-collapse.mjs:
lucide/dist/esm/icons/list-ordered.mjs:
lucide/dist/esm/icons/list.mjs:
lucide/dist/esm/icons/loader-circle.mjs:
lucide/dist/esm/icons/message-square-text.mjs:
lucide/dist/esm/icons/message-square-warning.mjs:
lucide/dist/esm/icons/move.mjs:
lucide/dist/esm/icons/panels-top-left.mjs:
lucide/dist/esm/icons/pause.mjs:
lucide/dist/esm/icons/play.mjs:
lucide/dist/esm/icons/quote.mjs:
lucide/dist/esm/icons/rotate-ccw.mjs:
lucide/dist/esm/icons/scan-eye.mjs:
lucide/dist/esm/icons/shield-alert.mjs:
lucide/dist/esm/icons/shuffle.mjs:
lucide/dist/esm/icons/square-check-big.mjs:
lucide/dist/esm/icons/square-code.mjs:
lucide/dist/esm/icons/square-dashed.mjs:
lucide/dist/esm/icons/strikethrough.mjs:
lucide/dist/esm/icons/subscript.mjs:
lucide/dist/esm/icons/superscript.mjs:
lucide/dist/esm/icons/table.mjs:
lucide/dist/esm/icons/text-cursor-input.mjs:
lucide/dist/esm/icons/triangle-alert.mjs:
lucide/dist/esm/icons/x.mjs:
lucide/dist/esm/lucide.mjs:
  (**
   * @license lucide v1.27.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/

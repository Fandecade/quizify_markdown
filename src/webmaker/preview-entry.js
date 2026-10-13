/*
 * Standalone preview runtime for the offline card maker.
 *
 * The surface is a shadow root that loads `quizify-preview.css` (the very same
 * stylesheet the cards use, with the KaTeX fonts inlined so it works from
 * `file://`) and reuses the review pipeline, so the preview and Anki cannot
 * drift apart.
 */

import "../review/entry.js";
import { highlightCodeElement } from "../review/code.js";
import { katex } from "../review/dependencies.js";
import { enhanceOutlineLists } from "../review/outline.js";
import { utf8Size } from "../review/security.js";
import { enhanceMarkdownTables } from "../review/tables.js";
import {
  disposePreviewInteractions,
  initPreviewInteractions
} from "../editor/preview-runtime.js";
import { renderMathPlaceholders } from "../shared/math.js";

const SHELL_CSS = `
:host {
  display: block;
  color: var(--q-text);
  color-scheme: light;
  font-family: var(--q-font);
  font-size: 15px;
  line-height: 1.72;
}
:host(.nightMode) {
  color-scheme: dark;
}
.container {
  padding-top: clamp(20px, 4vw, 34px);
}
.quizify-field {
  min-height: 72px;
}
.quizify-field:empty::before {
  content: attr(data-empty-label);
  color: var(--q-muted);
}
`;

function buildSurface(host) {
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "quizify-preview.css";
  const style = document.createElement("style");
  style.textContent = SHELL_CSS;

  const surface = document.createElement("article");
  surface.className = "container quizify-cardless";
  surface.setAttribute("data-quizify-theme", "kaiwu");
  const field = document.createElement("section");
  field.className = "quizify-field quizify-side-content";
  field.setAttribute("dir", "auto");
  surface.append(field);
  shadow.append(link, style, surface);

  const handle = { shadow, surface, field, options: null };
  host.__quizifyPreview = handle;
  return handle;
}

function surfaceFor(host) {
  if (!host) throw new Error("QuizifyPreview.render needs a host element");
  return host.__quizifyPreview ?? buildSurface(host);
}

function renderMarkdown(source) {
  const renderer = globalThis.Quizify?.renderMarkdown;
  if (typeof renderer === "function") return renderer(String(source ?? ""));
  return globalThis.myquizify.configureQuizifyMarked(globalThis.marked)(String(source ?? ""));
}

function render(host, options = {}) {
  const { source = "", side = "front", theme = "kaiwu", night = false, emptyLabel = "" } = options;
  const handle = surfaceFor(host);
  handle.options = { source, side, theme, night, emptyLabel };

  host.classList.toggle("nightMode", Boolean(night));
  host.setAttribute("data-quizify-theme", theme);
  handle.surface.setAttribute("data-quizify-theme", theme);
  handle.surface.setAttribute("data-quizify-side", side);

  const field = handle.field;
  field.setAttribute("data-empty-label", emptyLabel);
  disposePreviewInteractions(field);
  try {
    field.innerHTML = renderMarkdown(source);
    enhanceOutlineLists(field);
    enhanceMarkdownTables(field);
    field.querySelectorAll("pre > code").forEach((code) => {
      try {
        highlightCodeElement(code);
      } catch (error) {
        console.warn("Quizify preview highlighting failed", error);
      }
    });
    renderMathPlaceholders(field, katex);
    initPreviewInteractions(field, { isBack: side === "back" });
  } catch (error) {
    field.textContent = String(error?.message || error);
  }

  return { bytes: utf8Size(source), field };
}

function reset(host) {
  const handle = host?.__quizifyPreview;
  if (!handle?.options) return null;
  return render(host, handle.options);
}

function revealAll(host, revealed) {
  const field = host?.__quizifyPreview?.field;
  if (!field) return 0;
  let count = 0;
  field.querySelectorAll(".quizify-mask").forEach((mask) => {
    const expanded = String(mask.getAttribute("aria-expanded") ?? "");
    if (Boolean(revealed) === (expanded === "true")) return;
    if (typeof mask.click === "function") {
      mask.click();
      count += 1;
    }
  });
  return count;
}

globalThis.QuizifyPreview = {
  render,
  reset,
  revealAll,
  markdown: renderMarkdown,
  sizeOf: utf8Size
};

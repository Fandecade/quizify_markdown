/* Anki stores multi-line field text as HTML, and which markup carries the line
 * breaks depends on where the note was last edited: the plain-text HTML source
 * editor keeps literal "\n", while the visual editor (desktop visual editing,
 * AnkiDroid, AnkiMobile) wraps every line in its own block element such as
 * <div> or <p>. Reacting only to <br> therefore collapses such a field into a
 * single line, which silently breaks every line-based Quizify block (``::::``,
 * ``:::``, ``===``) as soon as a card is touched on a phone.
 *
 * The dangerous part is that authors may write real HTML in a field too, so the
 * wrapping markup cannot simply be deleted. Editor transport is recognised by
 * its shape: the entire field is nothing but top-level <div>/<p> blocks, no
 * text of its own outside them, and none of those blocks holds an element an
 * editor would never generate there. Only then are the boundaries turned back
 * into line breaks. Anything else (``<pre>``, ``<table>``, a hand-written
 * wrapper <div>, markup mixed with Markdown) is left exactly as written.
 */
const TRANSPORT_BLOCK = /^(?:div|p)$/i;
const ANY_TAG = /<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;

// Block-level or raw-text elements that never live inside an editor-generated
// line block. Finding one means the author wrote this markup by hand, so the
// field is handed to the renderer untouched.
const AUTHORED_BLOCK = new Set([
  "address", "article", "aside", "audio", "blockquote", "button", "canvas",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "embed", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr",
  "iframe", "input", "legend", "li", "main", "menu", "nav", "object", "ol",
  "optgroup", "option", "p", "picture", "pre", "script", "section", "select",
  "style", "summary", "table", "tbody", "td", "template", "textarea", "tfoot",
  "th", "thead", "tr", "ul", "video"
]);

/** True when ``html`` is nothing but editor-generated top-level blocks. */
function isEditorTransport(html) {
  if (!html.includes("<")) return false;
  let depth = 0;
  let blocks = 0;
  let position = 0;
  let match;
  ANY_TAG.lastIndex = 0;
  while ((match = ANY_TAG.exec(html)) !== null) {
    if (depth === 0 && /\S/.test(html.slice(position, match.index))) return false;
    position = ANY_TAG.lastIndex;
    const [, closing, name, selfClosing] = match;
    const tag = name.toLowerCase();
    if (depth === 0) {
      if (!TRANSPORT_BLOCK.test(tag)) return false;
    } else if (!closing && AUTHORED_BLOCK.has(tag)) {
      return false;
    }
    if (selfClosing || !TRANSPORT_BLOCK.test(tag)) continue;
    if (closing) {
      depth -= 1;
      if (depth < 0) return false;
    } else {
      depth += 1;
      if (depth === 1) blocks += 1;
    }
  }
  if (depth === 0 && /\S/.test(html.slice(position))) return false;
  return depth === 0 && blocks > 0;
}

// Sentinels stand in for "an explicit line break" and "a block boundary" while
// the markup is rewritten; they are replaced before any entity decoding, so
// they never reach the output.
const ANKI_BREAK = "\u0000";
const ANKI_BOUNDARY = "\u0001";
const TRANSPORT_TAG = /<\/?(?:div|p)\b[^>]*>/gi;
const MARKER_RUN = /[\u0000\u0001]+/g;

/**
 * Turn Anki's editor transport back into the author's line structure.
 *
 * A run of markers is one line structure, not several: any number of adjacent
 * block boundaries collapse to a single line break (each line has its own
 * <div>, but two lines are one break apart), while every explicit <br> keeps
 * its own break, so the editor idiom for an empty line (<div><br></div>)
 * survives as an empty line.
 */
function transportToLineBreaks(html) {
  return html
    .replace(/<br\s*\/?>/gi, ANKI_BREAK)
    .replace(TRANSPORT_TAG, ANKI_BOUNDARY)
    .replace(MARKER_RUN, (run) => {
      const explicit = run.split(ANKI_BREAK).length - 1;
      const boundaries = run.includes(ANKI_BOUNDARY) ? 1 : 0;
      return "\n".repeat(Math.min(2, explicit + boundaries));
    })
    // The wrapping block itself must not add a blank line at either end.
    .replace(/^\n+|\n+$/g, "");
}

function blockTagsToLineBreaks(html) {
  return isEditorTransport(html)
    ? transportToLineBreaks(html)
    : html.replace(/<br\s*\/?>/gi, "\n");
}

export function decodeAnkiFieldHtml(html, documentRef = globalThis.document) {
  const text = blockTagsToLineBreaks(
    String(html ?? "").replace(/&nbsp;/g, " ")
  );
  const decoder = documentRef?.createElement?.("textarea") || null;

  const fallback = () =>
    text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&");

  if (!decoder) return fallback();

  decoder.innerHTML = text;
  return typeof decoder.value === "string" ? decoder.value : fallback();
}

const QUIZIFY_SOURCE_MARKER =
  /<!--\s*quizify-source:(?:start|safe|end):[a-z0-9_-]+\s*-->/gi;
const QUIZIFY_SAFE_SOURCE_MARKER =
  /<!--\s*quizify-source:safe:[a-z0-9_-]+\s*-->/i;

export function readAnkiFieldSource(field, documentRef = globalThis.document) {
  if (!field) return "";
  const html = String(field.innerHTML ?? "");
  if (QUIZIFY_SAFE_SOURCE_MARKER.test(html)) {
    return String(field.textContent ?? "");
  }
  return decodeAnkiFieldHtml(html.replace(QUIZIFY_SOURCE_MARKER, ""), documentRef);
}

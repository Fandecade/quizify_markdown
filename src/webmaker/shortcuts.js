/*
 * Shortcut table for the offline card maker.
 *
 * The Markdown and Quizify insert keys mirror the in-Anki editor
 * (`src/editor/legacy-editor.js`, `src/shared/syntax-tools.js`) so muscle
 * memory transfers between the two surfaces: `Mod+Alt+1..7` inserts the same
 * Quizify snippets, in the same order.
 */

const MAC = /Mac|iPhone|iPad|iPod/i.test(
  globalThis.navigator?.userAgent ?? globalThis.navigator?.platform ?? ""
);

const MODIFIER_ALIASES = {
  mod: "mod",
  cmd: "mod",
  command: "mod",
  meta: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift"
};

function specKeyToken(token) {
  const raw = String(token ?? "").trim();
  if (/^[0-9]$/.test(raw)) return `digit${raw}`;
  const lower = raw.toLowerCase();
  if (lower === "esc") return "escape";
  if (lower === "return") return "enter";
  return lower;
}

export function parseKeySpec(spec) {
  const parts = { ctrl: false, meta: false, alt: false, shift: false };
  let key = "";
  for (const token of String(spec ?? "").split("+")) {
    if (!token.trim()) continue;
    const modifier = MODIFIER_ALIASES[token.trim().toLowerCase()];
    if (modifier === "mod") {
      if (MAC) parts.meta = true;
      else parts.ctrl = true;
    } else if (modifier) {
      parts[modifier] = true;
    } else {
      key = specKeyToken(token);
    }
  }
  return { ...parts, key };
}

export function signatureForSpec(spec) {
  const parsed = parseKeySpec(spec);
  const parts = [];
  if (parsed.ctrl) parts.push("ctrl");
  if (parsed.meta) parts.push("meta");
  if (parsed.alt) parts.push("alt");
  if (parsed.shift) parts.push("shift");
  parts.push(parsed.key);
  return parts.join("+");
}

/*
 * Punctuation is read from `event.code` so a spec can always be written with
 * the unshifted character: `Mod+Shift+.` keeps working on layouts where the
 * shifted glyph is `>` (and where `event.key` therefore reports `>`).
 */
const PUNCTUATION_CODES = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/"
};

export function keyToken(event) {
  const code = String(event?.code ?? "");
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.replace("Numpad", "Digit").toLowerCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (PUNCTUATION_CODES[code]) return PUNCTUATION_CODES[code];
  const key = String(event?.key ?? "");
  if (key === " ") return "space";
  return key.toLowerCase();
}

export function eventSignature(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(keyToken(event));
  return parts.join("+");
}

export function isComposing(event) {
  return Boolean(event?.isComposing) || event?.keyCode === 229 || event?.key === "Process";
}

const MAC_GLYPHS = { ctrl: "\u2303", alt: "\u2325", shift: "\u21e7", meta: "\u2318" };
const PC_NAMES = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };

function displayKeyName(key) {
  if (!key) return "";
  if (key.startsWith("digit")) return key.slice(5);
  if (key === "arrowup") return "\u2191";
  if (key === "arrowdown") return "\u2193";
  if (key === "arrowleft") return "\u2190";
  if (key === "arrowright") return "\u2192";
  if (key === "backspace") return MAC ? "\u232b" : "Backspace";
  if (key === "enter") return MAC ? "\u21a9" : "Enter";
  if (key === "escape") return "Esc";
  if (key === "space") return "Space";
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
}

export function displayKeySpec(spec) {
  const parsed = parseKeySpec(spec);
  const glyphs = MAC ? MAC_GLYPHS : PC_NAMES;
  const separators = MAC ? "" : "+";
  const parts = [];
  if (parsed.ctrl) parts.push(glyphs.ctrl);
  if (parsed.alt) parts.push(glyphs.alt);
  if (parsed.shift) parts.push(glyphs.shift);
  if (parsed.meta) parts.push(glyphs.meta);
  parts.push(displayKeyName(parsed.key));
  return parts.join(separators);
}

export function buildBindings(commands) {
  const map = new Map();
  const conflicts = [];
  for (const command of commands) {
    for (const spec of command.keys ?? []) {
      const signature = signatureForSpec(spec);
      const owner = map.get(signature);
      if (owner && owner !== command) {
        conflicts.push({ spec, first: owner.id, second: command.id });
        continue;
      }
      map.set(signature, command);
    }
  }
  return { map, conflicts };
}

export function createShortcutRunner({ commands, isBlocked }) {
  const { map, conflicts } = buildBindings(commands);

  function handle(event) {
    if (event.defaultPrevented || isComposing(event)) return false;
    if (typeof isBlocked === "function" && isBlocked(event)) return false;
    const command = map.get(eventSignature(event));
    if (!command) return false;
    if (typeof command.when === "function" && !command.when(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    command.run(event);
    return true;
  }

  return { handle, conflicts, map };
}

export function isMacPlatform() {
  return MAC;
}

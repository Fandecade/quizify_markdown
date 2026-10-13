/*
 * CSV import/export for the offline card maker.
 *
 * The emitted header block follows `docs/quizify-csv-spec.md`, which was
 * verified against Anki 25.9.5: Anki picks the note type and deck from the
 * directives, and `#guid column` + `#if matches` make re-imports update the
 * existing notes instead of creating duplicates.
 */

import { splitTags } from "./store.js";

export const NOTETYPE = "Quizify Markdown";
export const COLUMNS = ["Front", "Back", "tags", "guid"];
export const IF_MATCHES = "update current";

/*
 * Field names a hand-written or spreadsheet-exported header row may use. Only
 * consulted when the file has no `#columns:` directive, so a file exported by
 * this tool is never re-interpreted.
 */
const HEADER_NAMES = {
  front: ["front", "正面", "问题", "question"],
  back: ["back", "背面", "答案", "answer"],
  tags: ["tags", "tag", "标签"],
  guid: ["guid", "id", "唯一标识"]
};

function headerKind(cell) {
  const value = String(cell ?? "").trim().toLowerCase();
  for (const [kind, names] of Object.entries(HEADER_NAMES)) {
    if (names.includes(value)) return kind;
  }
  return "";
}

function headerMapping(row) {
  const kinds = row.map(headerKind);
  const front = kinds.indexOf("front");
  const back = kinds.indexOf("back");
  // Both field names have to sit in the leading columns; that is specific
  // enough that a real data row is never mistaken for a header.
  if (front < 0 || back < 0 || Math.max(front, back) > 1) return null;
  const mapping = { front, back };
  kinds.forEach((kind, index) => {
    if (kind && mapping[kind] === undefined) mapping[kind] = index;
  });
  return mapping;
}

const SEPARATOR_ALIASES = {
  comma: ",",
  tab: "\t",
  pipe: "|",
  semicolon: ";",
  colon: ":",
  space: " "
};
const DETECT_CANDIDATES = [",", "\t", ";", "|"];
const BOM = /^\uFEFF/;
const LINE_BREAK_TAG = /<br\s*\/?>/gi;

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv({ deck, tags, cards, ifMatches = IF_MATCHES }) {
  const lines = [
    "#separator:comma",
    "#html:false",
    `#notetype:${NOTETYPE}`,
    `#deck:${String(deck ?? "").trim()}`,
    `#columns:${COLUMNS.join(",")}`,
    `#tags column:3`,
    `#guid column:4`
  ];
  if (ifMatches) lines.push(`#if matches:${ifMatches}`);
  const globalTags = splitTags(tags).join(" ");
  if (globalTags) lines.push(`#tags:${globalTags}`);

  for (const card of cards) {
    lines.push(
      [
        card.front ?? "",
        card.back ?? "",
        splitTags(card.tags).join(" "),
        card.guid ?? ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function countOutsideQuotes(line, separator) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === separator) count += 1;
  }
  return count;
}

export function detectSeparator(line) {
  let best = ",";
  let bestCount = 0;
  for (const candidate of DETECT_CANDIDATES) {
    const count = countOutsideQuotes(line, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(text, separator) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text ?? "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function separatorFor(directives) {
  const raw = String(directives.separator ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (SEPARATOR_ALIASES[raw]) return SEPARATOR_ALIASES[raw];
  return raw.length === 1 ? raw : null;
}

function headerDirectives(text) {
  const lines = String(text ?? "").replace(BOM, "").replace(/\r\n?/g, "\n").split("\n");
  const directives = {};
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("#")) break;
    const colon = line.indexOf(":");
    if (colon > 1) {
      directives[line.slice(1, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim();
    }
  }
  return { directives, body: lines.slice(index).join("\n") };
}

function toColumnIndex(value) {
  const index = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(index) && index > 0 ? index - 1 : -1;
}

/*
 * Anki stores the field with `<br>` where the author typed a newline, and
 * escapes literal `&`/`<`/`>` into entities when the import ran with
 * `#html:false`. Undoing that in the right order keeps a real `<br>` the
 * author typed (stored as `&lt;br&gt;`) distinct from a stored line break.
 */
export function normalizeFromAnki(value) {
  return String(value ?? "")
    .replace(LINE_BREAK_TAG, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseCsvCards(text) {
  const { directives, body } = headerDirectives(text);
  const firstLine = body.split("\n", 1)[0] ?? "";
  const separator = separatorFor(directives) ?? detectSeparator(firstLine);
  const warnings = [];

  const columns = String(directives.columns ?? "")
    .split(separator)
    .map((name) => name.trim())
    .filter(Boolean);

  let frontIndex = 0;
  let backIndex = 1;
  if (columns.length) {
    const front = columns.indexOf("Front");
    const back = columns.indexOf("Back");
    if (front < 0 || back < 0) {
      warnings.push({
        severity: "error",
        message: `#columns 里必须同时出现 Front 和 Back，当前是 ${columns.join("/")}。`
      });
    }
    frontIndex = front;
    backIndex = back;
  }

  const tagsIndex = toColumnIndex(directives["tags column"]);
  const guidIndex = toColumnIndex(directives["guid column"]);

  const rows = parseDelimited(body, separator).filter((row) =>
    row.some((cell) => cell.trim() !== "")
  );

  let dataRows = rows;
  let tagsColumn = tagsIndex;
  let guidColumn = guidIndex;
  if (!columns.length && rows.length) {
    const mapping = headerMapping(rows[0]);
    if (mapping) {
      frontIndex = mapping.front;
      backIndex = mapping.back;
      tagsColumn = mapping.tags ?? tagsColumn;
      guidColumn = mapping.guid ?? guidColumn;
      dataRows = rows.slice(1);
    }
  }

  const cards = [];
  dataRows.forEach((row, rowIndex) => {
    const front = frontIndex >= 0 ? normalizeFromAnki(row[frontIndex]) : "";
    const back = backIndex >= 0 ? normalizeFromAnki(row[backIndex]) : "";
    if (!front.trim() && !back.trim()) return;
    cards.push({
      front,
      back,
      tags: tagsColumn >= 0 ? splitTags(row[tagsColumn]) : [],
      guid: guidColumn >= 0 ? String(row[guidColumn] ?? "").trim() : "",
      sourceLine: rowIndex + 1 + (dataRows === rows ? 0 : 1)
    });
  });

  return {
    cards,
    warnings,
    directives,
    separator,
    columns,
    deck: directives.deck ?? "",
    tags: directives.tags ?? ""
  };
}

export function duplicateGroups(cards) {
  const groups = new Map();
  cards.forEach((card, index) => {
    const key = `${card.front}\u0000${card.back}`;
    if (!card.front.trim() && !card.back.trim()) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return [...groups.values()].filter((indexes) => indexes.length > 1);
}

export function exportIssues({ deck, tags, cards }) {
  const issues = [];
  const deckName = String(deck ?? "").trim();
  if (!deckName) {
    issues.push({ severity: "error", message: "牌组名不能为空。" });
  } else if (/[",\n]/.test(deckName)) {
    issues.push({
      severity: "error",
      message: "牌组名不能包含逗号、双引号或换行，否则文件头会被切错。"
    });
  }
  if (/[,]/.test(String(tags ?? ""))) {
    issues.push({
      severity: "warning",
      message: "全局标签里的逗号会被当成空格分隔，建议直接用空格。"
    });
  }
  cards.forEach((card, index) => {
    if (!card.front.trim()) {
      issues.push({ severity: "warning", message: `第 ${index + 1} 张卡的正面是空的。` });
    }
  });
  for (const group of duplicateGroups(cards)) {
    issues.push({
      severity: "warning",
      message: `第 ${group.map((index) => index + 1).join("、")} 张卡的正面和背面完全相同。`
    });
  }
  return issues;
}

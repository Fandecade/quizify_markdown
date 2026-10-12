import {
  fenceMarker,
  nextFence,
  uniqueSortedLetters
} from "../../shared/markdown-structure.js";
import {
  findDisplayMathEndOnLine
} from "../../shared/math.js";
export function createParserTools(state) {
  function readLine(src, offset) {
    const end = src.indexOf("\n", offset);
    if (end === -1) {
      return { line: src.slice(offset), raw: src.slice(offset), next: src.length };
    }
    return {
      line: src.slice(offset, end),
      raw: src.slice(offset, end + 1),
      next: end + 1
    };
  }

  function validMathBlockEnd(src, offset) {
    return findDisplayMathEndOnLine(src, offset);
  }

  function trimBlankEdges(lines) {
    const copy = lines.slice();
    while (copy.length && copy[0].trim() === "") copy.shift();
    while (copy.length && copy[copy.length - 1].trim() === "") copy.pop();
    return copy;
  }

  function nextName(kind) {
    if (kind === "fitb") return `${state.fieldPrefix}fitb-${state.fitbCounter++}`;
    if (kind === "mcq") return `${state.fieldPrefix}mcq-${state.mcqCounter++}`;
    if (kind === "tabs") return `${state.fieldPrefix}tabs-${state.tabsCounter++}`;
    return `${state.fieldPrefix}${kind}`;
  }

  function inlineTokens(lexer, text) {
    return lexer.inlineTokens ? lexer.inlineTokens(text, []) : [];
  }

  function markerStart(src, marker) {
    const index = src.indexOf(marker);
    return index >= 0 ? index : undefined;
  }

  function regexStart(src, pattern) {
    const match = src.match(pattern);
    return match ? match.index : undefined;
  }

  function parseChoiceOptions(raw, lexer) {
    const options = [];
    const seen = new Set();
    const source = String(raw || "");
    let offset = 0;
    let fence = null;
    let mathEnd = -1;

    while (offset < source.length) {
      const continuingMath = !fence && offset < mathEnd;
      const detectedMathEnd = !fence && !continuingMath
        ? validMathBlockEnd(source, offset)
        : -1;
      const entry = readLine(source, offset);
      offset = entry.next;
      if (continuingMath) continue;
      if (detectedMathEnd > mathEnd) mathEnd = detectedMathEnd;

      const next = nextFence(entry.line, fence);
      if (fence || next) {
        fence = next;
        continue;
      }

      const match = /^([A-Za-z])\. ?(.+)$/.exec(entry.line.trim());
      if (!match) continue;

      const description = match[2].trim();
      const letter = match[1].toUpperCase();
      options.push({
        duplicate: seen.has(letter),
        letter,
        description,
        tokens: inlineTokens(lexer, description)
      });
      seen.add(letter);
    }

    return options;
  }

  function validChoiceBlock(options, correct) {
    if (options.length < 2 || !correct) return false;
    if (options.some((option) => option.duplicate || !option.description)) return false;
    const letters = new Set(options.map((option) => option.letter));
    return correct.split("").every((letter) => letters.has(letter));
  }

  function parseChoiceBlock(src, lexer) {
    const opener = readLine(src, 0);
    if (!/^;;;\s*$/.test(opener.line)) return null;

    let offset = opener.next;
    let fence = null;
    let mathEnd = -1;
    const optionLines = [];

    while (offset < src.length) {
      const insideMath =
        !fence &&
        (offset < mathEnd ||
          ((mathEnd = validMathBlockEnd(src, offset)) > offset));
      const entry = readLine(src, offset);
      const close =
        !fence && !insideMath && /^;;;([A-Za-z]+)\s*$/.exec(entry.line);
      offset = entry.next;

      if (close) {
        const correct = uniqueSortedLetters(close[1]);
        const options = parseChoiceOptions(optionLines.join("\n"), lexer);
        if (!validChoiceBlock(options, correct)) return null;
        return {
          raw: src.slice(0, offset),
          options,
          correct
        };
      }

      optionLines.push(entry.line);
      if (!insideMath) fence = nextFence(entry.line, fence);
    }

    return null;
  }

  function parseTabsBlock(src, lexer) {
    const first = readLine(src, 0);
    const firstMatch = /^===\s+(.+?)\s*$/.exec(first.line);
    if (!firstMatch) return null;

    const tabs = [];
    let title = firstMatch[1].trim();
    let lines = [];
    let offset = first.next;
    let fence = null;
    let mathEnd = -1;

    while (offset < src.length) {
      const insideMath =
        !fence &&
        (offset < mathEnd ||
          ((mathEnd = validMathBlockEnd(src, offset)) > offset));
      const entry = readLine(src, offset);
      offset = entry.next;

      if (insideMath) {
        lines.push(entry.line);
        continue;
      }

      if (fence) {
        lines.push(entry.line);
        fence = nextFence(entry.line, fence);
        continue;
      }

      if (fenceMarker(entry.line)) {
        lines.push(entry.line);
        fence = nextFence(entry.line, fence);
        continue;
      }

      if (/^===\s*$/.test(entry.line)) {
        tabs.push({
          title,
          titleTokens: inlineTokens(lexer, title),
          tokens: lexer.blockTokens(trimBlankEdges(lines).join("\n"))
        });
        return { raw: src.slice(0, offset), tabs };
      }

      const nextMatch = /^===\s+(.+?)\s*$/.exec(entry.line);
      if (nextMatch) {
        tabs.push({
          title,
          titleTokens: inlineTokens(lexer, title),
          tokens: lexer.blockTokens(trimBlankEdges(lines).join("\n"))
        });
        title = nextMatch[1].trim();
        lines = [];
      } else {
        lines.push(entry.line);
      }
    }

    return null;
  }

  function flattenTabTokens(tabs, key) {
    return tabs.flatMap((tab) => tab[key] || []);
  }

  function flattenChoiceTokens(options) {
    return options.flatMap((option) => option.tokens || []);
  }

  return Object.freeze({
    flattenChoiceTokens,
    flattenTabTokens,
    inlineTokens,
    markerStart,
    nextName,
    parseChoiceBlock,
    parseChoiceOptions,
    parseTabsBlock,
    readLine,
    regexStart,
    trimBlankEdges
  });
}

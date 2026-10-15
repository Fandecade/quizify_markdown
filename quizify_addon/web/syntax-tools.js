(() => {
  // src/shared/markdown-structure.js
  function fenceMarker(line) {
    const match = /^(?: {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(
      String(line != null ? line : "")
    );
    if (!match || match[1][0] === "`" && match[2].includes("`")) {
      return null;
    }
    return { char: match[1][0], length: match[1].length };
  }
  function closesFence(line, fence) {
    if (!fence) return false;
    const match = /^(?: {0,3})(`{3,}|~{3,})\s*$/.exec(String(line != null ? line : ""));
    return Boolean(
      match && match[1][0] === fence.char && match[1].length >= fence.length
    );
  }
  function nextFence(line, fence) {
    if (fence) return closesFence(line, fence) ? null : fence;
    return fenceMarker(line);
  }
  function uniqueSortedLetters(value) {
    return Array.from(new Set(String(value || "").toUpperCase().split(""))).filter((letter) => /^[A-Z]$/.test(letter)).sort().join("");
  }

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

  // src/shared/math.js
  var KATEX_DELIMITERS = Object.freeze(
    [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "$", right: "$", display: false }
    ].map(Object.freeze)
  );
  var KATEX_BLOCK_DELIMITERS = Object.freeze(
    KATEX_DELIMITERS.filter((delimiter) => delimiter.display)
  );
  var MAX_TEX_SOURCE_LENGTH = 16 * 1024;
  var MAX_TOTAL_TEX_SOURCE_LENGTH = 32 * 1024;
  var MARKDOWN_HTML_TAGS = new Set(
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg math altglyph altglyphdef altglyphitem animate animatecolor animatemotion animatetransform circle clippath defs desc ellipse filter font font-face font-face-format font-face-name font-face-src font-face-uri g glyph glyphref hkern line lineargradient marker mask metadata mpath path pattern polygon polyline radialgradient rect set stop switch symbol text textpath tref tspan use view vkern feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence annotation annotation-xml maction maligngroup malignmark menclose merror mfenced mfrac mglyph mi mlabeledtr mlongdiv mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mscarries mscarry msgroup msline mspace msqrt msrow mstack mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics".split(" ")
  );
  var MATH_IGNORED_HTML_TAGS = new Set(
    "pre code script style textarea option noscript kbd title template".split(" ")
  );
  var MARKDOWN_HTML_BLOCK_TAGS = new Set(
    "address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul".split(" ")
  );
  var delimiterStartPatterns = /* @__PURE__ */ new WeakMap();
  function delimiterStartPattern(delimiters) {
    let pattern = delimiterStartPatterns.get(delimiters);
    if (!pattern) {
      const alternatives = delimiters.map(
        (delimiter) => delimiter.left.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
      pattern = new RegExp(alternatives.join("|"), "g");
      delimiterStartPatterns.set(delimiters, pattern);
    }
    return pattern;
  }
  function rawDelimiterStart(source, delimiters, fromIndex = 0) {
    const immediate = delimiters.find(
      (delimiter) => source.startsWith(delimiter.left, fromIndex)
    );
    if (immediate) return { index: fromIndex, delimiter: immediate };
    const pattern = delimiterStartPattern(delimiters);
    pattern.lastIndex = fromIndex;
    const match = pattern.exec(source);
    if (!match) return;
    const selected = delimiters.find((delimiter) => match[0] === delimiter.left);
    return { index: match.index, delimiter: selected };
  }
  function findPotentialMathDelimiterStart(source, delimiters = KATEX_DELIMITERS, fromIndex = 0) {
    var _a;
    return (_a = rawDelimiterStart(
      String(source != null ? source : ""),
      delimiters,
      Math.max(0, Number(fromIndex) || 0)
    )) == null ? void 0 : _a.index;
  }
  function asciiLetter(character) {
    const code = (character == null ? void 0 : character.charCodeAt(0)) || 0;
    return code >= 65 && code <= 90 || code >= 97 && code <= 122;
  }
  function asciiTagNameCharacter(character) {
    const code = (character == null ? void 0 : character.charCodeAt(0)) || 0;
    return asciiLetter(character) || code >= 48 && code <= 57 || character === "-";
  }
  function htmlTagHeadAt(source, start, allowClosing = true) {
    if (source[start] !== "<") return;
    let cursor = start + 1;
    let closing = false;
    if (source[cursor] === "/") {
      if (!allowClosing) return;
      closing = true;
      cursor++;
    }
    const nameStart = cursor;
    if (!asciiLetter(source[cursor])) return;
    while (asciiTagNameCharacter(source[++cursor])) ;
    const terminator = source[cursor];
    if (terminator !== "/" && terminator !== ">" && !/\s/.test(terminator || "")) {
      return;
    }
    return {
      name: source.slice(nameStart, cursor).toLowerCase(),
      end: cursor,
      closing
    };
  }
  function buildHtmlTagEndIndex(source) {
    const text = String(source != null ? source : "");
    if (!text.includes("<")) return;
    const stateCount = 3;
    const none = 0;
    const single = 1;
    const double = 2;
    const ends = new Int32Array((text.length + 1) * stateCount);
    for (let position = text.length - 1; position >= 0; position--) {
      const current = position * stateCount;
      const next = current + stateCount;
      const character = text[position];
      ends[current + none] = character === ">" ? position + 1 : character === "'" ? ends[next + single] : character === '"' ? ends[next + double] : ends[next + none];
      ends[current + single] = character === "'" ? ends[next + none] : ends[next + single];
      ends[current + double] = character === '"' ? ends[next + none] : ends[next + double];
    }
    return { ends, stateCount };
  }
  function quotedTagEnd(source, start, htmlIndex) {
    if (htmlIndex) {
      return htmlIndex.ends[(start + 2) * htmlIndex.stateCount] || -1;
    }
    let quote = "";
    for (let index = start + 2; index < source.length; index++) {
      const character = source[index];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        return index + 1;
      }
    }
    return -1;
  }
  function validKnownHtmlTagSyntax(source, head, end) {
    let cursor = head.end;
    if (head.closing) {
      while (/\s/.test(source[cursor] || "")) cursor++;
      return source[cursor] === ">" && cursor + 1 === end;
    }
    while (cursor < end) {
      let separated = false;
      while (/\s/.test(source[cursor] || "")) {
        separated = true;
        cursor++;
      }
      if (source[cursor] === ">") return cursor + 1 === end;
      if (source[cursor] === "/") {
        return source[cursor + 1] === ">" && cursor + 2 === end;
      }
      if (!separated || !/[A-Za-z_:]/.test(source[cursor] || "")) return false;
      cursor++;
      while (/[A-Za-z0-9_.:-]/.test(source[cursor] || "")) cursor++;
      while (/\s/.test(source[cursor] || "")) cursor++;
      if (source[cursor] !== "=") continue;
      cursor++;
      while (/\s/.test(source[cursor] || "")) cursor++;
      const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor++] : "";
      if (quote) {
        while (cursor < end && source[cursor] !== quote) cursor++;
        if (source[cursor] !== quote) return false;
        cursor++;
      } else {
        const valueStart = cursor;
        while (cursor < end && !/[\s"'=<>`]/.test(source[cursor] || "")) {
          cursor++;
        }
        if (cursor === valueStart) return false;
      }
    }
    return false;
  }
  function tagEnd(source, start, htmlIndex) {
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      return end < 0 ? source.length : end + 3;
    }
    if (source.startsWith("<![CDATA[", start)) {
      const end = source.indexOf("]]>", start + 9);
      return end < 0 ? source.length : end + 3;
    }
    const head = htmlTagHeadAt(source, start);
    const knownTag = head && MARKDOWN_HTML_TAGS.has(head.name);
    if (knownTag) {
      const end = quotedTagEnd(source, start, htmlIndex);
      if (end < 0) return -1;
      return validKnownHtmlTagSyntax(source, head, end) ? end : -1;
    }
    if (source.startsWith("<?", start)) {
      const end = source.indexOf("?>", start + 2);
      return end < 0 ? source.length : end + 2;
    }
    if (/^<![A-Za-z]/.test(source.slice(start, start + 64))) {
      const end = source.indexOf(">", start + 3);
      return end < 0 ? source.length : end + 1;
    }
    return -1;
  }
  function htmlBoundaryAt(source, index, htmlIndex) {
    return source[index] === "<" ? tagEnd(source, index, htmlIndex) : -1;
  }
  function findMathDelimiterEnd(source, delimiter, startIndex, htmlIndex) {
    const text = String(source != null ? source : "");
    let tagEndIndex = htmlIndex;
    let htmlCandidateCount = 0;
    let braceDepth = 0;
    for (let index = startIndex; index < text.length; index++) {
      if (braceDepth <= 0 && text.startsWith(delimiter.right, index)) {
        return index;
      }
      const character = text[index];
      if (!delimiter.display && (character === "\n" || character === "\r")) {
        return -1;
      } else if (character === "<") {
        if (!tagEndIndex && ++htmlCandidateCount >= 16) {
          tagEndIndex = buildHtmlTagEndIndex(text);
        }
        if (htmlBoundaryAt(text, index, tagEndIndex) >= 0) return -1;
      } else if (character === "\\") {
        if (!delimiter.display && (text[index + 1] === "\n" || text[index + 1] === "\r")) {
          return -1;
        }
        index++;
      } else if (character === "{") {
        braceDepth++;
      } else if (character === "}") {
        braceDepth--;
      }
    }
    return -1;
  }
  function findHtmlCrossingDelimiterEnd(source, delimiter, startIndex, htmlIndex) {
    let braceDepth = 0;
    let crossedHtml = false;
    for (let index = startIndex; index < source.length; index++) {
      if (braceDepth <= 0 && source.startsWith(delimiter.right, index)) {
        return crossedHtml ? index : -1;
      }
      const character = source[index];
      if (!delimiter.display && (character === "\n" || character === "\r")) {
        return -1;
      }
      if (character === "<") {
        const end = htmlBoundaryAt(source, index, htmlIndex);
        if (end >= 0) {
          crossedHtml = true;
          index = end - 1;
          continue;
        }
      }
      if (character === "\\") {
        if (!delimiter.display && (source[index + 1] === "\n" || source[index + 1] === "\r")) {
          return -1;
        }
        index++;
      } else if (character === "{") {
        braceDepth++;
      } else if (character === "}") {
        braceDepth--;
      }
    }
    return -1;
  }
  function matchMathDelimiterAt(source, startIndex = 0, delimiters = KATEX_DELIMITERS, htmlIndex) {
    const text = String(source != null ? source : "");
    const delimiter = delimiters.find(
      (candidate) => text.startsWith(candidate.left, startIndex)
    );
    if (!delimiter) return;
    const contentStart = startIndex + delimiter.left.length;
    if (text.indexOf(delimiter.right, contentStart) < 0) return;
    const contentEnd = findMathDelimiterEnd(
      text,
      delimiter,
      contentStart,
      htmlIndex
    );
    if (contentEnd < 0) return;
    const rawEnd = contentEnd + delimiter.right.length;
    return {
      raw: text.slice(startIndex, rawEnd),
      text: text.slice(contentStart, contentEnd),
      left: delimiter.left,
      right: delimiter.right,
      display: delimiter.display,
      index: startIndex,
      end: rawEnd
    };
  }
  function lowerBound(records, position) {
    let low = 0;
    let high = records.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if (records[middle].position < position) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  function buildMathSearchIndex(text, delimiters, htmlIndex = buildHtmlTagEndIndex(text)) {
    var _a;
    const balanceAt = new Int32Array(text.length + 1);
    const escaped = new Uint8Array(text.length);
    let balance = 0;
    let slashRun = 0;
    for (let index = 0; index < text.length; index++) {
      balanceAt[index] = balance;
      escaped[index] = slashRun % 2;
      const character = text[index];
      if (character === "\\") {
        slashRun++;
        continue;
      }
      if (!escaped[index]) {
        if (character === "{") balance++;
        else if (character === "}") balance--;
      }
      slashRun = 0;
    }
    balanceAt[text.length] = balance;
    const regionAt = new Int32Array(text.length);
    const lineAt = new Uint32Array(text.length + 1);
    let line = 0;
    for (let index = 0; index < text.length; index++) {
      lineAt[index] = line;
      if (text[index] === "\n" || text[index] === "\r" && text[index + 1] !== "\n") {
        line++;
      }
    }
    lineAt[text.length] = line;
    let region = 0;
    let cursor = 0;
    while (cursor < text.length) {
      const end = !escaped[cursor] ? htmlBoundaryAt(text, cursor, htmlIndex) : -1;
      if (end >= 0) {
        regionAt.fill(-1, cursor, end);
        cursor = end;
        region++;
      } else {
        regionAt[cursor++] = region;
      }
    }
    const closers = /* @__PURE__ */ new Map();
    for (const right of new Set(delimiters.map((delimiter) => delimiter.right))) {
      const display = (_a = delimiters.find((delimiter) => delimiter.right === right)) == null ? void 0 : _a.display;
      const records = [];
      let position = text.indexOf(right);
      while (position >= 0) {
        if (!escaped[position] && regionAt[position] >= 0) {
          records.push({
            position,
            region: regionAt[position],
            line: lineAt[position],
            balance: balanceAt[position],
            suffixMin: balanceAt[position]
          });
        }
        position = text.indexOf(right, position + 1);
      }
      for (let index = records.length - 2; index >= 0; index--) {
        if (records[index].region === records[index + 1].region && (display || records[index].line === records[index + 1].line)) {
          records[index].suffixMin = Math.min(
            records[index].balance,
            records[index + 1].suffixMin
          );
        }
      }
      closers.set(right, records);
    }
    return { balanceAt, escaped, regionAt, lineAt, closers, htmlIndex };
  }
  function indexedMathDelimiterStart(text, delimiters, fromIndex, index = buildMathSearchIndex(text, delimiters)) {
    let searchFrom = fromIndex;
    while (searchFrom < text.length) {
      const candidate = rawDelimiterStart(text, delimiters, searchFrom);
      if (!candidate) return;
      const { delimiter, index: start } = candidate;
      const region = index.regionAt[start];
      if (!index.escaped[start] && region >= 0) {
        const records = index.closers.get(delimiter.right) || [];
        const recordIndex = lowerBound(records, start + delimiter.left.length);
        const record = records[recordIndex];
        if ((record == null ? void 0 : record.region) === region && (delimiter.display || record.line === index.lineAt[start]) && record.suffixMin <= index.balanceAt[start]) {
          if (matchMathDelimiterAt(text, start, delimiters, index.htmlIndex)) {
            return start;
          }
        }
        if (record && record.region !== region && (delimiter.display || record.line === index.lineAt[start])) {
          const rejectedEnd = findHtmlCrossingDelimiterEnd(
            text,
            delimiter,
            start + delimiter.left.length,
            index.htmlIndex
          );
          if (rejectedEnd >= 0) {
            searchFrom = rejectedEnd + delimiter.right.length;
            continue;
          }
        }
      }
      searchFrom = start + (index.escaped[start] ? 1 : delimiter.left.length);
    }
  }
  function indexedMathDelimiterMatchAt(text, start, delimiters, index) {
    const delimiter = delimiters.find(
      (candidate) => text.startsWith(candidate.left, start)
    );
    if (!delimiter || index.escaped[start] || index.regionAt[start] < 0) return;
    const records = index.closers.get(delimiter.right) || [];
    const record = records[lowerBound(records, start + delimiter.left.length)];
    if ((record == null ? void 0 : record.region) !== index.regionAt[start] || !delimiter.display && record.line !== index.lineAt[start] || record.suffixMin > index.balanceAt[start]) {
      return;
    }
    return matchMathDelimiterAt(text, start, delimiters, index.htmlIndex);
  }
  function findMathRanges(source, delimiters = KATEX_DELIMITERS) {
    const text = String(source != null ? source : "");
    const searchIndex = buildMathSearchIndex(text, delimiters);
    const ranges = [];
    let offset = 0;
    while (offset < text.length) {
      const start = indexedMathDelimiterStart(
        text,
        delimiters,
        offset,
        searchIndex
      );
      if (start === void 0) break;
      const match = matchMathDelimiterAt(
        text,
        start,
        delimiters,
        searchIndex.htmlIndex
      );
      ranges.push(match);
      offset = match.end;
    }
    return ranges;
  }
  function escapedAt(source, index) {
    let slashCount = 0;
    while (index > 0 && source[--index] === "\\") slashCount++;
    return slashCount % 2 === 1;
  }
  function buildBacktickRunIndex(source) {
    var _a;
    const text = String(source != null ? source : "");
    const runs = [];
    let start = text.indexOf("`");
    while (start >= 0) {
      let end = start + 1;
      while (text[end] === "`") end++;
      const escaped = escapedAt(text, start);
      runs.push({
        start,
        end,
        length: end - start,
        // A backslash escapes one backtick, not the rest of its run. Thus the
        // remaining suffix can still open a code span of one shorter length.
        openerStart: start + (escaped ? 1 : 0),
        openerLength: end - start - (escaped ? 1 : 0)
      });
      start = text.indexOf("`", end);
    }
    const nextCloser = new Int32Array(runs.length);
    nextCloser.fill(-1);
    const nextRunByLength = /* @__PURE__ */ new Map();
    for (let index = runs.length - 1; index >= 0; index--) {
      const run = runs[index];
      if (run.openerLength > 0) {
        nextCloser[index] = (_a = nextRunByLength.get(run.openerLength)) != null ? _a : -1;
      }
      nextRunByLength.set(run.length, index);
    }
    return { runs, nextCloser };
  }
  function backtickCodeRange(index, runIndex) {
    const opener = index.runs[runIndex];
    const closerIndex = index.nextCloser[runIndex];
    if (!(opener == null ? void 0 : opener.openerLength) || closerIndex < 0) return;
    return {
      start: opener.openerStart,
      end: index.runs[closerIndex].end,
      closerIndex
    };
  }
  function nextInlineCodeRange(index, fromIndex = 0, firstRunIndex = 0) {
    for (let runIndex = firstRunIndex; runIndex < index.runs.length; runIndex++) {
      const run = index.runs[runIndex];
      if (run.openerStart < fromIndex) continue;
      const range = backtickCodeRange(index, runIndex);
      if (range) return { ...range, runIndex };
    }
  }
  function closingHtmlCodeTag(source, start, htmlIndex) {
    const opener = htmlTagHeadAt(source, start, false);
    if (!opener || !MATH_IGNORED_HTML_TAGS.has(opener.name)) {
      return -1;
    }
    const openingEnd = tagEnd(source, start, htmlIndex);
    if (openingEnd < 0) return -1;
    if (opener.name === "option") {
      const optionClose = /<\/option\s*>|<option(?=[\s>])|<\/select\s*>/ig;
      optionClose.lastIndex = openingEnd;
      const boundary = optionClose.exec(source);
      if (!boundary) return source.length;
      return /^<\/option/i.test(boundary[0]) ? boundary.index + boundary[0].length : boundary.index;
    }
    const closePattern = new RegExp(`</${opener.name}\\s*>`, "ig");
    closePattern.lastIndex = openingEnd;
    const closer = closePattern.exec(source);
    return closer ? closer.index + closer[0].length : source.length;
  }
  function findHtmlOpaqueRanges(source, htmlIndex = buildHtmlTagEndIndex(source)) {
    const text = String(source != null ? source : "");
    const ranges = [];
    let index = text.indexOf("<");
    while (index >= 0) {
      const markupEnd = htmlBoundaryAt(text, index, htmlIndex);
      if (markupEnd >= 0) {
        const ignoredEnd = closingHtmlCodeTag(text, index, htmlIndex);
        const end = ignoredEnd >= 0 ? ignoredEnd : markupEnd;
        ranges.push({ start: index, end });
        index = text.indexOf("<", end);
        continue;
      }
      index = text.indexOf("<", index + 1);
    }
    return ranges;
  }
  function normalizeReferenceLabel(value) {
    return String(value != null ? value : "").replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1").trim().replace(/\s+/g, " ").toLowerCase();
  }
  function collectMarkdownReferenceLabels(source) {
    const labels = /* @__PURE__ */ new Set();
    for (const { line, kind } of classifyMarkdownBlockLines(source)) {
      if (kind !== "plain") continue;
      const match = /^ {0,3}\[((?:\\.|[^\]\\]){1,999})\]:[ \t]*(?:<[^<>\r\n]+>|[^ \t\r\n<>]+)(?:[ \t]+(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|\((?:\\.|[^)\\\r\n])*\)))?[ \t]*$/.exec(
        line
      );
      if (match) labels.add(normalizeReferenceLabel(match[1]));
    }
    return labels;
  }
  function buildMarkdownLinkScanIndex(source) {
    const length = source.length;
    const escaped = new Uint8Array(length);
    let slashRun = 0;
    for (let index = 0; index < length; index++) {
      escaped[index] = slashRun % 2;
      if (source[index] === "\\") slashRun++;
      else slashRun = 0;
    }
    const parenEnd = new Int32Array(length);
    parenEnd.fill(-1);
    const stack = [];
    for (let index = 0; index < length; index++) {
      if (source[index] === "\n" || source[index] === "\r") {
        stack.length = 0;
      } else if (!escaped[index] && source[index] === "(") {
        stack.push(index);
      } else if (!escaped[index] && source[index] === ")" && stack.length) {
        parenEnd[stack.pop()] = index;
      }
    }
    const nextClose = new Int32Array(length + 1);
    const nextSpecial = new Int32Array(length + 1);
    const nextBoundary = new Int32Array(length + 1);
    const nextLineBreak = new Int32Array(length + 1);
    nextClose.fill(-1);
    nextSpecial.fill(-1);
    nextBoundary.fill(-1);
    nextLineBreak.fill(-1);
    for (let index = length - 1; index >= 0; index--) {
      const character = source[index];
      const active = !escaped[index];
      const boundary = active && (character === "<" || character === " " || character === "	");
      nextClose[index] = active && character === ")" ? index : nextClose[index + 1];
      nextSpecial[index] = active && (boundary || character === "(" || character === ")") ? index : nextSpecial[index + 1];
      nextBoundary[index] = boundary ? index : nextBoundary[index + 1];
      nextLineBreak[index] = character === "\n" || character === "\r" ? index : nextLineBreak[index + 1];
    }
    return { nextBoundary, nextClose, nextLineBreak, nextSpecial, parenEnd };
  }
  function markdownLinkDestinationEnd(source, start, scanIndex) {
    if (source[start] !== "(") return -1;
    const lineBreak = scanIndex.nextLineBreak[start + 1];
    const lineEnd = lineBreak < 0 ? source.length : lineBreak;
    const nextClose = scanIndex.nextClose[start + 1];
    if (nextClose < 0 || nextClose >= lineEnd) return -1;
    let cursor = start + 1;
    const skipSpace = () => {
      while (source[cursor] === " " || source[cursor] === "	") cursor++;
    };
    skipSpace();
    if (source[cursor] === "<") {
      cursor++;
      let closed = false;
      while (cursor < source.length) {
        const character = source[cursor];
        if (character === "\n" || character === "\r" || character === "<") {
          return -1;
        }
        if (character === "\\") {
          cursor += 2;
        } else if (character === ">") {
          cursor++;
          closed = true;
          break;
        } else {
          cursor++;
        }
      }
      if (!closed) return -1;
    } else {
      let depth = 0;
      while (cursor < lineEnd) {
        const special = scanIndex.nextSpecial[cursor];
        if (special < 0 || special >= lineEnd) return -1;
        cursor = special;
        const character = source[cursor];
        if (character === "<") return -1;
        if (character === "(") {
          const close = scanIndex.parenEnd[cursor];
          const boundary = scanIndex.nextBoundary[cursor + 1];
          if (close < 0 || close >= lineEnd || boundary >= 0 && boundary < close) {
            return -1;
          }
          depth++;
          cursor = close + 1;
          depth--;
        } else if (character === ")") {
          if (depth === 0) return cursor + 1;
          depth--;
          cursor++;
        } else {
          break;
        }
      }
      if (depth !== 0) return -1;
    }
    const separatorStart = cursor;
    skipSpace();
    if (source[cursor] === ")") return cursor + 1;
    if (cursor === separatorStart) return -1;
    const opener = source[cursor];
    const closer = opener === '"' ? '"' : opener === "'" ? "'" : opener === "(" ? ")" : "";
    if (!closer) return -1;
    cursor++;
    let titleClosed = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === "\n" || character === "\r") return -1;
      if (character === "\\") {
        cursor += 2;
      } else if (character === closer) {
        cursor++;
        titleClosed = true;
        break;
      } else {
        cursor++;
      }
    }
    if (!titleClosed) return -1;
    skipSpace();
    return source[cursor] === ")" ? cursor + 1 : -1;
  }
  function markdownReferenceSuffix(source, start) {
    if (source[start] !== "[") return;
    for (let index = start + 1; index < source.length; index++) {
      if (source[index] === "\n" || source[index] === "\r") return;
      if (source[index] === "\\") {
        index++;
      } else if (source[index] === "]") {
        return { end: index + 1, label: source.slice(start + 1, index) };
      } else if (source[index] === "[") {
        return;
      }
    }
  }
  function findMarkdownLinkContexts(source, referenceLabels = /* @__PURE__ */ new Set()) {
    const text = String(source != null ? source : "");
    const scanIndex = buildMarkdownLinkScanIndex(text);
    const contexts = [];
    const brackets = [];
    function supportedLabel(labelStart, labelEnd) {
      var _a, _b, _c;
      const label = text.slice(labelStart, labelEnd);
      const atomic = [];
      for (const match of findMathRanges(label)) {
        atomic.push({ start: match.index, end: match.end });
      }
      const revealPattern = /\[\[(.*?)\|\|(.*?)\]\]/g;
      let reveal;
      while (reveal = revealPattern.exec(label)) {
        atomic.push({ start: reveal.index, end: reveal.index + reveal[0].length });
      }
      atomic.sort((left, right) => left.start - right.start || right.end - left.end);
      let atomicIndex = 0;
      let depth = 0;
      for (let index = 0; index < label.length; index++) {
        while (((_a = atomic[atomicIndex]) == null ? void 0 : _a.end) <= index) atomicIndex++;
        if (((_b = atomic[atomicIndex]) == null ? void 0 : _b.start) <= index && index < ((_c = atomic[atomicIndex]) == null ? void 0 : _c.end)) {
          index = atomic[atomicIndex].end - 1;
          continue;
        }
        if (label[index] === "\\") {
          index++;
        } else if (label[index] === "[") {
          if (++depth > 1) return false;
        } else if (label[index] === "]") {
          if (depth-- <= 0) return false;
        }
      }
      return depth === 0;
    }
    for (let index = 0; index < text.length; index++) {
      if (text[index] === "\\") {
        index++;
        continue;
      }
      if (text[index] === "[") {
        brackets.push(index);
        continue;
      }
      if (text[index] !== "]" || !brackets.length) continue;
      const labelOpen = brackets.pop();
      const image = labelOpen > 0 && text[labelOpen - 1] === "!" && !escapedAt(text, labelOpen - 1);
      const ownerStart = image ? labelOpen - 1 : labelOpen;
      let end = markdownLinkDestinationEnd(text, index + 1, scanIndex);
      if (end < 0) {
        const reference = markdownReferenceSuffix(text, index + 1);
        if (reference) {
          const label = reference.label || text.slice(labelOpen + 1, index);
          if (referenceLabels.has(normalizeReferenceLabel(label))) {
            end = reference.end;
          }
        } else if (text[index + 1] !== ":" && referenceLabels.has(
          normalizeReferenceLabel(text.slice(labelOpen + 1, index))
        )) {
          end = index + 1;
        }
      }
      if (end >= 0 && supportedLabel(labelOpen + 1, index)) {
        contexts.push({
          kind: "link",
          start: ownerStart,
          end,
          labelStart: labelOpen + 1,
          labelEnd: index,
          image
        });
        index = end - 1;
      }
    }
    return contexts.sort(
      (left, right) => left.start - right.start || right.end - left.end
    );
  }
  function resolveInlineOwnership(source, extraOpaqueRanges = [], referenceLabels = /* @__PURE__ */ new Set(), includeLinks = true) {
    var _a, _b, _c;
    const text = String(source != null ? source : "");
    const hasMath = findPotentialMathDelimiterStart(text) !== void 0;
    const mathIndex = hasMath ? buildMathSearchIndex(text, KATEX_DELIMITERS) : null;
    const backticks = text.includes("`") ? buildBacktickRunIndex(text) : null;
    const linkContexts = includeLinks ? findMarkdownLinkContexts(text, referenceLabels) : [];
    const opaqueRanges = extraOpaqueRanges.map((range) => ({ start: range.start, end: range.end })).sort((left, right) => left.start - right.start || right.end - left.end);
    const activeMath = [];
    const activeCode = [];
    const activeOpaque = [];
    const active = [];
    let opaqueIndex = 0;
    let codeRunIndex = 0;
    let linkIndex = 0;
    let cursor = 0;
    let cachedMath;
    let mathSearchExhausted = false;
    function appendRange(range) {
      active.push(range);
      if (range.kind === "math") activeMath.push(range);
      else if (range.kind === "code") activeCode.push(range);
      else activeOpaque.push(range);
    }
    while (cursor < text.length) {
      while (((_a = opaqueRanges[opaqueIndex]) == null ? void 0 : _a.start) < cursor) opaqueIndex++;
      while (((_b = linkContexts[linkIndex]) == null ? void 0 : _b.start) < cursor) linkIndex++;
      if ((cachedMath == null ? void 0 : cachedMath.index) < cursor) cachedMath = void 0;
      if (mathIndex && !cachedMath && !mathSearchExhausted) {
        const mathStart = indexedMathDelimiterStart(
          text,
          KATEX_DELIMITERS,
          cursor,
          mathIndex
        );
        if (mathStart === void 0) {
          mathSearchExhausted = true;
        } else {
          cachedMath = matchMathDelimiterAt(
            text,
            mathStart,
            KATEX_DELIMITERS,
            mathIndex.htmlIndex
          );
        }
      }
      const math = cachedMath;
      while (((_c = backticks == null ? void 0 : backticks.runs[codeRunIndex]) == null ? void 0 : _c.openerStart) < cursor) codeRunIndex++;
      const code = backticks ? nextInlineCodeRange(backticks, cursor, codeRunIndex) : void 0;
      const opaque = opaqueRanges[opaqueIndex];
      const link = linkContexts[linkIndex];
      const candidates = [
        math && { kind: "math", start: math.index, end: math.end, match: math },
        code && { kind: "code", start: code.start, end: code.end },
        opaque && { kind: "opaque", start: opaque.start, end: opaque.end },
        link
      ].filter(Boolean);
      if (!candidates.length) break;
      candidates.sort((left, right) => left.start - right.start);
      const range = candidates[0];
      if (range.kind === "link") {
        if (range.image) {
          appendRange({ kind: "opaque", start: range.start, end: range.end });
        } else {
          appendRange({
            kind: "opaque",
            start: range.start,
            end: range.labelStart
          });
          const label = text.slice(range.labelStart, range.labelEnd);
          const nested = resolveInlineOwnership(
            label,
            findHtmlOpaqueRanges(label),
            /* @__PURE__ */ new Set(),
            false
          );
          for (const child of nested.active) {
            appendRange({
              ...child,
              blockEligible: child.kind === "math" ? false : child.blockEligible,
              start: child.start + range.labelStart,
              end: child.end + range.labelStart,
              match: child.match && {
                ...child.match,
                index: child.match.index + range.labelStart,
                end: child.match.end + range.labelStart
              }
            });
          }
          appendRange({
            kind: "opaque",
            start: range.labelEnd,
            end: range.end
          });
        }
        linkIndex++;
      } else if (range.kind === "code") {
        appendRange(range);
        codeRunIndex = code.closerIndex + 1;
      } else {
        appendRange(range);
        if (range.kind === "opaque") opaqueIndex++;
      }
      cursor = range.end;
      if (range.kind === "math") cachedMath = void 0;
    }
    return {
      active,
      math: activeMath,
      code: activeCode,
      opaque: activeOpaque
    };
  }
  function resolveInlineMathAndCodeRanges(source) {
    const text = String(source != null ? source : "");
    return resolveInlineOwnership(
      text,
      findHtmlOpaqueRanges(text),
      collectMarkdownReferenceLabels(text)
    );
  }
  function maskRanges(source, ranges, replacement) {
    const text = String(source != null ? source : "");
    const fill = String(replacement || "x")[0];
    const masked = [];
    let offset = 0;
    for (const range of ranges) {
      masked.push(text.slice(offset, range.start));
      masked.push(text.slice(range.start, range.end).replace(/[^\r\n]/g, fill));
      offset = range.end;
    }
    masked.push(text.slice(offset));
    return masked.join("");
  }
  function rawHtmlBlockStart(line, allowTypeSeven = true) {
    const content = String(line != null ? line : "").replace(/^ {0,3}/, "");
    if (content.startsWith("<!--")) return { type: "until", value: "-->" };
    if (content.startsWith("<?")) return { type: "until", value: "?>" };
    if (content.startsWith("<![CDATA[")) return { type: "until", value: "]]>" };
    if (/^<![A-Za-z]/.test(content)) return { type: "until", value: ">" };
    const raw = /^<(pre|script|style|textarea)(?=[\s>]|$)/i.exec(content);
    if (raw) return { type: "closing", value: raw[1].toLowerCase() };
    const block = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/i.exec(content);
    if (block && MARKDOWN_HTML_BLOCK_TAGS.has(block[1].toLowerCase())) {
      return { type: "blank" };
    }
    if (allowTypeSeven && /^(?:<\/?[A-Za-z][\w-]*(?:\s+[A-Za-z:_][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)\s*$/.test(
      content
    )) {
      return { type: "blank" };
    }
  }
  function rawHtmlBlockEnds(line, state) {
    if (!state) return true;
    if (state.type === "blank") return /^\s*$/.test(line);
    if (state.type === "closing") {
      return new RegExp(`</${state.value}\\s*>`, "i").test(line);
    }
    return String(line).includes(state.value);
  }
  function classifyMarkdownBlockLines(source) {
    const text = String(source != null ? source : "");
    const parts = text.split(/(\r\n|\r|\n)/);
    const lines = [];
    let offset = 0;
    let fence = null;
    let mathEnd = -1;
    let rawHtml = null;
    let previousBlank = true;
    let blockMathIndex = null;
    for (let index = 0; index < parts.length; index += 2) {
      const line = parts[index];
      const newline = parts[index + 1] || "";
      const start = offset;
      offset += line.length + newline.length;
      let kind = "plain";
      if (start < mathEnd) {
        kind = "math";
      } else if (fence) {
        kind = "fence";
        fence = nextFence(line, fence);
      } else if (rawHtml) {
        kind = "html";
        if (rawHtmlBlockEnds(line, rawHtml)) rawHtml = null;
      } else {
        const opener = /^( {0,3})(?=\$\$|\\\[)/.exec(line);
        if (opener && !blockMathIndex) {
          blockMathIndex = buildMathSearchIndex(text, KATEX_BLOCK_DELIMITERS);
        }
        const math = opener ? indexedMathDelimiterMatchAt(
          text,
          start + opener[1].length,
          KATEX_BLOCK_DELIMITERS,
          blockMathIndex
        ) : void 0;
        if (math) {
          kind = "math";
          mathEnd = math.end;
        } else {
          const html = rawHtmlBlockStart(line, previousBlank);
          if (html) {
            kind = "html";
            if (!rawHtmlBlockEnds(line, html)) rawHtml = html;
          } else {
            const next = nextFence(line, null);
            if (next) {
              kind = "fence";
              fence = next;
            }
          }
        }
      }
      lines.push({ line, newline, start, kind });
      previousBlank = /^\s*$/.test(line);
    }
    return lines;
  }
  function maskMarkdownFencedCode(source) {
    var _a, _b, _c;
    const text = String(source != null ? source : "");
    const lines = classifyMarkdownBlockLines(text).map((line, index) => ({
      ...line,
      content: line.line,
      originalIndex: index
    }));
    const masked = /* @__PURE__ */ new Set();
    const blocked = new Set(
      lines.filter(({ kind }) => kind === "math" || kind === "html").map(({ originalIndex }) => originalIndex)
    );
    const mathRanges = resolveInlineMathAndCodeRanges(text).math;
    let rangeIndex = 0;
    for (const line of lines) {
      const end = line.start + line.line.length + line.newline.length;
      while (((_a = mathRanges[rangeIndex]) == null ? void 0 : _a.end) <= line.start) rangeIndex++;
      if (((_b = mathRanges[rangeIndex]) == null ? void 0 : _b.start) < end && ((_c = mathRanges[rangeIndex]) == null ? void 0 : _c.end) > line.start) {
        blocked.add(line.originalIndex);
      }
    }
    function stripIndent(value, columns) {
      let column = 0;
      let index = 0;
      while (index < value.length && column < columns) {
        if (value[index] === " ") {
          column++;
        } else if (value[index] === "	") {
          column += 4 - column % 4;
        } else {
          break;
        }
        index++;
      }
      return column >= columns ? value.slice(index) : void 0;
    }
    function listItemProjection(view, index) {
      const match = /^( {0,3})([*+-]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(
        view[index].content
      );
      if (!match) return;
      const markerWidth = match[1].length + match[2].length;
      let gapWidth = 0;
      for (const character of match[3]) {
        gapWidth += character === "	" ? 4 - (markerWidth + gapWidth) % 4 : 1;
      }
      const contentIndent = markerWidth + (gapWidth <= 4 ? gapWidth : 1);
      const firstContent = gapWidth <= 4 ? match[4] : match[3].slice(1) + match[4];
      const child = [{ ...view[index], content: firstContent }];
      let cursor = index + 1;
      while (cursor < view.length) {
        const value = view[cursor].content;
        if (/^[ \t]*$/.test(value)) {
          child.push({ ...view[cursor], content: "" });
          cursor++;
          continue;
        }
        const projected = stripIndent(value, contentIndent);
        if (projected === void 0) break;
        child.push({ ...view[cursor], content: projected });
        cursor++;
      }
      return { child, end: cursor };
    }
    function maskScope(view, depth = 0) {
      if (depth > 16) return;
      let index = 0;
      let previousBlank = true;
      while (index < view.length) {
        const entry = view[index];
        const content = entry.content;
        if (blocked.has(entry.originalIndex)) {
          previousBlank = /^[ \t]*$/.test(content);
          index++;
          continue;
        }
        const quote = /^ {0,3}>[ \t]?/.exec(content);
        if (quote) {
          const child = [];
          let cursor = index;
          while (cursor < view.length) {
            const prefix = /^ {0,3}>[ \t]?/.exec(view[cursor].content);
            if (!prefix) break;
            child.push({
              ...view[cursor],
              content: view[cursor].content.slice(prefix[0].length)
            });
            cursor++;
          }
          maskScope(child, depth + 1);
          previousBlank = false;
          index = cursor;
          continue;
        }
        const list = listItemProjection(view, index);
        if (list) {
          maskScope(list.child, depth + 1);
          previousBlank = false;
          index = list.end;
          continue;
        }
        const opener = nextFence(content, null);
        if (opener) {
          let closer = index + 1;
          while (closer < view.length && (blocked.has(view[closer].originalIndex) || nextFence(view[closer].content, opener) !== null)) {
            closer++;
          }
          if (closer < view.length) {
            for (let line = index; line <= closer; line++) {
              masked.add(view[line].originalIndex);
            }
            index = closer + 1;
            previousBlank = false;
            continue;
          }
          for (let line = index; line < view.length; line++) {
            masked.add(view[line].originalIndex);
          }
          return;
        }
        if (previousBlank && (/^ {4}/.test(content) || content.startsWith("	"))) {
          let cursor = index;
          while (cursor < view.length) {
            const value = view[cursor].content;
            if (/^[ \t]*$/.test(value)) {
              cursor++;
              continue;
            }
            if (!/^ {4}/.test(value) && !value.startsWith("	")) break;
            masked.add(view[cursor].originalIndex);
            cursor++;
          }
          index = cursor;
          previousBlank = true;
          continue;
        }
        previousBlank = /^[ \t]*$/.test(content);
        index++;
      }
    }
    maskScope(lines);
    return lines.map(
      ({ line, newline }, lineIndex) => (masked.has(lineIndex) ? " ".repeat(line.length) : line) + newline
    ).join("");
  }
  function maskHtmlMathContexts(source) {
    const text = String(source != null ? source : "");
    const htmlIndex = buildHtmlTagEndIndex(text);
    const masked = [];
    let cursor = 0;
    let plainStart = 0;
    while (cursor < text.length) {
      if (text[cursor] !== "<") {
        cursor++;
        continue;
      }
      const ignoredEnd = closingHtmlCodeTag(text, cursor, htmlIndex);
      const markupEnd = ignoredEnd >= 0 ? ignoredEnd : htmlBoundaryAt(text, cursor, htmlIndex);
      if (markupEnd < 0) {
        cursor++;
        continue;
      }
      masked.push(text.slice(plainStart, cursor));
      masked.push(text.slice(cursor, markupEnd).replace(/[^\r\n]/g, " "));
      cursor = markupEnd;
      plainStart = cursor;
    }
    masked.push(text.slice(plainStart));
    return masked.join("");
  }
  function maskMarkdownInlineContexts(source, replacement = "x") {
    const text = String(source != null ? source : "");
    const protectedText = maskRanges(
      text,
      resolveInlineMathAndCodeRanges(text).active,
      replacement
    );
    return maskHtmlMathContexts(protectedText);
  }

  // src/shared/syntax-tools.js
  (function(root, factory) {
    const api = factory();
    if (root) {
      root.QuizifySyntax = api;
    }
  })(typeof globalThis !== "undefined" ? globalThis : window, function() {
    const snippets = [
      [t("editor.snippet.fitb"), t("editor.snippet.fitb.template"), t("editor.placeholder.answer")],
      [t("editor.snippet.choice"), t("editor.snippet.choice.template"), t("editor.placeholder.option_a")],
      [t("editor.snippet.reveal"), t("editor.snippet.reveal.template"), t("editor.placeholder.question")],
      [t("editor.snippet.annotation"), t("editor.snippet.annotation.template"), t("editor.placeholder.content")],
      [t("editor.snippet.collapse"), t("editor.snippet.collapse.template"), t("editor.placeholder.title")],
      [t("editor.snippet.tabs"), t("editor.snippet.tabs.template"), t("editor.placeholder.tab_one")],
      [t("editor.snippet.mask"), t("editor.snippet.mask.template"), t("editor.placeholder.mask")]
    ];
    const markdownActions = [
      {
        id: "bold",
        label: t("editor.action.bold"),
        button: "B",
        shortcut: "Ctrl+B",
        key: "b",
        prefix: "**",
        suffix: "**",
        placeholder: t("editor.placeholder.bold")
      },
      {
        id: "italic",
        label: t("editor.action.italic"),
        button: "I",
        shortcut: "Ctrl+I",
        key: "i",
        prefix: "*",
        suffix: "*",
        placeholder: t("editor.placeholder.italic")
      },
      {
        id: "inline-code",
        label: t("editor.action.inline_code"),
        button: "</>",
        shortcut: "Ctrl+`",
        key: "`",
        prefix: "`",
        suffix: "`",
        placeholder: t("editor.placeholder.code")
      },
      {
        id: "link",
        label: t("editor.action.link"),
        button: "Link",
        shortcut: "Ctrl+K",
        key: "k",
        prefix: "[",
        suffix: "](url)",
        placeholder: t("editor.placeholder.link_text")
      },
      {
        id: "strikethrough",
        label: t("editor.action.strikethrough"),
        button: "S",
        shortcut: "Ctrl+Shift+X",
        key: "x",
        shift: true,
        prefix: "~~",
        suffix: "~~",
        placeholder: t("editor.placeholder.strikethrough")
      },
      {
        id: "highlight",
        label: t("editor.action.highlight"),
        button: "==",
        shortcut: "Ctrl+Shift+H",
        key: "h",
        shift: true,
        prefix: "==",
        suffix: "==",
        placeholder: t("editor.placeholder.highlight")
      },
      {
        id: "superscript",
        label: t("editor.action.superscript"),
        button: "X\xB2",
        shortcut: "Ctrl+Shift+.",
        code: "Period",
        shift: true,
        prefix: "^",
        suffix: "^",
        placeholder: t("editor.placeholder.superscript")
      },
      {
        id: "subscript",
        label: t("editor.action.subscript"),
        button: "X\u2082",
        shortcut: "Ctrl+Shift+,",
        code: "Comma",
        shift: true,
        prefix: "~",
        suffix: "~",
        placeholder: t("editor.placeholder.subscript")
      },
      {
        id: "github-alert",
        label: t("editor.action.alert"),
        button: "Alert",
        shortcut: "Ctrl+Shift+A",
        key: "a",
        shift: true,
        format: "alert",
        placeholder: t("editor.placeholder.alert")
      },
      {
        id: "heading",
        label: t("editor.action.heading"),
        button: "H1",
        shortcut: "",
        format: "heading",
        placeholder: t("editor.placeholder.heading")
      },
      {
        id: "blockquote",
        label: t("editor.action.blockquote"),
        button: "Quote",
        shortcut: "",
        format: "blockquote",
        placeholder: t("editor.placeholder.quote")
      },
      {
        id: "unordered-list",
        label: t("editor.action.unordered_list"),
        button: "\u2022 List",
        shortcut: "",
        format: "unordered-list",
        placeholder: t("editor.placeholder.list_item")
      },
      {
        id: "ordered-list",
        label: t("editor.action.ordered_list"),
        button: "1. List",
        shortcut: "",
        format: "ordered-list",
        placeholder: t("editor.placeholder.list_item")
      },
      {
        id: "code-block",
        label: t("editor.action.code_block"),
        button: "```",
        shortcut: "",
        format: "code-block",
        placeholder: t("editor.placeholder.code")
      },
      {
        id: "image",
        label: t("editor.action.image"),
        button: "Image",
        shortcut: "",
        format: "image",
        placeholder: t("editor.placeholder.image_alt")
      },
      {
        id: "table",
        label: t("editor.action.table"),
        button: "Table",
        shortcut: "",
        format: "table",
        placeholder: t("editor.placeholder.content")
      }
    ];
    function formatMarkdownAction(action, selection = "") {
      const selected = String(selection || "");
      const content = selected || (action == null ? void 0 : action.placeholder) || "";
      if ((action == null ? void 0 : action.format) === "alert") {
        const alert = /^(?:>|&gt;) \[!NOTE\]\n([\s\S]*?)\n?$/.exec(selected);
        if (alert) {
          return alert[1].split(/\r?\n/).map((line) => line.replace(/^(?:>|&gt;) ?/, "")).join("\n");
        }
        const quoted = content.split(/\r?\n/).map((line) => line ? `> ${line}` : ">").join("\n");
        return `> [!NOTE]
${quoted}
`;
      }
      if ((action == null ? void 0 : action.format) === "heading") {
        return /^#{1,6}\s+/.test(selected) ? selected.replace(/^#{1,6}\s+/, "") : `# ${content}`;
      }
      if ((action == null ? void 0 : action.format) === "blockquote") {
        const lines = content.split(/\r?\n/);
        const quoted = selected && lines.every((line) => !line || /^(?:>|&gt;) ?/.test(line));
        return quoted ? lines.map((line) => line.replace(/^(?:>|&gt;) ?/, "")).join("\n") : `${lines.map((line) => `> ${line}`).join("\n")}
`;
      }
      if ((action == null ? void 0 : action.format) === "unordered-list") {
        const lines = content.split(/\r?\n/);
        const listed = selected && lines.every((line) => !line || /^[-*+]\s+/.test(line));
        return listed ? lines.map((line) => line.replace(/^[-*+]\s+/, "")).join("\n") : `${lines.map((line) => `- ${line}`).join("\n")}
`;
      }
      if ((action == null ? void 0 : action.format) === "ordered-list") {
        const lines = content.split(/\r?\n/);
        const listed = selected && lines.every((line) => !line || /^\d+[.)]\s+/.test(line));
        return listed ? lines.map((line) => line.replace(/^\d+[.)]\s+/, "")).join("\n") : `${lines.map((line, index) => `${index + 1}. ${line}`).join("\n")}
`;
      }
      if ((action == null ? void 0 : action.format) === "code-block") {
        const fenced = /^```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(selected);
        return fenced ? fenced[1] : `\`\`\`
${content}
\`\`\`
`;
      }
      if ((action == null ? void 0 : action.format) === "image") {
        const image = /^!\[([\s\S]*)\]\(url\)$/.exec(selected);
        return image ? image[1] : `![${content}](url)`;
      }
      if ((action == null ? void 0 : action.format) === "table") {
        return t("editor.table.template", { content });
      }
      if (selected && (action == null ? void 0 : action.prefix) && (action == null ? void 0 : action.suffix) && selected.startsWith(action.prefix) && selected.endsWith(action.suffix) && selected.length >= action.prefix.length + action.suffix.length) {
        return selected.slice(action.prefix.length, selected.length - action.suffix.length);
      }
      return `${(action == null ? void 0 : action.prefix) || ""}${content}${(action == null ? void 0 : action.suffix) || ""}`;
    }
    function diagnostic(severity, message, line, column = 1) {
      return { severity, message, line, column };
    }
    function createLineLocator(source) {
      const text = String(source || "");
      const lineByOffset = new Uint32Array(text.length + 1);
      const lineStarts = [0];
      let lineIndex = 0;
      for (let index = 0; index < text.length; index++) {
        lineByOffset[index] = lineIndex;
        if (text.charCodeAt(index) === 10) {
          lineIndex++;
          lineStarts.push(index + 1);
        }
      }
      lineByOffset[text.length] = lineIndex;
      return (index) => {
        const numeric = Number.isFinite(index) ? Math.trunc(index) : 0;
        const offset = Math.max(0, Math.min(text.length, numeric));
        const locatedLine = lineByOffset[offset];
        return {
          line: locatedLine + 1,
          column: offset - lineStarts[locatedLine] + 1
        };
      };
    }
    function maskFencedCode(source) {
      return maskMarkdownFencedCode(source);
    }
    function maskSafeLinkInteractiveLabels(source, protectedSource) {
      const text = String(source || "");
      const masked = String(protectedSource || "");
      if (text.length !== masked.length) return masked;
      const output = masked.split("");
      const brackets = [];
      const interactivePatterns = [
        /\{\{[\s\S]*?\}\}/g,
        /\[\[[\s\S]*?\]\]/g,
        /\[(.*?)\]\^\((.*?)\)\^/gs,
        /%%[^%\n]+%%/g
      ];
      function escapedAt2(index) {
        let slashes = 0;
        while (index > 0 && text[--index] === "\\") slashes++;
        return slashes % 2 === 1;
      }
      function maskLabelRange(start, end) {
        const label = masked.slice(start, end);
        for (const pattern of interactivePatterns) {
          pattern.lastIndex = 0;
          for (const match of label.matchAll(pattern)) {
            const matchStart = start + match.index;
            const matchEnd = matchStart + match[0].length;
            for (let index = matchStart; index < matchEnd; index++) {
              if (output[index] !== "\r" && output[index] !== "\n") {
                output[index] = "x";
              }
            }
          }
        }
      }
      const referenceDefinition = /^ {0,3}\[((?:\\[\s\S]|[^\[\]\\])+?)\]:[ \t]*(?:<[^>\r\n]*>|[^\s<>]+)(?:[ \t]+(?:"(?:\\.|[^"\\\r\n])*"|'[^'\r\n]*'|\([^()\r\n]*\)))?[ \t]*(?=\r?$)/gm;
      for (const match of text.matchAll(referenceDefinition)) {
        const start = match.index;
        const end = start + match[0].length;
        for (let index = start; index < end; index++) {
          if (output[index] !== "\r" && output[index] !== "\n") {
            output[index] = "x";
          }
        }
      }
      for (let index = 0; index < text.length; index++) {
        if (text[index] === "\\") {
          index++;
          continue;
        }
        if (text[index] === "[") {
          brackets.push(index);
          continue;
        }
        if (text[index] !== "]" || !brackets.length) continue;
        const labelOpen = brackets.pop();
        if (masked[labelOpen] === text[labelOpen] || masked[index] === text[index]) {
          continue;
        }
        if (labelOpen > 0 && text[labelOpen - 1] === "!" && !escapedAt2(labelOpen - 1)) {
          continue;
        }
        maskLabelRange(labelOpen + 1, index);
      }
      return output.join("");
    }
    function protectAuthoringSyntax(source) {
      const fenced = maskFencedCode(source);
      const inline = maskMarkdownInlineContexts(fenced);
      return maskSafeLinkInteractiveLabels(fenced, inline);
    }
    function choiceOptionsFromLines(lines) {
      const options = [];
      const seen = /* @__PURE__ */ new Set();
      for (const optionLine of lines) {
        const match = /^([A-Za-z])\. ?(.+)$/.exec(optionLine.text.trim());
        if (!match) continue;
        const letter = match[1].toUpperCase();
        options.push({
          letter,
          text: match[2],
          line: optionLine.line,
          duplicate: seen.has(letter)
        });
        seen.add(letter);
      }
      return options;
    }
    function analyzeFillBlanks(source, diagnostics, locate) {
      for (const match of source.matchAll(/\{\{(.*?)\}\}/gs)) {
        if (match[1].trim()) continue;
        const pos = locate(match.index);
        diagnostics.push(diagnostic("warning", t("syntax.empty_fitb"), pos.line, pos.column));
      }
    }
    function analyzeReveal(source, diagnostics, locate) {
      for (const match of source.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
        const body = match[1];
        const pos = locate(match.index);
        if (!body.includes("||")) {
          diagnostics.push(diagnostic("error", t("syntax.reveal_missing_separator"), pos.line, pos.column));
          continue;
        }
        const [question, answer] = body.split("||");
        if (!question.trim()) {
          diagnostics.push(diagnostic("warning", t("syntax.empty_reveal_question"), pos.line, pos.column));
        }
        if (!answer.trim()) {
          diagnostics.push(diagnostic("warning", t("syntax.empty_reveal_answer"), pos.line, pos.column));
        }
      }
    }
    function analyzeAnnotations(source, diagnostics, locate) {
      for (const match of source.matchAll(/\[(.*?)\]\^\((.*?)\)\^/gs)) {
        const pos = locate(match.index);
        if (!match[1].trim()) {
          diagnostics.push(diagnostic("warning", t("syntax.empty_annotation_text"), pos.line, pos.column));
        }
        if (!match[2].trim()) {
          diagnostics.push(diagnostic("warning", t("syntax.empty_annotation_note"), pos.line, pos.column));
        }
      }
    }
    function analyzeMasks(source, diagnostics, locate) {
      const text = String(source || "");
      const lines = text.split(/\r?\n/);
      const unpaired = [];
      lines.forEach((line, index) => {
        let delimiters = 0;
        for (const match of line.matchAll(/%%/g)) {
          let slashes = 0;
          for (let back = match.index - 1; back >= 0 && line[back] === "\\"; back--) {
            slashes++;
          }
          if (slashes % 2 === 0) delimiters++;
        }
        if (delimiters % 2 === 1) unpaired.push(index);
      });
      const spanning = /* @__PURE__ */ new Set();
      for (let index = 0; index + 1 < unpaired.length; index++) {
        if (unpaired[index + 1] === unpaired[index] + 1) {
          spanning.add(unpaired[index]);
          spanning.add(unpaired[index + 1]);
        }
      }
      for (const index of unpaired) {
        diagnostics.push(
          diagnostic(
            "warning",
            t(spanning.has(index) ? "syntax.mask_cross_line" : "syntax.mask_unpaired"),
            index + 1
          )
        );
      }
    }
    function analyzeChoiceBlocks(lines, diagnostics) {
      let index = 0;
      while (index < lines.length) {
        if (!/^;;;\s*$/.test(lines[index])) {
          index++;
          continue;
        }
        const startLine = index + 1;
        const optionLines = [];
        index++;
        while (index < lines.length && !/^;;;[A-Za-z]*\s*$/.test(lines[index].trim())) {
          optionLines.push({ text: lines[index], line: index + 1 });
          index++;
        }
        if (index >= lines.length) {
          diagnostics.push(diagnostic("error", t("syntax.choice_missing_answer_line"), startLine));
          return;
        }
        const close = /^;;;([A-Za-z]*)\s*$/.exec(lines[index].trim());
        const rawAnswers = close ? close[1].toUpperCase() : "";
        const answers = uniqueSortedLetters(rawAnswers).split("").filter(Boolean);
        const options = choiceOptionsFromLines(optionLines);
        const seen = new Set(options.map((option) => option.letter));
        if (options.length < 2) {
          diagnostics.push(diagnostic("error", t("syntax.choice_too_few_options"), startLine));
        }
        if (!answers.length) {
          diagnostics.push(diagnostic("error", t("syntax.choice_empty_answer"), index + 1));
        }
        if (rawAnswers && rawAnswers.length !== uniqueSortedLetters(rawAnswers).length) {
          diagnostics.push(diagnostic("warning", t("syntax.choice_duplicate_answers"), index + 1));
        }
        for (const answer of answers) {
          if (!seen.has(answer)) {
            diagnostics.push(diagnostic("error", t("syntax.choice_missing_option", { answer }), index + 1));
          }
        }
        for (const option of options) {
          if (option.duplicate) {
            diagnostics.push(diagnostic("error", t("syntax.choice_duplicate_option", { option: option.letter }), option.line));
          }
          if (!option.text.trim()) {
            diagnostics.push(diagnostic("warning", t("syntax.choice_empty_option", { option: option.letter }), option.line));
          }
        }
        index++;
      }
    }
    function analyzeContainers(lines, diagnostics) {
      const collapseStack = [];
      let tabStart = null;
      let tabCount = 0;
      lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const trimmed = line.trim();
        if (/^:::\s+\S/.test(trimmed)) {
          collapseStack.push(lineNo);
        } else if (/^:::\s*$/.test(trimmed)) {
          if (!collapseStack.length) {
            diagnostics.push(diagnostic("error", t("syntax.collapse_extra_close"), lineNo));
          } else {
            collapseStack.pop();
          }
        }
        if (/^===\s+\S/.test(trimmed)) {
          if (tabStart === null) tabStart = lineNo;
          tabCount++;
        } else if (/^===\s*$/.test(trimmed)) {
          if (tabStart === null) {
            diagnostics.push(diagnostic("error", t("syntax.tabs_extra_close"), lineNo));
          } else if (tabCount < 2) {
            diagnostics.push(diagnostic("warning", t("syntax.tabs_too_few"), tabStart));
            tabStart = null;
            tabCount = 0;
          } else {
            tabStart = null;
            tabCount = 0;
          }
        }
      });
      for (const lineNo of collapseStack) {
        diagnostics.push(diagnostic("error", t("syntax.collapse_missing_close"), lineNo));
      }
      if (tabStart !== null) {
        diagnostics.push(diagnostic("error", t("syntax.tabs_missing_close"), tabStart));
      }
    }
    function analyzeQuizifySyntax(source) {
      const text = String(source || "");
      const protectedText = protectAuthoringSyntax(text);
      const locate = createLineLocator(text);
      const diagnostics = [];
      const lines = protectedText.split(/\r?\n/);
      analyzeFillBlanks(protectedText, diagnostics, locate);
      analyzeReveal(protectedText, diagnostics, locate);
      analyzeAnnotations(protectedText, diagnostics, locate);
      analyzeChoiceBlocks(lines, diagnostics);
      analyzeContainers(lines, diagnostics);
      analyzeMasks(protectedText, diagnostics, locate);
      diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
      return diagnostics;
    }
    function trimPreview(value, max = 40) {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
    }
    function previewItem(kind, title, line, meta = {}, column = 1) {
      return { kind, title, line, meta, _sourceColumn: column };
    }
    function collectInlinePreview(source, items, locate) {
      const text = String(source || "");
      for (const match of text.matchAll(/\{\{(.*?)\}\}/gs)) {
        const pos = locate(match.index);
        const answer = trimPreview(match[1] || t("syntax.preview.empty_answer"));
        items.push(previewItem("fitb", t("editor.snippet.fitb"), pos.line, { answer }, pos.column));
      }
      for (const match of text.matchAll(/%%([^%\n]+)%%/g)) {
        const pos = locate(match.index);
        items.push(previewItem("mask", t("editor.snippet.mask"), pos.line, {
          text: trimPreview(match[1] || t("syntax.preview.empty_text"))
        }, pos.column));
      }
      for (const match of text.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
        const pos = locate(match.index);
        const [question = "", answer = ""] = match[1].split("||");
        items.push(previewItem("reveal", t("editor.snippet.reveal"), pos.line, {
          question: trimPreview(question || t("syntax.preview.empty_question")),
          answer: trimPreview(answer || t("syntax.preview.empty_answer"))
        }, pos.column));
      }
      for (const match of text.matchAll(/\[(.*?)\]\^\((.*?)\)\^/gs)) {
        const pos = locate(match.index);
        items.push(previewItem("annotation", t("editor.snippet.annotation"), pos.line, {
          text: trimPreview(match[1] || t("syntax.preview.empty_text")),
          note: trimPreview(match[2] || t("syntax.preview.empty_note"))
        }, pos.column));
      }
    }
    function collectChoicePreview(lines, items) {
      let index = 0;
      while (index < lines.length) {
        if (!/^;;;\s*$/.test(lines[index])) {
          index++;
          continue;
        }
        const startLine = index + 1;
        const optionLines = [];
        index++;
        while (index < lines.length && !/^;;;[A-Za-z]*\s*$/.test(lines[index].trim())) {
          optionLines.push({ text: lines[index], line: index + 1 });
          index++;
        }
        const close = index < lines.length ? /^;;;([A-Za-z]*)\s*$/.exec(lines[index].trim()) : null;
        const options = choiceOptionsFromLines(optionLines).map((option) => option.letter);
        const answers = close ? uniqueSortedLetters(close[1]) : "";
        items.push(previewItem(answers.length === 1 ? "single" : "multiple", t(answers.length === 1 ? "syntax.preview.single" : "syntax.preview.multiple"), startLine, {
          options: options.join("") || t("syntax.preview.no_options"),
          answers: answers || t("syntax.preview.no_answer")
        }));
        index++;
      }
    }
    function collectContainerPreview(lines, items) {
      lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const collapse = /^:::\s+(.+?)\s*$/.exec(line.trim());
        if (collapse) {
          items.push(previewItem("collapse", t("editor.snippet.collapse"), lineNo, {
            title: trimPreview(collapse[1])
          }));
        }
        const tab = /^===\s+(.+?)\s*$/.exec(line.trim());
        if (tab) {
          items.push(previewItem("tab", t("editor.snippet.tabs"), lineNo, {
            title: trimPreview(tab[1])
          }));
        }
      });
    }
    function collectQuizifyPreview(source) {
      const text = String(source || "");
      const protectedText = protectAuthoringSyntax(text);
      const lines = protectedText.split(/\r?\n/);
      const locate = createLineLocator(text);
      const items = [];
      collectInlinePreview(protectedText, items, locate);
      collectChoicePreview(lines, items);
      collectContainerPreview(lines, items);
      items.sort((a, b) => a.line - b.line || a._sourceColumn - b._sourceColumn);
      return items.map(({ _sourceColumn, ...item }) => item);
    }
    function summarizeDiagnostics(diagnostics) {
      const errors = diagnostics.filter((item) => item.severity === "error").length;
      const warnings = diagnostics.filter((item) => item.severity === "warning").length;
      if (!errors && !warnings) return t("syntax.summary.valid");
      const errorSummary = tn("syntax.summary.errors", errors);
      const warningSummary = tn("syntax.summary.warnings", warnings);
      if (errors && warnings) {
        return t("syntax.summary.combined", {
          errors: errorSummary,
          warnings: warningSummary
        });
      }
      return errors ? errorSummary : warningSummary;
    }
    return {
      snippets,
      markdownActions,
      formatMarkdownAction,
      analyzeQuizifySyntax,
      collectQuizifyPreview,
      summarizeDiagnostics
    };
  });
})();
if (typeof module === 'object' && module.exports) module.exports = globalThis.QuizifySyntax;

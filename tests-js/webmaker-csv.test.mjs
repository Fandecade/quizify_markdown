import assert from "node:assert/strict";
import test from "node:test";

import {
  detectSeparator,
  duplicateGroups,
  exportCsv,
  exportIssues,
  normalizeFromAnki,
  parseCsvCards
} from "../src/webmaker/csv.js";

const card = (front, back, tags = [], guid = "g") => ({ front, back, tags, guid });

test("exportCsv writes the directives Anki needs and round-trips through parseCsvCards", () => {
  const cards = [
    card("什么是 %%三次握手%%？", "先发 SYN\n再回 SYN+ACK", ["网络", "自测"], "qf1"),
    card('引号 " 与,逗号', "第二行\n第三行", [], "qf2")
  ];
  const csv = exportCsv({ deck: "学习::网络", tags: "期末 复习", cards });

  assert.match(csv, /^#separator:comma\n/);
  assert.match(csv, /\n#notetype:Quizify Markdown\n/);
  assert.match(csv, /\n#deck:学习::网络\n/);
  assert.match(csv, /\n#columns:Front,Back,tags,guid\n/);
  assert.match(csv, /\n#tags column:3\n/);
  assert.match(csv, /\n#guid column:4\n/);
  assert.match(csv, /\n#if matches:update current\n/);
  assert.match(csv, /\n#tags:期末 复习\n/);

  const parsed = parseCsvCards(csv);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.deck, "学习::网络");
  assert.equal(parsed.tags, "期末 复习");
  assert.equal(parsed.cards.length, 2);
  assert.equal(parsed.cards[0].front, "什么是 %%三次握手%%？");
  assert.equal(parsed.cards[0].back, "先发 SYN\n再回 SYN+ACK");
  assert.deepEqual(parsed.cards[0].tags, ["网络", "自测"]);
  assert.equal(parsed.cards[0].guid, "qf1");
  assert.equal(parsed.cards[1].front, '引号 " 与,逗号');
  assert.equal(parsed.cards[1].back, "第二行\n第三行");
});

test("re-importing an exported file is byte-stable", () => {
  const cards = [card("A", "B", ["t"], "x"), card("C\nD", 'E"F', [], "y")];
  const first = exportCsv({ deck: "牌组", tags: "", cards });
  const second = exportCsv({
    deck: "牌组",
    tags: "",
    cards: parseCsvCards(first).cards
  });
  assert.equal(first, second);
});

test("parseCsvCards restores Anki's <br> escapes without touching typed ones", () => {
  assert.equal(normalizeFromAnki("a<br>b"), "a\nb");
  assert.equal(normalizeFromAnki("a&lt;br&gt;b"), "a<br>b");
  assert.equal(normalizeFromAnki("&amp;lt;"), "&lt;");
  assert.equal(normalizeFromAnki("&quot;x&quot; &#39;y&#39;"), '"x" \'y\'');
});

test("parseCsvCards honours foreign separators and column maps", () => {
  const text = [
    "#separator:tab",
    "#html:false",
    "#columns:Back\tFront\ttags",
    "#tags column:3",
    "背面\t正面\ttag1 tag2"
  ].join("\n");
  const parsed = parseCsvCards(text);
  assert.equal(parsed.separator, "\t");
  assert.equal(parsed.cards[0].front, "正面");
  assert.equal(parsed.cards[0].back, "背面");
  assert.deepEqual(parsed.cards[0].tags, ["tag1", "tag2"]);
  assert.equal(parsed.cards[0].guid, "");
});

test("a hand-written header row is recognised, but never re-interpreted from our own export", () => {
  const plain = parseCsvCards("Front,Back,tags,guid\n甲,乙\n丙,丁,tag1\n");
  assert.equal(plain.cards.length, 2);
  assert.equal(plain.cards[0].front, "甲");
  assert.deepEqual(plain.cards[1].tags, ["tag1"]);

  const reordered = parseCsvCards("#separator:comma\nBack,Front\n答案,问题\n");
  assert.equal(reordered.cards.length, 1);
  assert.equal(reordered.cards[0].front, "问题");
  assert.equal(reordered.cards[0].back, "答案");

  const headings = parseCsvCards("正面,背面,标签\n甲,乙,自测\n");
  assert.equal(headings.cards.length, 1);
  assert.deepEqual(headings.cards[0].tags, ["自测"]);

  // Only a row that names both fields counts as a header.
  assert.equal(parseCsvCards("甲,乙\n丙,丁\n").cards.length, 2);
  assert.equal(parseCsvCards("Front,甲\n乙,丙\n").cards.length, 2);
  assert.equal(parseCsvCards("甲,Back\n乙,丙\n").cards.length, 2);

  // The tool's own export carries #columns, so its first row stays data.
  const own = parseCsvCards(exportCsv({ deck: "d", tags: "", cards: [card("Front", "Back")] }));
  assert.equal(own.cards.length, 1);
  assert.equal(own.cards[0].front, "Front");
});

test("detectSeparator ignores separators inside quoted fields", () => {
  assert.equal(detectSeparator('"a,b,c";"d"'), ";");
  assert.equal(detectSeparator('a,b,"c;d"'), ",");
});

test("exportIssues reports an unusable deck and duplicated cards", () => {
  const issues = exportIssues({
    deck: 'bad"deck',
    tags: "a,b",
    cards: [card("x", "y"), card("x", "y"), card("", "")]
  });
  const messages = issues.map((issue) => issue.message);
  assert(messages.some((message) => message.includes("牌组名不能包含")));
  assert(messages.some((message) => message.includes("全局标签")));
  assert(messages.some((message) => message.includes("正面是空的")));
  assert(messages.some((message) => message.includes("完全相同")));
});

test("duplicateGroups only groups cards that share both fields", () => {
  const groups = duplicateGroups([card("a", "b"), card("a", "b"), card("a", "c")]);
  assert.deepEqual(groups, [[0, 1]]);
});

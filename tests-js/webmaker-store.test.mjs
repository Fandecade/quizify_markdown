import assert from "node:assert/strict";
import test from "node:test";

import { createStore, DEFAULT_SETTINGS, splitTags, STORAGE_KEY } from "../src/webmaker/store.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() {
      return map.size;
    }
  };
}

test("splitTags accepts spaces and commas and drops empties", () => {
  assert.deepEqual(splitTags("a b,c  d"), ["a", "b", "c", "d"]);
  assert.deepEqual(splitTags(""), []);
  assert.deepEqual(splitTags(null), []);
});

test("a fresh store starts with one empty card and the default settings", () => {
  const store = createStore({ storage: null });
  assert.equal(store.cards.length, 1);
  assert.equal(store.current().front, "");
  assert.ok(store.current().guid.startsWith("qf"));
  assert.deepEqual(store.settings, { ...DEFAULT_SETTINGS });
  assert.equal(store.state.currentId, store.cards[0].id);
});

test("card edits, duplication and ordering keep the current card in sync", () => {
  const store = createStore({ storage: null });
  const first = store.current();
  store.setField("front", "第一张");
  store.setCardTags("网络 复习");
  assert.equal(store.current().front, "第一张");
  assert.deepEqual(store.current().tags, ["网络", "复习"]);

  const second = store.addCard({ front: "第二张" });
  assert.equal(store.cards.length, 2);
  assert.equal(store.current().id, second.id);

  store.duplicateCard(first.id);
  assert.equal(store.cards.length, 3);
  assert.equal(store.current().front, "第一张");
  assert.notEqual(store.current().guid, first.guid);

  assert.equal(store.moveCard(store.current().id, -1), true);
  assert.equal(store.cards[0].front, "第一张");
  assert.equal(store.moveCard(store.current().id, -5), false);
});

test("the last card cannot be removed and deletions are undoable", () => {
  const store = createStore({ storage: null });
  store.addCard({ front: "keep" });
  const doomed = store.addCard({ front: "doomed" });
  assert.ok(store.removeCard(doomed.id));
  assert.equal(store.cards.length, 2);
  assert.equal(store.canUndo(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.cards.length, 3);
  assert.ok(store.cards.some((card) => card.front === "doomed"));

  const single = createStore({ storage: null });
  assert.equal(single.removeCard(single.current().id), null);
  assert.equal(single.cards.length, 1);
});

test("step walks the deck and stops at both ends", () => {
  const store = createStore({ storage: null });
  const first = store.current().id;
  store.addCard({ front: "two" });
  const second = store.current().id;
  assert.equal(store.step(1), false);
  assert.equal(store.step(-1), true);
  assert.equal(store.state.currentId, first);
  assert.equal(store.step(-1), false);
  assert.equal(store.step(1), true);
  assert.equal(store.state.currentId, second);
});

test("autosave writes the project and load restores it", async () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  store.setField("front", "持久化");
  store.updateSettings({ deck: "学习::网络", night: true });
  store.flush();

  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(raw, "autosave should have written the project");
  const project = JSON.parse(raw);
  assert.equal(project.cards[0].front, "持久化");
  assert.equal(project.settings.deck, "学习::网络");

  const restored = createStore({ storage });
  restored.load();
  assert.equal(restored.current().front, "持久化");
  assert.equal(restored.settings.night, true);
  assert.equal(restored.settings.theme, DEFAULT_SETTINGS.theme);
});

test("a corrupt autosave never blocks the editor", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, "{not json");
  const store = createStore({ storage });
  assert.doesNotThrow(() => store.load());
  assert.equal(store.cards.length, 1);
  assert.equal(store.current().front, "");
});

test("replaceAll normalises imported cards and clamps the current id", () => {
  const store = createStore({ storage: null });
  store.replaceAll({
    settings: { deck: "导入", tags: "a", night: "yes" },
    cards: [{ front: "a", back: "b", tags: "x y" }, { front: "c" }],
    currentId: "missing"
  });
  assert.equal(store.cards.length, 2);
  assert.deepEqual(store.cards[0].tags, ["x", "y"]);
  assert.equal(store.settings.night, true);
  assert.equal(store.state.currentId, store.cards[0].id);

  store.replaceAll({ cards: [] });
  assert.equal(store.cards.length, 1);
  assert.equal(store.settings.deck, DEFAULT_SETTINGS.deck);
});

test("a storage that throws falls back to working without persistence", () => {
  const hostile = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("SecurityError");
    },
    removeItem() {}
  };
  const store = createStore({ storage: hostile });
  assert.doesNotThrow(() => store.load());
  assert.doesNotThrow(() => {
    store.setField("front", "x");
    store.flush();
  });
  assert.equal(store.current().front, "x");
});

test("reorderCards accepts a permutation, rejects junk and is undoable", () => {
  const store = createStore({ storage: null });
  store.setField("front", "a");
  store.addCard({ front: "b" });
  store.addCard({ front: "c" });
  const [a, b, c] = store.cards.map((card) => card.id);

  assert.equal(store.reorderCards([c, a, b]), true);
  assert.deepEqual(store.cards.map((card) => card.front), ["c", "a", "b"]);

  assert.equal(store.reorderCards([c, a, b]), false);
  assert.equal(store.reorderCards([c, a]), false);
  assert.equal(store.reorderCards([c, a, "missing"]), false);
  assert.equal(store.reorderCards([c, c, a]), false);
  assert.deepEqual(store.cards.map((card) => card.front), ["c", "a", "b"]);

  assert.equal(store.undo(), true);
  assert.deepEqual(store.cards.map((card) => card.front), ["a", "b", "c"]);
});

test("clearAll drops the whole deck, keeps one blank card and is undoable", () => {
  const store = createStore({ storage: null });
  store.setField("front", "第一张");
  store.addCard({ front: "第二张" });
  assert.equal(store.cards.length, 2);

  assert.equal(store.clearAll(), 2);
  assert.equal(store.cards.length, 1);
  assert.equal(store.cards[0].front, "");
  assert.equal(store.canUndo(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.cards.length, 2);
  assert.equal(store.cards[0].front, "第一张");

  const single = createStore({ storage: null });
  single.setField("front", "只有这张");
  assert.equal(single.clearAll(), 1);
  assert.equal(single.cards[0].front, "");
  assert.equal(single.undo(), true);
  assert.equal(single.cards[0].front, "只有这张");
});

test("clearAll is a no-op on an already empty deck", () => {
  const store = createStore({ storage: null });
  assert.equal(store.clearAll(), 0);
  assert.equal(store.canUndo(), false);
  assert.equal(store.cards.length, 1);
});

test("localStorage availability is probed instead of assumed", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    }
  });
  try {
    const store = createStore();
    assert.doesNotThrow(() => store.load());
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

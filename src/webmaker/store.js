import { debounce } from "./dom.js";

export const PROJECT_VERSION = 1;
export const STORAGE_KEY = "quizify.webmaker.v1";

export const DEFAULT_SETTINGS = Object.freeze({
  deck: "学习::网络",
  tags: "",
  theme: "kaiwu",
  night: false,
  ifMatches: "update current"
});

export const FIELDS = Object.freeze(["front", "back"]);

function randomToken(prefix) {
  const webcrypto = globalThis.crypto;
  if (typeof webcrypto?.randomUUID === "function") {
    return `${prefix}${webcrypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  let out = "";
  for (let index = 0; index < 12; index += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return `${prefix}${out}`;
}

export function createCard(overrides = {}) {
  return {
    id: randomToken("c"),
    guid: randomToken("qf"),
    front: "",
    back: "",
    tags: [],
    ...overrides
  };
}

export function splitTags(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function safeStorage() {
  try {
    const probe = "__quizify_webmaker_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function normalizeCard(raw) {
  const card = createCard();
  if (!raw || typeof raw !== "object") return card;
  if (typeof raw.id === "string" && raw.id) card.id = raw.id;
  if (typeof raw.guid === "string" && raw.guid) card.guid = raw.guid;
  card.front = String(raw.front ?? "");
  card.back = String(raw.back ?? "");
  card.tags = Array.isArray(raw.tags) ? raw.tags.map(String) : splitTags(raw.tags);
  return card;
}

export function createStore(options = {}) {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const listeners = new Set();
  const undoStack = [];
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    cards: [createCard()],
    currentId: null
  };

  const persist = debounce(() => {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(toProject()));
      notify("saved");
    } catch {
      notify("save-failed");
    }
  }, 400);

  function notify(reason = "change") {
    for (const listener of listeners) listener(reason, state);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function toProject() {
    return {
      version: PROJECT_VERSION,
      settings: { ...state.settings },
      cards: state.cards.map((card) => ({
        id: card.id,
        guid: card.guid,
        front: card.front,
        back: card.back,
        tags: [...card.tags]
      })),
      currentId: state.currentId
    };
  }

  function replaceAll(project, { silent = false } = {}) {
    const source = project && typeof project === "object" ? project : {};
    state.settings = { ...DEFAULT_SETTINGS, ...(source.settings || {}) };
    state.settings.night = Boolean(state.settings.night);
    const cards = Array.isArray(source.cards) ? source.cards.map(normalizeCard) : [];
    state.cards = cards.length ? cards : [createCard()];
    state.currentId = state.cards.some((card) => card.id === source.currentId)
      ? source.currentId
      : state.cards[0].id;
    undoStack.length = 0;
    if (!silent) {
      persist.cancel();
      persist();
      notify("cards");
    }
    return state;
  }

  function load() {
    if (!storage) return state;
    let raw = null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw) {
      try {
        replaceAll(JSON.parse(raw), { silent: true });
      } catch {
        // A corrupt autosave must never block the editor.
      }
    }
    if (!state.currentId) state.currentId = state.cards[0].id;
    return state;
  }

  function currentIndex() {
    const index = state.cards.findIndex((card) => card.id === state.currentId);
    return index < 0 ? 0 : index;
  }

  function current() {
    if (!state.cards.length) state.cards.push(createCard());
    const found = state.cards.find((card) => card.id === state.currentId);
    if (found) return found;
    state.currentId = state.cards[0].id;
    return state.cards[0];
  }

  function select(id) {
    if (id === state.currentId) return;
    if (!state.cards.some((card) => card.id === id)) return;
    state.currentId = id;
    persist();
    notify("select");
  }

  function pushUndo() {
    undoStack.push({ cards: toProject().cards, currentId: state.currentId });
    if (undoStack.length > 30) undoStack.shift();
  }

  function addCard(overrides = {}, { after = null } = {}) {
    pushUndo();
    const card = createCard(overrides);
    const index = state.cards.findIndex((item) => item.id === (after ?? state.currentId));
    state.cards.splice(index < 0 ? state.cards.length : index + 1, 0, card);
    state.currentId = card.id;
    persist();
    notify("cards");
    return card;
  }

  function duplicateCard(id = state.currentId) {
    const source = state.cards.find((card) => card.id === id);
    if (!source) return null;
    return addCard(
      { front: source.front, back: source.back, tags: [...source.tags] },
      { after: id }
    );
  }

  function removeCard(id = state.currentId) {
    if (state.cards.length <= 1) return null;
    const index = state.cards.findIndex((card) => card.id === id);
    if (index < 0) return null;
    pushUndo();
    const [removed] = state.cards.splice(index, 1);
    if (state.currentId === removed.id) {
      const next = state.cards[Math.min(index, state.cards.length - 1)];
      state.currentId = next.id;
    }
    persist();
    notify("cards");
    return removed;
  }

  function clearAll() {
    const removed = state.cards.length;
    const onlyBlank =
      removed === 1 &&
      !state.cards[0].front.trim() &&
      !state.cards[0].back.trim() &&
      !state.cards[0].tags.length;
    if (!removed || onlyBlank) return 0;
    pushUndo();
    state.cards = [createCard()];
    state.currentId = state.cards[0].id;
    persist();
    notify("cards");
    return removed;
  }

  function moveCard(id = state.currentId, delta) {
    const index = state.cards.findIndex((card) => card.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= state.cards.length) return false;
    pushUndo();
    const [card] = state.cards.splice(index, 1);
    state.cards.splice(target, 0, card);
    persist();
    notify("cards");
    return true;
  }

  function reorderCards(ids) {
    if (!Array.isArray(ids) || ids.length !== state.cards.length) return false;
    const byId = new Map(state.cards.map((card) => [card.id, card]));
    const next = [];
    for (const id of ids) {
      const card = byId.get(id);
      if (!card || next.includes(card)) return false;
      next.push(card);
    }
    if (next.every((card, index) => card === state.cards[index])) return false;
    pushUndo();
    state.cards = next;
    persist();
    notify("cards");
    return true;
  }

  function step(delta) {
    const index = currentIndex() + delta;
    if (index < 0 || index >= state.cards.length) return false;
    select(state.cards[index].id);
    return true;
  }

  function setField(field, value, id = state.currentId) {
    const card = state.cards.find((item) => item.id === id);
    if (!card || !FIELDS.includes(field)) return;
    card[field] = String(value ?? "");
    persist();
    notify("field");
  }

  function setCardTags(tags, id = state.currentId) {
    const card = state.cards.find((item) => item.id === id);
    if (!card) return;
    card.tags = Array.isArray(tags) ? tags : splitTags(tags);
    persist();
    notify("field");
  }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    persist();
    notify("settings");
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return false;
    state.cards = entry.cards.map(normalizeCard);
    state.currentId = entry.currentId;
    if (!state.cards.some((card) => card.id === state.currentId)) {
      state.currentId = state.cards[0]?.id ?? null;
    }
    persist();
    notify("cards");
    return true;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function flush() {
    persist.flush();
  }

  state.currentId = state.cards[0].id;

  return {
    state,
    subscribe,
    load,
    toProject,
    replaceAll,
    current,
    currentIndex,
    select,
    addCard,
    duplicateCard,
    removeCard,
    clearAll,
    moveCard,
    reorderCards,
    step,
    setField,
    setCardTags,
    updateSettings,
    undo,
    canUndo,
    flush,
    get cards() {
      return state.cards;
    },
    get settings() {
      return state.settings;
    }
  };
}

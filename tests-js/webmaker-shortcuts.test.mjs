import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBindings,
  createShortcutRunner,
  displayKeySpec,
  eventSignature,
  isComposing,
  keyToken,
  parseKeySpec,
  signatureForSpec
} from "../src/webmaker/shortcuts.js";

const press = (overrides) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {},
  ...overrides
});

test("key specs resolve Mod per platform and accept aliases", () => {
  const parsed = parseKeySpec("Cmd+Option+Shift+3");
  assert.equal(parsed.alt, true);
  assert.equal(parsed.shift, true);
  assert.equal(parsed.key, "digit3");
  // Exactly one of ctrl/meta carries the platform modifier.
  assert.notEqual(parsed.ctrl, parsed.meta);
  assert.deepEqual(parseKeySpec("Alt+ArrowUp").key, "arrowup");
  assert.deepEqual(parseKeySpec("Mod+Enter").key, "enter");

  // In Node there is no navigator, so Mod resolves to the non-Mac control key
  // and every Mod alias collapses onto the same signature.
  assert.equal(signatureForSpec("Mod+B"), "ctrl+b");
  assert.equal(signatureForSpec("Ctrl+B"), "ctrl+b");
  assert.equal(signatureForSpec("Cmd+B"), signatureForSpec("Meta+B"));
});

test("punctuation is read from event.code so Option digits and shifted glyphs still match", () => {
  assert.equal(keyToken({ code: "Digit1", key: "\u00a1" }), "digit1");
  assert.equal(keyToken({ code: "Period", key: ">" }), ".");
  assert.equal(keyToken({ code: "Comma", key: "<" }), ",");
  assert.equal(keyToken({ code: "Slash", key: "?" }), "/");
  assert.equal(keyToken({ code: "Backspace", key: "Backspace" }), "backspace");
  assert.equal(keyToken({ key: " " }), "space");

  assert.equal(
    eventSignature(press({ altKey: true, code: "Digit7", key: "\u00a1" })),
    signatureForSpec("Alt+7")
  );
  assert.equal(
    eventSignature(press({ shiftKey: true, code: "Period", key: ">" })),
    signatureForSpec("Shift+.")
  );
});

test("buildBindings reports real conflicts but allows an alias onto the same command", () => {
  const first = { id: "a", keys: ["Mod+B", "Ctrl+Alt+1"] };
  const second = { id: "b", keys: ["Mod+B"] };
  const third = { id: "c", keys: ["Ctrl+Alt+1"] };
  const alone = buildBindings([first]);
  assert.deepEqual(alone.conflicts, []);
  assert.equal(alone.map.get(signatureForSpec("Ctrl+Alt+1")).id, "a");

  const clashing = buildBindings([first, second, third]);
  assert.deepEqual(
    clashing.conflicts.map((entry) => [entry.first, entry.second]).sort(),
    [["a", "b"], ["a", "c"]]
  );
});

test("the runner respects gates and composition state", () => {
  let calls = 0;
  const command = {
    id: "snippet.7",
    keys: ["Mod+Alt+7"],
    when: (event) => event.target?.tagName === "TEXTAREA",
    run: () => {
      calls += 1;
    }
  };
  const runner = createShortcutRunner({ commands: [command] });
  const shortcut = { altKey: true, ctrlKey: true, code: "Digit7", key: "\u00a1" };

  assert.equal(runner.handle(press({ ...shortcut, target: { tagName: "BODY" } })), false);
  assert.equal(calls, 0);

  const accepted = press({ ...shortcut, target: { tagName: "TEXTAREA" } });
  assert.equal(runner.handle(accepted), true);
  assert.equal(calls, 1);
  assert.equal(accepted.defaultPrevented, true);

  assert.equal(runner.handle(press({ ...shortcut, target: { tagName: "TEXTAREA" }, isComposing: true })), false);
  assert.equal(calls, 1);
});

test("a blocked runner lets the page keep its own Esc and dialog handling", () => {
  let calls = 0;
  const runner = createShortcutRunner({
    commands: [{ id: "x", keys: ["Mod+B"], run: () => { calls += 1; } }],
    isBlocked: () => true
  });
  assert.equal(runner.handle(press({ ctrlKey: true, code: "KeyB", key: "b" })), false);
  assert.equal(calls, 0);
});

test("isComposing detects IME composition", () => {
  assert.equal(isComposing({ isComposing: true }), true);
  assert.equal(isComposing({ keyCode: 229 }), true);
  assert.equal(isComposing({ key: "Process" }), true);
  assert.equal(isComposing({ key: "a" }), false);
});

test("displayKeySpec renders digits and arrows for humans", () => {
  assert.match(displayKeySpec("Mod+Alt+1"), /1$/);
  assert.match(displayKeySpec("Alt+ArrowUp"), /\u2191$/);
  assert.match(displayKeySpec("Alt+Backspace"), /Backspace|\u232b/);
});

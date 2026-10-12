import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../src/review/styles.css", import.meta.url),
  "utf8"
);

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("the review stylesheet stays brace-balanced so later rules are not swallowed", () => {
  // A single stray "}" makes every following rule part of an enclosing block
  // (or invalid), which silently disables the inline-mask styling.
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close, "unbalanced braces in src/review/styles.css");
  const maskRule = css.indexOf(".quizify-mask {");
  assert(maskRule > -1, "inline mask rule must exist in the review stylesheet");
});

test("card layout and focus styles no longer target every native button", () => {
  assert.doesNotMatch(css, /(?:^|})\s*\*\s*\{/m);
  assert.doesNotMatch(css, /(?:^|,)\s*button:focus-visible\s*(?:,|\{)/m);
  assert.match(css, /\.quizify-stage \*:not\(button\)/);
  assert.match(css, /\.quizify-floating-control \*:not\(button\)/);
});

test("owned controls neutralize Anki button defaults before component styling", () => {
  const reset = ruleFor("button[data-quizify-control]");
  for (const declaration of [
    "-webkit-appearance: none",
    "appearance: none",
    "box-sizing: border-box",
    "margin: 0",
    "padding: 0",
    "background-image: none",
    "border: 0",
    "border-radius: 0",
    "box-shadow: none",
    "font: inherit"
  ]) {
    assert(reset.includes(declaration), `owned control reset missing: ${declaration}`);
  }

  const focus = ruleFor("button[data-quizify-control]:focus-visible");
  assert.match(focus, /outline:\s*2px solid var\(--q-primary\) !important/);
});

test("every native card control has a component selector strong enough for Anki states", () => {
  for (const selector of [
    "button.feedback-icon",
    ".choice > button.feedback",
    "button.quizify-orb",
    ".quizify-floating-control button.quizify-orb:hover",
    ".quizify-floating-control button.quizify-orb:disabled"
  ]) {
    assert(css.includes(selector), `missing owned component selector: ${selector}`);
  }

  assert(ruleFor(".quizify-floating-control button.quizify-orb:disabled").includes("border: 0"));
});

test("inline text masks own their covered styling without leaking into native buttons", () => {
  const mask = ruleFor(".quizify-mask");
  assert.match(mask, /color:\s*transparent/);
  assert.match(mask, /background:\s*var\(--q-mask-fill\)/);
  const revealed = ruleFor(".quizify-mask.revealed");
  assert.match(revealed, /color:\s*inherit/);
});

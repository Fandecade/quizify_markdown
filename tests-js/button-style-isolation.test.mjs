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

/** Reads the declaration block that follows `selector`, even when it is the
 *  first member of a comma-separated selector list. */
function blockAfter(selector) {
  const index = css.indexOf(selector);
  assert(index > -1, `missing CSS selector: ${selector}`);
  const open = css.indexOf("{", index);
  assert(open > -1, `missing CSS block after: ${selector}`);
  return css.slice(open + 1, css.indexOf("}", open));
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

test("a covered mask also hides the colour and background of nested inline content", () => {
  // `%%`npm run build`%%`, `%%**bold**%%` and `%%[link](url)%%` all render an
  // element that sets its own `color`/`background`, which would otherwise stay
  // readable on top of the green cover.
  for (const selector of [
    ".quizify-mask:not(.revealed) .quizify-mask-text",
    ".quizify-mask:not(.revealed) .quizify-mask-text *"
  ]) {
    const rule = blockAfter(selector);
    for (const declaration of [
      "background: transparent !important",
      "border-color: transparent !important",
      "box-shadow: none !important",
      "color: transparent !important",
      "text-shadow: none !important",
      "-webkit-text-fill-color: transparent !important"
    ]) {
      assert(rule.includes(declaration), `${selector} missing: ${declaration}`);
    }
  }

  // Media keeps its box but stops painting, so revealing cannot reflow.
  const media = blockAfter(".quizify-mask:not(.revealed) .quizify-mask-text img");
  assert.equal(media.trim(), "visibility: hidden;");
  assert.doesNotMatch(css, /\.quizify-mask:not\(\.revealed\)[^{]*\{[^}]*display:\s*none/);
});

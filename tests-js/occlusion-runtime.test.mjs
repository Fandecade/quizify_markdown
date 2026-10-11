import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createLifecycle } from "../src/review/lifecycle.js";
import { initOcclusion } from "../src/review/runtime/occlusion.js";
import {
  buildOcclusionBlock,
  extractMarkdownImage,
  parseOcclusionOptions,
  parseOcclusionRegion,
  sortOcclusionRegions,
  stripFirstImage
} from "../src/shared/occlusion.js";

function makeFigure(regions = 2) {
  const shapes = Array.from(
    { length: regions },
    (_, index) =>
      `<g class="quizify-occlusion-region" role="button" tabindex="0" data-order="${index + 1}">` +
      `<rect class="quizify-occlusion-box" x="10" y="10" width="30" height="20"></rect>` +
      '<g class="quizify-occlusion-content"></g></g>'
  ).join("");
  return new JSDOM(
    '<!doctype html><body><section id="front" class="quizify-field">' +
      '<figure class="quizify-occlusion" data-count="2">' +
      `<svg class="quizify-occlusion-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">${shapes}</svg>` +
      "</figure></section></body>",
    { url: "https://anki.local/" }
  );
}

test("occlusion regions register as reveal controllers and toggle on click", () => {
  const dom = makeFigure();
  const controllers = [];
  const lifecycle = createLifecycle();
  initOcclusion({
    root: dom.window,
    lifecycle,
    registerRevealController: (controller) => controllers.push(controller)
  });

  const regions = dom.window.document.querySelectorAll(".quizify-occlusion-region");
  assert.equal(controllers.length, 2);
  assert.equal(controllers[0].kind, "occlusion");
  assert.equal(controllers[0].isRevealed(), false);

  controllers[0].reveal();
  assert.equal(controllers[0].isRevealed(), true);
  assert(regions[0].classList.contains("revealed"));

  regions[0].dispatchEvent(
    new dom.window.Event("click", { bubbles: true, cancelable: true })
  );
  assert.equal(controllers[0].isRevealed(), false);

  lifecycle.dispose();
  assert.equal(regions[0].classList.contains("revealed"), false);
  dom.window.close();
});

test("occlusion runtime is idempotent across re-initialization", () => {
  const dom = makeFigure();
  const controllers = [];
  const lifecycle = createLifecycle();
  const register = (controller) => controllers.push(controller);
  initOcclusion({ root: dom.window, lifecycle, registerRevealController: register });
  initOcclusion({ root: dom.window, lifecycle, registerRevealController: register });
  assert.equal(controllers.length, 2);
  lifecycle.dispose();
  dom.window.close();
});

test("occlusion region lines parse to clamped percentages with labels", () => {
  assert.deepEqual(parseOcclusionRegion("1. 12.5,20,18,10 应用层"), {
    order: 1,
    x: 12.5,
    y: 20,
    width: 18,
    height: 10,
    label: "应用层"
  });
  assert.deepEqual(parseOcclusionRegion("2 150,-5,30,20"), {
    order: 2,
    x: 100,
    y: 0,
    width: 30,
    height: 20,
    label: ""
  });
  assert.equal(parseOcclusionRegion("普通文本"), null);
  // Zero-size and negative sizes are rejected so a region always has an area.
  assert.equal(parseOcclusionRegion("3. 10,10,0,20"), null);
});

test("occlusion opener options and image extraction", () => {
  assert.deepEqual(parseOcclusionOptions('url="a b.png" alt="协议栈"'), {
    image: "a b.png",
    alt: "协议栈"
  });
  assert.deepEqual(extractMarkdownImage("![图](a b.png)\nnext"), {
    url: "a b.png",
    alt: "图"
  });
  assert.deepEqual(extractMarkdownImage('<img src="x.png" alt="y">'), {
    url: "x.png",
    alt: "y"
  });
  assert.equal(stripFirstImage("![alt](a.png)\ncaption"), "\ncaption");
});

test("regions sort by reveal order and round-trip through the block builder", () => {
  const regions = [
    { order: 3, x: 1, y: 2, width: 3, height: 4, label: "c" },
    { order: 1, x: 5, y: 6, width: 7, height: 8, label: "a" },
    { order: 2, x: 9, y: 9, width: 9, height: 9, label: "" }
  ];
  assert.deepEqual(
    sortOcclusionRegions(regions).map((region) => region.order),
    [1, 2, 3]
  );
  const block = buildOcclusionBlock({ image: "a b.png", alt: "图", regions });
  assert.match(block, /^:::: occlusion url="a b.png" alt="图"\n/);
  assert.match(block, /\n1\. 5,6,7,8 a\n/);
  assert.match(block, /::::\n$/);
});

// End-to-end through the *built* runtime bundle, so this exercises the same
// code path the phone and desktop reviewer use.
const builtBundle = await readFile(
  new URL("../quizify_addon/_quizify.js", import.meta.url),
  "utf8"
);
const builtCatalogs = await readFile(
  new URL("../quizify_addon/_quizify-i18n.js", import.meta.url),
  "utf8"
);

function bootReview(source, side = "front") {
  const config = JSON.stringify({
    schema_version: 1,
    review: { cardless: false, floating_control: false },
    platform: { ankidroid_api: true }
  });
  const dom = new JSDOM(
    "<!doctype html><body>" +
      `<script type="application/json" id="quizify-config">${config}</script>` +
      `<article class="container"><main id="note-container">` +
      `<section id="front" class="quizify-field">${source}</section>` +
      "</main></article></body>",
    { runScripts: "dangerously", url: "https://quizify.local/" }
  );
  dom.window.TextEncoder = TextEncoder;
  dom.window.quizifyLocale = "zh-CN";
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (value) => ({ width: String(value).length * 8 })
  });
  dom.window.eval(builtCatalogs);
  dom.window.eval(builtBundle);
  dom.window.Quizify.boot({ side });
  return dom;
}

test("the shipped image-occlusion sample card renders every labelled region", () => {
  // Verbatim Front field of the "_quizify-occlusion-sample" demo card.
  const front = [
    "# 图片遮挡",
    "",
    ":::: occlusion url=\"_quizify-occlusion-sample.png\" alt=\"网络协议栈\"",
    "1. 12.5,22,75,20 应用层",
    "2. 12.5,48,75,20 传输层",
    "3. 12.5,74,75,20 网络层",
    "::::"
  ].join("\n");

  const dom = bootReview(front);
  const { document } = dom.window;
  const figure = document.querySelector("figure.quizify-occlusion");
  assert.ok(figure, "the occlusion block becomes a figure");
  assert.equal(figure.getAttribute("data-count"), "3");

  const image = figure.querySelector("img.quizify-occlusion-image");
  assert.equal(image.getAttribute("src"), "_quizify-occlusion-sample.png");
  assert.equal(image.getAttribute("alt"), "网络协议栈");

  const regions = Array.from(figure.querySelectorAll(".quizify-occlusion-region"));
  assert.equal(regions.length, 3);
  assert.deepEqual(
    regions.map((region) => region.querySelector(".quizify-occlusion-box").getAttribute("x")),
    ["12.5", "12.5", "12.5"]
  );
  assert.deepEqual(
    regions.map((region) => region.querySelector(".quizify-occlusion-box").getAttribute("width")),
    ["75", "75", "75"]
  );
  assert.deepEqual(
    regions.map((region) => region.querySelector(".quizify-occlusion-label").textContent),
    ["应用层", "传输层", "网络层"]
  );
  // Every region is a keyboard-reachable control, not just a colored box.
  assert.ok(regions.every((region) => region.getAttribute("role") === "button"));
  assert.ok(regions.every((region) => region.getAttribute("tabindex") === "0"));
  // The runtime wires every region into the shared reveal progress system, so
  // the floating control can walk them in order on both phone and desktop.
  assert.deepEqual(
    regions.map((region) => region.dataset.quizifyRevealId),
    ["front-reveal-0", "front-reveal-1", "front-reveal-2"]
  );
});

test("an occlusion block may pull its image from Markdown inside the block", () => {
  const front = [
    ":::: occlusion",
    "![网络协议栈](_quizify-occlusion-sample.png)",
    "1. 12.5,22,75,20 应用层",
    "::::"
  ].join("\n");

  const dom = bootReview(front);
  const { document } = dom.window;
  const image = document.querySelector("img.quizify-occlusion-image");
  assert.ok(image, "a Markdown image inside the block becomes the overlay base");
  assert.equal(image.getAttribute("src"), "_quizify-occlusion-sample.png");
  // The base image must not also be rendered as an ordinary caption image.
  assert.equal(document.querySelectorAll("img").length, 1);
});

test("a tap reveals one region and the next tap hides it again", () => {
  const front = [
    ":::: occlusion url=\"_quizify-occlusion-sample.png\"",
    "1. 12.5,22,75,20 应用层",
    "2. 12.5,48,75,20 传输层",
    "::::"
  ].join("\n");

  const dom = bootReview(front);
  const { document, Event } = dom.window;
  const region = document.querySelector(".quizify-occlusion-region");
  assert.equal(region.classList.contains("revealed"), false);

  region.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  assert.equal(region.classList.contains("revealed"), true);
  assert.equal(region.getAttribute("aria-pressed"), "true");

  region.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  assert.equal(region.classList.contains("revealed"), false);
  assert.equal(region.getAttribute("aria-pressed"), "false");
});

test("every theme keeps the occlusion mask opaque enough to hide content", async () => {
  const css = await readFile(
    new URL("../src/review/styles.css", import.meta.url),
    "utf8"
  );
  const masks = [...css.matchAll(/--q-occlusion-mask:\s*rgba\(([^)]+)\)/g)];
  // Light + dark for both the 开务 and 格致 skins.
  assert.equal(masks.length, 4, "expected one mask colour per theme");
  for (const [, args] of masks) {
    const parts = args.split(",").map((part) => Number(part.trim()));
    const alpha = parts[3];
    assert.ok(alpha >= 0.8, `occlusion mask alpha ${alpha} leaves content readable`);
  }
  // The revealed state must clear the fill rather than keep painting the veil.
  assert.match(css, /\.quizify-occlusion-region\.revealed \.quizify-occlusion-box\s*\{[^}]*fill:\s*transparent/);
});

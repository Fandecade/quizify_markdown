import assert from "node:assert/strict";
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

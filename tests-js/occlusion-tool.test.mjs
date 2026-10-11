import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("the coordinate builder is a self-contained offline page", async () => {
  const page = await read("docs/image-occlusion-tool.html");
  // Runs straight from file://: no ES modules, no external scripts, no network.
  assert.doesNotMatch(page, /type="module"/);
  assert.doesNotMatch(page, /<script[^>]+\bsrc=/);
  assert.doesNotMatch(page, /https?:\/\/(?!www\.w3\.org)/);
  assert.match(page, /QuizifyOcclusion/);
});

test("the builder reuses the canonical occlusion helpers instead of duplicating them", async () => {
  const template = await read("src/occlusion-tool/page.html");
  const bridge = await read("src/shared/occlusion-tool-api.js");
  assert.match(template, /<!--__QUIZIFY_OCCLUSION_HELPER__-->/);
  assert.match(bridge, /from "\.\/occlusion\.js"/);
  assert.match(bridge, /globalThis\.QuizifyOcclusion = api/);
  // The build stamps the shared helpers into the shipped page.
  const built = await read("docs/image-occlusion-tool.html");
  assert.doesNotMatch(built, /__QUIZIFY_OCCLUSION_HELPER__/);
  assert.match(built, /parseOcclusionRegion/);
  // The addon ships the exact same page for its menu dialog.
  assert.equal(built, await read("quizify_addon/web/occlusion-tool.html"));
});

test("the built page exposes an occlusion API that the reviewer parser accepts", async () => {
  const page = await read("docs/image-occlusion-tool.html");
  const dom = new JSDOM(page, { runScripts: "dangerously" });
  const api = dom.window.QuizifyOcclusion;
  assert.equal(typeof api.buildOcclusionBlock, "function");
  const block = api.buildOcclusionBlock({
    image: "_quizify-occlusion-sample.png",
    alt: "网络协议栈",
    regions: [
      { order: 1, x: 12.5, y: 22, width: 75, height: 20, label: "应用层" },
      { order: 2, x: 12.5, y: 48, width: 75, height: 20, label: "传输层" }
    ]
  });
  assert.match(block, /^:::: occlusion url="_quizify-occlusion-sample\.png" alt="网络协议栈"/);
  const lines = block.split("\n").filter((line) => /^\d+\./.test(line));
  assert.deepEqual(
    lines.map((line) => api.parseOcclusionRegion(line)?.label),
    ["应用层", "传输层"]
  );
});

test("the sample deck ships the occlusion image the cards reference", async () => {
  const builder = await read("tools/build_apkg.py");
  assert.match(builder, /_quizify-occlusion-sample\.png/);
  assert.match(builder, /:::: occlusion/);
});

// jsdom has neither PointerEvent nor image decoding, so the drawing flow is
// driven with synthesized pointer events against a fixed stage rectangle.
function pointerEvent(window, type, { x, y, target }) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: "mouse"
  })) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  target.dispatchEvent(event);
}

test("dragging on the image produces valid occlusion syntax", async () => {
  const page = await read("docs/image-occlusion-tool.html");
  const dom = new JSDOM(page, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "file:///builder/index.html",
    beforeParse(window) {
      window.URL.createObjectURL = () => "blob:stub";
      window.URL.revokeObjectURL = () => {};
      window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { left: 0, top: 0, right: 400, bottom: 250, width: 400, height: 250, x: 0, y: 0 };
      };
    }
  });
  const { window } = dom;

  const fileInput = window.document.getElementById("file");
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [new window.File(["x"], "网络协议栈 图.png", { type: "image/png" })]
  });
  fileInput.dispatchEvent(new window.Event("change", { bubbles: true }));

  const stage = window.document.querySelector(".stage");
  assert.ok(stage, "selecting an image mounts the drawing stage");
  // The tool sanitizes the picked filename into a media-friendly name.
  assert.equal(window.document.getElementById("image").value, "网络协议栈-图.png");

  pointerEvent(window, "pointerdown", { x: 40, y: 50, target: stage });
  pointerEvent(window, "pointermove", { x: 240, y: 150, target: stage });
  pointerEvent(window, "pointerup", { x: 240, y: 150, target: stage });

  const output = window.document.getElementById("output").value;
  const regionLine = output.split("\n").find((line) => /^1\./.test(line));
  assert.ok(regionLine, output);
  const parsed = window.QuizifyOcclusion.parseOcclusionRegion(regionLine);
  assert.deepEqual(
    [parsed.x, parsed.y, parsed.width, parsed.height],
    [10, 20, 50, 40]
  );
});

/* Behavioural tests for the transformed template. jsdom has no layout, so the
   image/rect geometry is stubbed; everything else runs the real template JS. */
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const FIELDS = {
  Deck: "D", Question: "Q",
  Image: '<img id="demo" src="./demo.png">',
  Opinions: "10,10,30,20,1;40,40,30,20,2",
  Answer: "A", Note: "N", Tags: ""
};
function renderTemplate(source, fields) {
  return source
    .replace(/\{\{#([A-Za-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, n, body) => fields[n] ? body : "")
    .replace(/\{\{([A-Za-z]+)\}\}/g, (_m, n) => fields[n] ?? "");
}

const openWindows = [];
function closeAllWindows() {
  while (openWindows.length) {
    const dom = openWindows.pop();
    try { dom.window.close(); } catch (error) { /* already gone */ }
  }
}

// `scale` stands in for a tablet WebView (AnkiMobile content zoom, AnkiDroid
// display scaling) that magnifies the page: getBoundingClientRect() then
// reports visual pixels while style lengths stay in CSS pixels.
async function bootFront({ scale = 1 } = {}) {
  const tpl = await readFile(path.join(root, "front.html"), "utf8");
  const css = await readFile(path.join(root, "style.css"), "utf8");
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${css}</style></head>` +
    `<body class="card">${renderTemplate(tpl, FIELDS)}</body></html>`,
    { runScripts: "dangerously", url: "https://anki.local/", pretendToBeVisual: true }
  );
  const { window } = dom;
  // Stub the image geometry the template measures.
  const img = window.document.getElementById("demo");
  Object.defineProperty(img, "naturalWidth", { value: 400 });
  Object.defineProperty(img, "naturalHeight", { value: 200 });
  Object.defineProperty(img, "complete", { value: true });
  for (const prop of ["offsetWidth", "clientWidth"]) {
    Object.defineProperty(img, "offsetWidth", { value: 400 });
    Object.defineProperty(img, "clientWidth", { value: 400 });
  }
  const visual = { left: 0, top: 0, width: 400 * scale, height: 200 * scale };
  visual.right = visual.left + visual.width;
  visual.bottom = visual.top + visual.height;
  img.getBoundingClientRect = () => visual;
  window.document.querySelectorAll(".main-image").forEach((el) => {
    el.getBoundingClientRect = () => visual;
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return visual;
  };
  img.dispatchEvent(new window.Event("load"));
  await new Promise((r) => window.setTimeout(r, 0));
  openWindows.push(dom);
  return window;
}

afterEach(closeAllWindows);

test("coordinates from the Opinions field become masks in reveal order", async () => {
  const window = await bootFront();
  const rects = [...window.document.querySelectorAll(".mask-rect")];
  assert.equal(rects.length, 2, "one mask per coordinate pair");
  assert.deepEqual(rects.map((r) => r.order), [1, 2]);
  // Nothing is revealed on the front side at first.
  assert.ok(rects.every((r) => !r.classList.contains("revealed")));
});

test("masks are positioned in percentages, never in pixels", async () => {
  const window = await bootFront();
  const [first, second] = [...window.document.querySelectorAll(".mask-rect")];
  assert.equal(first.style.left, "10%");
  assert.equal(first.style.top, "10%");
  assert.equal(first.style.width, "30%");
  assert.equal(first.style.height, "20%");
  assert.equal(second.style.left, "40%");
  assert.equal(second.style.top, "40%");
  assert.doesNotMatch(first.getAttribute("style"), /px/);
});

test("masks stay aligned when the WebView magnifies the page", async () => {
  // Regression: a tablet WebView reports visual pixels from
  // getBoundingClientRect(); the old code wrote those back as CSS pixels, so a
  // 1.4x page zoom moved every mask 1.4x too far (12.5% became 17.5%).
  const window = await bootFront({ scale: 1.4 });
  const rects = [...window.document.querySelectorAll(".mask-rect")];
  assert.deepEqual(
    rects.map((r) => [r.style.left, r.style.top, r.style.width, r.style.height]),
    [
      ["10%", "10%", "30%", "20%"],
      ["40%", "40%", "30%", "20%"]
    ]
  );
});

test("copying the coordinates reads the percentages back unchanged", async () => {
  const window = await bootFront({ scale: 1.4 });
  window.document.getElementById("copyCoords").dispatchEvent(
    new window.MouseEvent("click", { bubbles: true })
  );
  assert.equal(
    window.document.getElementById("coordsTextarea").value,
    "10.00,10.00,30.00,20.00,1;40.00,40.00,30.00,20.00,2"
  );
});

test("drawing a mask while editing stores the same percentages on every device", async () => {
  const window = await bootFront({ scale: 1.4 });
  window.document.getElementById("toggleEditMode").dispatchEvent(
    new window.MouseEvent("click", { bubbles: true })
  );
  const img = window.document.getElementById("demo");
  const mouse = (type, x, y) =>
    img.dispatchEvent(
      new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    );

  // Drag from the top-left quarter to the middle of the (magnified) picture.
  mouse("mousedown", 56, 28);
  mouse("mousemove", 168, 84);
  mouse("mouseup", 168, 84);

  const masks = [...window.document.querySelectorAll(".mask-rect")];
  assert.equal(masks.length, 3, "the drag adds one mask");
  const drawn = masks[masks.length - 1];
  // 56..168 visual px at 1.4x is 40..120 layout px on a 400x200 picture.
  assert.equal(drawn.style.left, "10%");
  assert.equal(drawn.style.top, "10%");
  assert.equal(drawn.style.width, "20%");
  assert.equal(drawn.style.height, "20%");
  assert.doesNotMatch(drawn.getAttribute("style"), /px/);
});

test("clicking a mask reveals it and clicking again re-hides it", async () => {
  const window = await bootFront();
  const rect = window.document.querySelector(".mask-rect");
  rect.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(rect.classList.contains("revealed"), "first click reveals");
  rect.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(!rect.classList.contains("revealed"), "second click re-hides");
});

test("revealing is driven by a class, never by an inline background colour", async () => {
  const window = await bootFront();
  const rect = window.document.querySelector(".mask-rect");
  assert.equal(rect.style.backgroundColor, "", "no inline colours: theme owns the look");
  rect.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(rect.style.backgroundColor, "", "revealing must not write inline colour");
  assert.ok(rect.classList.contains("revealed"));
});

test("the mask colour comes from the theme and stays green", async () => {
  const css = await readFile(path.join(root, "style.css"), "utf8");
  const light = /:root\s*\{([\s\S]*?)\}/.exec(css)[1];
  const dark = /\.nightMode\s*\{([\s\S]*?)\}/.exec(css)[1];
  const bg = (block) => /--mask-bg:\s*([^;]+);/.exec(block)[1].trim();
  // Green means the green channel dominates red and blue.
  for (const [label, block] of [["light", light], ["dark", dark]]) {
    const hex = bg(block).replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(g > r && g > b, `${label} mask ${bg(block)} is not green`);
  }
  assert.match(light, /--mask-border:/);
});

test("the template no longer carries the old red/black mask literals", async () => {
  const html = await readFile(path.join(root, "front.html"), "utf8");
  assert.doesNotMatch(html, /2px solid red/);
  assert.doesNotMatch(html, /rgba\(0,\s*0,\s*0,\s*1\)/);
  assert.doesNotMatch(html, /backgroundColor\s*=/);
});

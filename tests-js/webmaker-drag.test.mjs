import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createRowReorder, DRAG_THRESHOLD } from "../src/webmaker/drag.js";

/*
 * jsdom lays nothing out, so every row gets a fixed 30px band. The helper is
 * re-run before each pointer move because a drag reshuffles the DOM, and the
 * midpoint maths has to see the order the user is looking at.
 */

const ROW_HEIGHT = 30;

function build(ids) {
  const dom = new JSDOM('<ol id="list"></ol>');
  const { window } = dom;
  const list = window.document.getElementById("list");
  for (const id of ids) {
    const row = window.document.createElement("li");
    row.className = "card-row";
    row.dataset.id = id;
    row.innerHTML =
      '<span class="card-grip"></span>' +
      '<button class="card-item"></button>' +
      '<button class="card-remove"></button>';
    list.append(row);
  }
  const layout = () => {
    [...list.children].forEach((row, index) => {
      const top = index * ROW_HEIGHT;
      row.getBoundingClientRect = () => ({
        top,
        bottom: top + ROW_HEIGHT,
        height: ROW_HEIGHT,
        left: 0,
        right: 120,
        width: 120,
        x: 0,
        y: top
      });
    });
  };
  layout();
  return { window, list, layout };
}

const order = (list) => [...list.children].map((row) => row.dataset.id);

function pointer(window, node, type, init) {
  return node.dispatchEvent(
    new window.PointerEvent(type, { bubbles: true, cancelable: true, ...init })
  );
}

function click(window, node) {
  const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
}

/** Press on `node` at `from`, travel to `to`, release — all on one pointer. */
function drag(window, list, node, { from, to, pointerId = 1, pointerType = "mouse" } = {}) {
  pointer(window, node, "pointerdown", {
    pointerId,
    pointerType,
    clientX: 10,
    clientY: from
  });
  pointer(window, node, "pointermove", { pointerId, pointerType, clientX: 10, clientY: to });
  pointer(window, node, "pointerup", { pointerId, pointerType, clientX: 10, clientY: to });
}

test("dragging a row above the first slot reports the new order", () => {
  const { window, list, layout } = build(["a", "b", "c"]);
  const reported = [];
  createRowReorder({ list, onReorder: (ids) => reported.push(ids) });

  const item = list.children[2].querySelector(".card-item");
  pointer(window, item, "pointerdown", { pointerId: 1, clientX: 10, clientY: 75 });
  layout();
  pointer(window, item, "pointermove", { pointerId: 1, clientX: 10, clientY: 5 });
  pointer(window, item, "pointerup", { pointerId: 1, clientX: 10, clientY: 5 });

  assert.deepEqual(order(list), ["c", "a", "b"]);
  assert.deepEqual(reported, [["c", "a", "b"]]);
  assert.equal(list.classList.contains("is-reordering"), false);
  assert.equal(list.children[0].classList.contains("is-dragging"), false);
});

test("a press that never travels the threshold stays a plain click", () => {
  const { window, list } = build(["a", "b", "c"]);
  const reported = [];
  createRowReorder({ list, onReorder: (ids) => reported.push(ids) });

  const item = list.children[1].querySelector(".card-item");
  pointer(window, item, "pointerdown", { pointerId: 2, clientX: 10, clientY: 45 });
  pointer(window, item, "pointermove", {
    pointerId: 2,
    clientX: 10,
    clientY: 45 + DRAG_THRESHOLD - 1
  });
  pointer(window, item, "pointerup", { pointerId: 2, clientX: 10, clientY: 46 });

  assert.deepEqual(order(list), ["a", "b", "c"]);
  assert.deepEqual(reported, []);
  assert.equal(click(window, item).defaultPrevented, false);
});

test("the click that ends a real drag is swallowed once", () => {
  const { window, list, layout } = build(["a", "b", "c"]);
  createRowReorder({ list, onReorder: () => {} });

  const item = list.children[2].querySelector(".card-item");
  pointer(window, item, "pointerdown", { pointerId: 3, clientX: 10, clientY: 75 });
  layout();
  pointer(window, item, "pointermove", { pointerId: 3, clientX: 10, clientY: 5 });
  pointer(window, item, "pointerup", { pointerId: 3, clientX: 10, clientY: 5 });

  assert.equal(click(window, item).defaultPrevented, true);
  assert.equal(click(window, item).defaultPrevented, false);
});

test("the delete button and non-primary buttons never start a drag", () => {
  const { window, list, layout } = build(["a", "b", "c"]);
  const reported = [];
  createRowReorder({ list, onReorder: (ids) => reported.push(ids) });

  const remove = list.children[2].querySelector(".card-remove");
  drag(window, list, remove, { from: 75, to: 5 });
  assert.deepEqual(order(list), ["a", "b", "c"]);

  const item = list.children[2].querySelector(".card-item");
  pointer(window, item, "pointerdown", { pointerId: 9, button: 2, clientX: 10, clientY: 75 });
  layout();
  pointer(window, item, "pointermove", { pointerId: 9, clientX: 10, clientY: 5 });
  pointer(window, item, "pointerup", { pointerId: 9, clientX: 10, clientY: 5 });

  assert.deepEqual(order(list), ["a", "b", "c"]);
  assert.deepEqual(reported, []);
});

test("touch drags start from the grip so the list stays scrollable", () => {
  const { window, list, layout } = build(["a", "b", "c"]);
  const reported = [];
  createRowReorder({ list, onReorder: (ids) => reported.push(ids) });

  const item = list.children[2].querySelector(".card-item");
  drag(window, list, item, { from: 75, to: 5, pointerId: 4, pointerType: "touch" });
  assert.deepEqual(order(list), ["a", "b", "c"]);
  assert.deepEqual(reported, []);

  const grip = list.children[2].querySelector(".card-grip");
  pointer(window, grip, "pointerdown", {
    pointerId: 5,
    pointerType: "touch",
    clientX: 10,
    clientY: 75
  });
  layout();
  pointer(window, grip, "pointermove", { pointerId: 5, clientX: 10, clientY: 5 });
  pointer(window, grip, "pointerup", { pointerId: 5, clientX: 10, clientY: 5 });

  assert.deepEqual(order(list), ["c", "a", "b"]);
  assert.deepEqual(reported, [["c", "a", "b"]]);
});

test("a disabled list ignores the pointer entirely", () => {
  const { window, list } = build(["a", "b", "c"]);
  const reported = [];
  createRowReorder({ list, isEnabled: () => false, onReorder: (ids) => reported.push(ids) });

  const item = list.children[2].querySelector(".card-item");
  drag(window, list, item, { from: 75, to: 5 });
  assert.deepEqual(order(list), ["a", "b", "c"]);
  assert.deepEqual(reported, []);
});

test("rows dropped past the end land last and destroy() detaches the listeners", () => {
  const { window, list, layout } = build(["a", "b", "c"]);
  const reported = [];
  const reorder = createRowReorder({ list, onReorder: (ids) => reported.push(ids) });

  const item = list.children[0].querySelector(".card-item");
  pointer(window, item, "pointerdown", { pointerId: 6, clientX: 10, clientY: 15 });
  layout();
  pointer(window, item, "pointermove", { pointerId: 6, clientX: 10, clientY: 500 });
  pointer(window, item, "pointerup", { pointerId: 6, clientX: 10, clientY: 500 });
  assert.deepEqual(order(list), ["b", "c", "a"]);

  reorder.destroy();
  const before = order(list);
  drag(window, list, list.children[0].querySelector(".card-item"), { from: 15, to: 500 });
  assert.deepEqual(order(list), before);
  assert.deepEqual(reported, [["b", "c", "a"]]);
});

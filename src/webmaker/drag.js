/*
 * Pointer-driven reordering for the card list.
 *
 * Rows are moved inside the DOM while dragging so the result is visible
 * immediately, and the finished order is handed to `onReorder` on pointerup —
 * the store stays the single source of truth and re-renders from there.
 *
 * A press that never travels `DRAG_THRESHOLD` stays a plain click, so tapping
 * a row still selects it, and the click a real drag would otherwise fire is
 * swallowed exactly once. Touch starts from the grip only: that keeps the list
 * scrollable with a finger everywhere else, because the grip is the one spot
 * that opts out of `touch-action`.
 */

export const DRAG_THRESHOLD = 4;

export function createRowReorder({
  list,
  rowSelector = ".card-row",
  gripSelector = ".card-grip",
  ignoreSelector = ".card-remove",
  isEnabled = () => true,
  onReorder
} = {}) {
  let drag = null;
  let swallowClick = false;

  const rows = () => Array.from(list.querySelectorAll(rowSelector));

  function begin(event) {
    if (drag || !isEnabled()) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    const target = event.target;
    if (!target?.closest) return;
    if (ignoreSelector && target.closest(ignoreSelector)) return;
    const row = target.closest(rowSelector);
    if (!row || !list.contains(row)) return;
    if (event.pointerType === "touch" && !target.closest(gripSelector)) return;

    const doc = list.ownerDocument;
    swallowClick = false;
    drag = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    doc.addEventListener("pointermove", move, { passive: false });
    doc.addEventListener("pointerup", end);
    doc.addEventListener("pointercancel", end);
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      const travelled = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY
      );
      if (travelled < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.row.classList.add("is-dragging");
      list.classList.add("is-reordering");
    }
    event.preventDefault();
    place(event.clientY);
  }

  /** Put the dragged row where the pointer sits, comparing row midpoints. */
  function place(clientY) {
    const dragged = drag.row;
    let reference = null;
    for (const row of rows()) {
      if (row === dragged) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        reference = row;
        break;
      }
    }
    if (reference) {
      if (dragged.nextElementSibling !== reference) {
        list.insertBefore(dragged, reference);
      }
    } else if (dragged !== list.lastElementChild) {
      list.append(dragged);
    }
  }

  function end() {
    const active = drag;
    drag = null;
    const doc = (active?.row ?? list).ownerDocument;
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", end);
    doc.removeEventListener("pointercancel", end);
    if (!active) return;
    active.row.classList.remove("is-dragging");
    list.classList.remove("is-reordering");
    if (!active.moved) return;
    swallowClick = true;
    onReorder?.(rows().map((row) => row.dataset.id));
  }

  function guardClick(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  list.addEventListener("pointerdown", begin);
  // Capture phase so the swallowed click never reaches a row's own handler.
  list.addEventListener("click", guardClick, true);

  return {
    destroy() {
      end();
      list.removeEventListener("pointerdown", begin);
      list.removeEventListener("click", guardClick, true);
    },
    get dragging() {
      return Boolean(drag?.moved);
    }
  };
}

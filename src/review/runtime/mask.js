/* Inline text masking (``%%文字%%``).
 *
 * A masked phrase renders as a solid block that the reviewer clicks to reveal,
 * and clicks again to cover. Every mask on the card is independent: there is no
 * global counter, ordering or floating control, so revealing one never touches
 * the others. The covered text stays in the DOM (painted transparent) so
 * revealing a phrase never reflows the surrounding line.
 */

const BOUND_ATTRIBUTE = "data-quizify-mask-bound";

function isRevealed(element) {
  return element.classList.contains("revealed");
}

function setRevealed(element, revealed) {
  element.classList.toggle("revealed", revealed);
  element.setAttribute("aria-expanded", String(revealed));
}

export function initTextMasks({ root } = {}) {
  const document = root?.document;
  if (!document?.querySelectorAll) return;

  document
    .querySelectorAll(`.quizify-mask:not([${BOUND_ATTRIBUTE}])`)
    .forEach((element) => {
      element.setAttribute(BOUND_ATTRIBUTE, "true");
      setRevealed(element, isRevealed(element));

      const toggle = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        setRevealed(element, !isRevealed(element));
      };

      element.addEventListener("click", toggle);
      element.addEventListener("keydown", (event) => {
        const key = event.key;
        if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
        toggle(event);
      });
    });
}

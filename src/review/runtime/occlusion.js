import { resolveRuntimeLifecycle } from "../lifecycle.js";
import { t } from "../../shared/i18n.js";

/**
 * Wire an image-occlusion block into Quizify's reveal system.
 *
 * Each region behaves like any other reveal controller: tapping it toggles the
 * mask, and the floating control's "reveal next / reveal all" walks the regions
 * in their numbered order. Region geometry is expressed as SVG percentages with
 * `preserveAspectRatio="none"`, so it stays aligned at any rendered size and
 * needs no measurement here.
 */
export function initOcclusion({ root, registerRevealController, lifecycle = null }) {
  if (!root.document) return;
  const activeLifecycle = resolveRuntimeLifecycle(root, lifecycle);

  root.document.querySelectorAll(".quizify-occlusion").forEach((figure) => {
    if (figure.dataset.quizifyInitialized === "true") return;
    const regions = Array.from(
      figure.querySelectorAll(".quizify-occlusion-region")
    );
    if (!regions.length) return;
    figure.dataset.quizifyInitialized = "true";

    regions.forEach((region) => {
      region.classList.remove("revealed");
      region.setAttribute("aria-pressed", "false");

      function setRevealed(show) {
        region.classList.toggle("revealed", show);
        region.setAttribute("aria-pressed", show ? "true" : "false");
      }
      function toggle() {
        setRevealed(!region.classList.contains("revealed"));
      }

      activeLifecycle.listen(region, "click", (event) => {
        event.preventDefault?.();
        toggle();
      });
      activeLifecycle.listen(region, "keydown", (event) => {
        if (event.target !== region) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });
      activeLifecycle.add(() => {
        region.classList.remove("revealed");
      });

      registerRevealController({
        kind: "occlusion",
        element: region,
        isRevealed: () => region.classList.contains("revealed"),
        reveal: () => setRevealed(true)
      });

      if (!region.dataset.quizifyLabelSet) {
        region.dataset.quizifyLabelSet = "true";
        const label = region.getAttribute("aria-label");
        if (label) region.title = label;
      }
    });

    activeLifecycle.add(() => {
      delete figure.dataset.quizifyInitialized;
      figure.dataset.occlusionReady = "false";
    });
  });
}

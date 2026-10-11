/* Classic-script bridge for the standalone occlusion coordinate builder.
 *
 * The builder page (`docs/image-occlusion-tool.html`) must run straight from
 * the file system, where browsers refuse cross-origin ES module imports. This
 * entry bundles the canonical `src/shared/occlusion.js` helpers into a single
 * classic script so the page formats and validates regions with *exactly* the
 * same rules the reviewer uses, instead of re-implementing them.
 */
import {
  MAX_OCCLUSION_REGIONS,
  buildOcclusionBlock,
  formatOcclusionRegion,
  parseOcclusionOptions,
  parseOcclusionRegion,
  sortOcclusionRegions
} from "./occlusion.js";

const api = Object.freeze({
  MAX_OCCLUSION_REGIONS,
  buildOcclusionBlock,
  formatOcclusionRegion,
  parseOcclusionOptions,
  parseOcclusionRegion,
  sortOcclusionRegions
});

globalThis.QuizifyOcclusion = api;

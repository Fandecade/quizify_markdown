/* Shared Quizify image-occlusion authoring helpers.
 *
 * The occlusion block keeps all data inside a single field in a human-editable
 * form:
 *
 *     :::: occlusion url="网络协议栈.png" alt="网络协议栈"
 *     1. 12.5,20,18,10 应用层
 *     2. 20,42,22,11 传输层
 *     ::::
 *
 * A region line is `order. x,y,w,h [label]` where the four numbers are
 * percentages of the image box, so a region stays aligned at any render size.
 * `url`/`image` and `alt` are optional opener options; when `url` is omitted the
 * block overlays the first image found inside its own body (usually a Markdown
 * image written just above the region lines).
 */

export const MAX_OCCLUSION_REGIONS = 200;
export const OCCLUSION_BLOCK_KEYWORD = "occlusion";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clampOcclusionPercent(value) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return clamp(number, 0, 100);
}

export function formatOcclusionNumber(value) {
  const number = toFiniteNumber(value);
  if (number === null) return "0";
  const rounded = Math.round(number * 100) / 100;
  return String(rounded);
}

/** Parse the opener option tail: `url="a.png" alt=文字`. */
export function parseOcclusionOptions(source) {
  const options = { image: "", alt: "" };
  const text = String(source ?? "");
  const pattern = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key === "url" || key === "image" || key === "src") {
      options.image = options.image || value.trim();
    } else if (key === "alt" || key === "title") {
      options.alt = options.alt || value.trim();
    }
  }
  return options;
}

/**
 * Parse a single region line. Returns `null` when the line is not a region so
 * the caller can treat it as ordinary Markdown content.
 */
export function parseOcclusionRegion(line) {
  const match =
    /^\s*(\d{1,4})\s*[.)]?\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:[ \t]+(.+?))?\s*$/.exec(
      String(line ?? "")
    );
  if (!match) return null;

  const order = Number(match[1]);
  const x = clampOcclusionPercent(match[2]);
  const y = clampOcclusionPercent(match[3]);
  const width = clampOcclusionPercent(match[4]);
  const height = clampOcclusionPercent(match[5]);
  if (![x, y, width, height].every((value) => value !== null)) return null;
  if (width <= 0 || height <= 0) return null;

  return {
    order: Number.isFinite(order) ? order : 0,
    x,
    y,
    width,
    height,
    label: (match[6] || "").trim()
  };
}

export function formatOcclusionRegion(region) {
  const order = Number(region?.order) || 0;
  const x = formatOcclusionNumber(clampOcclusionPercent(region?.x) ?? 0);
  const y = formatOcclusionNumber(clampOcclusionPercent(region?.y) ?? 0);
  const width = formatOcclusionNumber(clampOcclusionPercent(region?.width) ?? 0);
  const height = formatOcclusionNumber(clampOcclusionPercent(region?.height) ?? 0);
  const label = String(region?.label ?? "").trim();
  return `${order}. ${x},${y},${width},${height}${label ? ` ${label}` : ""}`;
}

/** Sort regions into their reveal order, keeping the source order for ties. */
export function sortOcclusionRegions(regions) {
  return regions
    .map((region, index) => ({ region, index }))
    .sort(
      (a, b) =>
        (a.region.order || 0) - (b.region.order || 0) || a.index - b.index
    )
    .map((entry) => entry.region);
}

export function buildOcclusionBlock({ image = "", alt = "", regions = [] } = {}) {
  const openerOptions = [];
  if (image) openerOptions.push(`url="${String(image).replace(/"/g, "")}"`);
  if (alt) openerOptions.push(`alt="${String(alt).replace(/"/g, "")}"`);
  const opener = `${"::::"} ${OCCLUSION_BLOCK_KEYWORD}${
    openerOptions.length ? " " + openerOptions.join(" ") : ""
  }`;
  const body = regions.map((region) => formatOcclusionRegion(region));
  return `${opener}\n${body.join("\n")}\n${"::::"}\n`;
}

/** Extract the first image reference from Markdown `![]()` or raw `<img src>`. */
export function extractMarkdownImage(text) {
  const source = String(text ?? "");
  const markdown = /!\[([^\]]*)\]\(\s*([^)]*?)\s*\)/.exec(source);
  if (markdown) {
    const url = markdown[2].replace(/\s+"[^"]*"\s*$/, "").replace(/\s+'[^']*'\s*$/, "").trim();
    return { url, alt: markdown[1].trim() };
  }
  const html = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
    source
  );
  if (html) {
    const url = (html[1] ?? html[2] ?? html[3] ?? "").trim();
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(source);
    return { url, alt: (alt?.[1] ?? alt?.[2] ?? "").trim() };
  }
  return { url: "", alt: "" };
}

/** Remove the first image reference so it is not rendered twice as a caption. */
export function stripFirstImage(text) {
  const source = String(text ?? "");
  return source
    .replace(/!\[[^\]]*\]\([^)]*\)/, "")
    .replace(/<img\b[^>]*>/i, "");
}

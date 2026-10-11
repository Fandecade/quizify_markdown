import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((arg) => arg !== "--release");
if (unknownArgs.length) {
  throw new Error(`Unknown build option: ${unknownArgs.join(", ")}`);
}
const release = args.has("--release");
const addon = path.join(root, "quizify_addon");
const web = path.join(addon, "web");
const licenses = path.join(addon, "licenses");

const WINDOWS_OUTPUT_LOCK = /user-mapped section open|EBUSY|EPERM/i;
async function buildWithRetry(options) {
  const attempts = process.platform === "win32" ? 4 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await build(options);
    } catch (error) {
      const transient = WINDOWS_OUTPUT_LOCK.test(String(error?.message || error));
      if (!transient || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw new Error("Build retry loop ended unexpectedly");
}

await mkdir(web, { recursive: true });
await mkdir(licenses, { recursive: true });
await copyFile(
  path.join(root, "THIRD_PARTY_LICENSES.md"),
  path.join(addon, "THIRD_PARTY_LICENSES.md")
);
for (const [source, target] of [
  ["marked/LICENSE", "marked-LICENSE.txt"],
  ["katex/LICENSE", "katex-LICENSE.txt"],
  ["highlight.js/LICENSE", "highlight.js-LICENSE.txt"],
  ["dompurify/LICENSE", "DOMPurify-Apache-LICENSE.txt"],
  ["dompurify/LICENSE-MPL", "DOMPurify-MPL-LICENSE.txt"],
  ["lucide/LICENSE", "lucide-ISC-LICENSE.txt"]
]) {
  await copyFile(path.join(root, "node_modules", source), path.join(licenses, target));
}

const common = {
  absWorkingDir: root,
  bundle: true,
  minify: release,
  sourcemap: false,
  target: ["es2019"],
  logLevel: "info",
  legalComments: "eof"
};

const katexWoff2Only = {
  name: "katex-woff2-only",
  setup(context) {
    context.onLoad({ filter: /katex\.min\.css$/ }, async ({ path: cssPath }) => {
      const original = await readFile(cssPath, "utf8");
      const contents = original.replace(/src:[^}]+/g, (source) => {
        const woff2 = source.match(/url\([^)]*\.woff2\)\s*format\("woff2"\)/);
        return woff2 ? `src:${woff2[0]}` : source;
      });
      return { contents, loader: "css", resolveDir: path.dirname(cssPath) };
    });
  }
};

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/shared/i18n-catalogs.js")],
  outfile: path.join(addon, "_quizify-i18n.js"),
  format: "iife"
});

for (const name of await readdir(addon)) {
  if (/^_quizify-katex-/.test(name)) {
    await rm(path.join(addon, name), { force: true });
  }
}

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/review/entry.js")],
  outfile: path.join(addon, "_quizify.js"),
  format: "iife",
  footer: {
    js: "if (typeof module === 'object' && module.exports) module.exports = globalThis.myquizify;"
  }
});

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/review/bundle.css")],
  outfile: path.join(addon, "_quizify.css"),
  loader: { ".woff": "file", ".woff2": "file", ".ttf": "file" },
  assetNames: "_quizify-katex-[name]-[hash]",
  plugins: [katexWoff2Only]
});

const bundledReviewCss = await readFile(path.join(addon, "_quizify.css"), "utf8");

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/editor/entry.js")],
  outfile: path.join(web, "editor.js"),
  format: "iife"
});

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/editor/preview-entry.js")],
  outfile: path.join(web, "editor-preview.js"),
  format: "iife",
  define: {
    __QUIZIFY_REVIEW_CSS__: JSON.stringify(bundledReviewCss)
  }
});

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/shared/syntax-tools.js")],
  outfile: path.join(web, "syntax-tools.js"),
  format: "iife",
  footer: {
    js: "if (typeof module === 'object' && module.exports) module.exports = globalThis.QuizifySyntax;"
  }
});

await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/editor/styles.css")],
  outfile: path.join(web, "editor.css")
});

// Image-occlusion coordinate builder. Its shared helpers are bundled as a
// classic script (file:// pages cannot use ES module imports) and then inlined
// into the page template, so the same standalone HTML ships both as
// `docs/image-occlusion-tool.html` and as the addon's menu dialog.
const occlusionHelper = await buildWithRetry({
  ...common,
  entryPoints: [path.join(root, "src/shared/occlusion-tool-api.js")],
  write: false,
  format: "iife",
  minify: false,
  banner: { js: "/* Generated from src/shared/occlusion.js - do not edit by hand. */" }
});
const occlusionTemplate = await readFile(
  path.join(root, "src", "occlusion-tool", "page.html"),
  "utf8"
);
if (!occlusionTemplate.includes("<!--__QUIZIFY_OCCLUSION_HELPER__-->")) {
  throw new Error("occlusion tool template lost its helper placeholder");
}
const occlusionPage = occlusionTemplate.replace(
  "<!--__QUIZIFY_OCCLUSION_HELPER__-->",
  `<script>${occlusionHelper.outputFiles[0].text}</script>`
);
await writeFile(
  path.join(root, "docs", "image-occlusion-tool.html"),
  occlusionPage,
  "utf8"
);
await writeFile(
  path.join(web, "occlusion-tool.html"),
  occlusionPage,
  "utf8"
);

const mediaNames = (await readdir(addon)).filter((name) =>
  /^_quizify(?:-i18n\.js|-katex-.*\.(?:woff2?|ttf)|\.(?:js|css))$/.test(name)
);
mediaNames.push("_persistence.js");
const files = {};
for (const name of mediaNames.sort()) {
  const data = await readFile(path.join(addon, name));
  files[name] = {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex")
  };
}
await writeFile(
  path.join(addon, "media-manifest.json"),
  `${JSON.stringify({ schema_version: 1, files }, null, 2)}\n`,
  "utf8"
);

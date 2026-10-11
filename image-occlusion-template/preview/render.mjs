/* Renders front.html/back.html the way Anki would, so the transformed template
   can be eyeballed and asserted without a live Anki install. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const FIELDS = {
  Deck: "Knowledge Lab::计算机网络",
  Question: "指出网络协议栈的每一层，点击绿色遮罩逐层揭示。",
  Image: '<img src="./demo.png" alt="网络协议栈">',
  // x%,y%,w%,h%,order
  Opinions: [
    "12.50,22.00,75.00,20.00,1",
    "12.50,48.00,75.00,20.00,2",
    "12.50,74.00,75.00,20.00,3"
  ].join(";"),
  Answer: "自上而下：应用层（HTTP / DNS）、传输层（TCP / UDP）、网络层（IP / ICMP）。",
  Note: "记忆口诀：应用传网链，逐层封装。",
  Tags: "计算机网络 协议栈".split(" ").map(t => `<span class="tag">${t}</span>`).join(" "),
};

// Minimal Anki template engine: {{Field}}, {{#Field}}...{{/Field}}.
function renderTemplate(source, fields) {
  let out = source;
  // conditionals first
  out = out.replace(/\{\{#([A-Za-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, name, body) => {
    const value = fields[name];
    return value ? body : "";
  });
  out = out.replace(/\{\{([A-Za-z]+)\}\}/g, (_m, name) => fields[name] ?? "");
  return out;
}

async function build(name) {
  const template = await readFile(path.join(root, `${name}.html`), "utf8");
  const css = await readFile(path.join(root, "style.css"), "utf8");
  // Strip the outer <script> wrappers Anki allows inside templates; keep them,
  // they're inline and run fine in a browser too.
  const html = renderTemplate(template, FIELDS);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${css}</style></head><body class="card">${html}</body></html>`;
}

for (const name of ["front", "back"]) {
  const page = await build(name);
  await writeFile(path.join(here, `${name}.preview.html`), page, "utf8");
  console.log(`wrote preview/${name}.preview.html`);
}

// Optional: reveal a couple of regions so screenshots show both states.
if (process.argv.includes("--reveal")) {
  const page = await readFile(path.join(here, "front.preview.html"), "utf8");
  const injected = page.replace(
    "</body>",
    `<script>
      setTimeout(function () {
        var rects = document.querySelectorAll('.mask-rect');
        if (rects[1]) rects[1].dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      }, 300);
    </script></body>`
  );
  await writeFile(path.join(here, "front.reveal.html"), injected, "utf8");
  console.log("wrote preview/front.reveal.html");
}

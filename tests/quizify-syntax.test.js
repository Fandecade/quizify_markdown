const assert = require("node:assert/strict");
const syntax = require("../quizify_addon/web/syntax-tools.js");

const valid = [
  "# Quizify",
  "{{答案}}",
  "[[题干||答案]]",
  "[术语]^(解释)^",
  "::: 折叠",
  "内容",
  ":::",
  "=== A",
  "内容 A",
  "=== B",
  "内容 B",
  "===",
  ";;;",
  "A. 选项 A",
  "B. 选项 B",
  ";;;A",
  "正文 %%整体短语%% 内容"
].join("\n");

assert.deepEqual(syntax.analyzeQuizifySyntax(valid), []);

const invalid = [
  "{{ }}",
  "[[缺少分隔符]]",
  ";;;",
  "A. 选项 A",
  ";;;B",
  "::: 未关闭",
  "=== Only",
  "body"
].join("\n");

const diagnostics = syntax.analyzeQuizifySyntax(invalid);
assert(diagnostics.some((item) => item.message.includes("填空题答案为空")));
assert(diagnostics.some((item) => item.message.includes("揭示语法缺少")));
assert(diagnostics.some((item) => item.message.includes("答案 B 没有对应选项")));
assert(diagnostics.some((item) => item.message.includes("折叠块缺少结束标记")));
assert(diagnostics.some((item) => item.message.includes("标签页缺少结束标记")));
assert.match(syntax.summarizeDiagnostics(diagnostics), /错误|警告/);

const preview = syntax.collectQuizifyPreview(valid);
assert(preview.some((item) => item.kind === "fitb" && item.meta.answer === "答案"));
assert(preview.some((item) => item.kind === "single" && item.meta.answers === "A"));
assert(preview.some((item) => item.kind === "collapse" && item.meta.title === "折叠"));
assert(preview.some((item) => item.kind === "tab" && item.meta.title === "A"));
assert(preview.some((item) => item.kind === "mask" && item.meta.text === "整体短语"));

const unpairedMask = syntax.analyzeQuizifySyntax([
  "正文 %%没有配对的遮盖",
  "%%配对成功%% 的遮盖"
].join("\n"));
assert(unpairedMask.some((item) => item.message.includes("没有配对")));
assert(!unpairedMask.some((item) => item.line === 2));

console.log("quizify syntax tests passed");

# 手机端 `.apkg` 打包说明

## 为什么要打包成 `.apkg`

Quizify 目前的形态是一个 **Anki 桌面端加载项（add-on）**：它通过 Python 钩子在
桌面端完成两件手机无法做到的事情：

1. 维护 `Quizify Markdown` 笔记类型（字段、卡片模板、样式）；
2. 把复习运行时 `_quizify.js` / `_quizify.css` / `_quizify-i18n.js` /
   `_persistence.js` 以及 KaTeX 字体同步到媒体库。

**AnkiDroid 和 AnkiMobile 不能安装桌面加载项。** 手机端唯一的主流分发格式是
`.apkg`（Anki 牌组包）。因此要把 Quizify 用到手机上，必须把"笔记类型 + 卡片模板 +
运行时资源 + 字体 + 示例卡片"一起塞进一个 `.apkg` 里。

这正是 `tools/build_apkg.py` 做的事情。生成的文件在桌面端、AnkiDroid、AnkiMobile
上都能通过标准的"导入文件"入口打开。

## 构建

需要 Python 3.10+，并安装带 Rust 后端的 Anki 库：

```bash
python -m pip install "anki==25.9.5"
python tools/build_apkg.py --out dist/quizify_markdown.apkg
```

也可以走 `npm`：

```bash
npm run build:apkg
```

可选参数：

- `--out PATH`：输出路径，默认 `dist/quizify_markdown.apkg`。
- `--no-samples`：只打包笔记类型，不附带示例牌组。

## 包里有什么

- `Quizify Markdown` 笔记类型，字段为纯文本 `Front` / `Back`；
- 正面 / 背面两张卡片模板 —— **直接复用 `quizify_addon/notetype.py`**，因此模板
  永远和加载项保持一致，不会各自漂移；
- 内嵌的首帧主题引导脚本与样式（进入暗色/明亮主题时不闪屏）；
- 完整的离线运行时（`_quizify.js` / `_quizify.css` / `_quizify-i18n.js` /
  `_persistence.js`）与 20 个 KaTeX WOFF2 字体；
- 一张示例图片与一段示例音频；
- 一个 `Quizify Markdown` 示例牌组（18 张卡片），逐张演示 Markdown、填空、
  单选、多选、代码高亮、KaTeX 公式、点击揭示、批注、折叠块、标签页、随机遮罩
  背诵、高亮与上下标、图片、音频、提示框、伸缩大纲等用法，导入后即可自检。

## 实现要点

模板里的 `<script src="./_quizify.js">`、`<script src="./_persistence.js">` 等引用
对应媒体库中的 `_quizify.js`、`_persistence.js`，与桌面加载项复用同一套文件名。

打包时有两个坑需要绕开：

1. **Anki 的媒体扫描只认“样式里出现的、以下划线开头的文件名”。** 新版 Rust 导出器
   （`export_anki_package`）不会把仅在笔记类型 CSS 里被 `@font-face` 引用的 KaTeX
   字体收进包，会静默丢失。因此构建脚本改用旧的 `AnkiPackageExporter`，它会扫描
   笔记类型的 CSS。
2. **字体文件不在卡片模板里出现，模板引用也无法触发收集。** 于是构建脚本把所有
   需要随包的资源统一为 `_` / `_quizify-` 前缀，并把它们的文件名写进笔记类型 CSS 的
   一段注释（`/* quizify-mobile-assets:v1 ... */`）。这样导出器会把**全部**运行时
   资源与示例图片/音频都收进包。

> 不要采用“导出后重写 zip”的方案：实测在当前 Anki 版本中，即便字节完全一致地
> 重新打包，导入器也可能丢掉媒体条目。让导出器一次到位才是可靠的。

## 使用与限制

1. 在手机上打开 `Quizify Markdown` 牌组下的卡片即可复习，内容按 Quizify 语法渲染。
2. 在桌面端创建新笔记时选择导入进来的 `Quizify Markdown` 笔记类型，即可继续编写。
3. 手机端**没有**这部分桌面能力：编辑器工具栏、Markdown 批量导入对话框、桌面级
   字段边界校验。这些属于加载项功能，`.apkg` 不含 Python 代码。
4. 悬浮复习控制仍可用于本地逐项揭示；自动翻面与拖拽评分依赖客户端的
   JavaScript 桥接，AnkiDroid 通过其正式/兼容 API 在支持时启用。
5. 复现同样的卡片样式时，桌面端加载项会把运行时挂载到常驻 WebView 头部；`.apkg`
   里的模板则把运行时直接内嵌在模板中（这正是除桌面外的客户端所使用的兼容路径）。

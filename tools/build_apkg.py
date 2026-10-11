"""Build an importable Quizify Markdown ``.apkg`` deck package.

Why this exists
---------------
Quizify ships as an Anki *Desktop* add-on: the reviewer runtime is copied into
the media folder and the ``Quizify Markdown`` note type is registered through
Python hooks.  Mobile clients (AnkiDroid / AnkiMobile) cannot run add-on Python,
so the only way to use Quizify on a phone is to carry everything the card needs
inside a normal ``.apkg`` file:

* the managed ``Quizify Markdown`` note type and its two card templates,
* the offline runtime (``_quizify.js``, ``_quizify.css``, ``_quizify-i18n.js``,
  ``_persistence.js``),
* the bundled KaTeX WOFF2 fonts referenced by ``_quizify.css``,
* a sample deck that demonstrates and self-tests every supported syntax.

The templates are produced with ``quizify_addon/notetype.py`` so they can never
drift from the add-on, and the runtime files come from the validated
``media-manifest.json``.

A note on media collection: Anki's exporters only keep media that the note
type references, and its media scanner only inspects the *styling* for files
whose names start with ``_``.  The KaTeX fonts referenced inside
``_quizify.css`` would otherwise be dropped.  This tool therefore keeps every
runtime asset on the ``_quizify-``/``_`` prefix, lists all of them in the note
type CSS (as a comment), and exports with the legacy ``AnkiPackageExporter`` so
the complete, validated asset set always travels with the deck.

Requirements
------------
Anki's Python library bundles the Rust backend, so it must be importable::

    python -m pip install "anki==25.9.5"   # needs Python 3.10+
    python tools/build_apkg.py --out dist/quizify_markdown.apkg
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
import tempfile
import types
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ADDON_ROOT = PROJECT_ROOT / "quizify_addon"
EXTRA_ASSETS_DIR = PROJECT_ROOT / "tools" / "apkg_assets"
DEFAULT_OUTPUT = PROJECT_ROOT / "dist" / "quizify_markdown.apkg"
MANAGED_TEMPLATE_NAME = "Quizify"
NOTE_TYPE_NAME = "Quizify Markdown"
SAMPLE_DECK_NAME = "Quizify Markdown"
DECK_DESCRIPTION = (
    "Quizify Markdown 示例牌组：逐张演示 Markdown、填空、单选、多选、代码高亮、"
    "KaTeX 公式、点击揭示、批注、折叠块、标签页、随机遮罩背诵、高亮、图片、音频、"
    "提示框与伸缩大纲等用法。可直接在此笔记类型下新建卡片。"
)


# ---------------------------------------------------------------------------
# Load the add-on's pure-Python helpers without executing quizify_addon/__init__
# (that module imports aqt and would fail outside Anki Desktop).
# ---------------------------------------------------------------------------
def load_addon_modules() -> types.SimpleNamespace:
    package_name = "_quizify_addon_pkg"
    package = types.ModuleType(package_name)
    package.__path__ = [str(ADDON_ROOT)]  # type: ignore[attr-defined]
    sys.modules[package_name] = package

    def load(name: str):
        spec = importlib.util.spec_from_file_location(
            f"{package_name}.{name}", ADDON_ROOT / f"{name}.py"
        )
        if spec is None or spec.loader is None:
            raise ImportError(f"cannot load add-on module {name}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module

    return types.SimpleNamespace(notetype=load("notetype"))


def default_config() -> dict:
    return json.loads((ADDON_ROOT / "config.json").read_text(encoding="utf-8"))


def media_manifest() -> list[Path]:
    manifest = json.loads(
        (ADDON_ROOT / "media-manifest.json").read_text(encoding="utf-8")
    )
    if manifest.get("schema_version") != 1:
        raise ValueError("unsupported media manifest schema")
    return [ADDON_ROOT / name for name in sorted(manifest["files"])]


def extra_assets() -> list[Path]:
    """Sample-only media (image, audio) shipped alongside the demo notes."""
    if not EXTRA_ASSETS_DIR.is_dir():
        return []
    return sorted(
        path
        for path in EXTRA_ASSETS_DIR.iterdir()
        if path.is_file() and not path.name.startswith(".")
    )


def package_assets() -> list[Path]:
    return media_manifest() + extra_assets()


# ---------------------------------------------------------------------------
# Sample notes: a self-documenting deck.  Each card teaches one feature; the
# ``Back`` usually shows the raw syntax inside a fenced code block (fenced code
# is protected, so the syntax shown there is never interpreted).
# ---------------------------------------------------------------------------
SAMPLES: list[tuple[str, str]] = [
    (
        r"""# 欢迎使用 Quizify Markdown

在 `Front` / `Back` 字段里直接写 **Markdown** 和 Quizify 语法，复习时会渲染成交互卡片。

- 手机（AnkiDroid / AnkiMobile）与桌面都能用
- 全部离线：Markdown、代码高亮、KaTeX 公式
- 接下来每一张示例卡演示一种用法""",
        r"""## 怎么新建卡片

1. 新建笔记，笔记类型选 `Quizify Markdown`
2. `Front` 写题目，`Back` 写答案
3. 正常复习即可看到渲染效果

> 💡 想学语法，就一张张往后翻这些示例卡。""",
    ),
    (
        r"""# Markdown 基础

**加粗**、*斜体*、~~删除线~~、`行内代码`。

- 无序列表
  - 可以嵌套
1. 有序列表
2. 第二项

[链接文字](https://apps.ankiweb.net)""",
        r"""段落之间空一行即可分段。

| 语法 | 效果 |
| --- | --- |
| `**文字**` | **加粗** |
| `*文字*` | *斜体* |
| `` `代码` `` | `代码` |

> 用 `>` 开头就是引用块。""",
    ),
    (
        r"""# 填空题

在答案两边写两个花括号：

HTTP 的默认端口是 {{80}}，HTTPS 是 {{443}}。""",
        r"""每个 `{{...}}` 会变成一个输入框和一个“揭示答案”按钮，可单独点开。

写法示例：

```
TCP 是{{面向连接}}的协议。
```""",
    ),
    (
        r"""# 单选题

答案行只有一个字母时，渲染为单选题。

;;;
A. TCP
B. HTTP
C. HTML
;;;A""",
        r"""结构说明：

```
;;;
A. 选项
B. 选项
;;;A        ← 答案行只写一个字母
```

点选项即可判断对错。""",
    ),
    (
        r"""# 多选题

答案行包含多个字母时，渲染为多选题。

;;;
A. GET
B. POST
C. BANANA
D. PUT
;;;ABD""",
        r"""答案行写多个字母（不分大小写、顺序随意）：

```
;;;
A. 选项一
B. 选项二
C. 选项三
;;;AC        ← 正确答案是 A 和 C
```

全部选对才算正确。""",
    ),
    (
        r"""# 代码高亮

用三个反引号包裹代码，并在后面标注语言：

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```""",
        r"""会按语言自动高亮并显示行号，常见语言都支持：

```javascript
const sum = (a, b) => a + b;
```

> 代码块里的内容不会被当成 Quizify 语法解析。""",
    ),
    (
        r"""# 数学公式

行内公式用单个美元符号：$E = mc^2$。

块级公式用两个美元符号：

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$""",
        r"""公式由内置的 KaTeX **离线**渲染，无需联网：

$$
\left(\sum_{i=1}^{n} x_i\right)^2
$$

> `$` 两侧不要和普通文字紧贴，否则可能不识别。""",
    ),
    (
        r"""# 点击揭示

用 `[[题干||答案]]` 生成一个点击展开的小组件。

三次握手发生在哪一层？ [[想一想||传输层]]""",
        r"""点击下划线文字显示答案，再点一次收起。

```
[[问题||答案]]
```

适合“先想再看”的自测。""",
    ),
    (
        r"""# 悬浮批注

用 `[术语]^(解释)^` 给词语加一条悬浮说明。

TCP 是一种[面向连接]^(发送数据前需要先建立连接)^的传输层协议。""",
        r"""把鼠标移到（手机上长按）带虚线的词语上，就会弹出解释。

```
[术语]^(这里的解释)^
```""",
    ),
    (
        r"""# 折叠块

用 `::: 标题` 开始，`:::` 结束，内容默认收起。

::: 点击查看解析
三次握手 = SYN → SYN/ACK → ACK，用来确认双方的收发能力。
:::""",
        r"""折叠块里可以放任意 Markdown：

::: 公式示例
$$a^2 + b^2 = c^2$$
:::

适合放“先思考，再展开”的解析。""",
    ),
    (
        r"""# 标签页

点击上方标签可以切换内容，适合并排对比。

=== 概念
TCP 提供可靠、有序的字节流传输。

=== 对比
UDP 更轻量，但不保证可靠。
===""",
        r"""点击上方标签即可切换内容，适合并排对比。

```
=== 标签一
内容一

=== 标签二
内容二
===
```""",
    ),
    (
        r"""# 随机遮罩背诵

用 `:::: recite ... ::::` 包裹，`%%...%%` 标记必须遮住的词。

:::: recite mask=50 mode=mixed
TCP 是一种 %%面向连接%%、可靠的 %%传输层协议%%。
::::""",
        r"""- `mask=50`：初始遮挡约 50% 的候选单元
- `mode=mixed`：自动识别中英文与数字
- 点遮罩可揭示/重新遮挡，长按可临时偷看
- 底部滑块调整比例，“洗牌”重新随机选择""",
    ),
    (
        r"""# 高亮与上下标

==这是重点==，平方写作 X^2^，水分子写作 H~2~O。""",
        r"""| 写法 | 效果 |
| --- | --- |
| `==重点==` | ==重点== |
| `X^2^` | X^2^ |
| `H~2~O` | H~2~O |""",
    ),
    (
        r"""# 图片

把图片放进媒体库后，用 Markdown 图片语法引用：

![Quizify 示例图片](_quizify-sample.png)""",
        r"""图片会直接显示在卡片里，并随主题自适应。

```
![说明文字](文件名.png)
```

> 手机端图片必须已经在 Anki 媒体库中（本包已内置一张示例图片）。""",
    ),
    (
        r"""# 图片遮挡

用 `:::: occlusion` 把图片上的指定区域遮住，点击才揭示；坐标是相对图片的百分比。

:::: occlusion url="_quizify-occlusion-sample.png" alt="网络协议栈"
1. 12.5,22,75,20 应用层
2. 12.5,48,75,20 传输层
3. 12.5,74,75,20 网络层
::::
""",
        r"""每一行区域写作 `序号. x,y,w,h [标签]`，x/y/w/h 都是相对图片宽高的百分比：

```
:::: occlusion url="文件名.png" alt="说明"
1. 12.5,22,75,20 应用层
2. 12.5,48,75,20 传输层
::::
```

- 点某个区域即揭示，再点一次重新遮挡
- 右下角悬浮控制可“揭示下一项 / 揭示全部”，按序号依次揭示
- 标签可省略；省略后只显示遮挡色块

> 想省事就用桌面端 `工具 → Quizify Markdown → 图片遮挡：生成坐标…` 或打开
> `docs/image-occlusion-tool.html`，拖框后直接复制这段文本。""",
    ),
    (
        r"""# 图片遮挡：顺序揭示

遮罩会按区域编号依次揭示，适合“一层一层展开”的讲解。

:::: occlusion url="_quizify-occlusion-sample.png" alt="协议栈顺序揭示"
1. 12.5,22,75,20 TCP / UDP
2. 12.5,48,75,20 IP / ICMP
::::
""",
        r"""区域按行首编号排序，编号小的先揭示。

- 点右下角悬浮控制里的“揭示下一项”逐个展开
- “揭示全部”一次显示所有遮罩
- 编号不必连续，但会被自动排序；相同编号保持书写先后

```
:::: occlusion url="文件名.png"
1. 12.5,22,75,20 第一层
2. 12.5,48,75,20 第二层
::::
```""",
    ),
    (
        r"""# 图片遮挡：块内图片

把 Markdown 图片放进块里，就无需再写 `url=` 参数：

:::: occlusion
![网络协议栈](_quizify-occlusion-sample.png)
1. 12.5,22,75,20 应用层
2. 12.5,48,75,20 传输层
3. 12.5,74,75,20 网络层
::::
""",
        r"""块内的第一张图片会作为遮挡底图，其余内容变成图注：

```
:::: occlusion
![](文件名.png)
1. 12.5,22,75,20 应用层
::::
```

> `url=` 与块内图片二选一即可；同时存在时以 `url=` 为准。""",
    ),
    (
        r"""# 音频播放器

用 `!audio[标题](文件名.mp3)` 插入播放器：

!audio[示例音频](_quizify-sample.mp3)""",
        r"""播放器支持变速、循环 A/B 段与拖动进度。

```
!audio[标题](文件名.mp3)
```

> 音频文件要先放进 Anki 媒体库（本包已内置一段示例音频）。""",
    ),
    (
        r"""# 提示框

用 `> [!类型]` 开头，支持 NOTE / TIP / IMPORTANT / WARNING / CAUTION。

> [!WARNING]
> 修改牌组前请先备份数据。""",
        r"""用 `> [!类型]` 开头即可：

```
> [!NOTE]
> 这是一条提示。
```

> [!IMPORTANT]
> 重要内容也会这样显示。""",
    ),
    (
        r"""# 伸缩大纲

普通 Markdown 嵌套列表会自动变成可折叠大纲：

- Camping trip
  - To buy
    - Coffee & tea
    - Trail mix
  - Journal
- Birthday gift""",
        r"""- 每个父项都能单独展开 / 收起
- 点三角收起，点圆点可像 Workflowy 一样聚焦
- 平铺列表仍是普通样式

- 一级
  - 二级
    - 三级""",
    ),
    (
        r"""# 综合示例

**问题**：TCP 三次握手发生在哪一层？

;;;
A. 应用层
B. 传输层
C. 网络层
;;;B""",
        r"""传输层（Transport Layer）。

- 代表协议：==TCP==、==UDP==
- 三次握手：SYN → SYN/ACK → ACK
- 端口范围：$0 \sim 65535$

> [!TIP]
> `;;;` 里选项字母的大小写和顺序都可以随意。""",
    ),
]


def build_collection(
    col, notetype, addon_dir: Path, config: dict, with_samples: bool
) -> None:
    models = col.models
    model = models.new(NOTE_TYPE_NAME)
    for field_name in ("Front", "Back"):
        field = models.new_field(field_name)
        field["plainText"] = True
        models.add_field(model, field)
    template = models.new_template(MANAGED_TEMPLATE_NAME)
    models.add_template(model, template)

    effective = {**config, "note_type": NOTE_TYPE_NAME}
    template["qfmt"] = notetype.template_html(addon_dir, "front.html", effective)
    template["afmt"] = notetype.template_html(addon_dir, "back.html", effective)
    model["css"] = notetype.DEFAULT_CSS + "\n" + scan_block(package_assets())
    models.add(model)

    if not with_samples:
        return

    deck_id = col.decks.id(SAMPLE_DECK_NAME)
    deck = col.decks.get(deck_id)
    if deck is not None:
        deck["desc"] = DECK_DESCRIPTION
        col.decks.save(deck)

    note_type = models.by_name(NOTE_TYPE_NAME)
    for front, back in SAMPLES:
        note = col.new_note(note_type)
        note["Front"] = front
        note["Back"] = back
        col.add_note(note, deck_id)


# ---------------------------------------------------------------------------
# Guarantee every runtime asset travels with the package.
# ---------------------------------------------------------------------------
MOBILE_ASSETS_COMMENT = "quizify-mobile-assets:v1"


def scan_block(assets: list[Path]) -> str:
    """A CSS comment listing every bundled asset.

    Anki's media scanner looks at the note type styling for files whose names
    start with ``_``; listing each filename here (with ``_quizify-``/``_``
    prefixes) makes the exporters keep the complete runtime and sample set.
    """
    lines = "\n".join(path.name for path in assets)
    return f"/* {MOBILE_ASSETS_COMMENT}\n{lines}\n*/"


def verify_package_media(apkg_path: Path, assets: list[Path]) -> None:
    with zipfile.ZipFile(apkg_path) as archive:
        packed = set(json.loads(archive.read("media")).values())
    expected = {path.name for path in assets}
    missing = sorted(expected - packed)
    if missing:
        raise RuntimeError(
            "packaged media is incomplete, missing: " + ", ".join(missing)
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--no-samples",
        action="store_true",
        help="package only the note type, without the sample deck",
    )
    args = parser.parse_args(argv)

    try:
        from anki.collection import Collection
    except ImportError:
        print(
            "error: the 'anki' package is required to build the .apkg.\n"
            '       install it with: python -m pip install "anki==25.9.5"',
            file=sys.stderr,
        )
        return 2
    from anki.exporting import AnkiPackageExporter

    addon = load_addon_modules()
    config = default_config()
    assets = package_assets()

    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    workdir = Path(tempfile.mkdtemp(prefix="quizify-apkg-"))
    try:
        col = Collection(str(workdir / "collection.anki2"))
        try:
            build_collection(
                col,
                addon.notetype,
                ADDON_ROOT,
                config,
                with_samples=not args.no_samples,
            )
            # Seed the collection media, then export with the legacy exporter,
            # which collects every asset listed in the note type styling.
            for path in assets:
                col.media.add_file(str(path))
            exporter = AnkiPackageExporter(col)
            exporter.includeSched = False
            exporter.includeMedia = True
            exporter.exportInto(str(output))
        finally:
            col.close()
        verify_package_media(output, assets)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    print(f"runtime assets embedded: {len(assets)}")
    if not args.no_samples:
        print(f"sample notes: {len(SAMPLES)}")
    print(f"wrote {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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
    "KaTeX 公式、点击揭示、批注、折叠块、标签页、文字遮盖、高亮、图片、"
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

    return types.SimpleNamespace(
        notetype=load("notetype"), runtime_media=load("runtime_media")
    )


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
    """Sample-only media (images) shipped alongside the demo notes."""
    if not EXTRA_ASSETS_DIR.is_dir():
        return []
    return sorted(
        path
        for path in EXTRA_ASSETS_DIR.iterdir()
        if path.is_file() and not path.name.startswith(".")
    )


def package_assets(runtime_media) -> list[tuple[Path, str]]:
    """Pair every bundled asset with the name it must carry in the package.

    The review runtime is content addressed, because a ``.apkg`` import never
    replaces an existing media file: shipping ``_quizify.js`` again would leave
    phones and tablets on the runtime they already have.
    """

    names = runtime_media.load_media_names(ADDON_ROOT)
    assets = [(path, names.get(path.name, path.name)) for path in media_manifest()]
    assets += [(path, path.name) for path in extra_assets()]
    return assets


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
        r"""# 文字遮盖

用 `%%文字%%` 把答案盖住，点一下才显示。

TCP 是一种 %%面向连接%%、可靠的 %%传输层协议%%，用 %%三次握手%% 建立连接。
""",
        r"""- 点一下遮盖块揭示，再点一下重新盖上
- 同一张卡里的多个遮盖块互不影响
- 遮盖块是绿色高亮，浅色 / 深色主题下都清晰

```
%%要遮盖的文字%%
```

> 遮盖只是“盖住”，文字仍留在卡片里，方便对照。""",
    ),
    (
        r"""# 文字遮盖：自测

先在心里回答，再逐个点开遮盖对照。

- TCP 三次握手第一步：%%SYN%%
- 第二步：%%SYN + ACK%%
- 第三步：%%ACK%%
""",
        r"""- 按顺序逐块揭示，先回忆再验证
- 键盘可用：Tab 聚焦遮盖块，Enter 或空格切换
- Back 里也能用遮盖自测，例如 %%传输层%% 的代表协议是 TCP 和 UDP

```
%%按需遮盖任何文字%%
```""",
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
    col,
    notetype,
    addon_dir: Path,
    config: dict,
    with_samples: bool,
    assets: list[tuple[Path, str]],
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
    model["css"] = notetype.DEFAULT_CSS + "\n" + scan_block(assets)
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


def scan_block(assets: list[tuple[Path, str]]) -> str:
    """A CSS comment listing every bundled asset.

    Anki's media scanner looks at the note type styling for files whose names
    start with ``_``; listing each filename here (with ``_quizify-``/``_``
    prefixes) makes the exporters keep the complete runtime and sample set.
    """
    lines = "\n".join(name for _, name in assets)
    return f"/* {MOBILE_ASSETS_COMMENT}\n{lines}\n*/"


def verify_package_media(apkg_path: Path, assets: list[tuple[Path, str]]) -> None:
    with zipfile.ZipFile(apkg_path) as archive:
        packed = set(json.loads(archive.read("media")).values())
    expected = {name for _, name in assets}
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
    assets = package_assets(addon.runtime_media)

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
                assets=assets,
            )
            # Seed the collection media, then export with the legacy exporter,
            # which collects every asset listed in the note type styling.
            for source, name in assets:
                addon.runtime_media.write_media_file(col.media, source, name)
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

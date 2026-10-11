"""Render the sample diagrams used by the packaged sample deck.

The layout constants in this file are the single source of truth: the same
numbers produce both the PNG artwork and the percentage coordinates written
into the sample notes, so a mask can never drift away from its picture.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

W, H = 800, 500
MARGIN_X = 70
CONTENT_TOP = 104
GAP = 20
FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
PALETTE = [
    ("#e7f4f1", "#3f9d8f", "#1d6b5f"),
    ("#fdf2e3", "#c98b34", "#96631d"),
    ("#e8eefb", "#5a76c4", "#3d549f"),
    ("#f3e8f7", "#a05fc0", "#7a3f96"),
    ("#e9f6ea", "#5aa564", "#357a3d"),
    ("#fdeaea", "#cf6a6a", "#9e3f3f"),
]


def grid(count: int, columns: int) -> tuple[float, float]:
    """Return the (cell width, cell height) that fits `count` labels.

    A single column produces full-width bars (good for a protocol stack); two
    columns split the canvas left/right (good for a parts diagram).
    """
    rows = (count + columns - 1) // columns
    width = (W - 2 * MARGIN_X - (columns - 1) * GAP) / columns
    height = (H - CONTENT_TOP - 40 - (rows - 1) * GAP) / rows
    return width, height


def cell_box(index: int, columns: int, count: int) -> dict:
    row, column = divmod(index, columns)
    cell_w, cell_h = grid(count, columns)
    return {
        "left": MARGIN_X + column * (cell_w + GAP),
        "top": CONTENT_TOP + row * (cell_h + GAP),
        "width": cell_w,
        "height": cell_h,
    }


def box_percent(index: int, columns: int, count: int) -> str:
    """`x,y,w,h` percentages for the nth cell, row-major."""
    box = cell_box(index, columns, count)
    return ",".join(
        f"{value:g}"
        for value in (
            round(box["left"] / W * 100, 2),
            round(box["top"] / H * 100, 2),
            round(box["width"] / W * 100, 2),
            round(box["height"] / H * 100, 2),
        )
    )


def build_html(title: str, sub: str, labels: list[str], columns: int) -> str:
    cells = []
    for index, name in enumerate(labels):
        box = cell_box(index, columns, len(labels))
        bg, border, ink = PALETTE[index % len(PALETTE)]
        cells.append(
            f'<div class="cell" style="left:{box["left"]:.0f}px;top:{box["top"]:.0f}px;'
            f'width:{box["width"]:.0f}px;height:{box["height"]:.0f}px;'
            f'background:{bg};border-color:{border}">'
            f'<span style="color:{ink}">{name}</span></div>'
        )
    return (
        f'<!doctype html><html><head><meta charset="utf-8"><style>'
        f'html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#fff;'
        f'font-family:{FONT}}}'
        f'.title{{position:absolute;left:40px;top:22px;font-size:29px;font-weight:700;color:#12433c}}'
        f'.sub{{position:absolute;left:40px;top:62px;font-size:15px;color:#7c8a87}}'
        f'.cell{{position:absolute;border:2px solid;border-radius:12px;box-sizing:border-box;'
        f'display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:700}}'
        f'</style></head><body><div class="title">{title}</div>'
        f'<div class="sub">{sub}</div>{"".join(cells)}</body></html>'
    )


def render(name: str, title: str, sub: str, labels: list[str], columns: int) -> dict:
    MEDIA.mkdir(parents=True, exist_ok=True)
    html_path = MEDIA / f"{name}.html"
    html_path.write_text(build_html(title, sub, labels, columns), encoding="utf-8")
    png = MEDIA / f"{name}.png"
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=2", f"--window-size={W},{H}",
         f"--screenshot={png}", f"file://{html_path}"],
        check=True, capture_output=True,
    )
    html_path.unlink()
    coordinates = ";".join(
        f"{box_percent(i, columns, len(labels))},{i + 1}" for i in range(len(labels))
    )
    return {"image": png.name, "coordinates": coordinates}


# name -> (title, subtitle, labels, columns)
DEMOS = {
    "demo1": ("网络协议栈", "点击绿色遮罩，自上而下说出每一层",
              ["应用层", "传输层", "网络层"], 1),
    "demo2": ("计算机组成", "点击绿色遮罩，逐个说出部件名称",
              ["运算器", "控制器", "存储器", "输入设备", "输出设备", "总线"], 2),
}


def main() -> int:
    result = {name: render(name, *payload) for name, payload in DEMOS.items()}
    # The apkg builder reads this manifest instead of hand-copied numbers, so a
    # regenerated diagram can never leave a stale mask behind.
    manifest = MEDIA / "manifest.json"
    manifest.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

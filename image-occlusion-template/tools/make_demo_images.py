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
COLUMNS = [70, 410]
ROWS = [104, 234, 364]
CELL_W, CELL_H = 320, 110
FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
PALETTE = [
    ("#e7f4f1", "#3f9d8f", "#1d6b5f"),
    ("#fdf2e3", "#c98b34", "#96631d"),
    ("#e8eefb", "#5a76c4", "#3d549f"),
    ("#f3e8f7", "#a05fc0", "#7a3f96"),
    ("#e9f6ea", "#5aa564", "#357a3d"),
    ("#fdeaea", "#cf6a6a", "#9e3f3f"),
]


def centre_percent(index: int) -> tuple[float, float]:
    row, column = divmod(index, 2)
    return (
        (COLUMNS[column] + CELL_W / 2) / W * 100,
        (ROWS[row] + CELL_H / 2) / H * 100,
    )


def box_percent(index: int) -> str:
    """`x,y,w,h` percentages for the nth cell, row-major."""
    row, column = divmod(index, 2)
    left = COLUMNS[column] / W * 100
    top = ROWS[row] / H * 100
    return ",".join(
        f"{value:g}"
        for value in (round(left, 2), round(top, 2),
                      round(CELL_W / W * 100, 2), round(CELL_H / H * 100, 2))
    )


def build_html(title: str, sub: str, labels: list[str]) -> str:
    cells = []
    for index, name in enumerate(labels):
        row, column = divmod(index, 2)
        bg, border, ink = PALETTE[index % len(PALETTE)]
        cells.append(
            f'<div class="cell" style="left:{COLUMNS[column]}px;top:{ROWS[row]}px;'
            f'width:{CELL_W}px;height:{CELL_H}px;background:{bg};border-color:{border}">'
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


def render(name: str, title: str, sub: str, labels: list[str]) -> dict:
    MEDIA.mkdir(parents=True, exist_ok=True)
    html_path = MEDIA / f"{name}.html"
    html_path.write_text(build_html(title, sub, labels), encoding="utf-8")
    png = MEDIA / f"{name}.png"
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=2", f"--window-size={W},{H}",
         f"--screenshot={png}", f"file://{html_path}"],
        check=True, capture_output=True,
    )
    html_path.unlink()
    coordinates = ";".join(
        f"{box_percent(i)},{i + 1}" for i in range(len(labels))
    )
    return {"image": png.name, "coordinates": coordinates}


DEMOS = {
    "demo1": ("网络协议栈", "点击绿色遮罩，由下往上说出每层名称",
              ["应用层", "传输层", "网络层"]),
    "demo2": ("计算机组成", "点击绿色遮罩，逐个说出部件名称",
              ["运算器", "控制器", "存储器", "输入设备", "输出设备", "总线"]),
}


def main() -> int:
    result = {name: render(name, *payload) for name, payload in DEMOS.items()}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

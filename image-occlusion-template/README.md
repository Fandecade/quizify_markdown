# Quizify 图片遮挡模板

基于 [Sunrongguo2008/anki-image-occlusion-template](https://github.com/Sunrongguo2008/anki-image-occlusion-template)
改造：**主题统一为 Quizify「开务」，遮挡色改为绿色**，并修复了原模板无法换肤的问题。

- 原项目：MIT / 原作者 Sunrongguo2008，许可证见 `LICENSE`
- 本改造：与 Quizify 保持一致的视觉语言（同一套主色、圆角、字体、深浅色）

## 关键改动

| 项目 | 原模板 | 本版本 |
| --- | --- | --- |
| 卡片/按钮/文本配色 | 蓝灰通用色板 | Quizify 开务色板（主色 `#147d72`） |
| 字体 | Inter | Quizify 字体栈（含 PingFang SC 等中文优选） |
| 圆角 | 16px / 4px | Quizify 令牌 14px / 9px |
| **遮挡颜色** | 黑色底 + 红色边框 | **绿色底 + 绿色边框** |
| 待揭示高亮 | 黄色 | 绿色脉冲 |
| 已揭示状态 | 内联 `rgba(0,0,0,0)` 哨兵 | `.revealed` 类（**可换肤、深色模式生效**） |

> 原模板把「是否揭示」编码在 `rect.style.backgroundColor === 'rgba(0,0,0,0)'` 里，
> 导致颜色被写死在 JS 中、深色模式无法生效。本版本改为 CSS 类控制：
> 颜色全部由 `--mask-*` 变量决定，深色模式通过 `.nightMode` 自动切换。

## 字段

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `Question` | 建议 | 题干 |
| `Image` | **必填** | 图片主体（用 Anki 原生图片字段，跨端同步） |
| `Opinions` | 制作时必填 | 遮挡坐标串 `x%,y%,w%,h%,order;...` |
| `Answer` | 可选 | 背面答案 |
| `Note` | 可选 | 背面备注 |
| `Tags` | 可选 | 标签 |

坐标格式（相对图片的百分比，最后一位是揭示顺序）：

```text
12.50,22.00,75.00,20.00,1;12.50,48.00,75.00,20.00,2
```

## 使用

**制作**：把图片放进 `Image` 字段 → 点「开启编辑模式」→ 在图上拖拽画遮挡框 →
点「复制遮挡坐标」→ 粘贴进 `Opinions` 字段 → 关闭编辑模式。

**复习**：点单个遮罩揭示/重新遮住；「揭示下一个遮挡」按顺序揭示；
`W` 揭示下一个、`Q` 收回上一个；`+/-` 或双指捏合缩放，拖动平移。

## 开发

```bash
node preview/render.mjs --reveal   # 生成可离线打开的预览页
node preview/test.mjs              # 行为测试（坐标、揭示、换肤、绿色）
```

`preview/` 只是本地调试用；正式使用时只需 `front.html` / `back.html` / `style.css`。

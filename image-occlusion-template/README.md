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
| **图片容器** | 浅色方框（背景 + 1px 边框 + 内边距 + 圆角） | **去框**，图片直接显示在卡片背景上 |

> 原模板把「是否揭示」编码在 `rect.style.backgroundColor === 'rgba(0,0,0,0)'` 里，
> 导致颜色被写死在 JS 中、深色模式无法生效。本版本改为 CSS 类控制：
> 颜色全部由 `--mask-*` 变量决定，深色模式通过 `.nightMode` 自动切换。

## 平板端遮罩漂移修复

旧版把 `Opinions` 里的百分比当成像素用：先用 `img.getBoundingClientRect()`
（**视觉像素**）换算成 px，再写回 `style.left/top/width/height`（**CSS 像素**）。
桌面和手机的页面缩放恰好是 1，两者相等所以看不出来；平板端 WebView 会缩放整个
页面（AnkiMobile 的内容缩放、AnkiDroid 的显示缩放），写进去的 px 被再缩放一次，
遮罩就整体外扩、越靠边越偏。

现在遮罩一律用**百分比定位**（`left:12.5%`、`width:75%` …），拖拽/移动时把指针
坐标先换算回布局像素再计算，绘制完成后同样只写百分比，因此台式机、手机、平板
（含任何缩放比）下位置完全一致。`clampImagePan()` 的平移钳制也改用同一套单位。

`preview/test.mjs` 里有回归用例：把 `getBoundingClientRect()` 的返回值放大 1.4 倍
模拟平板缩放，遮罩必须仍落在 `10/10/30/20`（旧实现在这里会变成 `14/14/42/28`）。

## 去掉图片外框

原模板的 `.main-image-container` 自带浅色底、1px 边框、10px 内边距和圆角，
看起来像卡片里又套了一个独立的小方框，图片被限制在里面。

现在这层装饰全部去掉，只保留**布局属性**（`flex` 居中、`overflow: hidden`、
`position: relative` 和各行高度），所以：

- 图片直接铺在卡片背景上，深浅色模式下都跟随卡片底色；
- 内边距归零后图片可用宽度增加 20px，仍按容器尺寸等比适配居中缩放；
- 遮罩坐标是**相对图片的百分比**，与容器留白无关，因此去掉框后旧卡片
  `Opinions` 数据无需任何修改；
- `preview/test.mjs` 的 9 项用例（含平板 1.4 倍缩放）全部通过。

## 图片铺满卡片宽度

原来的图片区被写死成「一屏高」布局里的 `minmax(220px, 1fr)` 行（移动端
`clamp(220px, 45vh, 460px)`），图片再按 `min(宽适配, 高适配)` 缩放。结果是：
卡片越宽、这一行越矮，图片就被**高度**卡住，只能缩成中间一条横带，左右留出大片空白，
在宽屏桌面（Anki 窗口横向拉伸）上尤其明显。

现在改成和普通 Anki 图片卡一样的行为：

- 图片区高度 **由图片本身撑开**（`height: auto`），不再是固定视口高度；
- `computeBaseFitScale()` 只按**可用宽度**适配（上限 2 倍放大，避免小图被拉糊），
  图片始终铺满卡片宽度、整张完整显示；
- 页面允许滚动（`body.front-mode` 的 `overflow: hidden` 改为 `overflow-y: auto`），
  图片高过一屏时向下滚动即可，不再为了塞进一屏而缩小图片；
- 正面那排「开启编辑模式 / 复制遮挡坐标 / 揭示下一个遮挡」按钮改为**吸底**
  （`position: sticky`），图片变高后按钮依然随手可点；
- 图片区左右各留 28px 空隙，加上卡片自身内边距，手机/平板上图片两侧各有约
  38–40px 空白，手指能落在图片之外滑动整页；
- **手势让位**（`syncTouchAction()`）：图片完整可见时把它和遮罩的
  `touch-action` 设为 `pan-y`，单指上下滑交给浏览器滚动整页——以前这里被
  平移逻辑 `preventDefault()` 吃掉，手机/平板上会出现「图片上滑不动」。
  放大到超出可视区（`userZoomFactor > 1`）后才切回 `none`，由 JS 接管平移和
  双指捏合，原有手势一个不少；
- 遮罩仍按百分比定位，坐标与缩放逻辑未变，`preview/test.mjs` 9 项用例全部通过。

## 字段

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `Question` | 建议 | 题干 |
| `Image` | **必填** | 图片主体（用 Anki 原生图片字段，支持直接粘贴/拖入，跨端同步） |
| `Opinions` | 制作时必填 | 遮挡坐标串 `x%,y%,w%,h%,order;...` |
| `Answer` | 可选 | 背面答案 |
| `Note` | 可选 | 背面备注 |
| `Tags` | 可选 | 标签 |

坐标格式（相对图片的百分比，最后一位是揭示顺序）：

```text
12.50,22.00,75.00,20.00,1;12.50,48.00,75.00,20.00,2
```

## 粘贴图片 / 从旧版升级

5 个字段默认都用 Anki 的**可视化编辑器**，所以可以直接 `Ctrl+V` 粘贴截图、
或把图片文件拖进 `Image` 字段：Anki 会把图片存进媒体库，字段里只留
`<img src="...">`，同步到手机端同样能正常显示。

> 早期版本的 `Image` 字段被误设成了**纯文本（HTML 源码编辑器）**，
> 在那种字段里粘贴图片不会有任何反应。如果已经导入过旧版，任选一种方式恢复：
>
> 1. **不丢卡片**：工具 → 管理笔记类型 → `Image Occlusion (Quizify)` →
>    字段… → 选中 `Image` → 取消勾选「默认使用 HTML 编辑器」→ 保存。
> 2. **重新导入**：先删除旧的 `Image Occlusion (Quizify)` 笔记类型
>    （连同用它建的示例卡），再导入新的 `apkg`。
>
> 临时救急：编辑时点字段左侧的 `</>` 徽标（`Ctrl+Shift+X`）切换到可视化编辑器，
> 也能直接粘贴图片。

## 已有卡片如何换成新模板

**重新导入 apkg 不会更新你正在用的笔记类型。** 实测（anki 25.9）：
Anki 的 apkg 导入器从不合并同名笔记类型，它只会新建一个
`Image Occlusion (Quizify)+` 副本，你原来的卡片仍然渲染旧模板。所以两条路：

1. **推荐**：桌面端 `工具 → 管理笔记类型 → Image Occlusion (Quizify) → 卡片…`，
   把本目录的 `front.html` / `back.html` / `style.css` 分别覆盖粘贴到
   正面模板 / 背面模板 / 样式，保存即可。所有已有卡片立即生效，同步后
   手机、平板也一起更新，**不用重新导入、不会多出副本**。
2. 想用新 apkg：先删掉旧的 `Image Occlusion (Quizify)` 笔记类型再导入；
   注意删除笔记类型会连同用它的卡片一起删掉，请先确认没有自己的卡片在用。

示例卡的 `guid` 现在是按图片名固定生成的，所以重复导入不会再多出两张重复示例卡。

## 使用

**制作**：把图片放进 `Image` 字段 → 点「开启编辑模式」→ 在图上拖拽画遮挡框 →
点「复制遮挡坐标」→ 粘贴进 `Opinions` 字段 → 关闭编辑模式。

**复习**：点单个遮罩揭示/重新遮住；「揭示下一个遮挡」按顺序揭示；
`W` 揭示下一个、`Q` 收回上一个；`+/-` 或双指捏合缩放，拖动平移。

## 打包成 `.apkg`（手机可直接导入）

```bash
python -m pip install "anki==25.9.5"     # 需要 Python 3.10+
python tools/build_apkg.py --out dist/image-occlusion-quizify.apkg
```

生成 `dist/image-occlusion-quizify.apkg`（约 220 KB），双击即可导入桌面端 /
AnkiDroid / AnkiMobile。包内含：

- `Image Occlusion (Quizify)` 笔记类型（`Question` / `Image` / `Opinions` /
  `Answer` / `Note`），模板复用本目录的 `front.html` / `back.html`，
  样式复用 `style.css`，因此主题与绿色遮罩始终一致；
- 两张示例图（`demo1.png` 网络协议栈、`demo2.png` 计算机组成）与两张示例卡。

示例图与坐标都由 `tools/make_demo_images.py` 的**同一套布局常量**生成，
所以遮罩永远和图形对齐；重新生成：

```bash
python tools/make_demo_images.py
```

> **为什么用 Rust 导出器**：旧的 `AnkiPackageExporter` 对这个笔记类型会
> 随机写出空的内层集合（实测约 60% 失败），导入后表现为「导入成功但没有卡片」。
> 构建脚本改用确定性的 Rust 导出器（`legacy=True` 保留经典
> `collection.anki21` 结构以兼容手机端），并在结束后**真实导入一次做校验**，
> 条数不符就直接报错，绝不会给你一个坏包。

## 开发

```bash
node preview/render.mjs --reveal   # 生成可离线打开的预览页
node preview/test.mjs              # 行为测试（坐标、揭示、换肤、绿色）
```

`preview/` 只是本地调试用；正式使用时只需 `front.html` / `back.html` / `style.css`。

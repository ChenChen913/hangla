# Hangla (夯拉榜)

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

**English** | [简体中文](./README.md)

「从夯到拉」中文梗图 Tier List 排行榜生成器，支持拖拽排名、多风格昼夜切换、PNG 导出与一键分享

> The line above is the canonical product description (kept verbatim in both READMEs, in `package.json` and in the GitHub About field). In English: a Tier List maker for the Chinese "from top-tier to trash" meme — drag to rank, switch visual themes and day/night palettes, export a high-resolution PNG, share in one click.

<!-- TODO: add the online demo URL once deployed (vercel.json is ready) -->

![Exported result of "A worker's day, ranked from top-tier to trash": five tiers filled in](docs/screenshot-export.png)

```sh
git clone https://github.com/ChenChen913/hangla.git && cd hangla && npm install && npm run dev
```

## Features

- **Drag to rank**: move items across tiers and reorder inside a tier; select an item and click an empty spot in a tier to file it there
- **5 preset modes**: 从夯到拉 (top-to-trash) / 经典梗图 (classic meme) / SSR 稀有度 (SSR rarity) / 竞技梯度 T0-T4 (ranked ladder T0–T4) / 经典 S ~ D (classic S–D) — tier names, colors, icons and descriptions are all editable
- **4 visual styles × day/night palettes** (8 themes): 现代 (modern) / 经典梗图 (classic meme) / 抽象梗风 (abstract meme) / 赛博霓虹 (cyber neon)
- **High-resolution PNG export**: rendered at 2× pixel ratio, file name follows `<timestamp>-<board name>-排行榜.png`, timestamped to the second
- **Share links**: the whole board (images included) is encoded into the URL, so the recipient sees the same board and can copy it into their own editor in one click
- **Item pool**: a staging area for unranked items — upload a logo, add a one-line description, paste or drop images; images are re-encoded by content (photos become JPEG, illustrations with transparency stay PNG) with the longest side capped at 640px
- **My boards**: save board snapshots in this browser, up to 30 of them
- **Fullscreen layout**: hide the navigation bar and show nothing but the board — handy for streaming or screen recording
- **Single-file offline build**: `npm run build` emits one `dist/index.html` that opens with a double click

The same board in three different themes:

| 经典梗图 · 白天 | 抽象梗风 · 白天 | 赛博霓虹 · 黑夜 |
|:---:|:---:|:---:|
| ![Classic meme style](docs/screenshot-classic-meme.png) | ![Abstract meme style](docs/screenshot-hype.png) | ![Cyber neon style](docs/screenshot-neon-night.png) |

## Table of contents

- [Features](#features)
- [Background](#background)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Development](#development)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Background

「从夯到拉」 ("from top-tier to trash") is a ranking meme from the Chinese internet: **夯** (untouchable, far ahead of the rest) > 顶级 (top) > 人上人 (above average) > NPC (filler) > **拉完了** (washed up, dead last). Tier List culture is mature outside China, but there was no ready-to-use ranking tool that speaks this meme's language — Hangla fills that gap: the classic Tier List table plus Chinese-internet tier wording, with an art font and motion, so the result can be posted as a meme right away.

## Quick start

Requirements: Node.js ≥ 20, Git.

```sh
git clone https://github.com/ChenChen913/hangla.git
cd hangla
npm install
npm run dev
```

Open the URL printed in the terminal (defaults to `http://localhost:5173`). The first launch ships with a sample board, "2026 年 AI 大模型从夯到拉" (2026 AI models, ranked top to trash) — just start dragging.

For an offline copy you can double-click and send to someone:

```sh
npm run build
```

The build output is a single `dist/index.html` with styles, scripts and fonts all inlined.

## Usage

1. **Add items**: in the item pool, click "＋添加项目" (add item) to upload a logo and write a one-line description, or type a name and press Enter, or paste / drop an image directly
2. **Rank**: drag item cards into any tier — they swap in real time across tiers; select an item and click an empty spot in a tier to file it quickly
3. **Edit tiers**: click a tier name to rename it, change its color, add an icon and description, or delete it; use "＋添加档位" to add a custom tier
4. **Change the look**: switch preset mode (从夯到拉 / 经典梗图 / SSR 稀有度 / 竞技梯度 T0-T4 / 经典 S ~ D), visual style (现代 / 经典梗图 / 抽象梗风 / 赛博霓虹) and day/night palette from the top bar
5. **Display & typography**: the sliders panel controls image and name visibility, image size, tilted images (including a per-image angle), label font size / family / weight, tier label font (standard / Smiley Sans) and animation strength
6. **Export / share**: "导出 PNG" renders a high-resolution board image (the file name carries a timestamp down to the second — the picture at the top of this page is that output); "分享" copies a board link or downloads a share card — open the link and you see the same board, with one click to copy it for editing
7. **Fullscreen layout**: the round button at the bottom right hides the navigation bar so only the board is shown
8. **My boards**: keep several board snapshots, preview or restore them at any time

The editor looks like this (items still waiting in the pool on the right can be dragged straight into a tier):

![Editor UI: a five-tier board named "打工人的一天", with the unranked item pool below](docs/screenshot-editor.png)

## Configuration

Every setting (appearance, display and typography, board content) is stored automatically in the browser's localStorage. **There is no config file and no environment variable** (nothing under `src/` reads `import.meta.env` or `process.env`, so there is no `.env` to create).

The board lives under the localStorage key `hangla.v3`, and images under `hangla.v3::images`: an image referenced by several snapshots is stored only once, and it is reclaimed automatically once no item uses it.

A re-encoded photo is about 80KB (the same image stored as-is is 800KB or more), so the measured browser quota (about 5MB in Chrome) fits roughly sixty-plus photos. Near the limit you get a warning, and a failed write tells you exactly which change was not saved instead of dropping it silently.

Common scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (defaults to http://localhost:5173) |
| `npm run build` | Type-check, then bundle the single-file build into `dist/index.html` |
| `npm run preview` | Preview the build output locally |
| `npm run docs:check` | Check in-page anchors and bilingual consistency across both READMEs |

Five preset modes ship with the app (从夯到拉 / 经典梗图 / SSR 稀有度 / 竞技梯度 T0-T4 / 经典 S ~ D); tier colors belong to the preset and are registered in `src/lib/presets.ts`. Visual styles are registered in `src/lib/themes.ts` along two axes, style × day/night — currently 4 styles × 2 palettes = 8 themes.

## Project structure

```text
hangla/
├── index.html
├── vite.config.ts            # react + tailwindcss + viteSingleFile
├── vercel.json               # Vercel deployment config
├── docs/                     # screenshots used by the READMEs
├── scripts/
│   └── check-anchors.mjs     # README anchor checker
├── src/
│   ├── main.tsx              # entry: legacy save migration, legacy share links
│   ├── App.tsx               # HashRouter + route transition animation
│   ├── index.css             # Tailwind 4 + theme variables + font
│   ├── types.ts              # data model
│   ├── store/
│   │   ├── board.ts          # board data / actions / snapshots (persist → localStorage)
│   │   ├── toast.ts
│   │   └── ui.ts             # overlay state
│   ├── lib/
│   │   ├── themes.ts         # style × day/night themes (screen + export palettes)
│   │   ├── presets.ts        # preset modes
│   │   ├── images.ts         # image reading and re-encoding
│   │   ├── storage.ts        # storage layer (image interning, batched writes, failure fallback)
│   │   ├── share.ts          # share-link building and availability check
│   │   └── utils.ts          # helpers, share encode/decode
│   ├── components/           # TierBoard / TierRow / ItemChip / dialogs …
│   └── pages/                # EditorPage / PreviewPage / TemplatesPage / MinePage
└── legacy/                   # archived v0.2 vanilla build
```

## Development

```sh
npm run dev        # dev server with instant hot reload
npm run test       # unit tests (data normalisation / share codec / storage layer / board actions)
npm run build      # type-check + single-file build
npm run preview    # preview the build output
npm run docs:check # README anchors + bilingual consistency
```

`npm install` installs husky's Git hooks through the `prepare` script: `commitlint` validates commit messages against Conventional Commits when you commit (`.husky/commit-msg`), and `pre-commit` runs the anchor check whenever a README changes.

Commit conventions live in [CONTRIBUTING.md](CONTRIBUTING.md); project rules for AI sessions live in [AGENTS.md](AGENTS.md); the roadmap is in [ROADMAP.md](ROADMAP.md).

## FAQ

**The exported PNG doesn't match what I see in the editor?**
It should — the export canvas and the editor share the same rendering parameters (palette, shadow, spacing, font, tilt angles are all in sync). If you do see a difference, refresh the page and try again.

**A share link won't open, or reports corrupted data?**
The link encodes the entire board including images, so a long one can be truncated by some chat apps. Download the PNG instead, or share again with fewer images.

**My data disappeared after switching browsers?**
Data is stored per browser in localStorage. To move it across devices use a share link, or export important boards from "My boards".

**What happens when I add a lot of images?**
Images live in the browser's localStorage, so the quota is up to the browser (about 5MB in Chrome, which measured out to roughly sixty-plus photos). When it fills up a toast tells you the change was not saved — delete a few images and you are back in business. Export the PNG first for anything you care about.

**How do I keep several boards for the long term?**
Use "保存快照" (save snapshot) on the "我的排名" page — up to 30 per browser — and export the PNG as a backup for boards that matter.

## Contributing

Issues and pull requests are welcome:

1. Fork the repository and branch off `main`
2. Commit messages follow Conventional Commits; the subject is written in Simplified Chinese and must start with a Chinese character (for example `feat: 新增XX功能`). The hook validates this automatically
3. One concern per commit; make sure `npm run build` passes before opening a PR
4. When adding a visual style, update both the screen palette and the export palette in `themes.ts`

Ask questions and report problems in [Issues](https://github.com/ChenChen913/hangla/issues); the details are in [CONTRIBUTING.md](CONTRIBUTING.md). Maintainer: [@ChenChen913](https://github.com/ChenChen913).

## License

[MIT](LICENSE) © 2026 ChenChen913

The Smiley Sans font bundled in the UI (「得意黑」) is released under the SIL Open Font License 1.1, copyright 听得 Antarctica & 摘星 Liu — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

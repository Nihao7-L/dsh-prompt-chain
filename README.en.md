<div align="center">

<img src="icon.svg" width="72" height="72" alt="dsh-prompt-chain" />

# dsh-prompt-chain

**One click on the enhance button in the DSH composer turns a rough draft into a precise, executable prompt — and when the answer is still too short, you keep going, round after round.**

[![Version](https://img.shields.io/badge/version-1.0.0-4f7cff?style=flat-square)](https://github.com/Nihao7-L/dsh-prompt-chain/releases)
[![License](https://img.shields.io/badge/license-MIT-3da639?style=flat-square)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-8b5cf6?style=flat-square)](#compatibility)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6b7280?style=flat-square)](#compatibility)

**English** · [简体中文](./README.md)

</div>

![Demo: draft → enhance → continue → compare → custom icon](docs/demo.gif)

<sub>18 seconds: rough draft → click the button → continue → line diff → change the icon.</sub>

---

## Screens

| Entry | Result panel |
| --- | --- |
| ![Enhance button next to the composer](docs/01-composer.png) | ![Rewrite result panel](docs/02-panel.png) |
| **Click the button left of the composer** — a round icon by default, swappable for an emoji, image or GIF | **The result writes straight back**; the bar has regenerate / continue / copy / done |
| Continue | Line diff |
| ![History after continuing](docs/03-continue.png) | ![Line-by-line diff](docs/04-diff.png) |
| **Keep going**; every round enters history, click any version to jump back | **Green added, red removed**, with a change count in the header |
| Prompt presets | Icon library |
| ![Bilingual prompt panes](docs/05-settings-prompt.png) | ![Icon library and preview](docs/06-button-style.png) |
| **6 read-only presets** plus up to 3 of your own; English on the left is what gets sent | **2 static + 1 hand-drawn + 3 animated** groups, all usable as the button icon |

---

## Features

| | |
| --- | --- |
| Enhance | Reads the draft, rewrites it with the model, opens a result panel that edits the composer live |
| Continue | Extends the result in rounds (max 5), shows "n rounds left", explains itself at the limit |
| Regenerate | Re-runs from the **original draft**, ignoring edits made in the panel |
| History | Every version is kept; click a version to jump back; undo/redo to the very first draft |
| Diff | Line-level added / removed / unchanged view with a change count |
| Presets | 6 read-only built-ins + 3 of your own (create / rename / delete), bilingual panes, one-click free translation |
| Custom system prompt | Edit the actual system prompt; the output contract ("only the rewritten prompt, no preamble") is always appended and cannot be broken |
| Model | Follow the session model (default), pin a provider + model, or pass one for a single run |
| Button | Circle / text / emoji style; sticker library with 6 built-in groups (2 static emoji + 1 hand-drawn art + 3 animated GIFs) plus your own packs; animated GIFs stay animated (≤128 KB) and single built-in stickers can be hidden |
| Panel | Glass or solid background, opacity slider with a numeric box, ±240 px offset from the composer |
| Hotkey | Ctrl+Enter, can be disabled |
| UI language | `CH / EN` toggle in the settings header (auto / Chinese / English) |
| Error handling | Full error text, selectable and copyable; clear messages for empty input, overflow, abort and broken chains |

---

## Install

Requires DSH 0.2.x (desktop or web).

**Plugin market** — search `dsh-prompt-chain`, install, then **fully quit and reopen DSH**.

**Download the tarball** (no npm)
Grab `dsh-prompt-chain.tgz` from [Releases](https://github.com/Nihao7-L/dsh-prompt-chain/releases/latest), then:
```bash
dsh plugin add .\dsh-prompt-chain.tgz
```
or use DSH's plugin page → “Install from file”.

**From a local checkout**
```powershell
cd <dsh home>/profiles/desktop
pnpm add "dsh-prompt-chain=file:D:/path/to/dsh-prompt-chain"
```
Then add `dsh-prompt-chain` to `dsh.profile.bundles` in that folder's `package.json` and restart DSH.

The plugin has two halves: the UI half (`client.js`) takes effect on a page refresh, the host half (`index.js` — model calls, config, translation) **needs a full restart**. If you see "the plugin host is not loaded (404)", you refreshed the page without restarting the app.

---

## Compatibility

- `platform: web` — desktop and web builds, any OS.
- `engines.dsh`: `^0.1.2-rc.1 || ^0.1.7-rc.2 || ^0.2.0-rc.1` (verified on 0.2.1-rc.2).
- Enhancement goes through DSH's own model channel (session model by default) — no extra API key.
- Free translation uses public endpoints (MyMemory, LibreTranslate mirror); when unavailable the English pane stays empty and enhancement still works.

## Privacy

Config lives in `~/.dsh/prompt-chain/config.json` on your machine. Enhancement requests go to whichever model service you already use in DSH. Icons are stored as data URIs locally — nothing is uploaded. Only text you explicitly translate is sent to the public translation endpoint.

## License

[MIT](./LICENSE) © 2026 Nihao7-L

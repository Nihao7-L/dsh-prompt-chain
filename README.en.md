<div align="center">

<img src="icon.svg" width="72" height="72" alt="dsh-prompt-chain" />

# dsh-prompt-chain

**One click turns a rough draft into a 💪 ready-to-run prompt — short on detail? keep going 🔜; not what you wanted? regenerate 🔄. Every round is saved as a history version 🕐 you can jump back to ↩️, the result writes straight back to the composer, and every change is shown line by line. 🗺️ Show or hide the panel, 🎨 pick the prompt 🪄 button icon, 📍 move the button wherever you want it.**

**🎨 Your button, your look**: six built-in icon packs (two emoji sets, one hand-drawn set, three animated GIF sets) plus any packs you build yourself.

[![Version](https://img.shields.io/badge/version-1.1.1-4f7cff?style=flat-square)](https://github.com/Nihao7-L/dsh-prompt-chain/releases)
[![License](https://img.shields.io/badge/license-MIT-3da639?style=flat-square)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-8b5cf6?style=flat-square)](#compatibility)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6b7280?style=flat-square)](#compatibility)

**English** · [简体中文](./README.md)

</div>

![Demo: draft → enhance → continue → compare → custom icon](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/demo.gif)

<sub>18 seconds: rough draft → click the button → continue → line diff → change the icon.</sub>

---

## Screens

| 1 | 2 |
| --- | --- |
| ![Enhance button next to the composer](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/01-composer.png) | ![Rewrite result panel](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/02-panel.png) |
| **Click the button left of the composer** — a round icon by default, swappable for an emoji, image or GIF | **The result writes straight back**; the bar has regenerate / continue / copy / done |
| ![History after continuing](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/03-continue.png) | ![Line-by-line diff](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/04-diff.png) |
| **Keep going** — up to 5 rounds; every round enters history, click any version to jump back | **Green added, red removed**, with a change count in the header |
| ![Bilingual prompt panes](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/05-settings-prompt.png) | ![Icon library and preview](https://raw.githubusercontent.com/Nihao7-L/dsh-prompt-chain/main/docs/06-button-style.png) |
| **6 read-only presets** plus up to 3 of your own; English on the left is what gets sent | **6 icon sets** (2 static + 1 image + 3 animated), all usable as the button icon |

---

## Features

| | |
| --- | --- |
| Enhance | Reads the draft, rewrites it with the model, opens a result panel that edits the composer live |
| Continue | Extends the result in rounds (max 5), shows "n rounds left", explains itself at the limit |
| Regenerate | Two modes: **from the original draft** (drops panel edits and re-runs the first draft) or **from the last prompt** (re-runs the prompt actually sent to the model last round). Hover a menu item for the explanation |
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

**Plugin market** (once listed) — search `dsh-prompt-chain`, install, then fully quit and reopen DSH.

**Command line**
```bash
dsh plugin add dsh-prompt-chain
```
Then **fully quit and reopen DSH**. This needs the package published to npm; until then use the tarball below.

**Download the tarball** (works before the npm/market release)
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
- `engines.dsh`: `>=0.1.2-rc.1 <0.2.0 || >=0.2.0-rc.1 <0.3.0` (verified on 0.2.1-rc.3).
- Enhancement goes through DSH's own model channel (session model by default) — no extra API key.
- Free translation uses public endpoints (MyMemory, LibreTranslate mirror); when unavailable the English pane stays empty and enhancement still works.

## Privacy

Config lives in `~/.dsh/prompt-chain/config.json` on your machine. Enhancement requests go to whichever model service you already use in DSH. Icons are stored as data URIs locally — nothing is uploaded. Only text you explicitly translate is sent to the public translation endpoint.

## License

[MIT](./LICENSE) © 2026 Nihao7-L

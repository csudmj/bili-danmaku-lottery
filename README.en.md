# 抽奖姬

**Developer: 想吃金丝虾球** · Windows 10/11 x64 · Version 2.1.0

[简体中文](README.md) | [English](README.en.md)

> V2.1.0 adds draws from your own uploads using creator-center sender IDs, a local history of 20 activities per module, and a single top-level folder in portable ZIPs. Native launch, account switching, real video import/draw, and history persistence were verified. Live paid-gift traffic and the published update path still require field verification. Video parts reporting 1,000 or more messages are blocked to avoid truncated entry pools. See [CHANGELOG](CHANGELOG.md).


A desktop tool for Bilibili live interactions: collect keyword-based entries for a random draw or a first-come queue, and display participants and winners in a compact portrait window.

The room field starts empty and remembers your last entry locally. Paste a full Bilibili live-room URL or erase the room field to clear the saved value. Collection never starts automatically.

## Features

| Feature | Behavior |
| --- | --- |
| Keyword draws | Substring matching, UID deduplication, and multiple winners per draw |
| Fan medal filter | Allow everyone or require a medal belonging to the current room's streamer; no separate lit-status check |
| Ordered queue | Order eligible messages by arrival at the application; configurable waiting capacity |
| Manual removal | Remove pending participants from either the main window or portrait window |
| Draw weights | Separate captain, admiral, governor, room-fan and other-viewer defaults, all initially 1; individual overrides and reset-to-one |
| Personal weights | Exact UID matching, or exact-name matching for all namesakes when UID is empty; saved locally, editable, searchable and clearable |
| Queue adjustment | Drag handles or move arrows in the main window; synchronized portrait order |
| Portrait window | Pin, minimize, resize, draw, and reset; latest winners appear below the controls |
| Backgrounds | Choose a local photo, restore the default, and adjust dimming |
| Automatic scrolling | Independent switches for the main and portrait lists; pauses during interaction |
| Updates and About | Installed builds check stable GitHub releases; repository QR code, Issues and PR links |
| Diagnostics | Runtime error guidance, diagnostic export and a standalone file integrity checker |
| Clear status | Login and collection status; the portrait window hides the signed-in account name |

## Download and quick start

1. Open [Releases](https://github.com/csudmj/bili-danmaku-lottery/releases) and install `danmakullottery-2.1.0-x64.exe` for in-app updates. GitHub's automatic Source code downloads are not runnable application packages.
2. Alternatively, download `danmakullottery-Windows-x64-v2.1.0.zip` and extract the entire ZIP to a writable directory and run `抽奖姬.exe`. Keep the adjacent `resources`, `locales`, DLLs, and other files. End users do not need Node.js or Python.
3. Select **登录 B 站** and sign in yourself on the official webpage opened by the app. This session is separate from other browsers.
4. Select draw or queue mode, enter a room ID and keyword, and choose the medal requirement.
5. Select **开始收集弹幕**. Wait for **正在获取弹幕** before asking viewers to enter. The portrait window opens after connection succeeds.
6. Select **抽取** to draw, or serve queued viewers in order and remove them when finished.

See the [changelog](CHANGELOG.md) and [publishing guide](docs/发布与升级指南.md) (Chinese).

Personal UID rules take priority over name-only rules, followed by identity defaults. A name-only rule applies to every viewer with that exact name. Editing the personal list does not retroactively change admitted viewers. Applying defaults to all pending viewers uses the personal list too; resetting everyone to 1 retains the personal list for future entries. Unknown guard identity falls back to the room-medal category. Identity defaults reset to 1 on restart; the personal list persists locally.

## Entry rules and controls

- **Matching:** A message must contain the keyword. For example, `我要喵喵喵` matches `喵喵喵`, while `喵喵` does not. Only new messages received during collection count. Historical messages and messages without a valid UID are not admitted.
- **Deduplication:** One entry per UID per round. Winners cannot win again in that round; removed participants cannot rejoin until a reset.
- **Queue:** Capacity defaults to 20 and accepts integers from 1 to 10000. It limits current waiting participants. Apply changes with **应用**; capacity cannot be lower than current occupancy. A full queue has no hidden waiting list. Viewers who were not admitted must send the keyword again after a slot opens.
- **Weights:** Each selection uses the participant's weight divided by the remaining total weight. Multiple winners are selected sequentially without replacement. A larger weight does not guarantee a win.
- **Stop collection:** Retains participants, winners, and weights; collection can be resumed.
- **Start Collection:** Archives the previous round, including undrawn or empty rounds, and starts a new round.
- **Portrait Start Collection:** Archives the previous round and starts a new one using the existing conditions.
- **Close or minimize the portrait window:** Retains data and does not stop collection. Reopen it from the main window.
- **Exit the application:** The active round is not resumed. The latest 20 activities per module remain available in History, and personal weight rules persist.

Drawing automatically pauses collection. Mode, room, keyword, and medal requirements are locked during collection or after anyone has entered the round. Reset before changing them. The message feed retains the latest 2000 messages without removing admitted participants.

## Current scope

The current release targets Windows x64. Installed builds check stable GitHub releases automatically. Download and installation require user action; installation is blocked during collection. ZIP builds require manual downloads. Versions without in-app updates require a manual installation of the current release. Run the bundled `启动检查.cmd` if the app cannot start; it checks file hashes and writes a troubleshooting report. About also supports diagnostic export. The executable is not digitally signed. Its company-name field is not a certificate-verified publisher identity.

## Data and distribution

Login information and custom backgrounds are stored in the current Windows user's application-data directory, not the release ZIP. Distribute the complete release package without personal application data. Offline demonstration data, real-message samples, and local backups are excluded from the software and source upload packages.

## Development

Stack: Electron 35, React 18, TypeScript, and Vite 6.

Use Windows, Node.js 22.13 or a later 22.x release, and pnpm 10. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec electron --version
pnpm run dev
```

If pnpm reports blocked dependency build scripts, run `pnpm approve-builds`, approve the required `electron` and `esbuild` installation scripts, and run `pnpm rebuild`. Initial installation needs network access to fetch dependencies and Electron.

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm run build:win
```

The Windows installer, ZIP, blockmap and latest.yml are written to `release/vVERSION/`. The packaging script includes runtime resources only, excluding tests, caches, and personal login data. Automated tests use network substitutes to check eligibility, deduplication, queue capacity, removal, weighted selection, and synchronized window state. They do not replace live-room testing.

A manually triggered Windows workflow uploads builds as Actions artifacts without publishing a Release. It still needs an actual GitHub run after the initial upload.

## Issues and contributions

Issues and pull requests are welcome in this repository. Include the app version, Windows version, reproduction steps, expected behavior, and actual behavior. Redact personal information from screenshots; never submit cookies, login data, or passwords. Describe the purpose and validation of your pull request.

## License

The project uses the [MIT License](LICENSE). Required third-party copyright and license notices are included in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt). Release packages also retain the bundled Electron/Chromium licenses. Product developer: **想吃金丝虾球**.


## Video lottery and history

Select **B站视频**, sign into the uploader account inside the app, enter your own video URL or BV ID, and choose parts and a keyword. Participants are deduplicated by real UID. Missing identities, inconsistent pagination, or a part with at least 1,000 comments stop the import instead of producing a potentially incomplete pool. Deleted comments or data withheld by the platform cannot be recovered. Live and video pools are separate; personal weight rules are shared.

**历史记录** separates Bilibili Live and Bilibili Video, storing the most recent 20 activities per module locally across restarts, including participants, removed members, queue order, and draw results. Multiple draws in one activity remain grouped. Optional live loss compensation defaults to +0.1 for each remaining participant per draw click; winners have matching personal rules removed. Optional paid-gift queue sorting uses accumulated amounts for already queued viewers while enabled, with original arrival order breaking ties.

Live rounds: clicking Start Collection again archives the current round (including undrawn or empty rounds) and starts a new one. Pause / Resume preserves participants, winners, weights and the current round settings.

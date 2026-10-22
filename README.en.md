# 抽奖姬

**Developer: 想吃金丝虾球** · Windows 10/11 x64 · Version 1.5.0

[简体中文](README.md) | [English](README.en.md)

A desktop tool for Bilibili live interactions: collect keyword-based entries for a random draw or a first-come queue, and display participants and winners in a compact portrait window.

## Features

| Feature | Behavior |
| --- | --- |
| Keyword draws | Substring matching, UID deduplication, and multiple winners per draw |
| Fan medal filter | Allow everyone or require a medal belonging to the current room's streamer; no separate lit-status check |
| Ordered queue | Order eligible messages by arrival at the application; configurable waiting capacity |
| Manual removal | Remove pending participants from either the main window or portrait window |
| Draw weights | Default 1; manually set an integer from 1 to 10000 in the main window |
| Portrait window | Pin, minimize, resize, draw, and reset; latest winners appear below the controls |
| Backgrounds | Choose a local photo, restore the default, and adjust dimming |
| Automatic scrolling | Independent switches for the main and portrait lists; pauses during interaction |
| Updates and About | Installed builds check stable GitHub releases; repository QR code, Issues and PR links |
| Diagnostics | Runtime error guidance, diagnostic export and a standalone file integrity checker |
| Clear status | Login and collection status; the portrait window hides the signed-in account name |

## Download and quick start

1. Open [Releases](https://github.com/csudmj/bili-danmaku-lottery/releases) and install `danmakullottery-1.5.0-x64.exe` for in-app updates. GitHub's automatic Source code downloads are not runnable application packages.
2. Alternatively, download `抽奖姬-Windows-x64-v1.5.0.zip` and extract the entire ZIP to a writable directory and run `抽奖姬.exe`. Keep the adjacent `resources`, `locales`, DLLs, and other files. End users do not need Node.js or Python.
3. Select **登录 B 站** and sign in yourself on the official webpage opened by the app. This session is separate from other browsers.
4. Select draw or queue mode, enter a room ID and keyword, and choose the medal requirement.
5. Select **开始收集弹幕**. Wait for **正在获取弹幕** before asking viewers to enter. The portrait window opens after connection succeeds.
6. Select **抽取** to draw, or serve queued viewers in order and remove them when finished.

See the [illustrated PDF manual in Chinese](docs/抽奖姬_v1.4.0_图文使用说明.pdf). Its 1.4.0 instructions also apply to 1.4.1. Version 1.5.0 uses a new application identity, so users must sign in again and reselect a custom background if needed.

## Entry rules and controls

- **Matching:** A message must contain the keyword. For example, `我要喵喵喵` matches `喵喵喵`, while `喵喵` does not. Only new messages received during collection count. Historical messages and messages without a valid UID are not admitted.
- **Deduplication:** One entry per UID per round. Winners cannot win again in that round; removed participants cannot rejoin until a reset.
- **Queue:** Capacity defaults to 20 and accepts integers from 1 to 10000. It limits current waiting participants. Apply changes with **应用**; capacity cannot be lower than current occupancy. A full queue has no hidden waiting list. Viewers who were not admitted must send the keyword again after a slot opens.
- **Weights:** Each selection uses the participant's weight divided by the remaining total weight. Multiple winners are selected sequentially without replacement. A larger weight does not guarantee a win.
- **Stop collection:** Retains participants, winners, and weights; collection can be resumed.
- **Main-window reset:** Clears the round and pauses collection so conditions can be changed.
- **Portrait-window reset:** Clears the round and reconnects using the existing conditions.
- **Close or minimize the portrait window:** Retains data and does not stop collection. Reopen it from the main window.
- **Exit the application:** Round participants and weights are not restored. Copy the winner list before exiting if you need a record.

Drawing automatically pauses collection. Mode, room, keyword, and medal requirements are locked during collection or after anyone has entered the round. Reset before changing them. The message feed retains the latest 2000 messages without removing admitted participants.

## Current scope

The current release targets Windows x64. Installed builds check stable GitHub releases automatically. Download and installation require user action; installation is blocked during collection. ZIP builds require manual downloads. Users of 1.4.x must manually install 1.5.0 first. Run the bundled `启动检查.cmd` if the app cannot start; it checks file hashes and writes a troubleshooting report. About also supports diagnostic export. The executable is not digitally signed. Its company-name field is not a certificate-verified publisher identity.

## Data and distribution

Login information and custom backgrounds are stored in the current Windows user's application-data directory, not the release ZIP. Distribute the complete release package without personal application data. Offline demonstration data, real-message samples, and local backups are excluded from the software and source upload packages. Manual screenshots use demonstration participants.

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

<img src="https://raw.githubusercontent.com/MattModeCode/MattModeCode/main/assets/hero.svg" alt="Terminal running 'chin status'. Output reads: matthew chin, oakville, on — incoming chemical engineering at mcmaster '30. Building chinos, a local-first voice AI OS. Shipped octet, promptly, ai-concept-map. Stack: swift, rust, python, gdscript, typescript." width="100%">

## matthew chin

I build local-first AI systems that run entirely on my own machine — voice, agents and memory, with no cloud inference anywhere in the loop.

Incoming chemical engineering (co-op) at McMaster '30 · Oakville, ON

---

## selected work

| project | what it is |
|:--|:--|
| **[octet](https://github.com/MattModeCode/octet)**<br><sub>`Godot 4.7` · `GDScript`</sub> | An eight-lane rhythm game whose editor finds the tempo for you. Onset detection runs on an FFT I wrote by hand in GDScript, and notes are timed against audio playback position rather than frame delta — which is the difference between a rhythm game that feels right and one that doesn't. Released v1.1.0 for macOS, Windows and Linux.<br><br><sub>Third rhythm game I've built. The first two taught me which mechanic was worth keeping.</sub> |
| **[promptly](https://github.com/MattModeCode/Promptly)**<br><sub>`Swift` · `AppKit` · zero dependencies</sub> | Press ⌥Space in any text field, fuzzy-find a template, and it pastes where your cursor was — focus never leaves the app you're in. An Accessibility write returning `.success` does not mean the text actually landed, so it verifies by reading the value back, and snapshots and restores your clipboard around every paste. |
| **[ai-concept-map](https://github.com/MattModeCode/ai-concept-map)**<br><sub>`Vanilla JS` · `Canvas 2D`</sub> | The 80 concepts you need in order to understand how modern LLMs work, laid out as a graph of prerequisites rather than a flat glossary. 71 of them carry a hand-drawn SVG diagram. One HTML file, no framework, no build step, no server. |
| **[youtube-downloader](https://github.com/MattModeCode/youtube-downloader)**<br><sub>`Rust` · `Tauri 2` · `TypeScript`</sub> | Paste a link, get an MP4 or an MP3. `yt-dlp` and `ffmpeg` ship inside the app bundle as sidecars, so there is no terminal, no Homebrew and no Python to install first. |
| **[claude-skills](https://github.com/MattModeCode/claude-skills)**<br><sub>`Markdown`</sub> | The Claude Code skills I publish — including the one that captured octet's screenshots and wrote its README. |

## currently building

| | |
|:--|:--|
| **chinos** <sub>private</sub> | A local-first voice AI operating system for macOS — one voice, one router, one memory sitting above Claude Code and local models. Speech recognition benchmarks at 3.0% WER and 62 ms p50 on the Neural Engine, and holds there under concurrent LLM decode. Planning and benchmarks complete; assembly in progress. |
| **aegis** <sub>private</sub> | An always-on personal agent system that runs entirely offline. The approval kernel is a durable SQLite state machine with exactly-once execution, TTL auto-deny and crash recovery, so an agent can find the hydro bill on its own but only I can approve paying it. 1,142 test functions green in CI. |
| **atlas** <sub>private</sub> | Local-first personal finance with a deterministic tax engine — 2026 federal and Ontario brackets, surtax, CPP/EI, tuition carryforward. The model narrates and takes instructions but never produces a number it didn't receive from the engine. Options are priced by running the engine twice and diffing it. |

## how I work

- **Local-first by construction.** No cloud inference in any of it. Privacy ends up being an architectural property rather than a policy — in chinos, a cloud adapter physically cannot receive privacy-enveloped work.
- **Decisions get competed, not asserted.** Three or more isolated proposals, a judge that picks or merges and records what the losing proposals contributed, then a skeptic whose only job is refutation.
- **Benchmarks are committed artifacts, including the ones that went badly.** The chinos router scores 0.900 on-corpus and about 0.40 on held-out paraphrases — which is precisely why recovery and traces carry that design instead of first-pass accuracy.

## stack

<img src="https://raw.githubusercontent.com/MattModeCode/MattModeCode/main/assets/stats.svg" alt="Language breakdown by bytes written across all repositories, with counts of contributions, repositories, releases and languages." width="100%">

## recent activity

<img src="https://raw.githubusercontent.com/MattModeCode/MattModeCode/main/assets/grid.svg" alt="Contribution activity over the last 60 days, drawn as a strip of daily cells where opacity encodes volume." width="100%">

---

<sub>Everything above is mine and current. The stats and contribution grid regenerate daily from the GitHub API — last updated <!--UPDATED-->2026-07-18<!--/UPDATED-->.</sub>

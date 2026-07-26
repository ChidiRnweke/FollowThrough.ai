# Screenshot capture plan

Every wanted screenshot in this repo, in one list. Each row is a complete brief: a capture pass
should need nothing beyond it.

Two consumers:

- **README** — files land in `docs/screenshots/<id>.png` and the `<!-- SCREENSHOT: … -->` markers
  in `README.md` become image embeds.
- **Landing page** — files land in `src/lib/assets/marketing/<id>.png`. Nothing else is needed:
  `screenshot-slot.svelte` swaps its placeholder for the image as soon as the file exists
  (`src/lib/components/marketing/screenshots.ts` resolves it by filename).

The same capture can serve both; copy it to both locations.

## How to capture

Auth is disabled in single-user dev mode, so a local Playwright run reaches every page directly.

```sh
pnpm dev
npx playwright ...   # or a one-off script driving chromium
```

Rules for every shot:

- **Viewport** exactly as listed, `deviceScaleFactor: 2`.
- **No browser chrome** — capture the page, not the window.
- **Both themes** where the row says `both`: emulate `colorScheme` and save `<id>.png` (light) and
  `<id>-dark.png` (dark).
- **Real but plausible data.** Seed a project called _Acme rebrand_ with the notes, todos, and
  memory entries the rows below assume. Empty states are not what these shots are for.
- **No real personal data** — no real client names, no real email addresses.
- Let animations settle (~500ms) before capturing; the app's own motion is 125ms.

## Shots

| id                    | Route                       | Viewport  | Theme | Must be on screen                                                                                                                                                                                                |
| --------------------- | --------------------------- | --------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero`                | `/today`                    | 1440×900  | dark  | The Today page with at least one overdue item, two due today, one waiting-on, and two pinned notes. The greeting line and date eyebrow visible.                                                                  |
| `today-triage`        | `/today`                    | 1440×900  | both  | Same page, light-first. All four triage groups populated so the grouping structure reads.                                                                                                                        |
| `note-split`          | `/notes/<id>`               | 1600×1000 | both  | Two notes open side by side via a dragged tab, the split resizer visible, a backlink chip in view, and one inline suggestion anchored in the text.                                                               |
| `board`               | `/todos`                    | 1440×900  | both  | Board tab selected, three columns populated, one card mid-drag with the drag handle visible, one overdue card showing its red date.                                                                              |
| `transcript-to-todos` | `/notes/<id>`               | 1440×900  | both  | A note containing a pasted standup transcript, with extracted-promise suggestions shown inline and the suggestions panel open on the right. This is the money shot — it is the one the landing page argues from. |
| `agent-approval`      | `/chats/<id>`               | 1440×900  | both  | An agent run paused on a tool-approval card, the proposed diff expanded, Accept and Reject visible. Execution mode set to approval-required.                                                                     |
| `project-memory`      | `/projects/<id>/memory`     | 1440×900  | both  | Memory entries of at least three kinds (decision, constraint, preference) plus one still in `proposed` state.                                                                                                    |
| `artifacts`           | `/artifacts`                | 1440×900  | both  | At least three generated artifacts, mixed PDF and DOCX badges, one row's actions menu open.                                                                                                                      |
| `diagram-editor`      | `/notes/<id>/diagrams/<id>` | 1600×1000 | both  | A rendered Mermaid diagram with the draw.io editor available — ideally mid-review, showing both representations.                                                                                                 |

## Video

One screen recording, worth more than the stills:

- **`walkthrough`** — 30–45 seconds, 1440×900, dark. Paste a transcript into a note → accept the
  extracted todos → open the board and see them → open the project's memory and accept the proposed
  entry. No cursor jitter, no dead time, no narration. Export as MP4 and as a looping WebM under
  3 MB for the README.

## Already captured

- `llm-traces.png` — agent run traces in Arize Phoenix.
- `llm-spans.png` — span detail for a single run.

Both are embedded in the README's Observability section.

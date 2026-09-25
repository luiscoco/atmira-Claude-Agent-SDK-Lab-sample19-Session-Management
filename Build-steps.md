# Session management

This file describes the **steps followed** to add Concept 19 (**Session management**) to the Claude Agent SDK Lab:
what was read, what was decided, how it was tested, and what the tests changed.
To learn the concept itself, read [Tab19-Session-management.md](Tab19-Session-management.md).

| Concept | Topic | Routes | Explanation |
|---|---|---|---|
| 19 | `continue`, `resume`, `forkSession`, `resumeSessionAt`, `sessionId`, `persistSession`, `listSessions()`, `getSessionInfo()`, `getSessionMessages()`, `renameSession()`, `tagSession()`, `forkSession()`, `deleteSession()` | `/api/c19/turn`, `/sessions`, `/sessions/:id`, `/sessions/:id/rename`, `/tag`, `/fork`, `/delete`, `/reset` | [Tab19-Session-management.md](Tab19-Session-management.md) |

## How to run it

```powershell
npm run dev        # server on http://localhost:3001, web on the Vite port
```

`node_modules` was copied from sample18, so `npm install` is not needed. Open the **19. Session management** tab.
Start it from a normal terminal: from inside Claude Code, the inherited `CLAUDE_CODE_*` variables make every run use
the login (`apiKeySource: "none"`, see Tab16).

> **Only one sample can run at a time.** Every sample's server uses port **3001**. Stop the other samples'
> `npm run dev` first.

## Step 1: Choose the feature

Again, the request said "implement the following feature sample" with no feature text. `sample19/` was a copy of sample18
(without `node_modules`). Four topics were offered: **Session management**, **Plugins in depth**, **Slash commands**,
or a pasted spec. **Session management** was chosen: Concept 6 only covered `resume`.

## Step 2: Read the existing samples

| Read | To learn |
|---|---|
| `server/concepts/06-sessions.ts`, `Tab6-Sessions.md` | What Concept 6 already covers (`resume` only), so as not to repeat it |
| `server/concepts/17-checkpointing.ts`, `Concept17Checkpointing.tsx`, `Tab17-Checkpointing-and-rewind.md` | The `BASE` options, a JSON `control()` wrapper returning 409, a lab folder, "the browser never sends a path", the doc style |
| `server/index.ts`, `server/sse.ts`, `src/lib/sse.ts`, `src/App.tsx`, `src/styles.css`, `.gitignore` | Mounting a router, SSE, the tab list, CSS to reuse |

## Step 3: Check the types

`sdk.d.ts` (`0.3.281`): the `Options` `continue`, `resume`, `forkSession`, `resumeSessionAt`, `sessionId` (with the
rule that it needs `forkSession` alongside `resume`), `persistSession` and the long `resumeDropsTurn` comment. The
functions `listSessions`, `getSessionInfo`, `getSessionMessages`, `renameSession`, `tagSession`, `forkSession` and
`deleteSession`, their `dir` option, `SDKSessionInfo` and `SessionMessage`.

## Step 4: Experiment before designing

A scratch script called the SDK directly, with the `CLAUDE*` variables removed and no tools. It ran two turns, then
tried every option and function on that session (the full table is in Step 2 of the Tab). What shaped the design:

- `resumeSessionAt` keeps the **same** id and drops the later turns from the chain. That was not obvious from the
  types, so the verdict had to show turns before and after, not only the id.
- `continue` goes to the most recent session **in cwd**, so the lab needs its own `cwd`.
- `persistSession: false` still returns a `session_id`, so "was it written?" must be checked on disk
  (`getSessionInfo`), not from the stream.
- Haiku's thinking adds a `thinking`-only `assistant` entry per turn → `thinking: { type: "disabled" }`.
- The first run used a scratch folder in the Windows temp directory: its transcript folder name went over 200
  characters, got cut and hashed, and `getSessionMessages(id, { dir })` returned `[]`. The second run, from a folder
  inside the project, worked. So the lab folder is `sample19/session-lab/`.
- Without `dir`, `deleteSession()` searches every project → the server only acts on ids that
  `listSessions({ dir: LAB })` lists.

The probe's transcripts were deleted from `~/.claude/projects/` afterwards.

## Step 5: Design the concept

- **Part A is one SSE route with seven modes.** The browser sends a mode, not option names, and the server maps it.
- **A verdict that does not depend on the model**: sessions listed before the run, `init.session_id` during it,
  `getSessionInfo()` and the turn count after it.
- **Part B is JSON routes around the functions**, logged in the tab as the call that was made and its result.
- **Turns, not raw entries**: the transcript is grouped into turns, and each turn's **last** uuid is the one used for
  `resumeSessionAt` and `upToMessageId`, as the `resumeDropsTurn` comment says.
- **The two parts are linked**: the session a run wrote to is selected in Part B, and *Use for resumeSessionAt* on a
  turn switches Part A to that mode.
- **The browser never sends a path**: a mode (checked against the list), uuids (checked against a pattern and
  against the lab's sessions), and a title/tag of at most 80 characters.

## Step 6: Implement it

| File | What was done |
|---|---|
| `server/concepts/19-session-management.ts` | New: `/turn` (SSE) and the session routes |
| `server/index.ts` | Mounted on `/api/c19` |
| `src/concepts/Concept19SessionManagement.tsx` | New: `TurnPart` (A), `SessionsPart` (B), shared selection |
| `src/App.tsx` | The tab |
| `.gitignore` | `session-lab/` |

`npx tsc --noEmit -p .` passed, and `npx vite build` succeeded (the `dist/` it made was removed).

## Step 7: Test the routes

The real server (`server/index.ts`) was started on port **3001** with `.env` loaded and the `CLAUDE*` variables
removed, and driven by a Node script like the browser does:

| Test | Result |
|---|---|
| `new`, then `resume` | New session, 1 turn. Then the same id, turns 1 → 2 |
| `GET /sessions/:id` | 2 turns, 2 entries each (thinking off), the transcript path |
| `fork` | A new id, 3 turns, *Colour: green, Fruit: mango* |
| `continue` | Went to the **fork** (the most recent session) |
| `resumeAt` on turn 1 | The original id, turns 2 → 2, *colour: green, fruit: unknown* |
| `customId` | `init.session_id` = the `sessionId` in the options |
| `ephemeral` | An answer, `persisted: false` |
| `mode: "rm -rf"`, `resume` without an id | `error` event, no query started |
| `resume` of an unknown uuid | `error_during_execution`, `No conversation found…`, $0 |
| `fork` (function, `upToMessageId`), `rename`, `tag`, tag cleared | 200, 6–13 ms each. `getSessionInfo` shows the title and tag |
| `delete` of an id not in the lab, `GET /sessions/..%2F..%2Fetc` | 409 `That session is not in session-lab/.` / `Not a session id.` |
| `delete` of the fork, `reset` | Removed from the list. `reset` deleted the rest |

One change came from the tests: the session table marked a session as "titled" when `customTitle` equaled `summary`.
The CLI's generated title is also stored in `customTitle`, so that label was wrong and was removed.

Costs: $0.0003 to $0.0017 per turn on Haiku, about $0.006 for the route tests and about $0.03 for the probes.

## Step 8: Run it in the real app

Vite was started on port **5199** next to the server: it served the page, `App.tsx` with the new tab,
`Concept19SessionManagement.tsx` (HTTP 200), and `/api/c19/sessions` through the Vite proxy. The lab sessions were
deleted with `/reset`, and both processes were stopped.

## Step 9: Fix from the first real use

With the lab empty (after `/reset`), `resume + forkSession` was picked first. Send was disabled because there was no
session to fork, and the app's CSS gives disabled buttons `cursor: wait`, so the page looked frozen ("not responding").
Changes in `Concept19SessionManagement.tsx`:

- A **Not ready** card says why Send is disabled: no sessions yet (start with "(no session option)"), no session
  selected, or no turn picked for `resumeSessionAt`. The button gets `cursor: not-allowed` instead of `wait`.
- When nothing is selected, the **newest session is selected** automatically.
- If `/api/c19/sessions` fails (for example, another sample's server on port 3001), an error card is shown instead of
  failing silently.

## Files added or changed

| File | Change |
|---|---|
| `server/concepts/19-session-management.ts` | New: the Concept 19 routes |
| `server/index.ts` | Mounts `/api/c19` |
| `src/concepts/Concept19SessionManagement.tsx` | New: the Session management tab |
| `src/App.tsx` | Tab |
| `.gitignore` | Ignores `session-lab/` |
| `Tab1-query().md` | Adds Concept 19 to the table |
| `Tab19-Session-management.md` | Explanation of the concept |
| `Build-steps.md` | This file |
| `readme.md` | Same content as `Tab19-Session-management.md` |

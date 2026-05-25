# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## What this project is

**Cheeky Ludo** — a 4-player Ludo game self-hosted on Firebase for playing
with friends. The novel twist (not yet implemented) is the **Cheeky** bot
mode where the dice itself is dishonest: a hidden controller silently
favors or sabotages random players with effects like lucky sixes, stuck on
ones, guaranteed kills, then reveals what happened after the game ends.

`DESIGN_NOTES.md` is the source of truth for rules, bot behavior, the five
Cheeky favor kinds, and concurrency expectations. If anything in the notes
seems off, ask before deviating — those decisions were deliberate.

## Stack

- **Frontend**: React 18 + TypeScript + Vite, `react-router-dom` for routes.
- **Backend**: Firebase Hosting (static SPA) + Cloud Firestore (game state)
  + Firebase Auth (Google sign-in).
- **Tests**: vitest + jsdom. Engine module is framework-free and unit-tested
  in isolation under `src/engine/__tests__/`.
- **Plan**: Spark (free tier) by design — see [Free-tier constraints](#free-tier-constraints).

## Layout

```
src/
  engine/         # Pure game logic. NO React / Firebase imports.
  rooms/          # Firestore room CRUD; bridges engine ↔ persistence.
  auth/           # AuthProvider, allowlist gate.
  components/    # React UI (Board, Dice, Lobby, GameView, etc.)
  styles/         # Plain CSS.
  firebase.ts     # Firebase SDK init from VITE_FIREBASE_* env.
  App.tsx, main.tsx
firestore.rules            # Allowlist-gated read/write rules.
firestore.indexes.json     # No composite indexes yet.
firebase.json              # Hosting → dist/; firestore wired.
.firebaserc                # Points at the deployed project (anchit-test-01).
```

## Firestore data model

- `allowed_users/{uid}` — allowlist. Anyone with a doc here can read/write
  rooms. Managed manually from the Firebase console (clients can't write).
- `users/{uid}` — `{ displayName, photoURL, lastSeenAt }`. Self-write only.
- `rooms/{roomCode}` — full `RoomState` (see `src/engine/state.ts`). Updated
  via Firestore transactions so concurrent moves don't trample each other.

Rules (`firestore.rules`) check `isAllowed()` on every read/write, which
means each call costs an extra `exists()` read against `allowed_users/`.
Fine on Spark for a handful of friends.

## Deploy

Setup + deploy steps for humans live in `README.md`. For an end-to-end
deploy from a fresh clone or after a code change:

```bash
npm install                # first time only
npm run typecheck          # optional sanity check
npm test                   # engine unit tests
npm run deploy             # = `npm run build && firebase deploy`
```

`npm run deploy` pushes **hosting + firestore rules + indexes** in one shot.
To deploy only one piece during iteration:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Hosting URL: `https://<project-id>.web.app` (currently
`https://anchit-test-01.web.app`).

## Local development

```bash
npm run dev          # http://localhost:5173 — hot reload
npm run test:watch   # vitest in watch mode
```

Local dev talks to **production Firestore** — there is no emulator wired up.
That means a `npm run dev` session counts against the live read/write quota
and writes into real `rooms/` docs. Use a separate test room code while
hacking.

## Adding a friend

1. They sign in once at the deployed URL — get bounced to the rejection
   page which displays their UID (with a "Copy ID" button).
2. They send you the UID.
3. In the Firebase console → Firestore → `allowed_users` collection, add a
   doc with that UID as the document ID. Any field works (e.g.
   `addedAt: <timestamp>`).
4. They reload and they're in.

## Free-tier constraints

The project is on the Spark (free) plan and must stay there. Spark limits
that matter here:

- **Firestore**: 50K reads / 20K writes / 20K deletes per day, 1 GiB total
  storage.
- **Hosting**: 10 GB stored, 360 MB transferred per day.
- **Auth**: Google sign-in is free.
- **No Cloud Functions** — Functions require Blaze. Anything resembling a
  backend job has to run in the browser or be wired via a Firestore
  transaction.

Don't propose features that require Blaze (Functions, scheduled jobs,
external API egress on the server side).

## When the user asks to make a change

1. Keep `src/engine/` framework-free — no React, no Firebase imports — so
   the engine stays vitest-only. If a feature needs both engine and
   persistence, add the engine bit first, test it, then wire it from
   `src/rooms/`.
2. Game-state writes go through `runTransaction` in `src/rooms/roomStore.ts`
   to stay consistent under concurrent edits. New mutators should follow
   the existing `mutate(roomCode, fn)` pattern.
3. Firestore rules are tight (allowlist-only). New collections need a
   matching rule block in `firestore.rules` or every client call will fail
   silently.
4. UI is plain CSS (`src/styles/app.css`). No CSS framework, no
   design-system dependency. Keep it that way unless asked.

## Things not to propose

- **Reintroducing Streamlit.** Prior attempt was reverted — see
  `git log --all`.
- **Cloud Functions / Cloud Run / any server-side compute.** Requires
  Blaze; out of scope.
- **A second database** (Redis, Supabase, etc.) — Firestore is enough.
- **Horizontal scaling / multi-replica / CDN-edge logic.** This is a small
  game for a few friends, not a service.
- **Adding analytics, telemetry, or third-party tracking.** Personal app.

## When the user asks about the previous (Streamlit) implementation

`git log --all` shows the Streamlit commits and the revert. Read deleted
files with `git show <commit>:<path>` rather than restoring them to the
working tree.

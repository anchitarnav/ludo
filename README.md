# Cheeky Ludo

A 4-player Ludo game for self-hosting on Firebase, with a planned "Cheeky"
bot mode where the dice itself is dishonest. See `DESIGN_NOTES.md` for the
game spec and `CLAUDE.md` for working-with-this-repo notes.

This POC ships the lobby and 4-human game. Bots and the Cheeky favor
mechanic are next.

## Stack

- React 18 + TypeScript + Vite
- Firebase Hosting + Cloud Firestore + Google Auth (Spark / free tier)
- Engine module is framework-free (`src/engine/`); vitest covers it.

## One-time setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Create a Firebase project**

   In the [Firebase console](https://console.firebase.google.com): create a
   project. Then:
   - Build → Authentication → Sign-in method → enable **Google**.
   - Build → Firestore Database → Create database (Native mode, region
     close to you).
   - Project settings → General → "Your apps" → add a **Web app**, copy
     the SDK config.

3. **Wire env + project ID**

   ```bash
   cp .env.local.example .env.local
   # paste the 6 VITE_FIREBASE_* values from the console into .env.local
   ```

   `.firebaserc` is checked in pointing at the project this repo is
   deployed to (`anchit-test-01`). If you're forking, replace it with your
   own project ID.

4. **Install Firebase CLI**

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## Local development

```bash
npm run dev    # http://localhost:5173
npm run test   # engine unit tests
```

On your first sign-in the app will reject you ("Not on the guest list").
That's expected — open the Firestore console and add a doc to
`allowed_users` with the **document ID** set to your UID (the rejection
page shows it). Reload; you're in.

## Deploy

```bash
npm run deploy
```

That runs `npm run build && firebase deploy`, which publishes **hosting +
Firestore rules + indexes** in one shot. To iterate on just one piece:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

The site lives at `https://<your-project>.web.app` — currently
[anchit-test-01.web.app](https://anchit-test-01.web.app).

## Adding friends

1. Have them sign in once — they'll land on the rejection page with their
   UID shown.
2. They send you the UID; you add a doc with that UID under
   `allowed_users` in the Firestore console.
3. They refresh and can play.

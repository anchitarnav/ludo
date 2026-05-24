# Cheeky Ludo

Not so honest Ludo — a 4-player Streamlit Ludo game with optional dishonest dice.

Up to 4 humans share a room via a link; bots fill empty seats. Standard Ludo
rules apply, with four bot modes selected by the host:

- **Neutral** — honest dice, random legal moves.
- **Killer** — honest dice, prefers captures, stays behind the leader to set up future kills.
- **Defensive** — honest dice, avoids capture range, prefers safe squares and blocks.
- **Cheeky** — *the dice itself is dishonest*. The board silently favors or sabotages
  any seat (human or bot) at random intervals with one of five effects: lucky sixes,
  stuck on ones, guaranteed kill, home-stretch sprint, stay-home. After the game a
  reveal-log shows what happened.

## Run locally

```bash
pip install -e .
streamlit run app.py
```

Open the printed URL, click "Create room", and share the URL with friends. The room
code is in the `?room=` query param. When the host clicks "Start game", any empty
seats get filled with bots of the chosen mode.

## Tests

```bash
pip install -e .[dev]
pytest
```

## Deployment

```bash
docker build -t cheeky-ludo .
docker run -p 8501:8501 cheeky-ludo
```

**Important:** room state lives in process memory. Deploy as a single process
(one container, no horizontal scaling). For a friends-only game this is fine.

## Concurrency model

The `ludo/store.py` module exposes a single `@st.cache_resource` dict keyed by
room code. Every browser session in every thread looks up the same `GameRoom`
object — that's how cross-tab state sharing works. Per-room `threading.RLock`
guards all mutations; a `version` counter bumps on every change so other tabs
auto-refresh and pick up the new state within ~1 second.

# CSCape — Computer Science Escape Room

The screen at the front goes dark. Students huddle around terminals, racing to crack the next challenge — create a folder, write a query, fix a broken script. The moment they nail it, a video kicks in and the story unfolds. No buttons, no manual triggers. The room just *knows*.

CSCape turns a Raspberry Pi and a projector into a fully automated escape room for teaching computer science. It pairs a [reveal.js](https://revealjs.com/) presentation with a Python backend that continuously monitors whether tasks have been completed — files created, database rows inserted, services running on the network. When a check passes, the next slide appears automatically and plays a video to advance the story.

## How It Works

1. The presentation (`index.html`) is displayed on a projector via a browser
2. The Flask backend (`cscape.py`) exposes check endpoints
3. The reveal.js plugin (`revealjs-cscape.js`) polls the backend every 5 seconds
4. When a check returns `solved: true`, the presentation advances to the next slide
5. The slide plays a video, then fades to black — waiting for the next challenge to be solved

## Setup

```bash
pip install -r requirements.txt
```

Copy the example files and fill in your values:

```bash
cp config.example.ini config.ini
cp game.example.py game.py
```

Add your video files to the `videos/` directory.

### Configuration

Edit `config.ini`:

```ini
[general]
title = My Escape Room

[telegram]
token = YOUR_BOT_TOKEN
chat_id = YOUR_CHAT_ID
```

The Telegram integration sends a notification whenever a level is solved.

## Defining Levels

Each level is a `<section>` in `index.html`. Add a `data-cscape-check` attribute pointing to a method in your `Game` class, and optionally a background video:

```html
<section data-cscape-check="check_database"
         data-background-video="videos/intro.mp4"
         data-background-size="contain"
         data-autoplay></section>
```

Then implement the corresponding check in `game.py`:

```python
class Game:
    def __init__(self):
        # Prepare the environment when the server starts
        pass

    def check_database(self):
        # Return True when the level is solved
        return row_count("answers") >= 5
```

Each check method should start with `check_` and return `True` when the level is solved.

## Running

```bash
python cscape.py
```

Then open `index.html` in a browser on the same machine. The backend runs on port 5000.

### Browser Configuration

Browsers block autoplay with audio by default. To allow background videos to play with sound:

**Chromium / Chrome / Google Chrome:**

```bash
chromium --autoplay-policy=no-user-gesture-required
google-chrome --autoplay-policy=no-user-gesture-required
```

**Firefox:**

Open `about:config` and set:

```
media.autoplay.default = 0
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Replay the current slide's background video |

## Project Structure

| File | Purpose |
|------|---------|
| `index.html` | Presentation with all slides/levels |
| `cscape.py` | Flask backend that runs checks and sends Telegram notifications |
| `game.py` | Your game logic — `Game` class with `__init__` and `check_*` methods |
| `game.example.py` | Template for `game.py` |
| `config.ini` | Configuration (title, Telegram credentials) |
| `config.example.ini` | Template for `config.ini` |
| `revealjs-cscape.js` | reveal.js plugin that polls the backend and controls slide progression |
| `reveal.js/` | Vendored reveal.js framework |
| `videos/` | Video files referenced by slides |

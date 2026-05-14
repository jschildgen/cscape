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

It is recommended to create a virtual environment before you install the required Python packages:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy the example files and fill in your values:

```bash
cp config.example.ini config.ini
cp game.example.py game.py
cp index.example.html index.html
```

Add your video files to the `videos/` directory.

### Configuration

Edit `config.ini`:

```ini
[general]
check_interval_seconds = 5

[telegram]
telegram_push = false
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
    title = "My Escape Room"

    def __init__(self):
        # Prepare the environment when the server starts
        pass

    def check_database(self):
        # Return True when the level is solved
        return row_count("answers") >= 5
```

Each check method should start with `check_` and return `True` when the level is solved.

### Actions

Actions allow you to execute backend code when a level is solved. Use the `@action_for` decorator to register actions for one or more check methods. For example, the following action will run when `check_example()` returns `True`:

```python
class Game:
    def check_example(self):
        ...

    @cscape.action_for("check_example")
    def example_action(self):
        # Runs when check_example returns True
        ...
```

You can reuse a single action for multiple checks by passing a comma-separated list of check method names:

```python
@cscape.action_for("check_example1, check_example2")
def example_action(self):
    # Runs when either check_example1 or check_example2 returns True
    ...
```

When an action should be for a part of a parallel check (see next section), use this syntax:

```python
@cscape.action_for("check_parallel/b")
def example_action(self):
    # Runs when part b of check_parallel is solved (this is when check_parallel returns 'b')
    ...
```

Use actions for side effects like sending notifications, updating databases, controlling external devices, or triggering physical effects in your escape room (e.g., turning on the light via remote control).

### Parallel Checks with Vertical Slides

You can create parallel challenges using reveal.js's vertical slides. When a horizontal slide contains multiple vertical child slides, each with its own `data-cscape-check`, all checks are evaluated simultaneously. As each check passes, its corresponding vertical slide is displayed. When all checks in the group are solved, the presentation advances to the next horizontal slide.

```html
<section data-cscape-check="check_files">
    <!-- This is a vertical slide group -->
    <section data-cscape-check-part="file1"
             data-background-video="videos/challenge1.mp4"
             data-background-size="contain"
             data-autoplay></section>
    
    <section data-cscape-check-part="file2"
             data-background-video="videos/challenge2.mp4"
             data-background-size="contain"
             data-autoplay></section>
    
    <section data-cscape-check-part="file3"
             data-background-video="videos/challenge3.mp4"
             data-background-size="contain"
             data-autoplay></section>
</section>

<!-- This slide plays automatically when all parallel challenges are solved -->
<!-- Note: NO data-cscape-check attribute -->
<section data-background-video="videos/congratulations.mp4"
         data-background-size="contain"
         data-autoplay></section>
```

In the Python code, check methods for parallel checks have an additional parameter `parts`, a list of parts (in this example: `['file1', 'file2', 'file3']`) which are not solved yet.

```python
def check_files(self, parts):
    return None   # or one element of parts that was solved
```

Instead of returning True or False, parallel checks return the name of the part when it was solved. When none of the parts were solved, it returns None.

In this example:
- The check (`check_files`) needs to checks all remaining parts simultaneously
- As a part check passes, its video plays automatically
- When all parts are completed, the presentation moves to the next main slide
- This allows teams to work on different challenges in parallel

**Important**: The slide that follows a vertical slide group should **not** have a `data-cscape-check` attribute. This ensures it plays automatically once all parallel challenges are solved, rather than waiting for an additional check to pass.

The system polls the check method every 5 seconds and displays solved slides as they complete.

## Running

For convenience, you can use the provided `run.sh` script to start the escape room:

```bash
./run.sh
```

This script starts the backend and opens Firefox with autoplay enabled. When you close Firefox (e.g., by pressing Ctrl+W), the Python backend server will automatically terminate as well.

## Manual Startup

```bash
python game.py
```

The `game.py` script instantiates the `Game` class and passes it to `cscape.run()`, which starts the Flask server on port 5000. 

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

Alternatively, you can use the provided `run.sh` script, which starts Firefox in kiosk mode with autoplay enabled (see above).

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R`, `Enter` | Replay the current slide's background video |
| `S` | Stop the current video (pause and reset) |
| `P` | Toggle play/pause |
| `Ctrl+W` | Close the browser window |
| `←` | Navigate to previous slide |
| `→` | Navigate to next slide |


## Project Structure

| File | Purpose |
|------|---------|
| `index.example.html` | Template for `index.html` |
| `index.html` | Presentation with all slides/levels |
| `cscape.py` | Flask backend that runs checks and sends Telegram notifications |
| `game.py` | Your game logic — `Game` class with `__init__` and `check_*` methods; calls `cscape.run()` |
| `game.example.py` | Template for `game.py` |
| `config.ini` | Configuration (Telegram credentials and more) |
| `config.example.ini` | Template for `config.ini` |
| `revealjs-cscape.js` | reveal.js plugin that polls the backend and controls slide progression |
| `reveal.js/` | Vendored reveal.js framework |
| `videos/` | Video files referenced by slides |

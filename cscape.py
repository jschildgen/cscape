import configparser
import logging

import requests
from flask import Flask, jsonify, abort, send_from_directory, request
from flask_cors import CORS


import webbrowser

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")

config = configparser.ConfigParser()
config.read("config.ini")

app = Flask(__name__)
CORS(app)

game_instance = None

solved_levels = set()

# Action registry to map check functions to their action functions
_action_registry = {}

def action_for(check_function_name):
    """Decorator to register an action function for one or more check functions.
    `check_function_name` can be a single name or a comma-separated list.
    """
    names = [n.strip() for n in str(check_function_name).split(",") if n.strip()]

    def decorator(action_function):
        for name in names:
            _action_registry[name] = action_function
            logging.debug(f"Registered action for {name}: {action_function.__name__}")
        return action_function

    return decorator

@app.route("/check/<check>")
def check(check):
    fn = getattr(game_instance, check, None)
    if not callable(fn):
        logging.warning("Unknown check: %s", check)
        return abort(404)
    
    parts_param = request.args.get('parts')
    if parts_param:
        parts = parts_param.split('|')
        result = fn(parts)
        if result == None: 
            result = False
    else:
        result = fn()

    logging.debug("Check %s: solved=%s", check, result)
    if result != False:
        solved_task = check+"/"+result if isinstance(result, str) else check

        solved_levels.add(solved_task)
        pushmsg(f"{game_instance.title} - Level {len(solved_levels)} solved: {solved_task}")

        # Check if an action is registered for this check
        action_fn = _action_registry.get(solved_task)
        if action_fn:
            logging.debug(f"Calling action for {solved_task}")
            try:
                action_fn(game_instance)
            except Exception as e:
                logging.error("Error in action for check %s: %s", solved_task, e)

    return jsonify(solved=result)


@app.route("/start")
def start():
    pushmsg("Escape room started: " + game_instance.title)
    return jsonify(ok=True, 
                   title=game_instance.title, 
                   check_interval_seconds=config["general"].getint("check_interval_seconds", 5))

# Serve static files
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

def pushmsg(message):
    if not config.getboolean("telegram", "telegram_push"):
        return
    token = config["telegram"]["token"]
    chat_id = config["telegram"]["chat_id"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message}
    requests.post(url, json=payload)

def run(game, open_browser=False, threaded=False):
    global game_instance
    game_instance = game
    url = "http://127.0.0.1:5000"
    
    if open_browser:
        webbrowser.open(url)

    app.run(host="0.0.0.0", port=5000, threaded=threaded)

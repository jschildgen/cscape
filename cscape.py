import configparser
import logging
import importlib
import requests
import socket
import datetime
import uuid
from flask import Flask, jsonify, abort, send_from_directory, request
from flask_cors import CORS
import webbrowser

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

config = configparser.ConfigParser()
config.read("config.ini")

GAME_MODULE_NAME = config.get('general', 'game_module')
game_package_path = f"./{GAME_MODULE_NAME}"

app = Flask(__name__)
CORS(app)

game_instance = None

solved_levels = set()

# Action registry to map check functions to their action functions
_action_registry = {}


class GameDataStore:
    def __init__(self):
        self._store = {}

    def get(self, key, default=None):
        return self._store.get(key, default)

    def store(self, key, value, source=None, push=False):
        self._store[key] = value
        message = f"{key}={value}" + ("" if source is None else " (via "+source+")")
        logging.info(message)
        if push:
            pushmsg(message)

    def clear(self):
        self._store = {}

    def __contains__(self, key):
        return key in self._store

    def __getitem__(self, key):
        return self._store[key]

    def __setitem__(self, key, value):
        self._store[key] = value

    def __delitem__(self, key):
        del self._store[key]

    def __iter__(self):
        return iter(self._store)

    def __len__(self):
        return len(self._store)

    def items(self):
        return self._store.items()

    def keys(self):
        return self._store.keys()

    def values(self):
        return self._store.values()

    def update(self, other=None, **kwargs):
        if other is not None:
            if hasattr(other, 'items'):
                for key, value in other.items():
                    self._store[key] = value
            else:
                for key, value in other:
                    self._store[key] = value
        for key, value in kwargs.items():
            self._store[key] = value


game_data_store = GameDataStore()


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
    param_value = request.args.get('param')
    
    if parts_param:
        parts = parts_param.split('|')
        if param_value:
            result = fn(parts, param=param_value)
        else:
            result = fn(parts)
        if result == None: 
            result = False
    else:
        if param_value:
            result = fn(param=param_value)
        else:
            result = fn()

    if param_value:
        logging.debug("Check %s: param=%s solved=%s", check, param_value, result)
    else:
        logging.debug("Check %s: solved=%s", check, result)

    if result != False:
        solved_task = check+"/"+result if isinstance(result, str) else check

        solved_levels.add(solved_task)
        game_data_store.store("cscape-current-level", len(solved_levels))
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

def __get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()

    return ip

@app.route("/start")
def start():
    global game_data_store
    pushmsg("Escape room started: " + game_instance.title)

    game_data_store.clear()
    game_data_store.store("cscape-ip", __get_local_ip())
    game_data_store.store("cscape-title", game_instance.title)
    game_data_store.store("cscape-session-id", uuid.uuid4().hex)
    game_data_store.store("cscape-start-timestamp", datetime.datetime.now().isoformat()) 
    game_data_store.store("cscape-current-level", 0)

    return jsonify(ok=True, 
                   title=game_instance.title, 
                   check_interval_seconds=config["general"].getint("check_interval_seconds", 5))

@app.route("/game_data_store/<path:key>", methods=["GET"])
def get_game_data_store_key(key):
    if key in game_data_store:
        return jsonify(game_data_store[key])
    return jsonify({"error": "Key not found"}), 404

@app.route("/game_data_store", methods=["GET"])
def get_game_data_store():
    return jsonify(dict(game_data_store.items()))


@app.route("/game_data_store", methods=["POST"])
def set_game_data_store():
    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify(error="Request body must be a JSON object with key-value pairs"), 400

    for key, value in data.items():
        game_data_store.store(key, value, source="endpoint")

    return jsonify(ok=True, stored_data=data)

# Serve common JS assets from /js/ directory
@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory('./js', path)

# Serve game-specific files
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(game_package_path, path)

@app.route('/')
def index():
    return send_from_directory(game_package_path, 'index.html')

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

# Start the game
if __name__ == "__main__":
    Game = importlib.import_module(GAME_MODULE_NAME).Game
    run(Game(game_data_store))
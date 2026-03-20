import configparser
import logging

import requests
from flask import Flask, jsonify, abort, send_from_directory
from flask_cors import CORS

import webbrowser

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")

config = configparser.ConfigParser()
config.read("config.ini")

app = Flask(__name__)
CORS(app)

game_instance = None

@app.route("/check/<check>")
def check(check):
    fn = getattr(game_instance, check, None)
    if not callable(fn):
        logging.warning("Unknown check: %s", check)
        return abort(404)
    result = fn()
    logging.debug("Check %s: solved=%s", check, result)
    if result:
        pushmsg(f"Level solved: {check} # {game_instance.title}")
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

def run(game, open_browser=False):
    global game_instance
    game_instance = game
    url = "http://127.0.0.1:5000"
    
    if open_browser:
        webbrowser.open(url)

    app.run(host="0.0.0.0", port=5000)

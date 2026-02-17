import configparser
import logging

import requests
from flask import Flask, jsonify, abort
from flask_cors import CORS

from game import Game

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")

config = configparser.ConfigParser()
config.read("config.ini")




app = Flask(__name__)
CORS(app)




@app.route("/check/<check>")
def check(check):
    fn = getattr(game, check, None)
    if not callable(fn):
        logging.warning("Unknown check: %s", check)
        return abort(404)
    result = fn()
    logging.debug("Check %s: solved=%s", check, result)
    if result:
        pushmsg(f"Level solved: {check} # {config['general']['title']}")
    return jsonify(solved=result)


@app.route("/")
def index():
    return jsonify(ok=True, title=config["general"]["title"])

def pushmsg(message):
    token = config["telegram"]["token"]
    chat_id = config["telegram"]["chat_id"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message}
    requests.post(url, json=payload)

if __name__ == "__main__":
    game = Game()
    app.run(host="0.0.0.0", port=5000)

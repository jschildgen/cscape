import logging

from flask import Flask, jsonify, abort
from flask_cors import CORS

import levels

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")




app = Flask(__name__)
CORS(app)




@app.route("/check/<check>")
def check(check):
    fn = getattr(levels, check, None)
    if not callable(fn):
        logging.warning("Unknown check: %s", check)
        return abort(404)
    result = fn()
    logging.debug("Check %s: solved=%s", check, result)
    return jsonify(solved=result)


@app.route("/")
def index():
    return jsonify(ok=True)

if __name__ == "__main__":
    levels.init()
    app.run(host="0.0.0.0", port=5000)

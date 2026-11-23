"""
Milestone 3: Flask server that connects the frontend (browser page) with the backend (backend.py).

    browser  --POST /api/analyze (JSON)-->  Flask  -->  backend.analyze()  (SymPy + SciPy)
    browser  <--------- JSON result ---------------------------------------

Run:  python app.py      then open  http://127.0.0.1:5000
"""
import os
import threading
import webbrowser
from flask import Flask, jsonify, request, send_from_directory
from backend import analyze, AnalysisError
from multivar import analyze2

import threading
from functools import lru_cache

_gate = threading.BoundedSemaphore(int(os.environ.get("OA_GATE", "12")))   # limit on simultaneous analyses (12 = effectively unlimited; measured: a smaller queue did not help)


@lru_cache(maxsize=256)
def _cached(kind, f, g, lo, hi, ends):
    with _gate:
        return analyze(f, lo, hi, ends) if kind == "1" else analyze2(f, g, lo, hi)


app = Flask(__name__, static_folder="static", static_url_path="/static")


@app.route("/")
def home():
    return send_from_directory("static", "index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True})


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    data = request.get_json(silent=True) or {}
    try:
        result = _cached("1", str(data.get("function", "")), "", str(data.get("lo")), str(data.get("hi")), bool(data.get("include_endpoints", True)))
    except AnalysisError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:          # anything unexpected
        return jsonify({"error": "Unexpected problem: %s" % err}), 500
    return jsonify(result)


@app.route("/api/multivar", methods=["POST"])
def api_multivar():
    d = request.get_json(silent=True) or {}
    try:
        return jsonify(_cached("2", str(d.get("function", "")), str(d.get("constraint", "")), str(d.get("lo")), str(d.get("hi")), True))
    except AnalysisError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        return jsonify({"error": "Unexpected problem: %s" % err}), 500


@app.route("/<path:name>")
def assets(name):          # lets index.html use relative links (style.css, app.js)
    return send_from_directory("static", name)


if __name__ == "__main__":
    threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False)

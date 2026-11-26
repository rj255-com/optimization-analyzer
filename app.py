"""Optimization Analyzer Flask application.

Preserves the existing x and (x,y) APIs and adds a three-variable x,y,z API.
Run locally with: python app.py
"""
import os
import threading
import webbrowser
from functools import lru_cache

from flask import Flask, jsonify, request, send_from_directory

from backend import analyze, AnalysisError
from multivar import analyze2
from multivar3 import analyze3, MultiVar3Error

_gate = threading.BoundedSemaphore(int(os.environ.get("OA_GATE", "12")))
app = Flask(__name__, static_folder="static", static_url_path="/static")


@lru_cache(maxsize=256)
def _cached(kind, f, g, lo, hi, ends):
    with _gate:
        if kind == "1":
            return analyze(f, lo, hi, ends)
        return analyze2(f, g, lo, hi)


@app.route("/")
def home():
    return send_from_directory(os.path.join(app.root_path, "static"), "index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True})


@app.route("/sample_dataset.csv")
def sample_dataset():
    return send_from_directory(app.root_path, "sample_dataset.csv", mimetype="text/csv")


@app.route("/test_summary.json")
def test_summary():
    return send_from_directory(app.root_path, "test_summary.json", mimetype="application/json")


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    data = request.get_json(silent=True) or {}
    try:
        result = _cached(
            "1", str(data.get("function", "")), "",
            str(data.get("lo")), str(data.get("hi")),
            bool(data.get("include_endpoints", True)),
        )
        return jsonify(result)
    except AnalysisError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.exception("Single-variable analysis failed")
        return jsonify({"error": "Unexpected problem: %s" % err}), 500


@app.route("/api/multivar", methods=["POST"])
def api_multivar():
    data = request.get_json(silent=True) or {}
    try:
        result = _cached(
            "2", str(data.get("function", "")),
            str(data.get("constraint", "")),
            str(data.get("lo")), str(data.get("hi")), True,
        )
        return jsonify(result)
    except AnalysisError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.exception("Two-variable analysis failed")
        return jsonify({"error": "Unexpected problem: %s" % err}), 500


@app.route("/api/multivar3", methods=["POST"])
def api_multivar3():
    data = request.get_json(silent=True) or {}
    try:
        result = analyze3(
            str(data.get("function", "")),
            data.get("lo", -3),
            data.get("hi", 3),
            data.get("grid_size", 23),
        )
        return jsonify(result)
    except MultiVar3Error as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.exception("Three-variable analysis failed")
        return jsonify({"error": "Unexpected 3-variable analysis error: %s" % err}), 500


@app.route("/<path:name>")
def assets(name):
    # Keep the project's original relative static asset URLs working.
    return send_from_directory(os.path.join(app.root_path, "static"), name)


if __name__ == "__main__":
    if os.environ.get("OA_NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)

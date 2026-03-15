from flask import Flask, render_template, request, jsonify, send_file
import os, io, json, sys
import pandas as pd
from werkzeug.utils import secure_filename

# ── Always run from the directory where app.py lives ──────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)

from detection.graph_analysis import analyze_transactions

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, "templates"),
            static_folder=os.path.join(BASE_DIR, "static"))

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB
os.makedirs(os.path.join(BASE_DIR, "uploads"), exist_ok=True)

REQUIRED = ["transaction_id", "sender_id", "receiver_id", "amount", "timestamp"]

def err(msg, code=400, **kw):
    return jsonify({"status": "error", "message": msg, **kw}), code

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.post("/analyze")
def analyze():
    if "file" not in request.files:
        return err("No file uploaded.")
    f = request.files["file"]
    if not f or not secure_filename(f.filename).lower().endswith(".csv"):
        return err("Please upload a valid .csv file.")
    try:
        df = pd.read_csv(f)
    except Exception as e:
        return err(f"Cannot parse CSV: {e}")
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        return err("Missing columns.", missing=missing, required=REQUIRED)
    df = df[REQUIRED]
    try:
        result = analyze_transactions(df, max_runtime_seconds=30.0)
    except ValueError as e:
        return err(str(e))
    except Exception as e:
        return err(f"Internal error: {e}", code=500)
    return jsonify({"status": "ok", "data": result})

@app.post("/download")
def download():
    data = request.get_json(silent=True)
    if not data:
        return err("No data provided.")
    out = io.BytesIO(json.dumps(data, indent=2).encode())
    out.seek(0)
    return send_file(out, mimetype="application/json",
                     as_attachment=True, download_name="fraud_report.json")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
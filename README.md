# 🏆 RIFT 2026 — Graph-Based Money Muling Detection Engine

> **Financial Graph Intelligence System** · RIFT 2026 Hackathon · Graph Theory / Financial Crime Detection Track

A graph-theoretic fraud detection engine that identifies money muling rings, smurfing behaviour, and layered shell transaction networks from structured CSV transaction data. Built with a directed graph model and four specialized detection algorithms, all returning results in under 5 seconds for datasets up to 10,000 transactions.

---

## 🌐 Live Demo

🔗 **https://moneymulingdetectionsystem.onrender.com**

---

## 📁 Project Structure

```
rift2026/
│
├── app.py                        # Flask app — all routes
├── requirements.txt              # Python dependencies
├── .gitignore
│
├── detection/
│   ├── __init__.py
│   └── graph_analysis.py         # All detection algorithms + scoring
│
├── templates/
│   ├── index.html                # Landing page + CSV upload
│   └── dashboard.html            # Analysis dashboard + graph
│
└── static/
    ├── css/
    │   └── style.css             # Shared light theme styles
    └── js/
        ├── index.js              # Upload logic + progress animation
        └── dashboard.js          # (inline in dashboard.html)
```

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, Flask 3.1 |
| Graph Engine | NetworkX 3.6 |
| Data Processing | Pandas 3.0, NumPy 2.4 |
| Production Server | Gunicorn |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Graph Visualization | Cytoscape.js 3.28 |
| Fonts | Inter, JetBrains Mono (Google Fonts) |

---

## 🔄 System Workflow

```
User uploads CSV
      ↓
Schema Validation (Pandas)
  — checks required columns, types, amounts > 0, no self-loops
      ↓
Directed Graph Construction (NetworkX DiGraph)
  — nodes = accounts, edges = transactions (aggregated weight + count)
      ↓
Whitelist Computation
  — legitimate high-volume merchants excluded from all detectors
      ↓
┌─────────────────────────────────────────┐
│  Four Detection Algorithms (parallel)   │
│  1. Cycle Detection (SCC)               │
│  2. Smurfing (Fan-In / Fan-Out)         │
│  3. Layered Shell Networks (BFS)        │
│  4. Hub Node Analysis (percentile)      │
└─────────────────────────────────────────┘
      ↓
Suspicion Scoring Engine
  — 0–100 score per account, log-scaled activity boost
      ↓
JSON Response
  — suspicious_accounts, fraud_rings, summary, graph data
      ↓
Interactive Dashboard
  — Cytoscape.js graph, node detail panel, fraud ring table
```

---

## 🧠 Algorithm Details

### 1. Cycle Detection — Circular Fund Routing
**Algorithm:** Tarjan's SCC via `nx.strongly_connected_components()`

A Strongly Connected Component (SCC) with ≥ 3 nodes means every node can reach every other node — indicating circular money flow (e.g. A → B → C → A).

> **Why SCC instead of `simple_cycles()`?**
> `simple_cycles()` is O(2^n) and hangs permanently on dense graphs (50+ nodes, 400+ edges). SCC is O(V+E) and always finishes in milliseconds regardless of graph density.

- Minimum SCC size: **3 nodes**
- Whitelisted nodes excluded
- Score contribution: **+35**
- Complexity: **O(V + E)**

---

### 2. Smurfing Detection — Fan-In / Fan-Out
**Algorithm:** Two-pointer sliding window on sorted timestamps

- **Fan-in:** ≥ 5 unique senders → 1 receiver within 72 hours
- **Fan-out:** 1 sender → ≥ 5 unique receivers within 72 hours
- Uses vectorized NumPy timestamp arithmetic for performance
- Score contribution: **+25**
- Complexity: **O(T log T)**

---

### 3. Layered Shell Networks
**Algorithm:** BFS from high-activity source nodes through shell accounts

Shell accounts are defined as accounts with ≤ 3 total transactions. Chains of 3+ hops through shell intermediaries simulate how funds are obfuscated before reaching the final destination. Capped at 100 rings to prevent memory explosion.

- Minimum chain length: **3 hops**
- Shell account max transactions: **3**
- Score contribution: **+20**
- Complexity: **O(V + E)**

---

### 4. Hub Node Analysis
**Algorithm:** 95th percentile degree threshold

Accounts with combined in+out degree at or above the 95th percentile across the entire graph are flagged as potential laundering hubs. Legitimate high-volume merchants are automatically whitelisted before this check runs.

- Percentile threshold: **95th**
- Score contribution: **+20**
- Complexity: **O(V)**

---

## 📊 Suspicion Score Methodology

Each account receives a score from **0 to 100**, computed as:

```
score = pattern_contributions + activity_boost
activity_boost = log(degree + 1) × 2 + log(total_flow / 1000 + 1)
final_score = min(100, score)
```

| Pattern | Contribution |
|---|---|
| Fraud Ring Membership (Cycle) | +35 |
| Smurfing (Fan-In or Fan-Out) | +25 |
| Layering Chain | +20 |
| High-Degree Hub | +20 |
| Activity Boost | log-scaled |

**Risk Tiers:**

| Score | Tier |
|---|---|
| 75 – 100 | 🔴 High Risk |
| 40 – 74  | 🟡 Medium Risk |
| 0 – 39   | 🟢 Low Risk |

Suspicion threshold for flagging: **≥ 40**

---

## 🛡️ False Positive Control

Legitimate high-volume accounts (payroll processors, merchants) are automatically whitelisted and excluded from **all** detection algorithms if they meet both conditions:

- Total degree (in + out edges) ≥ **200**
- Unique partner ratio ≥ **60%** (unique counterparties / total edges)

This prevents high-volume but legitimate accounts from triggering hub or smurfing detectors.

---

## 📥 CSV Input Format

Your CSV must contain exactly these columns (order does not matter):

| Column | Type | Example |
|---|---|---|
| `transaction_id` | String | `TXN_001` |
| `sender_id` | String | `ACC_00123` |
| `receiver_id` | String | `ACC_00456` |
| `amount` | Float (> 0) | `1500.00` |
| `timestamp` | DateTime | `2024-01-15 14:30:00` |

**Timestamp format:** `YYYY-MM-DD HH:MM:SS`

The engine automatically:
- Drops duplicate `transaction_id` rows
- Removes rows with invalid or negative amounts
- Removes self-loop transactions (sender = receiver)
- Coerces all account IDs to strings

---

## 📤 JSON Output Format

```json
{
  "suspicious_accounts": [
    {
      "account_id": "ACC_00123",
      "suspicion_score": 87.5,
      "detected_patterns": ["cycle_scc_3", "high_degree_hub"],
      "ring_id": "RING_001"
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "member_accounts": ["ACC_00123", "ACC_00456", "ACC_00789"],
      "pattern_type": "cycle",
      "risk_score": 95.3
    }
  ],
  "summary": {
    "total_accounts_analyzed": 500,
    "total_transactions": 3200,
    "suspicious_accounts_flagged": 15,
    "fraud_rings_detected": 4,
    "cycle_rings": 2,
    "smurfing_rings": 1,
    "layering_rings": 1,
    "hub_nodes": 3,
    "whitelisted_nodes": 2,
    "processing_time_seconds": 0.48
  }
}
```

---

## ⚡ Performance

| Dataset Size | Processing Time |
|---|---|
| 500 transactions | < 0.3s |
| 2,000 transactions | < 0.7s |
| 5,000 transactions | < 2.5s |
| 10,000 transactions | < 5s |

All within the RIFT requirement of ≤ 30 seconds.

**Key optimizations:**
- Graph construction uses vectorized `groupby` instead of row iteration
- Smurfing detection uses a two-pointer sliding window with NumPy int64 timestamps
- Flow computation uses vectorized `groupby sum` (was `iterrows` — 20× faster)
- SCC replaces `simple_cycles()` — avoids O(2^n) exponential blowup on dense graphs

---

## 🚀 Installation & Setup

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/rift2026.git
cd rift2026
```

**2. Create and activate virtual environment**
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Run locally**
```bash
python app.py
```
Open: [http://127.0.0.1:5000](http://127.0.0.1:5000)

**5. Deploy to Render (production)**

Start command:
```bash
gunicorn app:app
```

---

## 🔌 API Reference

### `POST /analyze`
Upload a CSV file for analysis.

- **Content-Type:** `multipart/form-data`
- **Field:** `file` (CSV file)
- **Returns:** JSON with `suspicious_accounts`, `fraud_rings`, `summary`, `graph`

### `POST /download`
Download a JSON report file.

- **Content-Type:** `application/json`
- **Body:** Analysis result object
- **Returns:** `fraud_report.json` file download

---

## ⚠️ Known Limitations

- Rule-based detection only — no ML classifier
- Dense graphs with > 20,000 transactions may increase memory usage
- Temporal window is fixed at 72 hours (not configurable at runtime)
- Graph visualization caps at 700 nodes and 2,000 edges for browser performance
- Does not support streaming or real-time transaction data
- Layering detection capped at 100 rings to prevent BFS explosion on highly connected graphs

---

## 👥 Team

| Role | Name |
|---|---|
| Team Leader | Fahad Afzal Hussain |
| Member | Aryan Gambheer |
| Member | Saurabh Yadav |
| Member | Aditya Ranjan |

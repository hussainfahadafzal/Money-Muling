<<<<<<< HEAD
"""
RIFT 2026 — Money Muling Detection Engine

KEY FIX: Replaced nx.simple_cycles() with Strongly Connected Components (SCC).
simple_cycles() is O(2^n) on dense graphs — hangs for minutes on 50+ nodes.
SCC is O(V+E) and always finishes in milliseconds.
"""

import time, math, warnings
from collections import defaultdict, deque
from typing import Any

import numpy as np
import pandas as pd
import networkx as nx

warnings.filterwarnings("ignore")

FAN_IN_THRESHOLD      = 5
FAN_OUT_THRESHOLD     = 5
TEMPORAL_WINDOW_HOURS = 72
MIN_SCC_SIZE          = 3
SHELL_MIN_HOPS        = 3
SHELL_MAX_TX          = 3
HUB_PERCENTILE        = 95
SUSPICION_THRESHOLD   = 40
LEGIT_VOLUME          = 200
LEGIT_DIVERSITY       = 0.6


def _parse_timestamps(df):
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"])
    if df.empty:
        raise ValueError("No timestamps could be parsed. Use YYYY-MM-DD HH:MM:SS format.")
    return df


def _validate(df):
    df = df.copy()
    df.drop_duplicates(subset="transaction_id", inplace=True)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df[(df["amount"].notna()) & (df["amount"] > 0)].copy()
    df = df[df["sender_id"].astype(str) != df["receiver_id"].astype(str)].copy()
    if df.empty:
        raise ValueError("No valid transactions after cleaning.")
    return df


def _is_legitimate(G, node):
    total = G.in_degree(node) + G.out_degree(node)
    if total < LEGIT_VOLUME:
        return False
    unique = len(set(G.predecessors(node)) | set(G.successors(node)))
    return (unique / total) >= LEGIT_DIVERSITY


def build_graph(df):
    G = nx.DiGraph()
    agg = defaultdict(lambda: {"weight": 0.0, "count": 0})
    for _, row in df.iterrows():
        key = (str(row["sender_id"]), str(row["receiver_id"]))
        agg[key]["weight"] += float(row["amount"])
        agg[key]["count"]  += 1
    for (src, dst), d in agg.items():
        G.add_edge(src, dst, weight=round(d["weight"], 2), tx_count=d["count"])
    return G


def detect_cycles_scc(G, whitelist):
    """
    SCC-based cycle detection — O(V+E), never hangs.
    An SCC with >=3 nodes means circular money flow exists inside it.
    """
    rings = []
    for i, scc in enumerate(nx.strongly_connected_components(G)):
        if len(scc) < MIN_SCC_SIZE:
            continue
        members = list(scc)
        if all(m in whitelist for m in members):
            continue
        rings.append({
            "ring_id": f"RING_{i+1:03d}",
            "pattern_type": "cycle",
            "members": members,
            "scc_size": len(members),
        })
    return rings


def detect_smurfing(df, whitelist):
    rings = []
    counter = [0]
    window = pd.Timedelta(hours=TEMPORAL_WINDOW_HOURS)

    def make_ring(pattern, hub, members):
        counter[0] += 1
        return {
            "ring_id": f"SMURF_{counter[0]:03d}",
            "pattern_type": pattern,
            "members": list(set(members + [hub])),
            "hub": hub,
        }

    for receiver, grp in df.groupby("receiver_id"):
        if receiver in whitelist:
            continue
        grp = grp.sort_values("timestamp")
        senders, t0 = set(), None
        for _, row in grp.iterrows():
            ts = row["timestamp"]
            if t0 is None: t0 = ts
            if ts - t0 <= window:
                senders.add(str(row["sender_id"]))
            else:
                if len(senders) >= FAN_IN_THRESHOLD:
                    rings.append(make_ring("fan_in", receiver, list(senders)))
                senders, t0 = {str(row["sender_id"])}, ts
        if len(senders) >= FAN_IN_THRESHOLD:
            rings.append(make_ring("fan_in", receiver, list(senders)))

    for sender, grp in df.groupby("sender_id"):
        if sender in whitelist:
            continue
        grp = grp.sort_values("timestamp")
        receivers, t0 = set(), None
        for _, row in grp.iterrows():
            ts = row["timestamp"]
            if t0 is None: t0 = ts
            if ts - t0 <= window:
                receivers.add(str(row["receiver_id"]))
            else:
                if len(receivers) >= FAN_OUT_THRESHOLD:
                    rings.append(make_ring("fan_out", sender, list(receivers)))
                receivers, t0 = {str(row["receiver_id"])}, ts
        if len(receivers) >= FAN_OUT_THRESHOLD:
            rings.append(make_ring("fan_out", sender, list(receivers)))

    return rings


def detect_layering(G, df, whitelist):
    tx_count = defaultdict(int)
    for _, row in df.iterrows():
        tx_count[str(row["sender_id"])]   += 1
        tx_count[str(row["receiver_id"])] += 1

    shell = {n for n in G.nodes() if tx_count.get(n, 0) <= SHELL_MAX_TX and n not in whitelist}
    rings, seen = [], set()
    sources = [n for n in G.nodes() if tx_count.get(n, 0) > SHELL_MAX_TX and n not in whitelist]

    for src in sources:
        if len(rings) >= 100: break
        queue = deque([(src, [src])])
        while queue and len(rings) < 100:
            node, path = queue.popleft()
            if len(path) > SHELL_MIN_HOPS + 2: continue
            for nb in G.successors(node):
                if nb in path: continue
                new_path = path + [nb]
                if nb in shell:
                    if len(new_path) >= SHELL_MIN_HOPS:
                        key = tuple(new_path)
                        if key not in seen:
                            seen.add(key)
                            rings.append({
                                "ring_id": f"LAYER_{len(rings)+1:03d}",
                                "pattern_type": "layering",
                                "members": new_path,
                                "chain_length": len(new_path),
                            })
                    queue.append((nb, new_path))
    return rings


def detect_hubs(G, whitelist):
    if G.number_of_nodes() < 5: return []
    degrees = {n: G.in_degree(n) + G.out_degree(n) for n in G.nodes()}
    threshold = float(np.percentile(list(degrees.values()), HUB_PERCENTILE))
    return [n for n, d in degrees.items() if d >= threshold and n not in whitelist]


def compute_scores(G, df, cycle_rings, smurf_rings, layer_rings, hub_nodes):
    scores = defaultdict(lambda: {"score": 0.0, "patterns": set(), "ring_ids": set()})

    for ring in cycle_rings:
        for m in ring["members"]:
            scores[m]["score"] += 35
            scores[m]["patterns"].add(f"cycle_scc_{ring['scc_size']}")
            scores[m]["ring_ids"].add(ring["ring_id"])

    for ring in smurf_rings:
        for m in ring["members"]:
            scores[m]["score"] += 25
            scores[m]["patterns"].add(ring["pattern_type"])
            scores[m]["ring_ids"].add(ring["ring_id"])

    for ring in layer_rings:
        for m in ring["members"]:
            scores[m]["score"] += 20
            scores[m]["patterns"].add("layering")
            scores[m]["ring_ids"].add(ring["ring_id"])

    for node in hub_nodes:
        scores[node]["score"] += 20
        scores[node]["patterns"].add("high_degree_hub")

    flow = defaultdict(float)
    for _, row in df.iterrows():
        flow[str(row["sender_id"])]   += float(row["amount"])
        flow[str(row["receiver_id"])] += float(row["amount"])

    for node in scores:
        deg = G.in_degree(node) + G.out_degree(node)
        boost = math.log1p(deg) * 2 + math.log1p(flow.get(node, 0) / 1000)
        scores[node]["score"] = min(100.0, round(scores[node]["score"] + boost, 2))
        scores[node]["patterns"] = sorted(scores[node]["patterns"])
        scores[node]["ring_ids"] = sorted(scores[node]["ring_ids"])

    return dict(scores)


def analyze_transactions(df: pd.DataFrame, max_runtime_seconds: float = 30.0) -> dict[str, Any]:
    t0 = time.time()

    df = _parse_timestamps(df)
    df = _validate(df)
    G  = build_graph(df)

    whitelist = {n for n in G.nodes() if _is_legitimate(G, n)}

    cycle_rings = detect_cycles_scc(G, whitelist)
    smurf_rings = detect_smurfing(df, whitelist)
    layer_rings = detect_layering(G, df, whitelist)
    hub_nodes   = detect_hubs(G, whitelist)

    scores = compute_scores(G, df, cycle_rings, smurf_rings, layer_rings, hub_nodes)

    suspicious_accounts = sorted(
        [
            {
                "account_id":        acct,
                "suspicion_score":   data["score"],
                "detected_patterns": data["patterns"],
                "ring_id":           data["ring_ids"][0] if data["ring_ids"] else "NONE",
            }
            for acct, data in scores.items()
            if data["score"] >= SUSPICION_THRESHOLD
        ],
        key=lambda x: x["suspicion_score"],
        reverse=True,
    )

    all_rings = cycle_rings + smurf_rings + layer_rings
    fraud_rings = []
    for ring in all_rings:
        ms = [scores.get(m, {}).get("score", 0) for m in ring["members"]]
        risk = round(min(100.0, float(np.mean(ms)) + float(np.std(ms))), 2) if ms else 0.0
        fraud_rings.append({
            "ring_id":         ring["ring_id"],
            "member_accounts": ring["members"],
            "pattern_type":    ring["pattern_type"],
            "risk_score":      risk,
        })
    fraud_rings.sort(key=lambda r: r["risk_score"], reverse=True)

    suspicious_ids  = {a["account_id"] for a in suspicious_accounts}
    ring_member_ids = {m for r in fraud_rings for m in r["member_accounts"]}

    nodes = [
        {
            "id":         n,
            "score":      round(scores.get(n, {}).get("score", 0), 2),
            "suspicious": n in suspicious_ids,
            "in_ring":    n in ring_member_ids,
            "in_degree":  G.in_degree(n),
            "out_degree": G.out_degree(n),
            "patterns":   scores.get(n, {}).get("patterns", []),
        }
        for n in G.nodes()
    ]

    edges = [
        {"source": src, "target": dst,
         "weight": d.get("weight", 0), "tx_count": d.get("tx_count", 1)}
        for src, dst, d in G.edges(data=True)
    ]

    return {
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings":         fraud_rings,
        "summary": {
            "total_accounts_analyzed":     G.number_of_nodes(),
            "total_transactions":          len(df),
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected":        len(fraud_rings),
            "cycle_rings":                 len(cycle_rings),
            "smurfing_rings":              len(smurf_rings),
            "layering_rings":              len(layer_rings),
            "hub_nodes":                   len(hub_nodes),
            "whitelisted_nodes":           len(whitelist),
            "processing_time_seconds":     round(time.time() - t0, 3),
        },
        "graph": {"nodes": nodes, "edges": edges},
=======
"""
RIFT 2026 — Money Muling Detection Engine

KEY FIX: Replaced nx.simple_cycles() with Strongly Connected Components (SCC).
simple_cycles() is O(2^n) on dense graphs — hangs for minutes on 50+ nodes.
SCC is O(V+E) and always finishes in milliseconds.
"""

import time, math, warnings
from collections import defaultdict, deque
from typing import Any

import numpy as np
import pandas as pd
import networkx as nx

warnings.filterwarnings("ignore")

FAN_IN_THRESHOLD      = 5
FAN_OUT_THRESHOLD     = 5
TEMPORAL_WINDOW_HOURS = 72
MIN_SCC_SIZE          = 3
SHELL_MIN_HOPS        = 3
SHELL_MAX_TX          = 3
HUB_PERCENTILE        = 95
SUSPICION_THRESHOLD   = 40
LEGIT_VOLUME          = 200
LEGIT_DIVERSITY       = 0.6


def _parse_timestamps(df):
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"])
    if df.empty:
        raise ValueError("No timestamps could be parsed. Use YYYY-MM-DD HH:MM:SS format.")
    return df


def _validate(df):
    df = df.copy()
    df.drop_duplicates(subset="transaction_id", inplace=True)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df[(df["amount"].notna()) & (df["amount"] > 0)].copy()
    df = df[df["sender_id"].astype(str) != df["receiver_id"].astype(str)].copy()
    if df.empty:
        raise ValueError("No valid transactions after cleaning.")
    return df


def _is_legitimate(G, node):
    total = G.in_degree(node) + G.out_degree(node)
    if total < LEGIT_VOLUME:
        return False
    unique = len(set(G.predecessors(node)) | set(G.successors(node)))
    return (unique / total) >= LEGIT_DIVERSITY


def build_graph(df):
    G = nx.DiGraph()
    agg = defaultdict(lambda: {"weight": 0.0, "count": 0})
    for _, row in df.iterrows():
        key = (str(row["sender_id"]), str(row["receiver_id"]))
        agg[key]["weight"] += float(row["amount"])
        agg[key]["count"]  += 1
    for (src, dst), d in agg.items():
        G.add_edge(src, dst, weight=round(d["weight"], 2), tx_count=d["count"])
    return G


def detect_cycles_scc(G, whitelist):
    """
    SCC-based cycle detection — O(V+E), never hangs.
    An SCC with >=3 nodes means circular money flow exists inside it.
    """
    rings = []
    for i, scc in enumerate(nx.strongly_connected_components(G)):
        if len(scc) < MIN_SCC_SIZE:
            continue
        members = list(scc)
        if all(m in whitelist for m in members):
            continue
        rings.append({
            "ring_id": f"RING_{i+1:03d}",
            "pattern_type": "cycle",
            "members": members,
            "scc_size": len(members),
        })
    return rings


def detect_smurfing(df, whitelist):
    rings = []
    counter = [0]
    window = pd.Timedelta(hours=TEMPORAL_WINDOW_HOURS)

    def make_ring(pattern, hub, members):
        counter[0] += 1
        return {
            "ring_id": f"SMURF_{counter[0]:03d}",
            "pattern_type": pattern,
            "members": list(set(members + [hub])),
            "hub": hub,
        }

    for receiver, grp in df.groupby("receiver_id"):
        if receiver in whitelist:
            continue
        grp = grp.sort_values("timestamp")
        senders, t0 = set(), None
        for _, row in grp.iterrows():
            ts = row["timestamp"]
            if t0 is None: t0 = ts
            if ts - t0 <= window:
                senders.add(str(row["sender_id"]))
            else:
                if len(senders) >= FAN_IN_THRESHOLD:
                    rings.append(make_ring("fan_in", receiver, list(senders)))
                senders, t0 = {str(row["sender_id"])}, ts
        if len(senders) >= FAN_IN_THRESHOLD:
            rings.append(make_ring("fan_in", receiver, list(senders)))

    for sender, grp in df.groupby("sender_id"):
        if sender in whitelist:
            continue
        grp = grp.sort_values("timestamp")
        receivers, t0 = set(), None
        for _, row in grp.iterrows():
            ts = row["timestamp"]
            if t0 is None: t0 = ts
            if ts - t0 <= window:
                receivers.add(str(row["receiver_id"]))
            else:
                if len(receivers) >= FAN_OUT_THRESHOLD:
                    rings.append(make_ring("fan_out", sender, list(receivers)))
                receivers, t0 = {str(row["receiver_id"])}, ts
        if len(receivers) >= FAN_OUT_THRESHOLD:
            rings.append(make_ring("fan_out", sender, list(receivers)))

    return rings


def detect_layering(G, df, whitelist):
    tx_count = defaultdict(int)
    for _, row in df.iterrows():
        tx_count[str(row["sender_id"])]   += 1
        tx_count[str(row["receiver_id"])] += 1

    shell = {n for n in G.nodes() if tx_count.get(n, 0) <= SHELL_MAX_TX and n not in whitelist}
    rings, seen = [], set()
    sources = [n for n in G.nodes() if tx_count.get(n, 0) > SHELL_MAX_TX and n not in whitelist]

    for src in sources:
        if len(rings) >= 100: break
        queue = deque([(src, [src])])
        while queue and len(rings) < 100:
            node, path = queue.popleft()
            if len(path) > SHELL_MIN_HOPS + 2: continue
            for nb in G.successors(node):
                if nb in path: continue
                new_path = path + [nb]
                if nb in shell:
                    if len(new_path) >= SHELL_MIN_HOPS:
                        key = tuple(new_path)
                        if key not in seen:
                            seen.add(key)
                            rings.append({
                                "ring_id": f"LAYER_{len(rings)+1:03d}",
                                "pattern_type": "layering",
                                "members": new_path,
                                "chain_length": len(new_path),
                            })
                    queue.append((nb, new_path))
    return rings


def detect_hubs(G, whitelist):
    if G.number_of_nodes() < 5: return []
    degrees = {n: G.in_degree(n) + G.out_degree(n) for n in G.nodes()}
    threshold = float(np.percentile(list(degrees.values()), HUB_PERCENTILE))
    return [n for n, d in degrees.items() if d >= threshold and n not in whitelist]


def compute_scores(G, df, cycle_rings, smurf_rings, layer_rings, hub_nodes):
    scores = defaultdict(lambda: {"score": 0.0, "patterns": set(), "ring_ids": set()})

    for ring in cycle_rings:
        for m in ring["members"]:
            scores[m]["score"] += 35
            scores[m]["patterns"].add(f"cycle_scc_{ring['scc_size']}")
            scores[m]["ring_ids"].add(ring["ring_id"])

    for ring in smurf_rings:
        for m in ring["members"]:
            scores[m]["score"] += 25
            scores[m]["patterns"].add(ring["pattern_type"])
            scores[m]["ring_ids"].add(ring["ring_id"])

    for ring in layer_rings:
        for m in ring["members"]:
            scores[m]["score"] += 20
            scores[m]["patterns"].add("layering")
            scores[m]["ring_ids"].add(ring["ring_id"])

    for node in hub_nodes:
        scores[node]["score"] += 20
        scores[node]["patterns"].add("high_degree_hub")

    flow = defaultdict(float)
    for _, row in df.iterrows():
        flow[str(row["sender_id"])]   += float(row["amount"])
        flow[str(row["receiver_id"])] += float(row["amount"])

    for node in scores:
        deg = G.in_degree(node) + G.out_degree(node)
        boost = math.log1p(deg) * 2 + math.log1p(flow.get(node, 0) / 1000)
        scores[node]["score"] = min(100.0, round(scores[node]["score"] + boost, 2))
        scores[node]["patterns"] = sorted(scores[node]["patterns"])
        scores[node]["ring_ids"] = sorted(scores[node]["ring_ids"])

    return dict(scores)


def analyze_transactions(df: pd.DataFrame, max_runtime_seconds: float = 30.0) -> dict[str, Any]:
    t0 = time.time()

    df = _parse_timestamps(df)
    df = _validate(df)
    G  = build_graph(df)

    whitelist = {n for n in G.nodes() if _is_legitimate(G, n)}

    cycle_rings = detect_cycles_scc(G, whitelist)
    smurf_rings = detect_smurfing(df, whitelist)
    layer_rings = detect_layering(G, df, whitelist)
    hub_nodes   = detect_hubs(G, whitelist)

    scores = compute_scores(G, df, cycle_rings, smurf_rings, layer_rings, hub_nodes)

    suspicious_accounts = sorted(
        [
            {
                "account_id":        acct,
                "suspicion_score":   data["score"],
                "detected_patterns": data["patterns"],
                "ring_id":           data["ring_ids"][0] if data["ring_ids"] else "NONE",
            }
            for acct, data in scores.items()
            if data["score"] >= SUSPICION_THRESHOLD
        ],
        key=lambda x: x["suspicion_score"],
        reverse=True,
    )

    all_rings = cycle_rings + smurf_rings + layer_rings
    fraud_rings = []
    for ring in all_rings:
        ms = [scores.get(m, {}).get("score", 0) for m in ring["members"]]
        risk = round(min(100.0, float(np.mean(ms)) + float(np.std(ms))), 2) if ms else 0.0
        fraud_rings.append({
            "ring_id":         ring["ring_id"],
            "member_accounts": ring["members"],
            "pattern_type":    ring["pattern_type"],
            "risk_score":      risk,
        })
    fraud_rings.sort(key=lambda r: r["risk_score"], reverse=True)

    suspicious_ids  = {a["account_id"] for a in suspicious_accounts}
    ring_member_ids = {m for r in fraud_rings for m in r["member_accounts"]}

    nodes = [
        {
            "id":         n,
            "score":      round(scores.get(n, {}).get("score", 0), 2),
            "suspicious": n in suspicious_ids,
            "in_ring":    n in ring_member_ids,
            "in_degree":  G.in_degree(n),
            "out_degree": G.out_degree(n),
            "patterns":   scores.get(n, {}).get("patterns", []),
        }
        for n in G.nodes()
    ]

    edges = [
        {"source": src, "target": dst,
         "weight": d.get("weight", 0), "tx_count": d.get("tx_count", 1)}
        for src, dst, d in G.edges(data=True)
    ]

    return {
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings":         fraud_rings,
        "summary": {
            "total_accounts_analyzed":     G.number_of_nodes(),
            "total_transactions":          len(df),
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected":        len(fraud_rings),
            "cycle_rings":                 len(cycle_rings),
            "smurfing_rings":              len(smurf_rings),
            "layering_rings":              len(layer_rings),
            "hub_nodes":                   len(hub_nodes),
            "whitelisted_nodes":           len(whitelist),
            "processing_time_seconds":     round(time.time() - t0, 3),
        },
        "graph": {"nodes": nodes, "edges": edges},
>>>>>>> c67093b3709cfa654f81c6a0261652a27a512fe4
    }
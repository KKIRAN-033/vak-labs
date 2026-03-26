from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from collections import Counter, defaultdict

import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ─── Models ───────────────────────────────────────────────────────────────────

class DatasetInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    dataset_type: str  # CDR, IPDR, TOWER
    record_count: int
    columns: List[str]
    uploaded_at: str

class ChatQuery(BaseModel):
    message: str
    dataset_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    data: Optional[Any] = None
    query_type: str


# ─── Dataset Type Detection ───────────────────────────────────────────────────

def detect_dataset_type(columns: List[str]) -> str:
    cols_lower = [c.lower().strip() for c in columns]
    # Tower Dump: tower/cell/location columns
    tower_keywords = ['tower', 'cell_id', 'cellid', 'cell_tower', 'lat', 'latitude', 'longitude', 'lng', 'location', 'lac', 'sector']
    tower_score = sum(1 for kw in tower_keywords if any(kw in c for c in cols_lower))
    # IPDR: IP-related columns
    ipdr_keywords = ['ip', 'ip_address', 'source_ip', 'dest_ip', 'destination_ip', 'src_ip', 'dst_ip', 'port', 'protocol', 'bytes', 'url', 'domain', 'nat_ip']
    ipdr_score = sum(1 for kw in ipdr_keywords if any(kw in c for c in cols_lower))
    # CDR: caller/receiver/phone columns
    cdr_keywords = ['caller', 'receiver', 'calling', 'called', 'phone', 'msisdn', 'a_party', 'b_party', 'duration', 'call_type', 'imei', 'imsi']
    cdr_score = sum(1 for kw in cdr_keywords if any(kw in c for c in cols_lower))

    scores = {'CDR': cdr_score, 'IPDR': ipdr_score, 'TOWER': tower_score}
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return 'CDR'  # default
    return best


# ─── Data Normalization ───────────────────────────────────────────────────────

def normalize_records(df: pd.DataFrame, dataset_type: str) -> List[Dict]:
    cols_lower = {c.lower().strip(): c for c in df.columns}
    records = []

    for _, row in df.iterrows():
        rec = {}
        if dataset_type == 'CDR':
            rec['source'] = str(row.get(cols_lower.get('caller', cols_lower.get('calling', cols_lower.get('a_party', cols_lower.get('msisdn', '')))), ''))
            rec['target'] = str(row.get(cols_lower.get('receiver', cols_lower.get('called', cols_lower.get('b_party', ''))), ''))
            ts_col = cols_lower.get('timestamp', cols_lower.get('datetime', cols_lower.get('date', cols_lower.get('call_time', cols_lower.get('start_time', '')))))
            rec['timestamp'] = str(row.get(ts_col, '')) if ts_col else ''
            rec['type'] = 'CDR'
            rec['duration'] = str(row.get(cols_lower.get('duration', cols_lower.get('call_duration', '')), ''))
            rec['cell_id'] = str(row.get(cols_lower.get('cell_id', cols_lower.get('tower_id', cols_lower.get('cell_tower', ''))), ''))

        elif dataset_type == 'IPDR':
            rec['source'] = str(row.get(cols_lower.get('source_ip', cols_lower.get('src_ip', cols_lower.get('ip_address', cols_lower.get('ip', '')))), ''))
            rec['target'] = str(row.get(cols_lower.get('dest_ip', cols_lower.get('destination_ip', cols_lower.get('dst_ip', cols_lower.get('url', cols_lower.get('domain', ''))))), ''))
            ts_col = cols_lower.get('timestamp', cols_lower.get('datetime', cols_lower.get('date', cols_lower.get('start_time', ''))))
            rec['timestamp'] = str(row.get(ts_col, '')) if ts_col else ''
            rec['type'] = 'IPDR'
            rec['bytes'] = str(row.get(cols_lower.get('bytes', cols_lower.get('data_volume', '')), ''))
            rec['port'] = str(row.get(cols_lower.get('port', cols_lower.get('dest_port', '')), ''))

        elif dataset_type == 'TOWER':
            rec['source'] = str(row.get(cols_lower.get('msisdn', cols_lower.get('phone', cols_lower.get('imsi', cols_lower.get('subscriber', '')))), ''))
            rec['target'] = str(row.get(cols_lower.get('cell_id', cols_lower.get('tower_id', cols_lower.get('cell_tower', cols_lower.get('tower', '')))), ''))
            ts_col = cols_lower.get('timestamp', cols_lower.get('datetime', cols_lower.get('date', cols_lower.get('start_time', ''))))
            rec['timestamp'] = str(row.get(ts_col, '')) if ts_col else ''
            rec['type'] = 'TOWER'
            rec['latitude'] = str(row.get(cols_lower.get('latitude', cols_lower.get('lat', '')), ''))
            rec['longitude'] = str(row.get(cols_lower.get('longitude', cols_lower.get('lng', cols_lower.get('lon', ''))), ''))
            rec['location'] = str(row.get(cols_lower.get('location', cols_lower.get('area', '')), ''))

        records.append(rec)
    return records


# ─── Analysis Engine ──────────────────────────────────────────────────────────

def analyze_dataset(records: List[Dict], dataset_type: str) -> Dict:
    if not records:
        return {"error": "No records to analyze"}

    analysis = {}

    # Top communication pairs
    pairs = Counter()
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            pair = tuple(sorted([s, t]))
            pairs[pair] += 1
    top_pairs = [{"pair": list(p), "count": c} for p, c in pairs.most_common(10)]
    analysis['top_pairs'] = top_pairs

    # Most active entities
    entities = Counter()
    for r in records:
        if r.get('source'):
            entities[r['source']] += 1
        if r.get('target'):
            entities[r['target']] += 1
    top_entities = [{"entity": e, "count": c} for e, c in entities.most_common(10)]
    analysis['top_entities'] = top_entities

    # Night activity (10PM - 6AM)
    night_records = []
    for r in records:
        ts = r.get('timestamp', '')
        if ts:
            try:
                dt = pd.to_datetime(ts)
                if dt.hour >= 22 or dt.hour < 6:
                    night_records.append(r)
            except Exception:
                pass
    analysis['night_activity'] = {
        "count": len(night_records),
        "total": len(records),
        "percentage": round(len(night_records) / len(records) * 100, 1) if records else 0,
        "records": night_records[:20]
    }

    # Unique connections per entity
    connections = defaultdict(set)
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            connections[s].add(t)
            connections[t].add(s)
    unique_conn = [{"entity": e, "unique_contacts": len(conns)} for e, conns in sorted(connections.items(), key=lambda x: -len(x[1]))[:10]]
    analysis['unique_connections'] = unique_conn

    # Movement patterns (tower dump specific)
    if dataset_type == 'TOWER':
        movement = defaultdict(list)
        for r in records:
            src = r.get('source', '')
            tower = r.get('target', '')
            if src and tower:
                movement[src].append({"tower": tower, "timestamp": r.get('timestamp', ''), "lat": r.get('latitude', ''), "lng": r.get('longitude', '')})
        top_movers = sorted(movement.items(), key=lambda x: len(set(m['tower'] for m in x[1])), reverse=True)[:10]
        analysis['movement_patterns'] = [
            {"entity": e, "towers_visited": len(set(m['tower'] for m in moves)), "movements": moves[:10]}
            for e, moves in top_movers
        ]
    else:
        analysis['movement_patterns'] = []

    # Timeline distribution
    hour_dist = Counter()
    for r in records:
        ts = r.get('timestamp', '')
        if ts:
            try:
                dt = pd.to_datetime(ts)
                hour_dist[dt.hour] += 1
            except Exception:
                pass
    analysis['timeline'] = [{"hour": h, "count": hour_dist.get(h, 0)} for h in range(24)]

    return analysis


# ─── Suspicious Detection ─────────────────────────────────────────────────────

def detect_suspicious(records: List[Dict], all_datasets: List[Dict] = None) -> List[Dict]:
    suspects = []

    # One entity connecting to many entities (hub detection)
    connections = defaultdict(set)
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            connections[s].add(t)
            connections[t].add(s)

    avg_connections = sum(len(v) for v in connections.values()) / max(len(connections), 1)
    threshold = max(avg_connections * 2, 5)
    for entity, conns in connections.items():
        if len(conns) >= threshold:
            suspects.append({
                "entity": entity,
                "reason": f"Hub node: Connected to {len(conns)} unique entities (threshold: {int(threshold)})",
                "severity": "HIGH",
                "metric": len(conns)
            })

    # High frequency in short time
    entity_timestamps = defaultdict(list)
    for r in records:
        src = r.get('source', '')
        ts = r.get('timestamp', '')
        if src and ts:
            try:
                dt = pd.to_datetime(ts)
                entity_timestamps[src].append(dt)
            except Exception:
                pass

    for entity, timestamps in entity_timestamps.items():
        if len(timestamps) < 3:
            continue
        timestamps.sort()
        # Check for bursts: more than 10 activities in 1 hour
        for i in range(len(timestamps)):
            window_end = timestamps[i] + pd.Timedelta(hours=1)
            count = sum(1 for t in timestamps[i:] if t <= window_end)
            if count >= 10:
                already = any(s['entity'] == entity and 'High frequency' in s['reason'] for s in suspects)
                if not already:
                    suspects.append({
                        "entity": entity,
                        "reason": f"High frequency: {count} activities within 1 hour window",
                        "severity": "MEDIUM",
                        "metric": count
                    })
                break

    # Repeated connections (same pair multiple times)
    pair_counts = Counter()
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            pair = tuple(sorted([s, t]))
            pair_counts[pair] += 1
    avg_pair = sum(pair_counts.values()) / max(len(pair_counts), 1)
    pair_threshold = max(avg_pair * 3, 5)
    for pair, count in pair_counts.most_common(5):
        if count >= pair_threshold:
            suspects.append({
                "entity": f"{pair[0]} <-> {pair[1]}",
                "reason": f"Repeated connection: {count} times (threshold: {int(pair_threshold)})",
                "severity": "MEDIUM",
                "metric": count
            })

    # Cross-dataset linking
    if all_datasets and len(all_datasets) > 1:
        cross_entities = defaultdict(set)
        for ds in all_datasets:
            ds_type = ds.get('dataset_type', '')
            for r in ds.get('normalized_records', []):
                if r.get('source'):
                    cross_entities[r['source']].add(ds_type)
                if r.get('target'):
                    cross_entities[r['target']].add(ds_type)
        for entity, types in cross_entities.items():
            if len(types) > 1:
                already = any(s['entity'] == entity and 'Cross-dataset' in s['reason'] for s in suspects)
                if not already:
                    suspects.append({
                        "entity": entity,
                        "reason": f"Cross-dataset presence: Found in {', '.join(sorted(types))}",
                        "severity": "HIGH",
                        "metric": len(types)
                    })

    # Sort by severity
    severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    suspects.sort(key=lambda x: severity_order.get(x['severity'], 3))
    return suspects[:20]


# ─── Chatbot Engine ───────────────────────────────────────────────────────────

def chatbot_query(message: str, analysis: Dict, suspicious: List[Dict], dataset_type: str) -> Dict:
    msg = message.lower().strip()

    # Top contacts / pairs
    if any(kw in msg for kw in ['top contact', 'top pair', 'most communicated', 'frequent pair', 'top communication']):
        pairs = analysis.get('top_pairs', [])
        if pairs:
            lines = [f"{i+1}. {p['pair'][0]} <-> {p['pair'][1]}: {p['count']} times" for i, p in enumerate(pairs[:5])]
            return {"response": "Top communication pairs:\n" + "\n".join(lines), "data": pairs[:5], "query_type": "top_pairs"}
        return {"response": "No communication pair data available.", "data": None, "query_type": "top_pairs"}

    # Suspicious numbers
    if any(kw in msg for kw in ['suspicious', 'suspect', 'anomal', 'flag', 'alert']):
        if suspicious:
            lines = [f"- {s['entity']}: {s['reason']} [{s['severity']}]" for s in suspicious[:5]]
            return {"response": "Suspicious entities detected:\n" + "\n".join(lines), "data": suspicious[:5], "query_type": "suspicious"}
        return {"response": "No suspicious activity detected in the current dataset.", "data": None, "query_type": "suspicious"}

    # Night activity
    if any(kw in msg for kw in ['night', 'midnight', 'late', '10pm', '10 pm', 'nocturnal']):
        night = analysis.get('night_activity', {})
        if night.get('count', 0) > 0:
            return {
                "response": f"Night activity (10PM-6AM): {night['count']} records out of {night['total']} ({night['percentage']}%)",
                "data": night,
                "query_type": "night_activity"
            }
        return {"response": "No night activity detected (10PM-6AM).", "data": None, "query_type": "night_activity"}

    # Active entities
    if any(kw in msg for kw in ['active', 'most active', 'busiest', 'top entit', 'top number', 'top phone', 'top ip']):
        entities = analysis.get('top_entities', [])
        if entities:
            lines = [f"{i+1}. {e['entity']}: {e['count']} activities" for i, e in enumerate(entities[:5])]
            return {"response": "Most active entities:\n" + "\n".join(lines), "data": entities[:5], "query_type": "top_entities"}
        return {"response": "No entity data available.", "data": None, "query_type": "top_entities"}

    # Unique connections
    if any(kw in msg for kw in ['unique', 'connection', 'link', 'network']):
        conns = analysis.get('unique_connections', [])
        if conns:
            lines = [f"{i+1}. {c['entity']}: {c['unique_contacts']} unique contacts" for i, c in enumerate(conns[:5])]
            return {"response": "Entities with most unique connections:\n" + "\n".join(lines), "data": conns[:5], "query_type": "unique_connections"}
        return {"response": "No connection data available.", "data": None, "query_type": "unique_connections"}

    # Movement
    if any(kw in msg for kw in ['movement', 'tower', 'travel', 'location', 'move']):
        movements = analysis.get('movement_patterns', [])
        if movements:
            lines = [f"{i+1}. {m['entity']}: visited {m['towers_visited']} towers" for i, m in enumerate(movements[:5])]
            return {"response": "Movement patterns:\n" + "\n".join(lines), "data": movements[:5], "query_type": "movement_patterns"}
        return {"response": "No movement data available. Upload a Tower Dump dataset for movement analysis.", "data": None, "query_type": "movement_patterns"}

    # Timeline
    if any(kw in msg for kw in ['timeline', 'time', 'hour', 'when', 'peak']):
        timeline = analysis.get('timeline', [])
        if timeline:
            peak = max(timeline, key=lambda x: x['count'])
            return {
                "response": f"Peak activity hour: {peak['hour']}:00 with {peak['count']} records.",
                "data": timeline,
                "query_type": "timeline"
            }
        return {"response": "No timeline data available.", "data": None, "query_type": "timeline"}

    # Summary
    if any(kw in msg for kw in ['summary', 'overview', 'report', 'brief', 'stats']):
        entities = analysis.get('top_entities', [])
        night = analysis.get('night_activity', {})
        pairs = analysis.get('top_pairs', [])
        resp = f"Dataset Summary ({dataset_type}):\n"
        resp += f"- Top entity: {entities[0]['entity']} ({entities[0]['count']} activities)\n" if entities else ""
        resp += f"- Top pair: {pairs[0]['pair'][0]} <-> {pairs[0]['pair'][1]} ({pairs[0]['count']} calls)\n" if pairs else ""
        resp += f"- Night activity: {night.get('count', 0)} records ({night.get('percentage', 0)}%)\n"
        resp += f"- Suspicious entities: {len(suspicious)}"
        return {"response": resp, "data": None, "query_type": "summary"}

    # Help
    if any(kw in msg for kw in ['help', 'what can', 'command', 'how']):
        return {
            "response": "Available queries:\n- \"top contacts\" - Most frequent communication pairs\n- \"suspicious numbers\" - Flagged suspicious entities\n- \"night activity\" - Activity between 10PM-6AM\n- \"most active\" - Busiest entities\n- \"unique connections\" - Entities with most contacts\n- \"movement patterns\" - Tower-based movement (Tower Dump only)\n- \"timeline\" - Activity distribution by hour\n- \"summary\" - Overall dataset summary",
            "data": None,
            "query_type": "help"
        }

    # Default
    return {
        "response": f"I couldn't understand \"{message}\". Try asking about: top contacts, suspicious numbers, night activity, most active, unique connections, movement patterns, timeline, or summary. Type \"help\" for all options.",
        "data": None,
        "query_type": "unknown"
    }


# ─── Sample Data Generation ──────────────────────────────────────────────────

def generate_sample_cdr() -> pd.DataFrame:
    import random
    random.seed(42)
    phones = [f"+91{random.randint(7000000000, 9999999999)}" for _ in range(15)]
    rows = []
    for i in range(200):
        caller = random.choice(phones)
        receiver = random.choice([p for p in phones if p != caller])
        hour = random.choices(range(24), weights=[1,1,1,1,1,2,3,5,6,7,8,8,7,6,6,5,5,4,3,3,2,2,2,1])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        duration = random.randint(5, 3600)
        cell = f"CELL_{random.randint(1,20):03d}"
        call_type = random.choice(['VOICE', 'SMS', 'VOICE', 'VOICE'])
        rows.append({"caller": caller, "receiver": receiver, "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "duration": duration, "call_type": call_type, "cell_id": cell, "imei": f"{random.randint(100000000000000, 999999999999999)}"})
    # Add suspicious patterns: one number calling many
    hub_phone = phones[0]
    for target in phones[1:12]:
        for _ in range(random.randint(3, 8)):
            hour = random.choice([22, 23, 0, 1, 2, 3])
            dt = datetime(2024, 2, random.randint(1,28), hour, random.randint(0,59))
            rows.append({"caller": hub_phone, "receiver": target, "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "duration": random.randint(10, 120), "call_type": "VOICE", "cell_id": f"CELL_{random.randint(1,5):03d}", "imei": f"{random.randint(100000000000000, 999999999999999)}"})
    return pd.DataFrame(rows)


def generate_sample_ipdr() -> pd.DataFrame:
    import random
    random.seed(43)
    ips = [f"192.168.{random.randint(1,10)}.{random.randint(1,254)}" for _ in range(12)]
    dest_ips = [f"10.0.{random.randint(1,5)}.{random.randint(1,254)}" for _ in range(8)]
    rows = []
    for i in range(180):
        src = random.choice(ips)
        dst = random.choice(dest_ips)
        hour = random.choices(range(24), weights=[2,2,1,1,1,2,3,5,7,8,8,7,6,5,5,4,4,3,3,3,3,3,2,2])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        bytes_val = random.randint(100, 50000000)
        port = random.choice([80, 443, 8080, 3306, 22, 53, 8443])
        protocol = random.choice(['TCP', 'UDP', 'TCP', 'TCP'])
        rows.append({"source_ip": src, "dest_ip": dst, "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "bytes": bytes_val, "dest_port": port, "protocol": protocol, "nat_ip": f"203.0.{random.randint(1,5)}.{random.randint(1,254)}"})
    # Suspicious: one IP with very high data transfer
    sus_ip = ips[0]
    for _ in range(30):
        dt = datetime(2024, 2, 15, random.choice([1,2,3,23,0]), random.randint(0,59))
        rows.append({"source_ip": sus_ip, "dest_ip": random.choice(dest_ips), "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "bytes": random.randint(10000000, 90000000), "dest_port": 443, "protocol": "TCP", "nat_ip": f"203.0.1.{random.randint(1,5)}"})
    return pd.DataFrame(rows)


def generate_sample_tower() -> pd.DataFrame:
    import random
    random.seed(44)
    phones = [f"+91{random.randint(7000000000, 9999999999)}" for _ in range(10)]
    towers = [{"id": f"TWR_{i:03d}", "lat": 28.5 + random.uniform(-0.2, 0.2), "lng": 77.2 + random.uniform(-0.2, 0.2), "location": random.choice(["Connaught Place", "Karol Bagh", "Saket", "Dwarka", "Noida Sec 18", "Gurugram", "Rohini", "Lajpat Nagar"])} for i in range(12)]
    rows = []
    for i in range(200):
        phone = random.choice(phones)
        tower = random.choice(towers)
        hour = random.choices(range(24), weights=[1,1,1,1,1,2,3,5,6,7,8,8,7,6,6,5,5,4,3,3,2,2,2,1])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        rows.append({"msisdn": phone, "cell_id": tower['id'], "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "latitude": round(tower['lat'], 6), "longitude": round(tower['lng'], 6), "location": tower['location'], "imsi": f"{random.randint(404000000000000, 404999999999999)}"})
    # Suspicious: rapid tower changes (same person, many towers in short time)
    rapid_phone = phones[0]
    base_dt = datetime(2024, 2, 10, 14, 0)
    for i in range(15):
        tower = towers[i % len(towers)]
        dt = base_dt + pd.Timedelta(minutes=i*4)
        rows.append({"msisdn": rapid_phone, "cell_id": tower['id'], "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"), "latitude": round(tower['lat'], 6), "longitude": round(tower['lng'], 6), "location": tower['location'], "imsi": f"404{random.randint(100000000000, 999999999999)}"})
    return pd.DataFrame(rows)


# ─── API Routes ───────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Telecom Forensic AI API"}


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx) are supported")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File contains no data")

    columns = list(df.columns)
    dataset_type = detect_dataset_type(columns)
    normalized = normalize_records(df, dataset_type)

    dataset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Store raw preview (first 50 rows)
    raw_preview = df.head(50).fillna('').to_dict(orient='records')
    # Convert all values to strings for MongoDB
    raw_preview = [{k: str(v) for k, v in row.items()} for row in raw_preview]

    doc = {
        "id": dataset_id,
        "filename": file.filename,
        "dataset_type": dataset_type,
        "record_count": len(df),
        "columns": columns,
        "uploaded_at": now,
        "raw_preview": raw_preview,
        "normalized_records": normalized
    }

    await db.datasets.insert_one(doc)

    return {
        "id": dataset_id,
        "filename": file.filename,
        "dataset_type": dataset_type,
        "record_count": len(df),
        "columns": columns,
        "uploaded_at": now,
        "preview": raw_preview[:10]
    }


@api_router.get("/datasets")
async def list_datasets():
    datasets = await db.datasets.find({}, {"_id": 0, "normalized_records": 0, "raw_preview": 0}).to_list(100)
    return datasets


@api_router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    doc = await db.datasets.find_one({"id": dataset_id}, {"_id": 0, "normalized_records": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return doc


@api_router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    result = await db.datasets.delete_one({"id": dataset_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"message": "Dataset deleted"}


@api_router.get("/analyze/{dataset_id}")
async def analyze_single(dataset_id: str):
    doc = await db.datasets.find_one({"id": dataset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    records = doc.get('normalized_records', [])
    dataset_type = doc.get('dataset_type', 'CDR')

    analysis = analyze_dataset(records, dataset_type)
    suspicious = detect_suspicious(records)

    return {
        "dataset_id": dataset_id,
        "dataset_type": dataset_type,
        "record_count": len(records),
        "analysis": analysis,
        "suspicious": suspicious
    }


@api_router.get("/analyze")
async def analyze_all():
    all_docs = await db.datasets.find({}, {"_id": 0}).to_list(100)

    if not all_docs:
        return {"analysis": {}, "suspicious": [], "datasets": []}

    all_records = []
    combined_type = "MIXED"
    for doc in all_docs:
        recs = doc.get('normalized_records', [])
        all_records.extend(recs)

    if len(all_docs) == 1:
        combined_type = all_docs[0].get('dataset_type', 'CDR')

    analysis = analyze_dataset(all_records, combined_type)
    suspicious = detect_suspicious(all_records, all_docs)

    datasets_info = [{"id": d["id"], "filename": d["filename"], "dataset_type": d["dataset_type"], "record_count": d["record_count"]} for d in all_docs]

    return {
        "dataset_type": combined_type,
        "total_records": len(all_records),
        "analysis": analysis,
        "suspicious": suspicious,
        "datasets": datasets_info
    }


@api_router.post("/query")
async def query_chatbot(query: ChatQuery):
    if query.dataset_id:
        doc = await db.datasets.find_one({"id": query.dataset_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Dataset not found")
        records = doc.get('normalized_records', [])
        dataset_type = doc.get('dataset_type', 'CDR')
        analysis = analyze_dataset(records, dataset_type)
        suspicious = detect_suspicious(records)
    else:
        all_docs = await db.datasets.find({}, {"_id": 0}).to_list(100)
        if not all_docs:
            return {"response": "No datasets uploaded yet. Please upload a dataset first.", "data": None, "query_type": "no_data"}
        all_records = []
        combined_type = "MIXED"
        for doc in all_docs:
            all_records.extend(doc.get('normalized_records', []))
        if len(all_docs) == 1:
            combined_type = all_docs[0].get('dataset_type', 'CDR')
        analysis = analyze_dataset(all_records, combined_type)
        suspicious = detect_suspicious(all_records, all_docs)
        dataset_type = combined_type

    result = chatbot_query(query.message, analysis, suspicious, dataset_type)
    return result


@api_router.post("/generate-samples")
async def generate_samples():
    """Generate and return sample dataset files as downloadable links stored in DB."""
    samples = {
        "CDR": generate_sample_cdr(),
        "IPDR": generate_sample_ipdr(),
        "TOWER": generate_sample_tower()
    }

    results = []
    for dtype, df in samples.items():
        dataset_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        columns = list(df.columns)
        normalized = normalize_records(df, dtype)
        raw_preview = df.head(50).fillna('').to_dict(orient='records')
        raw_preview = [{k: str(v) for k, v in row.items()} for row in raw_preview]

        doc = {
            "id": dataset_id,
            "filename": f"sample_{dtype.lower()}_data.xlsx",
            "dataset_type": dtype,
            "record_count": len(df),
            "columns": columns,
            "uploaded_at": now,
            "raw_preview": raw_preview,
            "normalized_records": normalized
        }
        await db.datasets.insert_one(doc)
        results.append({
            "id": dataset_id,
            "filename": f"sample_{dtype.lower()}_data.xlsx",
            "dataset_type": dtype,
            "record_count": len(df)
        })

    return {"message": "Sample datasets generated", "datasets": results}


@api_router.post("/download-sample/{dtype}")
async def download_sample(dtype: str):
    """Generate and download a sample Excel file."""
    dtype = dtype.upper()
    generators = {"CDR": generate_sample_cdr, "IPDR": generate_sample_ipdr, "TOWER": generate_sample_tower}
    if dtype not in generators:
        raise HTTPException(status_code=400, detail="Invalid type. Use CDR, IPDR, or TOWER")

    df = generators[dtype]()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
    df.to_excel(tmp.name, index=False)
    return FileResponse(tmp.name, filename=f"sample_{dtype.lower()}_data.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ─── App Setup ────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

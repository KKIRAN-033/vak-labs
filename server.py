"from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import io
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from collections import Counter, defaultdict

import pandas as pd

# ─── Configuration ────────────────────────────────────────────────────────────
# Try loading .env if available (for local development)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / '.env')
except ImportError:
    pass

PORT = int(os.environ.get(\"PORT\", 8000))
MONGO_URL = os.environ.get(\"MONGO_URL\", \"\")
DB_NAME = os.environ.get(\"DB_NAME\", \"telecom_forensics\")
USE_MONGO = bool(MONGO_URL)

# ─── Database Setup (MongoDB or In-Memory) ────────────────────────────────────
if USE_MONGO:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    print(f\"Using MongoDB: {DB_NAME}\")
else:
    print(\"No MONGO_URL found. Using in-memory storage.\")

# In-memory storage fallback
_datasets_store: Dict[str, Dict] = {}

app = FastAPI(title=\"Telecom Forensic AI API\")
api_router = APIRouter(prefix=\"/api\")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ─── In-Memory DB Helpers ─────────────────────────────────────────────────────
async def db_insert(doc):
    if USE_MONGO:
        await db.datasets.insert_one(doc)
    else:
        _datasets_store[doc[\"id\"]] = doc

async def db_find_all(projection_exclude=None):
    if USE_MONGO:
        proj = {\"_id\": 0}
        if projection_exclude:
            for k in projection_exclude:
                proj[k] = 0
        return await db.datasets.find({}, proj).to_list(100)
    else:
        results = []
        for doc in _datasets_store.values():
            filtered = {k: v for k, v in doc.items() if k != \"_id\" and (not projection_exclude or k not in projection_exclude)}
            results.append(filtered)
        return results

async def db_find_one(dataset_id, projection_exclude=None):
    if USE_MONGO:
        proj = {\"_id\": 0}
        if projection_exclude:
            for k in projection_exclude:
                proj[k] = 0
        return await db.datasets.find_one({\"id\": dataset_id}, proj)
    else:
        doc = _datasets_store.get(dataset_id)
        if doc and projection_exclude:
            return {k: v for k, v in doc.items() if k not in projection_exclude}
        return doc

async def db_delete(dataset_id):
    if USE_MONGO:
        result = await db.datasets.delete_one({\"id\": dataset_id})
        return result.deleted_count > 0
    else:
        return _datasets_store.pop(dataset_id, None) is not None


# ─── Models ───────────────────────────────────────────────────────────────────
class ChatQuery(BaseModel):
    message: str
    dataset_id: Optional[str] = None


# ─── Dataset Type Detection ───────────────────────────────────────────────────
def detect_dataset_type(columns: List[str]) -> str:
    cols_lower = [c.lower().strip() for c in columns]
    tower_keywords = ['tower', 'cell_id', 'cellid', 'cell_tower', 'lat', 'latitude', 'longitude', 'lng', 'location', 'lac', 'sector']
    tower_score = sum(1 for kw in tower_keywords if any(kw in c for c in cols_lower))
    ipdr_keywords = ['ip', 'ip_address', 'source_ip', 'dest_ip', 'destination_ip', 'src_ip', 'dst_ip', 'port', 'protocol', 'bytes', 'url', 'domain', 'nat_ip']
    ipdr_score = sum(1 for kw in ipdr_keywords if any(kw in c for c in cols_lower))
    cdr_keywords = ['caller', 'receiver', 'calling', 'called', 'phone', 'msisdn', 'a_party', 'b_party', 'duration', 'call_type', 'imei', 'imsi']
    cdr_score = sum(1 for kw in cdr_keywords if any(kw in c for c in cols_lower))
    scores = {'CDR': cdr_score, 'IPDR': ipdr_score, 'TOWER': tower_score}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'CDR'


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
        return {\"error\": \"No records to analyze\"}
    analysis = {}

    pairs = Counter()
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            pair = tuple(sorted([s, t]))
            pairs[pair] += 1
    analysis['top_pairs'] = [{\"pair\": list(p), \"count\": c} for p, c in pairs.most_common(10)]

    entities = Counter()
    for r in records:
        if r.get('source'): entities[r['source']] += 1
        if r.get('target'): entities[r['target']] += 1
    analysis['top_entities'] = [{\"entity\": e, \"count\": c} for e, c in entities.most_common(10)]

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
        \"count\": len(night_records), \"total\": len(records),
        \"percentage\": round(len(night_records) / len(records) * 100, 1) if records else 0,
        \"records\": night_records[:20]
    }

    connections = defaultdict(set)
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            connections[s].add(t)
            connections[t].add(s)
    analysis['unique_connections'] = [{\"entity\": e, \"unique_contacts\": len(conns)} for e, conns in sorted(connections.items(), key=lambda x: -len(x[1]))[:10]]

    if dataset_type == 'TOWER':
        movement = defaultdict(list)
        for r in records:
            src, tower = r.get('source', ''), r.get('target', '')
            if src and tower:
                movement[src].append({\"tower\": tower, \"timestamp\": r.get('timestamp', ''), \"lat\": r.get('latitude', ''), \"lng\": r.get('longitude', '')})
        top_movers = sorted(movement.items(), key=lambda x: len(set(m['tower'] for m in x[1])), reverse=True)[:10]
        analysis['movement_patterns'] = [{\"entity\": e, \"towers_visited\": len(set(m['tower'] for m in moves)), \"movements\": moves[:10]} for e, moves in top_movers]
    else:
        analysis['movement_patterns'] = []

    hour_dist = Counter()
    for r in records:
        ts = r.get('timestamp', '')
        if ts:
            try:
                dt = pd.to_datetime(ts)
                hour_dist[dt.hour] += 1
            except Exception:
                pass
    analysis['timeline'] = [{\"hour\": h, \"count\": hour_dist.get(h, 0)} for h in range(24)]
    return analysis


# ─── Suspicious Detection ─────────────────────────────────────────────────────
def detect_suspicious(records: List[Dict], all_datasets: List[Dict] = None) -> List[Dict]:
    suspects = []
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
            suspects.append({\"entity\": entity, \"reason\": f\"Hub node: Connected to {len(conns)} unique entities (threshold: {int(threshold)})\", \"severity\": \"HIGH\", \"metric\": len(conns)})

    entity_timestamps = defaultdict(list)
    for r in records:
        src, ts = r.get('source', ''), r.get('timestamp', '')
        if src and ts:
            try:
                entity_timestamps[src].append(pd.to_datetime(ts))
            except Exception:
                pass
    for entity, timestamps in entity_timestamps.items():
        if len(timestamps) < 3: continue
        timestamps.sort()
        for i in range(len(timestamps)):
            window_end = timestamps[i] + pd.Timedelta(hours=1)
            count = sum(1 for t in timestamps[i:] if t <= window_end)
            if count >= 10:
                if not any(s['entity'] == entity and 'High frequency' in s['reason'] for s in suspects):
                    suspects.append({\"entity\": entity, \"reason\": f\"High frequency: {count} activities within 1 hour window\", \"severity\": \"MEDIUM\", \"metric\": count})
                break

    pair_counts = Counter()
    for r in records:
        s, t = r.get('source', ''), r.get('target', '')
        if s and t:
            pair_counts[tuple(sorted([s, t]))] += 1
    avg_pair = sum(pair_counts.values()) / max(len(pair_counts), 1)
    pair_threshold = max(avg_pair * 3, 5)
    for pair, count in pair_counts.most_common(5):
        if count >= pair_threshold:
            suspects.append({\"entity\": f\"{pair[0]} <-> {pair[1]}\", \"reason\": f\"Repeated connection: {count} times (threshold: {int(pair_threshold)})\", \"severity\": \"MEDIUM\", \"metric\": count})

    if all_datasets and len(all_datasets) > 1:
        cross_entities = defaultdict(set)
        for ds in all_datasets:
            ds_type = ds.get('dataset_type', '')
            for r in ds.get('normalized_records', []):
                if r.get('source'): cross_entities[r['source']].add(ds_type)
                if r.get('target'): cross_entities[r['target']].add(ds_type)
        for entity, types in cross_entities.items():
            if len(types) > 1 and not any(s['entity'] == entity and 'Cross-dataset' in s['reason'] for s in suspects):
                suspects.append({\"entity\": entity, \"reason\": f\"Cross-dataset presence: Found in {', '.join(sorted(types))}\", \"severity\": \"HIGH\", \"metric\": len(types)})

    severity_order = {\"HIGH\": 0, \"MEDIUM\": 1, \"LOW\": 2}
    suspects.sort(key=lambda x: severity_order.get(x['severity'], 3))
    return suspects[:20]


# ─── Chatbot Engine ───────────────────────────────────────────────────────────
def chatbot_query(message: str, analysis: Dict, suspicious: List[Dict], dataset_type: str) -> Dict:
    msg = message.lower().strip()

    if any(kw in msg for kw in ['top contact', 'top pair', 'most communicated', 'frequent pair', 'top communication']):
        pairs = analysis.get('top_pairs', [])
        if pairs:
            lines = [f\"{i+1}. {p['pair'][0]} <-> {p['pair'][1]}: {p['count']} times\" for i, p in enumerate(pairs[:5])]
            return {\"response\": \"Top communication pairs:
\" + \"
\".join(lines), \"data\": pairs[:5], \"query_type\": \"top_pairs\"}
        return {\"response\": \"No communication pair data available.\", \"data\": None, \"query_type\": \"top_pairs\"}

    if any(kw in msg for kw in ['suspicious', 'suspect', 'anomal', 'flag', 'alert']):
        if suspicious:
            lines = [f\"- {s['entity']}: {s['reason']} [{s['severity']}]\" for s in suspicious[:5]]
            return {\"response\": \"Suspicious entities detected:
\" + \"
\".join(lines), \"data\": suspicious[:5], \"query_type\": \"suspicious\"}
        return {\"response\": \"No suspicious activity detected.\", \"data\": None, \"query_type\": \"suspicious\"}

    if any(kw in msg for kw in ['night', 'midnight', 'late', '10pm', '10 pm', 'nocturnal']):
        night = analysis.get('night_activity', {})
        if night.get('count', 0) > 0:
            return {\"response\": f\"Night activity (10PM-6AM): {night['count']} records out of {night['total']} ({night['percentage']}%)\", \"data\": night, \"query_type\": \"night_activity\"}
        return {\"response\": \"No night activity detected (10PM-6AM).\", \"data\": None, \"query_type\": \"night_activity\"}

    if any(kw in msg for kw in ['active', 'most active', 'busiest', 'top entit', 'top number', 'top phone', 'top ip']):
        entities = analysis.get('top_entities', [])
        if entities:
            lines = [f\"{i+1}. {e['entity']}: {e['count']} activities\" for i, e in enumerate(entities[:5])]
            return {\"response\": \"Most active entities:
\" + \"
\".join(lines), \"data\": entities[:5], \"query_type\": \"top_entities\"}
        return {\"response\": \"No entity data available.\", \"data\": None, \"query_type\": \"top_entities\"}

    if any(kw in msg for kw in ['unique', 'connection', 'link', 'network']):
        conns = analysis.get('unique_connections', [])
        if conns:
            lines = [f\"{i+1}. {c['entity']}: {c['unique_contacts']} unique contacts\" for i, c in enumerate(conns[:5])]
            return {\"response\": \"Entities with most unique connections:
\" + \"
\".join(lines), \"data\": conns[:5], \"query_type\": \"unique_connections\"}
        return {\"response\": \"No connection data available.\", \"data\": None, \"query_type\": \"unique_connections\"}

    if any(kw in msg for kw in ['movement', 'tower', 'travel', 'location', 'move']):
        movements = analysis.get('movement_patterns', [])
        if movements:
            lines = [f\"{i+1}. {m['entity']}: visited {m['towers_visited']} towers\" for i, m in enumerate(movements[:5])]
            return {\"response\": \"Movement patterns:
\" + \"
\".join(lines), \"data\": movements[:5], \"query_type\": \"movement_patterns\"}
        return {\"response\": \"No movement data. Upload Tower Dump dataset.\", \"data\": None, \"query_type\": \"movement_patterns\"}

    if any(kw in msg for kw in ['timeline', 'time', 'hour', 'when', 'peak']):
        timeline = analysis.get('timeline', [])
        if timeline:
            peak = max(timeline, key=lambda x: x['count'])
            return {\"response\": f\"Peak activity hour: {peak['hour']}:00 with {peak['count']} records.\", \"data\": timeline, \"query_type\": \"timeline\"}
        return {\"response\": \"No timeline data available.\", \"data\": None, \"query_type\": \"timeline\"}

    if any(kw in msg for kw in ['summary', 'overview', 'report', 'brief', 'stats']):
        entities = analysis.get('top_entities', [])
        night = analysis.get('night_activity', {})
        pairs = analysis.get('top_pairs', [])
        resp = f\"Dataset Summary ({dataset_type}):
\"
        resp += f\"- Top entity: {entities[0]['entity']} ({entities[0]['count']} activities)
\" if entities else \"\"
        resp += f\"- Top pair: {pairs[0]['pair'][0]} <-> {pairs[0]['pair'][1]} ({pairs[0]['count']} calls)
\" if pairs else \"\"
        resp += f\"- Night activity: {night.get('count', 0)} records ({night.get('percentage', 0)}%)
\"
        resp += f\"- Suspicious entities: {len(suspicious)}\"
        return {\"response\": resp, \"data\": None, \"query_type\": \"summary\"}

    if any(kw in msg for kw in ['help', 'what can', 'command', 'how']):
        return {\"response\": \"Available queries:
- \\"top contacts\\" - Most frequent communication pairs
- \\"suspicious numbers\\" - Flagged suspicious entities
- \\"night activity\\" - Activity between 10PM-6AM
- \\"most active\\" - Busiest entities
- \\"unique connections\\" - Entities with most contacts
- \\"movement patterns\\" - Tower-based movement (Tower Dump only)
- \\"timeline\\" - Activity distribution by hour
- \\"summary\\" - Overall dataset summary\", \"data\": None, \"query_type\": \"help\"}

    return {\"response\": f\"I couldn't understand \\"{message}\\". Try: top contacts, suspicious numbers, night activity, most active, unique connections, movement patterns, timeline, summary. Type \\"help\\" for options.\", \"data\": None, \"query_type\": \"unknown\"}


# ─── Sample Data Generation ──────────────────────────────────────────────────
def generate_sample_cdr() -> pd.DataFrame:
    import random
    random.seed(42)
    phones = [f\"+91{random.randint(7000000000, 9999999999)}\" for _ in range(15)]
    rows = []
    for i in range(200):
        caller = random.choice(phones)
        receiver = random.choice([p for p in phones if p != caller])
        hour = random.choices(range(24), weights=[1,1,1,1,1,2,3,5,6,7,8,8,7,6,6,5,5,4,3,3,2,2,2,1])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        rows.append({\"caller\": caller, \"receiver\": receiver, \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"duration\": random.randint(5, 3600), \"call_type\": random.choice(['VOICE', 'SMS', 'VOICE', 'VOICE']), \"cell_id\": f\"CELL_{random.randint(1,20):03d}\", \"imei\": f\"{random.randint(100000000000000, 999999999999999)}\"})
    hub_phone = phones[0]
    for target in phones[1:12]:
        for _ in range(random.randint(3, 8)):
            hour = random.choice([22, 23, 0, 1, 2, 3])
            dt = datetime(2024, 2, random.randint(1,28), hour, random.randint(0,59))
            rows.append({\"caller\": hub_phone, \"receiver\": target, \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"duration\": random.randint(10, 120), \"call_type\": \"VOICE\", \"cell_id\": f\"CELL_{random.randint(1,5):03d}\", \"imei\": f\"{random.randint(100000000000000, 999999999999999)}\"})
    return pd.DataFrame(rows)

def generate_sample_ipdr() -> pd.DataFrame:
    import random
    random.seed(43)
    ips = [f\"192.168.{random.randint(1,10)}.{random.randint(1,254)}\" for _ in range(12)]
    dest_ips = [f\"10.0.{random.randint(1,5)}.{random.randint(1,254)}\" for _ in range(8)]
    rows = []
    for i in range(180):
        src, dst = random.choice(ips), random.choice(dest_ips)
        hour = random.choices(range(24), weights=[2,2,1,1,1,2,3,5,7,8,8,7,6,5,5,4,4,3,3,3,3,3,2,2])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        rows.append({\"source_ip\": src, \"dest_ip\": dst, \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"bytes\": random.randint(100, 50000000), \"dest_port\": random.choice([80, 443, 8080, 3306, 22, 53, 8443]), \"protocol\": random.choice(['TCP', 'UDP', 'TCP', 'TCP']), \"nat_ip\": f\"203.0.{random.randint(1,5)}.{random.randint(1,254)}\"})
    sus_ip = ips[0]
    for _ in range(30):
        dt = datetime(2024, 2, 15, random.choice([1,2,3,23,0]), random.randint(0,59))
        rows.append({\"source_ip\": sus_ip, \"dest_ip\": random.choice(dest_ips), \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"bytes\": random.randint(10000000, 90000000), \"dest_port\": 443, \"protocol\": \"TCP\", \"nat_ip\": f\"203.0.1.{random.randint(1,5)}\"})
    return pd.DataFrame(rows)

def generate_sample_tower() -> pd.DataFrame:
    import random
    random.seed(44)
    phones = [f\"+91{random.randint(7000000000, 9999999999)}\" for _ in range(10)]
    towers = [{\"id\": f\"TWR_{i:03d}\", \"lat\": 28.5 + random.uniform(-0.2, 0.2), \"lng\": 77.2 + random.uniform(-0.2, 0.2), \"location\": random.choice([\"Connaught Place\", \"Karol Bagh\", \"Saket\", \"Dwarka\", \"Noida Sec 18\", \"Gurugram\", \"Rohini\", \"Lajpat Nagar\"])} for i in range(12)]
    rows = []
    for i in range(200):
        phone, tower = random.choice(phones), random.choice(towers)
        hour = random.choices(range(24), weights=[1,1,1,1,1,2,3,5,6,7,8,8,7,6,6,5,5,4,3,3,2,2,2,1])[0]
        dt = datetime(2024, random.randint(1,3), random.randint(1,28), hour, random.randint(0,59), random.randint(0,59))
        rows.append({\"msisdn\": phone, \"cell_id\": tower['id'], \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"latitude\": round(tower['lat'], 6), \"longitude\": round(tower['lng'], 6), \"location\": tower['location'], \"imsi\": f\"{random.randint(404000000000000, 404999999999999)}\"})
    rapid_phone = phones[0]
    base_dt = datetime(2024, 2, 10, 14, 0)
    for i in range(15):
        tower = towers[i % len(towers)]
        dt = base_dt + pd.Timedelta(minutes=i*4)
        rows.append({\"msisdn\": rapid_phone, \"cell_id\": tower['id'], \"timestamp\": dt.strftime(\"%Y-%m-%d %H:%M:%S\"), \"latitude\": round(tower['lat'], 6), \"longitude\": round(tower['lng'], 6), \"location\": tower['location'], \"imsi\": f\"404{random.randint(100000000000, 999999999999)}\"})
    return pd.DataFrame(rows)


# ─── API Routes ───────────────────────────────────────────────────────────────
@api_router.get(\"/\")
async def root():
    return {\"message\": \"Telecom Forensic AI API\", \"status\": \"running\"}

@api_router.post(\"/upload\")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail=\"Only Excel files (.xlsx) are supported\")
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), engine=\"openpyxl\")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f\"Failed to read Excel file: {str(e)}\")
    if df.empty:
        raise HTTPException(status_code=400, detail=\"File contains no data\")

    columns = list(df.columns)
    dataset_type = detect_dataset_type(columns)
    normalized = normalize_records(df, dataset_type)
    dataset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    raw_preview = [{k: str(v) for k, v in row.items()} for row in df.head(50).fillna('').to_dict(orient='records')]

    doc = {\"id\": dataset_id, \"filename\": file.filename, \"dataset_type\": dataset_type, \"record_count\": len(df), \"columns\": columns, \"uploaded_at\": now, \"raw_preview\": raw_preview, \"normalized_records\": normalized}
    await db_insert(doc)

    return {\"id\": dataset_id, \"filename\": file.filename, \"dataset_type\": dataset_type, \"record_count\": len(df), \"columns\": columns, \"uploaded_at\": now, \"preview\": raw_preview[:10]}

@api_router.get(\"/datasets\")
async def list_datasets():
    return await db_find_all(projection_exclude=[\"normalized_records\", \"raw_preview\"])

@api_router.get(\"/datasets/{dataset_id}\")
async def get_dataset(dataset_id: str):
    doc = await db_find_one(dataset_id, projection_exclude=[\"normalized_records\"])
    if not doc:
        raise HTTPException(status_code=404, detail=\"Dataset not found\")
    return doc

@api_router.delete(\"/datasets/{dataset_id}\")
async def delete_dataset(dataset_id: str):
    if not await db_delete(dataset_id):
        raise HTTPException(status_code=404, detail=\"Dataset not found\")
    return {\"message\": \"Dataset deleted\"}

@api_router.get(\"/analyze/{dataset_id}\")
async def analyze_single(dataset_id: str):
    doc = await db_find_one(dataset_id)
    if not doc:
        raise HTTPException(status_code=404, detail=\"Dataset not found\")
    records = doc.get('normalized_records', [])
    dataset_type = doc.get('dataset_type', 'CDR')
    return {\"dataset_id\": dataset_id, \"dataset_type\": dataset_type, \"record_count\": len(records), \"analysis\": analyze_dataset(records, dataset_type), \"suspicious\": detect_suspicious(records)}

@api_router.get(\"/analyze\")
async def analyze_all():
    all_docs = await db_find_all()
    if not all_docs:
        return {\"analysis\": {}, \"suspicious\": [], \"datasets\": []}
    all_records = []
    for doc in all_docs:
        all_records.extend(doc.get('normalized_records', []))
    combined_type = all_docs[0].get('dataset_type', 'CDR') if len(all_docs) == 1 else \"MIXED\"
    datasets_info = [{\"id\": d[\"id\"], \"filename\": d[\"filename\"], \"dataset_type\": d[\"dataset_type\"], \"record_count\": d[\"record_count\"]} for d in all_docs]
    return {\"dataset_type\": combined_type, \"total_records\": len(all_records), \"analysis\": analyze_dataset(all_records, combined_type), \"suspicious\": detect_suspicious(all_records, all_docs), \"datasets\": datasets_info}

@api_router.post(\"/query\")
async def query_chatbot(query: ChatQuery):
    if query.dataset_id:
        doc = await db_find_one(query.dataset_id)
        if not doc:
            raise HTTPException(status_code=404, detail=\"Dataset not found\")
        records = doc.get('normalized_records', [])
        dataset_type = doc.get('dataset_type', 'CDR')
        return chatbot_query(query.message, analyze_dataset(records, dataset_type), detect_suspicious(records), dataset_type)
    else:
        all_docs = await db_find_all()
        if not all_docs:
            return {\"response\": \"No datasets uploaded yet. Upload a dataset first.\", \"data\": None, \"query_type\": \"no_data\"}
        all_records = []
        for doc in all_docs:
            all_records.extend(doc.get('normalized_records', []))
        combined_type = all_docs[0].get('dataset_type', 'CDR') if len(all_docs) == 1 else \"MIXED\"
        return chatbot_query(query.message, analyze_dataset(all_records, combined_type), detect_suspicious(all_records, all_docs), combined_type)

@api_router.post(\"/generate-samples\")
async def generate_samples():
    samples = {\"CDR\": generate_sample_cdr(), \"IPDR\": generate_sample_ipdr(), \"TOWER\": generate_sample_tower()}
    results = []
    for dtype, df in samples.items():
        dataset_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        columns = list(df.columns)
        raw_preview = [{k: str(v) for k, v in row.items()} for row in df.head(50).fillna('').to_dict(orient='records')]
        doc = {\"id\": dataset_id, \"filename\": f\"sample_{dtype.lower()}_data.xlsx\", \"dataset_type\": dtype, \"record_count\": len(df), \"columns\": columns, \"uploaded_at\": now, \"raw_preview\": raw_preview, \"normalized_records\": normalize_records(df, dtype)}
        await db_insert(doc)
        results.append({\"id\": dataset_id, \"filename\": f\"sample_{dtype.lower()}_data.xlsx\", \"dataset_type\": dtype, \"record_count\": len(df)})
    return {\"message\": \"Sample datasets generated\", \"datasets\": results}

@api_router.post(\"/download-sample/{dtype}\")
async def download_sample(dtype: str):
    dtype = dtype.upper()
    generators = {\"CDR\": generate_sample_cdr, \"IPDR\": generate_sample_ipdr, \"TOWER\": generate_sample_tower}
    if dtype not in generators:
        raise HTTPException(status_code=400, detail=\"Invalid type. Use CDR, IPDR, or TOWER\")
    df = generators[dtype]()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
    df.to_excel(tmp.name, index=False)
    return FileResponse(tmp.name, filename=f\"sample_{dtype.lower()}_data.xlsx\", media_type=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\")


# ─── App Setup ────────────────────────────────────────────────────────────────
app.include_router(api_router)

# Also add routes without /api prefix for standalone deployment
standalone_router = APIRouter()

@standalone_router.post(\"/upload\")
async def upload_standalone(file: UploadFile = File(...)):
    return await upload_file(file)

@standalone_router.get(\"/datasets\")
async def datasets_standalone():
    return await list_datasets()

@standalone_router.get(\"/datasets/{dataset_id}\")
async def dataset_standalone(dataset_id: str):
    return await get_dataset(dataset_id)

@standalone_router.delete(\"/datasets/{dataset_id}\")
async def delete_standalone(dataset_id: str):
    return await delete_dataset(dataset_id)

@standalone_router.get(\"/analyze/{dataset_id}\")
async def analyze_single_standalone(dataset_id: str):
    return await analyze_single(dataset_id)

@standalone_router.get(\"/analyze\")
async def analyze_standalone():
    return await analyze_all()

@standalone_router.post(\"/query\")
async def query_standalone(query: ChatQuery):
    return await query_chatbot(query)

@standalone_router.post(\"/generate-samples\")
async def samples_standalone():
    return await generate_samples()

@standalone_router.post(\"/download-sample/{dtype}\")
async def download_standalone(dtype: str):
    return await download_sample(dtype)

app.include_router(standalone_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[\"*\"],
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)

# Serve frontend static files if they exist
frontend_build = Path(__file__).parent / \"frontend\" / \"build\"
if frontend_build.exists():
    app.mount(\"/\", StaticFiles(directory=str(frontend_build), html=True), name=\"frontend\")

if USE_MONGO:
    @app.on_event(\"shutdown\")
    async def shutdown_db_client():
        client.close()

# ─── Run Server ───────────────────────────────────────────────────────────────
if __name__ == \"__main__\":
    import uvicorn
    uvicorn.run(\"server:app\", host=\"0.0.0.0\", port=PORT, reload=True)
"

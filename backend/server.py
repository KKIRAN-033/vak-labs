from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import json
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ─── WebSocket Manager ───
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for conn in list(self.active_connections):
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(conn)


manager = ConnectionManager()


# ─── Models ───
class IncidentCreate(BaseModel):
    lat: float
    lng: float
    description: str = "Election incident reported"


class IncidentStatusUpdate(BaseModel):
    incident_id: str
    status: str


# ─── Haversine ───
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ─── Seed Data ───
OFFICERS = [
    {"id": "off-001", "name": "SI Rajesh Kumar", "badge": "AP-001", "rank": "Sub Inspector",
     "lat": 14.6870, "lng": 77.6080, "status": "free"},
    {"id": "off-002", "name": "SI Suresh Reddy", "badge": "AP-002", "rank": "Sub Inspector",
     "lat": 14.6780, "lng": 77.5950, "status": "free"},
    {"id": "off-003", "name": "ASI Venkat Rao", "badge": "AP-003", "rank": "Asst Sub Inspector",
     "lat": 14.6920, "lng": 77.6120, "status": "free"},
    {"id": "off-004", "name": "CI Priya Sharma", "badge": "AP-004", "rank": "Circle Inspector",
     "lat": 14.6750, "lng": 77.5900, "status": "free"},
    {"id": "off-005", "name": "SI Kumar Naidu", "badge": "AP-005", "rank": "Sub Inspector",
     "lat": 14.6950, "lng": 77.6020, "status": "free"},
    {"id": "off-006", "name": "ASI Lakshmi Devi", "badge": "AP-006", "rank": "Asst Sub Inspector",
     "lat": 14.6700, "lng": 77.6050, "status": "free"},
    {"id": "off-007", "name": "SI Ravi Teja", "badge": "AP-007", "rank": "Sub Inspector",
     "lat": 14.6840, "lng": 77.5850, "status": "free"},
    {"id": "off-008", "name": "CI Srinivas Murthy", "badge": "AP-008", "rank": "Circle Inspector",
     "lat": 14.6900, "lng": 77.6180, "status": "free"},
    {"id": "off-009", "name": "ASI Anitha Kumari", "badge": "AP-009", "rank": "Asst Sub Inspector",
     "lat": 14.6680, "lng": 77.6120, "status": "free"},
    {"id": "off-010", "name": "SI Ramesh Babu", "badge": "AP-010", "rank": "Sub Inspector",
     "lat": 14.6980, "lng": 77.5950, "status": "free"},
    {"id": "off-011", "name": "ASI Deepika Reddy", "badge": "AP-011", "rank": "Asst Sub Inspector",
     "lat": 14.6760, "lng": 77.6150, "status": "free"},
    {"id": "off-012", "name": "SI Harish Varma", "badge": "AP-012", "rank": "Sub Inspector",
     "lat": 14.6880, "lng": 77.5920, "status": "free"},
]


@app.on_event("startup")
async def seed_data():
    count = await db.officers.count_documents({})
    if count == 0:
        await db.officers.insert_many([dict(o) for o in OFFICERS])
        logger.info("Seeded 12 officers")
    # Reset all officers to free on startup
    await db.officers.update_many({}, {"$set": {"status": "free"}})
    # Clear old incidents
    await db.incidents.delete_many({})
    logger.info("Officers reset, incidents cleared")


# ─── Routes ───
@api_router.get("/")
async def root():
    return {"message": "Smart Election Patrol API"}


@api_router.get("/personnel")
async def get_personnel():
    officers = await db.officers.find({}, {"_id": 0}).to_list(100)
    return officers


@api_router.post("/incident")
async def create_incident(data: IncidentCreate):
    officers = await db.officers.find({"status": "free"}, {"_id": 0}).to_list(100)
    if not officers:
        return {"error": "No free officers available", "success": False}

    nearest = min(officers, key=lambda o: haversine(data.lat, data.lng, o["lat"], o["lng"]))
    dist = haversine(data.lat, data.lng, nearest["lat"], nearest["lng"])

    incident_id = str(uuid.uuid4())[:8]
    incident = {
        "id": incident_id,
        "lat": data.lat,
        "lng": data.lng,
        "description": data.description,
        "status": "assigned",
        "assigned_officer_id": nearest["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.incidents.insert_one(incident)
    await db.officers.update_one({"id": nearest["id"]}, {"$set": {"status": "busy"}})

    await manager.broadcast({
        "type": "incident_assigned",
        "incident_id": incident_id,
        "officer": nearest,
        "incident_lat": data.lat,
        "incident_lng": data.lng,
    })

    return {
        "success": True,
        "id": incident_id,
        "lat": data.lat,
        "lng": data.lng,
        "description": data.description,
        "status": "assigned",
        "assigned_officer": nearest,
        "distance_km": round(dist, 3),
    }


@api_router.patch("/incident/status")
async def update_incident_status(data: IncidentStatusUpdate):
    incident = await db.incidents.find_one({"id": data.incident_id}, {"_id": 0})
    if not incident:
        return {"error": "Incident not found", "success": False}

    await db.incidents.update_one({"id": data.incident_id}, {"$set": {"status": data.status}})

    if data.status == "resolved":
        await db.officers.update_one(
            {"id": incident["assigned_officer_id"]},
            {"$set": {"status": "free"}}
        )
        await manager.broadcast({
            "type": "incident_resolved",
            "incident_id": data.incident_id,
            "officer_id": incident["assigned_officer_id"],
        })

    return {"success": True, "incident_id": data.incident_id, "status": data.status}


# ─── WebSocket ───
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "officer_position_update":
                await db.officers.update_one(
                    {"id": msg["officer_id"]},
                    {"$set": {"lat": msg["lat"], "lng": msg["lng"]}}
                )
                await manager.broadcast(msg)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# ─── Include router & middleware ───
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const API = `${BACKEND_URL}/api`;
const OFFICER_SPEED_KMH = 40;
const MAP_BOUNDS = {
  minLat: 28.604,
  maxLat: 28.626,
  minLng: 77.203,
  maxLng: 77.231,
};
const USER_LOCATION = { lat: 28.6188, lng: 77.2125 };

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function toMapPoint(lat, lng) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = 100 - ((lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
  return { x: Math.min(99, Math.max(1, x)), y: Math.min(99, Math.max(1, y)) };
}

function formatDistance(distanceKm) {
  if (distanceKm == null) return "--";
  return `${distanceKm.toFixed(2)} km`;
}

function formatEta(distanceKm) {
  if (distanceKm == null) return "--";
  const etaMinutes = (distanceKm / OFFICER_SPEED_KMH) * 60;
  return `${etaMinutes.toFixed(1)} min`;
}

function statusForDistance(distanceKm, hasIncident) {
  if (!hasIncident || distanceKm == null) return "Assigned";
  if (distanceKm <= 0.03) return "Reached";
  if (distanceKm < 0.1) return "Near";
  return "Moving";
}

function App() {
  const [dispatch, setDispatch] = useState({ incident: null, officers: [], assigned_officer_id: null });
  const [pulse, setPulse] = useState(false);
  const smoothPositionRef = useRef(null);
  const markerRef = useRef(null);
  const targetRef = useRef(null);
  const animationFrameRef = useRef(null);

  const assignedOfficer = useMemo(
    () => dispatch.officers.find((officer) => officer.id === dispatch.assigned_officer_id) || null,
    [dispatch.officers, dispatch.assigned_officer_id],
  );

  const liveDistanceKm = useMemo(() => {
    if (!dispatch.incident || !assignedOfficer) return null;
    return haversineKm(assignedOfficer.lat, assignedOfficer.lng, dispatch.incident.lat, dispatch.incident.lng);
  }, [dispatch.incident, assignedOfficer]);

  const reportIncident = useCallback(async () => {
    const hotspot = { latitude: 28.6217, longitude: 77.2189 };
    setPulse(true);
    window.setTimeout(() => setPulse(false), 400);

    const response = await fetch(`${API}/dispatch/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hotspot),
    });

    if (!response.ok) {
      console.error("Unable to assign incident");
      return;
    }

    const data = await response.json();
    setDispatch(data);
  }, []);

  useEffect(() => {
    let ws;

    const fetchInitialState = async () => {
      const response = await fetch(`${API}/dispatch/state`);
      if (!response.ok) return;
      const data = await response.json();
      setDispatch(data);
    };

    const connectSocket = () => {
      const socketUrl = `${BACKEND_URL.replace(/^http/, "ws")}/api/dispatch/ws`;
      ws = new WebSocket(socketUrl);
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setDispatch(payload);
      };
      ws.onopen = () => ws.send("sync");
      ws.onclose = () => window.setTimeout(connectSocket, 1500);
    };

    fetchInitialState();
    connectSocket();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!assignedOfficer) return;
    const incoming = { lat: assignedOfficer.lat, lng: assignedOfficer.lng };

    if (!smoothPositionRef.current) {
      smoothPositionRef.current = incoming;
      targetRef.current = incoming;
      return;
    }

    targetRef.current = incoming;
  }, [assignedOfficer]);

  useEffect(() => {
    const animate = () => {
      if (markerRef.current && smoothPositionRef.current && targetRef.current) {
        const current = smoothPositionRef.current;
        const target = targetRef.current;
        const eased = {
          lat: current.lat + (target.lat - current.lat) * 0.14,
          lng: current.lng + (target.lng - current.lng) * 0.14,
        };
        smoothPositionRef.current = eased;
        const point = toMapPoint(eased.lat, eased.lng);
        markerRef.current.style.left = `${point.x}%`;
        markerRef.current.style.top = `${point.y}%`;
      }
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const incidentPoint = dispatch.incident ? toMapPoint(dispatch.incident.lat, dispatch.incident.lng) : null;
  const userPoint = toMapPoint(USER_LOCATION.lat, USER_LOCATION.lng);
  const assignedPoint = smoothPositionRef.current
    ? toMapPoint(smoothPositionRef.current.lat, smoothPositionRef.current.lng)
    : null;

  return (
    <main className="incident-app">
      <section className="map-shell">
        <div className="map-grid" />

        {dispatch.officers
          .filter((officer) => officer.id !== dispatch.assigned_officer_id)
          .map((officer) => {
            const point = toMapPoint(officer.lat, officer.lng);
            const markerClass = officer.status === "free" ? "free" : "busy";
            return (
              <div
                key={officer.id}
                className={`static-marker ${markerClass}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                title={officer.name}
              />
            );
          })}

        {incidentPoint && (
          <>
            <div className="incident-marker" style={{ left: `${incidentPoint.x}%`, top: `${incidentPoint.y}%` }} />
            {assignedPoint && (
              <svg className="route-layer" aria-hidden>
                <line x1={`${assignedPoint.x}%`} y1={`${assignedPoint.y}%`} x2={`${incidentPoint.x}%`} y2={`${incidentPoint.y}%`} />
              </svg>
            )}
          </>
        )}

        <div className="user-marker" style={{ left: `${userPoint.x}%`, top: `${userPoint.y}%` }} title="You" />

        {assignedOfficer && <div ref={markerRef} className="officer-marker" title={assignedOfficer.name} />}

        <article className="incident-card">
          <h1>🚨 Incident Assigned</h1>
          <p><strong>Officer:</strong> {assignedOfficer?.name || "Awaiting assignment"}</p>
          <p><strong>Distance:</strong> {formatDistance(liveDistanceKm)}</p>
          <p><strong>ETA:</strong> {formatEta(liveDistanceKm)}</p>
          <p className="status-row"><strong>Status:</strong> {statusForDistance(liveDistanceKm, Boolean(dispatch.incident))}</p>
          <button className={`report-btn ${pulse ? "tap" : ""}`} onClick={reportIncident}>🚨 Report Incident</button>
          <p className="meta">🚓 {formatDistance(liveDistanceKm)} away | ETA: {formatEta(liveDistanceKm)}</p>
        </article>
      </section>
    </main>
  );
}

export default App;

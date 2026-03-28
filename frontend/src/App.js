import { useState, useEffect, useRef } from 'react';
import { Shield } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import MapView from '@/components/MapView';
import FloatingCard from '@/components/FloatingCard';
import { haversineDistance, calculateETA } from '@/utils/geo';
import 'leaflet/dist/leaflet.css';
import '@/App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function App() {
  const [officers, setOfficers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [activeIncident, setActiveIncident] = useState(null);
  const [assignedOfficer, setAssignedOfficer] = useState(null);
  const [officerPosition, setOfficerPosition] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [distance, setDistance] = useState(0);
  const [eta, setEta] = useState(0);
  const [userLocation, setUserLocation] = useState(null);

  const intervalRef = useRef(null);
  const officerPosRef = useRef(null);
  const incidentRef = useRef(null);

  useEffect(() => { officerPosRef.current = officerPosition; }, [officerPosition]);
  useEffect(() => { incidentRef.current = activeIncident; }, [activeIncident]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      (p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  useEffect(() => {
    fetchOfficers();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function fetchOfficers() {
    try { setOfficers(await (await fetch(`${API}/personnel`)).json()); }
    catch (e) { console.error('Fetch officers failed:', e); }
  }

  function handleMapClick(latlng) {
    if (phase !== 'idle' && phase !== 'selected') return;
    setSelectedLocation({ lat: latlng.lat, lng: latlng.lng });
    setPhase('selected');
  }

  async function handleReport() {
    if (!selectedLocation) return;
    setPhase('assigning');
    try {
      const res = await fetch(`${API}/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: selectedLocation.lat, lng: selectedLocation.lng }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || 'No free officers'); setPhase('selected'); return; }

      const officer = data.assigned_officer;
      setActiveIncident({ id: data.id, lat: data.lat, lng: data.lng });
      setAssignedOfficer(officer);
      setOfficerPosition({ lat: officer.lat, lng: officer.lng });
      officerPosRef.current = { lat: officer.lat, lng: officer.lng };
      incidentRef.current = { id: data.id, lat: data.lat, lng: data.lng };
      setDistance(data.distance_km);
      setEta(calculateETA(data.distance_km));
      setPhase('assigned');
      setOfficers((prev) => prev.map((o) => (o.id === officer.id ? { ...o, status: 'busy' } : o)));
      toast.success(`${officer.name} dispatched`);
    } catch (e) { console.error(e); toast.error('Failed to report'); setPhase('selected'); }
  }

  function handleAccept() {
    setPhase('enroute');
    startTracking();
  }

  /* ── Tracking: 1-second logical LERP; AnimatedMarker handles 60fps visual ── */
  function startTracking() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const pos = officerPosRef.current;
      const inc = incidentRef.current;
      if (!pos || !inc) return;

      const factor = 0.12;
      const newLat = pos.lat + (inc.lat - pos.lat) * factor;
      const newLng = pos.lng + (inc.lng - pos.lng) * factor;
      const dist = haversineDistance(newLat, newLng, inc.lat, inc.lng);
      const newPos = { lat: newLat, lng: newLng };

      officerPosRef.current = newPos;
      setOfficerPosition(newPos);
      setDistance(dist);
      setEta(calculateETA(dist));

      if (dist < 0.02) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        resolveIncident(inc.id);
      }
    }, 1000);
  }

  async function resolveIncident(incidentId) {
    try {
      await fetch(`${API}/incident/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, status: 'resolved' }),
      });
    } catch (e) { console.error(e); }
    setPhase('resolved');
    toast.success('Incident resolved — officer arrived!');
    fetchOfficers();
  }

  function handleReset() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setSelectedLocation(null);
    setActiveIncident(null);
    setAssignedOfficer(null);
    setOfficerPosition(null);
    setDistance(0);
    setEta(0);
    setPhase('idle');
    fetchOfficers();
  }

  return (
    <div className="app-container" data-testid="app-container">
      <MapView
        officers={officers}
        selectedLocation={selectedLocation}
        onMapClick={handleMapClick}
        officerPosition={officerPosition}
        activeIncident={activeIncident}
        assignedOfficer={assignedOfficer}
        tracking={phase === 'enroute'}
        userLocation={userLocation}
        phase={phase}
        distance={distance}
        eta={eta}
        onAccept={handleAccept}
      />

      <FloatingCard
        selectedLocation={selectedLocation}
        assignedOfficer={assignedOfficer}
        distance={distance}
        eta={eta}
        phase={phase}
        onReport={handleReport}
        onReset={handleReset}
      />

      <div className="top-bar" data-testid="top-bar">
        <Shield size={14} className="text-blue-500" />
        <span>Election Patrol</span>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
}

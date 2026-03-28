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

  // Geolocation - show user's real location
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => console.log('Geolocation not available'),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    fetchOfficers();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function fetchOfficers() {
    try {
      const res = await fetch(`${API}/personnel`);
      const data = await res.json();
      setOfficers(data);
    } catch (err) {
      console.error('Failed to fetch officers:', err);
    }
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
        body: JSON.stringify({
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'No free officers available');
        setPhase('selected');
        return;
      }

      const officer = data.assigned_officer;
      setActiveIncident({ id: data.id, lat: data.lat, lng: data.lng });
      setAssignedOfficer(officer);
      setOfficerPosition({ lat: officer.lat, lng: officer.lng });
      officerPosRef.current = { lat: officer.lat, lng: officer.lng };
      incidentRef.current = { id: data.id, lat: data.lat, lng: data.lng };
      setDistance(data.distance_km);
      setEta(calculateETA(data.distance_km));
      setPhase('assigned');
      setOfficers((prev) =>
        prev.map((o) => (o.id === officer.id ? { ...o, status: 'busy' } : o))
      );
      toast.success(`${officer.name} assigned to incident`);
    } catch (err) {
      console.error('Report failed:', err);
      toast.error('Failed to report incident');
      setPhase('selected');
    }
  }

  function handleAccept() {
    setPhase('enroute');
    startTracking();
  }

  function startTracking() {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const pos = officerPosRef.current;
      const inc = incidentRef.current;
      if (!pos || !inc) return;

      const factor = 0.025;
      const newLat = pos.lat + (inc.lat - pos.lat) * factor;
      const newLng = pos.lng + (inc.lng - pos.lng) * factor;
      const dist = haversineDistance(newLat, newLng, inc.lat, inc.lng);

      const newPos = { lat: newLat, lng: newLng };
      officerPosRef.current = newPos;
      setOfficerPosition(newPos);
      setDistance(dist);
      setEta(calculateETA(dist));

      if (dist < 0.015) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        resolveIncident(inc.id);
      }
    }, 80);
  }

  async function resolveIncident(incidentId) {
    try {
      await fetch(`${API}/incident/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, status: 'resolved' }),
      });
    } catch (err) {
      console.error('Resolve failed:', err);
    }
    setPhase('resolved');
    toast.success('Incident resolved! Officer reached the location.');
    fetchOfficers();
  }

  function handleReset() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
      />

      <FloatingCard
        selectedLocation={selectedLocation}
        activeIncident={activeIncident}
        assignedOfficer={assignedOfficer}
        distance={distance}
        eta={eta}
        phase={phase}
        onReport={handleReport}
        onAccept={handleAccept}
        onReset={handleReset}
      />

      <div className="top-bar" data-testid="top-bar">
        <Shield size={16} className="text-blue-500" />
        <span>Election Patrol</span>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
}

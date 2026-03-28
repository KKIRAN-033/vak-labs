import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Shield, Radio } from 'lucide-react';
import { formatDistance, formatETA } from '../utils/geo';

const ANANTAPUR = [14.6819, 77.6006];

/* ═══════════════════════════════════════════
   Google Maps–style Pin Builder (SVG)
   ═══════════════════════════════════════════ */
function gmapPin(color, innerSvg, size = 38) {
  const h = Math.round(size * 1.38);
  const r = size / 2;
  const ir = r * 0.46;
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${h}px;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
      <svg viewBox="0 0 ${size} ${h}" width="${size}" height="${h}">
        <path d="M${r} 0C${r * 0.44} 0 0 ${r * 0.44} 0 ${r}c0 ${r * 0.78} ${r} ${h - r} ${r} ${h} ${0} 0 ${r}-${h - r * 1.78} ${r}-${h - r}C${size} ${r * 0.44} ${r * 1.56} 0 ${r} 0z" fill="${color}"/>
        <circle cx="${r}" cy="${r - 1}" r="${ir}" fill="white"/>
      </svg>
      <div style="position:absolute;top:${r - ir}px;left:${r - ir}px;width:${ir * 2}px;height:${ir * 2}px;display:flex;align-items:center;justify-content:center;">
        ${innerSvg}
      </div>
    </div>`,
    iconSize: [size, h],
    iconAnchor: [r, h],
  });
}

function createClickPin() {
  return gmapPin('#3B82F6', '<div style="width:10px;height:10px;background:#3B82F6;border-radius:50%;"></div>', 34);
}

function createIncidentPin() {
  return gmapPin(
    '#F59E0B',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 16H3z"/><line x1="12" y1="10" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>',
    42
  );
}

function createOfficerPin(status) {
  if (status === 'free') {
    return gmapPin(
      '#10B981',
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      40
    );
  }
  return gmapPin(
    '#EF4444',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    40
  );
}

function createMyLocationIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="position:relative;width:22px;height:22px;"><div class="my-loc-pulse"></div><div style="width:22px;height:22px;background:#4285F4;border-radius:50%;border:3px solid white;box-shadow:0 1px 6px rgba(66,133,244,0.6);position:relative;z-index:2;"></div></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/* ═══════════════════════════════════════════
   Map Click Handler
   ═══════════════════════════════════════════ */
function MapClickHandler({ onMapClick, disabled }) {
  useMapEvents({ click(e) { if (!disabled) onMapClick(e.latlng); } });
  return null;
}

/* ═══════════════════════════════════════════
   Animated Marker — 60fps smooth via rAF
   Uses setLatLng() only, NEVER recreates marker
   ═══════════════════════════════════════════ */
function AnimatedOfficerMarker({ targetPosition, icon }) {
  const markerRef = useRef(null);
  const currentRef = useRef(null);
  const targetRef = useRef(null);
  const animRef = useRef(null);

  // Sync target from props
  useEffect(() => {
    if (targetPosition) {
      targetRef.current = targetPosition;
      if (!currentRef.current) currentRef.current = [...targetPosition];
    }
  }, [targetPosition]);

  // 60fps animation loop — interpolates towards target
  useEffect(() => {
    function frame() {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      if (markerRef.current && cur && tgt) {
        const f = 0.06;
        cur[0] += (tgt[0] - cur[0]) * f;
        cur[1] += (tgt[1] - cur[1]) * f;
        markerRef.current.setLatLng(cur);
      }
      animRef.current = requestAnimationFrame(frame);
    }
    animRef.current = requestAnimationFrame(frame);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  if (!targetPosition) return null;
  return <Marker ref={markerRef} position={targetPosition} icon={icon} />;
}

/* ═══════════════════════════════════════════
   Incident Marker with Custom Popup
   ═══════════════════════════════════════════ */
function IncidentMarkerWithPopup({ position, icon, showPopup, officer, distance, eta, onAccept }) {
  const markerRef = useRef(null);

  useEffect(() => {
    if (markerRef.current && showPopup) {
      const t = setTimeout(() => { try { markerRef.current.openPopup(); } catch(e) {} }, 150);
      return () => clearTimeout(t);
    }
  }, [showPopup]);

  return (
    <Marker ref={markerRef} position={position} icon={icon} data-testid="incident-marker">
      {showPopup && officer && (
        <Popup
          className="custom-popup"
          closeButton={false}
          closeOnClick={false}
          autoClose={false}
          autoPan={false}
          offset={[0, -10]}
        >
          <div className="popup-card" data-testid="assigned-state">
            <div className="popup-header">
              <div className="popup-dot" />
              <span>INCIDENT ASSIGNED</span>
            </div>
            <div className="popup-officer">
              <div className="popup-icon-wrap">
                <Shield size={16} color="#10B981" />
              </div>
              <div className="popup-info">
                <p className="popup-name">{officer.name}</p>
                <p className="popup-badge">{officer.rank || 'Sub Inspector'} &middot; {officer.badge}</p>
              </div>
            </div>
            <div className="popup-metrics" data-testid="live-distance-display">
              <span style={{ marginRight: 4 }}>🚓</span>
              {formatDistance(distance)} away
              <span className="popup-sep">|</span>
              <span data-testid="live-eta-display">ETA: {formatETA(eta)}</span>
            </div>
            <button className="popup-accept-btn" onClick={onAccept} data-testid="accept-dispatch-btn">
              <Radio size={15} />
              Accept Dispatch
            </button>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

/* ═══════════════════════════════════════════
   Main MapView
   ═══════════════════════════════════════════ */
export default function MapView({
  officers,
  selectedLocation,
  onMapClick,
  officerPosition,
  activeIncident,
  assignedOfficer,
  tracking,
  userLocation,
  phase,
  distance,
  eta,
  onAccept,
}) {
  const clickPin = useMemo(() => createClickPin(), []);
  const incidentPin = useMemo(() => createIncidentPin(), []);
  const myLocIcon = useMemo(() => createMyLocationIcon(), []);
  const busyPin = useMemo(() => createOfficerPin('busy'), []);

  const polylinePositions = [];
  if (officerPosition && activeIncident) {
    polylinePositions.push([officerPosition.lat, officerPosition.lng]);
    polylinePositions.push([activeIncident.lat, activeIncident.lng]);
  }

  return (
    <MapContainer center={ANANTAPUR} zoom={14} className="h-full w-full" zoomControl={false} data-testid="map-container">
      <TileLayer
        attribution='&copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MapClickHandler onMapClick={onMapClick} disabled={tracking || phase === 'assigned'} />

      {/* My Location */}
      {userLocation && (
        <>
          <Circle center={[userLocation.lat, userLocation.lng]} radius={userLocation.accuracy || 50}
            pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.08, weight: 1, opacity: 0.3 }} />
          <Marker position={[userLocation.lat, userLocation.lng]} icon={myLocIcon} />
        </>
      )}

      {/* Free/Busy officer markers */}
      {officers.map((o) => {
        if (assignedOfficer && o.id === assignedOfficer.id && officerPosition) return null;
        return <Marker key={o.id} position={[o.lat, o.lng]} icon={createOfficerPin(o.status)} />;
      })}

      {/* Animated assigned officer — 60fps smooth, never recreated */}
      {officerPosition && (
        <AnimatedOfficerMarker targetPosition={[officerPosition.lat, officerPosition.lng]} icon={busyPin} />
      )}

      {/* Selected click location */}
      {selectedLocation && !activeIncident && (
        <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={clickPin} data-testid="user-marker" />
      )}

      {/* Incident marker with custom popup card */}
      {activeIncident && (
        <IncidentMarkerWithPopup
          position={[activeIncident.lat, activeIncident.lng]}
          icon={incidentPin}
          showPopup={phase === 'assigned'}
          officer={assignedOfficer}
          distance={distance}
          eta={eta}
          onAccept={onAccept}
        />
      )}

      {/* Path polyline — updates each second */}
      {polylinePositions.length === 2 && (
        <Polyline positions={polylinePositions}
          pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.7, dashArray: '12 8' }} />
      )}
    </MapContainer>
  );
}

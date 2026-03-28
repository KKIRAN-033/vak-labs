import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const ANANTAPUR = [14.6819, 77.6006];

/* ─── Google Maps Pin (clean, no photos) ─── */
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

/* ─── Marker Creators ─── */
function createClickPin() {
  return gmapPin('#3B82F6', `<div style="width:10px;height:10px;background:#3B82F6;border-radius:50%;"></div>`, 34);
}

function createIncidentPin() {
  return gmapPin(
    '#F59E0B',
    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 16H3z"/><line x1="12" y1="10" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>`,
    42
  );
}

function createOfficerPin(status) {
  if (status === 'free') {
    return gmapPin(
      '#10B981',
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      40
    );
  }
  return gmapPin(
    '#EF4444',
    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    40
  );
}

function createMyLocationIcon() {
  return L.divIcon({
    className: '',
    html: `<div data-testid="my-location-marker" style="position:relative;width:22px;height:22px;">
      <div class="my-loc-pulse"></div>
      <div style="width:22px;height:22px;background:#4285F4;border-radius:50%;border:3px solid white;box-shadow:0 1px 6px rgba(66,133,244,0.6);position:relative;z-index:2;"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/* ─── Map Click Handler ─── */
function MapClickHandler({ onMapClick, disabled }) {
  useMapEvents({
    click(e) {
      if (!disabled) onMapClick(e.latlng);
    },
  });
  return null;
}

/* ─── Animated Marker (uses setLatLng for smooth movement) ─── */
function AnimatedOfficerMarker({ position, icon }) {
  const markerRef = useRef(null);

  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setLatLng(position);
    }
  }, [position]);

  if (!position) return null;
  return <Marker ref={markerRef} position={position} icon={icon} />;
}

export default function MapView({
  officers,
  selectedLocation,
  onMapClick,
  officerPosition,
  activeIncident,
  assignedOfficer,
  tracking,
  userLocation,
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
    <MapContainer
      center={ANANTAPUR}
      zoom={14}
      className="h-full w-full"
      zoomControl={false}
      data-testid="map-container"
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      <MapClickHandler onMapClick={onMapClick} disabled={tracking} />

      {/* My Location */}
      {userLocation && (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={userLocation.accuracy || 50}
            pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.08, weight: 1, opacity: 0.3 }}
          />
          <Marker position={[userLocation.lat, userLocation.lng]} icon={myLocIcon} />
        </>
      )}

      {/* Officer markers */}
      {officers.map((officer) => {
        if (assignedOfficer && officer.id === assignedOfficer.id && officerPosition) return null;
        return (
          <Marker
            key={officer.id}
            position={[officer.lat, officer.lng]}
            icon={createOfficerPin(officer.status)}
            data-testid="officer-marker"
          />
        );
      })}

      {/* Animated assigned officer */}
      {officerPosition && (
        <AnimatedOfficerMarker
          position={[officerPosition.lat, officerPosition.lng]}
          icon={busyPin}
        />
      )}

      {/* Selected click location */}
      {selectedLocation && !activeIncident && (
        <Marker
          position={[selectedLocation.lat, selectedLocation.lng]}
          icon={clickPin}
          data-testid="user-marker"
        />
      )}

      {/* Incident marker */}
      {activeIncident && (
        <Marker
          position={[activeIncident.lat, activeIncident.lng]}
          icon={incidentPin}
          data-testid="incident-marker"
        />
      )}

      {/* Path polyline */}
      {polylinePositions.length === 2 && (
        <Polyline
          positions={polylinePositions}
          pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.7, dashArray: '12 8' }}
          data-testid="path-polyline"
        />
      )}
    </MapContainer>
  );
}

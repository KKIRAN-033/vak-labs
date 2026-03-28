import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const ANANTAPUR = [14.6819, 77.6006];

function createUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:20px;height:20px;background:#3B82F6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 6px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.3);"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createIncidentIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:44px;height:44px;background:#F59E0B;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;box-shadow:0 4px 16px rgba(245,158,11,0.5);animation:markerPulse 2s ease-in-out infinite;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createOfficerIcon(status, avatarUrl) {
  const borderColor = status === 'free' ? '#10B981' : '#EF4444';
  const shadow = status === 'free'
    ? '0 4px 12px rgba(16,185,129,0.4)'
    : '0 4px 12px rgba(239,68,68,0.4)';
  return L.divIcon({
    className: '',
    html: `<div style="width:48px;height:48px;border-radius:50%;border:4px solid ${borderColor};background:white;overflow:hidden;box-shadow:${shadow};position:relative;">
      <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
      <div style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;background:${borderColor};border-radius:50%;border:2px solid white;"></div>
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

function MapClickHandler({ onMapClick, disabled }) {
  useMapEvents({
    click(e) {
      if (!disabled) onMapClick(e.latlng);
    },
  });
  return null;
}

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
}) {
  const userIcon = useMemo(() => createUserIcon(), []);
  const incidentIcon = useMemo(() => createIncidentIcon(), []);

  const busyIcon = useMemo(() => {
    if (!assignedOfficer) return null;
    return createOfficerIcon('busy', assignedOfficer.avatar);
  }, [assignedOfficer]);

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

      {officers.map((officer) => {
        if (assignedOfficer && officer.id === assignedOfficer.id && officerPosition) return null;
        return (
          <Marker
            key={officer.id}
            position={[officer.lat, officer.lng]}
            icon={createOfficerIcon(officer.status, officer.avatar)}
            data-testid="officer-marker"
          />
        );
      })}

      {officerPosition && busyIcon && (
        <AnimatedOfficerMarker
          position={[officerPosition.lat, officerPosition.lng]}
          icon={busyIcon}
        />
      )}

      {selectedLocation && !activeIncident && (
        <Marker
          position={[selectedLocation.lat, selectedLocation.lng]}
          icon={userIcon}
          data-testid="user-marker"
        />
      )}

      {activeIncident && (
        <Marker
          position={[activeIncident.lat, activeIncident.lng]}
          icon={incidentIcon}
          data-testid="incident-marker"
        />
      )}

      {polylinePositions.length === 2 && (
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: '#3B82F6',
            weight: 4,
            opacity: 0.7,
            dashArray: '12 8',
          }}
          data-testid="path-polyline"
        />
      )}
    </MapContainer>
  );
}

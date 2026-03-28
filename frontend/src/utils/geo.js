export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateETA(distanceKm, speedKmh = 40) {
  return (distanceKm / speedKmh) * 60;
}

export function formatDistance(km) {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(2)} km`;
}

export function formatETA(minutes) {
  if (minutes < 1) return `${(minutes * 60).toFixed(0)} sec`;
  return `${minutes.toFixed(1)} min`;
}

export function getTrackingStatus(distanceKm) {
  if (distanceKm > 0.3) return { label: 'Responding', color: '#F59E0B', bg: '#FEF3C7' };
  if (distanceKm > 0.1) return { label: 'Approaching', color: '#3B82F6', bg: '#DBEAFE' };
  if (distanceKm > 0.03) return { label: 'Almost There', color: '#10B981', bg: '#D1FAE5' };
  return { label: 'Arrived', color: '#10B981', bg: '#D1FAE5' };
}

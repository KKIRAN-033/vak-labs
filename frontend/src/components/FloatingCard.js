import { MapPin, Siren, CheckCircle2 } from 'lucide-react';
import { formatDistance, formatETA, getTrackingStatus } from '../utils/geo';

export default function FloatingCard({
  selectedLocation,
  assignedOfficer,
  distance,
  eta,
  phase,
  onReport,
  onReset,
}) {
  if (phase === 'idle') return <IdleHint />;
  if (phase === 'selected') return <ReportCard location={selectedLocation} onReport={onReport} />;
  if (phase === 'assigning') return <LoadingCard />;
  if (phase === 'assigned') return null; /* Custom popup on map handles this */
  if (phase === 'enroute') return <TrackingBar officer={assignedOfficer} distance={distance} eta={eta} />;
  if (phase === 'resolved') return <ResolvedCard onReset={onReset} />;
  return null;
}

/* ─── Idle: subtle bottom hint ─── */
function IdleHint() {
  return (
    <div className="idle-hint" data-testid="idle-state">
      <div className="idle-dot" />
      <span>Tap the map to report an incident</span>
    </div>
  );
}

/* ─── Selected: location + FAB report button ─── */
function ReportCard({ location, onReport }) {
  return (
    <div className="report-card" data-testid="selected-state">
      <div className="report-location">
        <MapPin size={13} className="text-slate-400" />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
        </span>
      </div>
      <button className="fab-btn" onClick={onReport} data-testid="report-incident-btn">
        <Siren size={20} />
        <span>Report Incident</span>
      </button>
    </div>
  );
}

/* ─── Assigning: compact loader ─── */
function LoadingCard() {
  return (
    <div className="loading-card" data-testid="assigning-state">
      <div className="loader-ring" />
      <span>Locating nearest patrol unit...</span>
    </div>
  );
}

/* ─── EnRoute: top tracking bar with live metrics ─── */
function TrackingBar({ officer, distance, eta }) {
  const st = getTrackingStatus(distance);
  return (
    <div className="tracking-bar" data-testid="floating-card">
      <div className="tb-status" style={{ background: st.bg, color: st.color }}>
        <div className="tb-dot" style={{ background: st.color }} />
        {st.label}
      </div>
      <div className="tb-metric" data-testid="live-distance-display">
        <span className="tb-emoji">🚓</span>
        {formatDistance(distance)} away
      </div>
      <div className="tb-divider" />
      <div className="tb-metric" data-testid="live-eta-display">
        <span className="tb-emoji">⏱</span>
        ETA: {formatETA(eta)}
      </div>
      {officer && (
        <>
          <div className="tb-divider" />
          <div className="tb-officer">{officer.name}</div>
        </>
      )}
    </div>
  );
}

/* ─── Resolved: compact success bar ─── */
function ResolvedCard({ onReset }) {
  return (
    <div className="resolved-card" data-testid="resolved-state">
      <div className="rc-left">
        <CheckCircle2 size={22} className="text-emerald-500" />
        <div>
          <p className="rc-title">Incident Resolved</p>
          <p className="rc-sub">Officer reached the location</p>
        </div>
      </div>
      <button className="rc-btn" onClick={onReset} data-testid="report-new-btn">
        <Siren size={14} />
        New Report
      </button>
    </div>
  );
}

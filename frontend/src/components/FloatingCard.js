import { MapPin, Siren, Navigation, CheckCircle2, Shield, Clock } from 'lucide-react';
import { formatDistance, formatETA } from '../utils/geo';

export default function FloatingCard({
  selectedLocation,
  activeIncident,
  assignedOfficer,
  distance,
  eta,
  phase,
  onReport,
  onAccept,
  onReset,
}) {
  return (
    <div className="floating-card" data-testid="floating-card">
      {phase === 'idle' && <IdleState />}
      {phase === 'selected' && (
        <SelectedState location={selectedLocation} onReport={onReport} />
      )}
      {phase === 'assigning' && <AssigningState />}
      {phase === 'assigned' && (
        <AssignedState
          officer={assignedOfficer}
          distance={distance}
          eta={eta}
          onAccept={onAccept}
        />
      )}
      {phase === 'enroute' && (
        <EnRouteState officer={assignedOfficer} distance={distance} eta={eta} />
      )}
      {phase === 'resolved' && <ResolvedState onReset={onReset} />}
    </div>
  );
}

function IdleState() {
  return (
    <div className="text-center py-2" data-testid="idle-state">
      <div className="flex items-center justify-center gap-2 mb-2">
        <MapPin size={20} className="text-blue-500" />
        <span className="font-bold text-slate-800 tracking-tight">
          Smart Election Patrol
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Tap on the map to select incident location
      </p>
    </div>
  );
}

function SelectedState({ location, onReport }) {
  return (
    <div data-testid="selected-state">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <MapPin size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm tracking-tight">
            Location Selected
          </p>
          <p className="text-xs text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {location?.lat.toFixed(4)}, {location?.lng.toFixed(4)}
          </p>
        </div>
      </div>
      <button
        onClick={onReport}
        className="report-btn"
        data-testid="report-incident-btn"
      >
        <Siren size={22} />
        <span>Report Incident</span>
      </button>
    </div>
  );
}

function AssigningState() {
  return (
    <div className="text-center py-6" data-testid="assigning-state">
      <div className="flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-700 font-semibold">
          Finding nearest officer...
        </span>
      </div>
    </div>
  );
}

function AssignedState({ officer, distance, eta, onAccept }) {
  if (!officer) return null;
  return (
    <div data-testid="assigned-state">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
        <span className="font-bold text-slate-800 tracking-tight text-sm">
          Incident Assigned
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-2xl">
        <img
          src={officer.avatar}
          alt={officer.name}
          className="w-12 h-12 rounded-full object-cover border-2 border-amber-400"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate">{officer.name}</p>
          <p className="text-xs text-slate-500">Badge: {officer.badge}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className="text-sm font-bold text-slate-800"
            style={{ fontVariantNumeric: 'tabular-nums' }}
            data-testid="live-distance-display"
          >
            {formatDistance(distance)}
          </p>
          <p
            className="text-xs text-slate-500"
            style={{ fontVariantNumeric: 'tabular-nums' }}
            data-testid="live-eta-display"
          >
            ETA: {formatETA(eta)}
          </p>
        </div>
      </div>

      <button
        onClick={onAccept}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3.5 font-bold text-base flex items-center justify-center gap-2 shadow-[0_8px_16px_-6px_rgba(16,185,129,0.5)] transition-all active:scale-[0.98]"
        data-testid="accept-dispatch-btn"
      >
        <Shield size={18} />
        <span>Accept Dispatch</span>
      </button>
    </div>
  );
}

function EnRouteState({ officer, distance, eta }) {
  if (!officer) return null;
  return (
    <div data-testid="enroute-state">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full absolute inset-0 animate-ping" />
        </div>
        <span className="font-bold text-slate-800 tracking-tight">
          Officer En Route
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <img
          src={officer.avatar}
          alt={officer.name}
          className="w-12 h-12 rounded-full object-cover"
          style={{ border: '3px solid #10B981' }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 truncate">{officer.name}</p>
          <p className="text-xs text-slate-500">{officer.badge}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <Navigation size={14} className="text-blue-500" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Distance
            </span>
          </div>
          <p
            className="text-2xl font-extrabold text-slate-800"
            style={{ fontVariantNumeric: 'tabular-nums' }}
            data-testid="live-distance-display"
          >
            {formatDistance(distance)}
          </p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <Clock size={14} className="text-blue-500" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              ETA
            </span>
          </div>
          <p
            className="text-2xl font-extrabold text-slate-800"
            style={{ fontVariantNumeric: 'tabular-nums' }}
            data-testid="live-eta-display"
          >
            {formatETA(eta)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ResolvedState({ onReset }) {
  return (
    <div className="text-center py-2" data-testid="resolved-state">
      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <CheckCircle2 size={28} className="text-emerald-500" />
      </div>
      <p className="font-bold text-slate-800 text-lg tracking-tight mb-1">
        Incident Resolved
      </p>
      <p className="text-sm text-slate-500 mb-5">
        Officer reached the location successfully
      </p>
      <button
        onClick={onReset}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3.5 font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        data-testid="report-new-btn"
      >
        <Siren size={18} />
        <span>Report New Incident</span>
      </button>
    </div>
  );
}

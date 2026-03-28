import { MapPin, Siren, Navigation, CheckCircle2, Shield, Clock, Radio, Zap } from 'lucide-react';
import { formatDistance, formatETA } from '../utils/geo';

export default function FloatingCard({
  selectedLocation,
  assignedOfficer,
  distance,
  eta,
  phase,
  onReport,
  onAccept,
  onReset,
}) {
  /* ─── EnRoute: compact HUD at top-right, won't block tracking ─── */
  if (phase === 'enroute') {
    return (
      <div className="tracking-hud" data-testid="floating-card">
        <EnRouteHUD officer={assignedOfficer} distance={distance} eta={eta} />
      </div>
    );
  }

  /* ─── All other phases: bottom card ─── */
  return (
    <div className="floating-card" data-testid="floating-card">
      {phase === 'idle' && <IdleState />}
      {phase === 'selected' && (
        <SelectedState location={selectedLocation} onReport={onReport} />
      )}
      {phase === 'assigning' && <AssigningState />}
      {phase === 'assigned' && (
        <AssignedState officer={assignedOfficer} distance={distance} eta={eta} onAccept={onAccept} />
      )}
      {phase === 'resolved' && <ResolvedState onReset={onReset} />}
    </div>
  );
}

/* ─── Phase: Idle ─── */
function IdleState() {
  return (
    <div className="text-center py-1" data-testid="idle-state">
      <div className="flex items-center justify-center gap-2.5 mb-1.5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Shield size={16} className="text-blue-600" />
        </div>
        <span className="font-extrabold text-slate-800 tracking-tight text-base">
          Election Patrol System
        </span>
      </div>
      <p className="text-sm text-slate-400 font-medium">
        Tap anywhere on the map to report an incident
      </p>
    </div>
  );
}

/* ─── Phase: Location Selected ─── */
function SelectedState({ location, onReport }) {
  return (
    <div data-testid="selected-state">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 border border-amber-100">
          <MapPin size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm tracking-tight">
            Incident Location
          </p>
          <p className="text-xs text-slate-400 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
          </p>
        </div>
      </div>
      <button onClick={onReport} className="report-btn" data-testid="report-incident-btn">
        <Siren size={20} />
        <span>Report Incident</span>
      </button>
    </div>
  );
}

/* ─── Phase: Finding officer ─── */
function AssigningState() {
  return (
    <div className="text-center py-5" data-testid="assigning-state">
      <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-slate-700 font-bold text-sm">Locating nearest patrol unit...</p>
      <p className="text-xs text-slate-400 mt-1">Scanning available officers</p>
    </div>
  );
}

/* ─── Phase: Officer Assigned ─── */
function AssignedState({ officer, distance, eta, onAccept }) {
  if (!officer) return null;
  return (
    <div data-testid="assigned-state">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <div className="w-2 h-2 bg-amber-500 rounded-full" />
          <div className="w-2 h-2 bg-amber-500 rounded-full absolute inset-0 animate-ping" />
        </div>
        <span className="font-extrabold text-slate-800 tracking-tight text-xs uppercase">
          Unit Assigned
        </span>
      </div>

      {/* Officer info card */}
      <div className="flex items-center gap-3 mb-4 p-3.5 bg-gradient-to-r from-slate-50 to-slate-50/50 rounded-2xl border border-slate-100">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 border border-emerald-100">
          <Shield size={20} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate">{officer.name}</p>
          <p className="text-xs text-slate-400">{officer.rank || 'Sub Inspector'} &middot; {officer.badge}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-extrabold text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }} data-testid="live-distance-display">
            {formatDistance(distance)}
          </p>
          <p className="text-xs text-slate-400 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }} data-testid="live-eta-display">
            ETA {formatETA(eta)}
          </p>
        </div>
      </div>

      {/* Accept button */}
      <button
        onClick={onAccept}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2.5 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)] transition-all active:scale-[0.98]"
        data-testid="accept-dispatch-btn"
      >
        <Radio size={17} />
        <span>Accept &amp; Dispatch</span>
      </button>
    </div>
  );
}

/* ─── Phase: EnRoute — compact top-right HUD ─── */
function EnRouteHUD({ officer, distance, eta }) {
  if (!officer) return null;
  return (
    <div data-testid="enroute-state">
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          <div className="w-2 h-2 bg-emerald-400 rounded-full absolute inset-0 animate-ping" />
        </div>
        <span className="font-extrabold text-slate-700 text-[11px] uppercase tracking-wider">
          En Route
        </span>
      </div>

      {/* Metrics — big numbers */}
      <div className="flex items-baseline gap-2 mb-2.5">
        <div className="flex-1 text-center">
          <p className="text-[28px] font-black text-slate-800 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }} data-testid="live-eta-display">
            {formatETA(eta)}
          </p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">ETA</p>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="flex-1 text-center">
          <p className="text-[28px] font-black text-slate-800 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }} data-testid="live-distance-display">
            {formatDistance(distance)}
          </p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Dist</p>
        </div>
      </div>

      {/* Officer info */}
      <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100">
        <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center flex-shrink-0">
          <Zap size={12} className="text-red-500" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 truncate">{officer.name}</p>
          <p className="text-[10px] text-slate-400">{officer.badge}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Phase: Resolved ─── */
function ResolvedState({ onReset }) {
  return (
    <div className="text-center py-2" data-testid="resolved-state">
      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-100">
        <CheckCircle2 size={32} className="text-emerald-500" />
      </div>
      <p className="font-extrabold text-slate-800 text-lg tracking-tight mb-0.5">
        Incident Resolved
      </p>
      <p className="text-sm text-slate-400 mb-5">
        Patrol unit reached the location
      </p>
      <button
        onClick={onReset}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        data-testid="report-new-btn"
      >
        <Siren size={17} />
        <span>Report New Incident</span>
      </button>
    </div>
  );
}

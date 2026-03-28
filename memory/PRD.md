# Smart Election Patrol & Incident Response System

## Architecture
- **Backend**: FastAPI + MongoDB + WebSocket
- **Frontend**: React + Leaflet + Tailwind CSS

## What's Been Implemented (2026-03-28)
### Iteration 3 — Critical Fixes (Latest)
- 60fps smooth marker movement via requestAnimationFrame + 1-sec LERP (factor 0.12)
- Custom Google Maps-style popup card ON THE MAP with officer info + Accept button
- Top tracking bar: "🚓 0.6 km away | ⏱ ETA: 1.5 min" with live updates
- Status progression: Responding → Approaching → Almost There → Arrived
- Premium UI: FAB button, subtle idle hint, compact resolved card
- Performance: setLatLng only, no marker recreation, no full map re-render
- Clean code: no unused imports, consolidated components
### Previous Iterations
- 12 officers seeded around Anantapur, AP
- Google Maps-style SVG teardrop pins (green/red/amber/blue)
- Haversine distance + 40km/h ETA calculation
- User geolocation with blue pulsing dot

## Backlog
- P2: Multi-incident parallel tracking
- P2: Incident categories (booth capture, violence, EVM tampering)

# Smart Election Patrol & Incident Response System

## Problem Statement
Build a real-time election patrol and incident response system for a police hackathon. Full-screen Leaflet map centered on Anantapur, AP, India. Core flow: click map → report incident → auto-assign nearest officer → smooth live tracking → incident resolved.

## Architecture
- **Backend**: FastAPI + MongoDB + WebSocket (`/api/ws`)
- **Frontend**: React + Leaflet + Tailwind CSS
- **Real-time**: LERP interpolation at 80ms intervals for smooth officer movement

## What's Been Implemented (2026-03-28)
- Full-screen Leaflet map with CARTO Voyager tiles centered on Anantapur (14.6819, 77.6006)
- 5 seeded officers with avatars, badges, and free/busy status
- POST /api/incident - creates incident + auto-assigns nearest free officer (Haversine)
- GET /api/personnel - returns all officers with status
- PATCH /api/incident/status - resolves incident and frees officer
- WebSocket at /api/ws for real-time broadcasts
- Smooth LERP movement animation (factor 0.025, 80ms interval)
- Live ETA + Distance calculation (Haversine + 40km/h speed)
- Professional Google Maps-style floating cards with animations
- Custom markers: green=free officer, red=busy, blue=user click, amber=incident
- Path polyline from officer to incident (dashed blue)
- Phase-based UI: idle → selected → assigning → assigned → enroute → resolved
- Sonner toasts for notifications
- Mobile-first responsive design

## User Personas
- Election patrol officers in the field
- Control room operators monitoring incidents
- Demo audience at hackathon

## Prioritized Backlog
- P2: Multi-incident support (parallel tracking)
- P2: Incident history/log view
- P3: Officer chat/communication
- P3: Incident categories (violence, fraud, etc.)

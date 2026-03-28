# Smart Election Patrol & Incident Response System

## Problem Statement
Police hackathon project - real-time election patrol and incident response system. Full-screen Leaflet map centered on Anantapur, AP, India.

## Architecture
- **Backend**: FastAPI + MongoDB + WebSocket (`/api/ws`)
- **Frontend**: React + Leaflet + Tailwind CSS + Manrope font
- **Real-time**: LERP interpolation at 80ms intervals

## What's Been Implemented (2026-03-28)
- 12 officers seeded around Anantapur with Indian names, ranks, badges
- Google Maps-style SVG teardrop pins (no photos) - green=free, red=busy, amber=incident, blue=click
- Compact glassmorphic tracking HUD at top-right (doesn't block map during tracking)
- Smooth LERP movement animation
- Live ETA + Distance (Haversine + 40km/h)
- Icon-based officer cards (Shield, Radio, Zap icons)
- Phase-based UI: idle → selected → assigning → assigned → enroute → resolved
- User geolocation with blue pulsing dot
- Sonner toasts for notifications
- Professional bottom cards for reporting, top-right HUD for tracking

## Iteration 2 Changes
- Officers increased from 5 to 12
- Removed photos from markers and cards — clean SVG icons
- Tracking HUD moved to compact top-right to not block map view
- Improved typography and glassmorphism effects
- Better officer data (ranks: SI, ASI, CI)

## Backlog
- P2: Multi-incident parallel tracking
- P2: Incident categories
- P3: Officer chat

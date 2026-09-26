# NEON GRAB v1.3 — Challenge Edition

A browser-based 2–8 player cyberpunk arena game. Each 60-second round combines smooth real-time movement with risk/reward collection, hazards and power-ups.

## Core loop
- Create/join a 4-character room; no account required.
- Move with WASD/arrow keys or mobile drag.
- Collect energy orbs and outscore opponents.
- Server-authoritative scoring and collisions.

## v1.3 challenge systems
1. **Shrinking Safe Zone:** warning circles precede  impacts; impacts can knock players back, cost points and break combos.
2. **Risk/Reward Orbs:** energy (1), rare (3), volatile (5 + bonus), multiplier (2× for 5s), void (-2), and bounty (5).
3. **Power-Ups:** dash, shield, magnet, overdrive and phase; each lasts briefly and changes movement/survival strategy.
4. **Shrinking Arena:** the safe zone contracts during the final 30 seconds; players outside gradually lose points and their combo.
5. **Combo + Bounty:** rapid pickups build combo multipliers up to ×4; the current leader receives a bounty marker and bounty targets spawn near them.

## Visual/game feel
- Smooth client interpolation and predictive rendering.
- Tapered -like player trails.
- Neon/cyberpunk UI and typography.
- Pickup particles,  warnings and glowing power-up indicators.
- Sound effects for game start, pickups, power-ups and hazards.

## Public deployment
The server binds to `0.0.0.0`, uses the platform `PORT`, supports Socket.IO WebSocket/polling, and includes `/health` for deployment health checks.

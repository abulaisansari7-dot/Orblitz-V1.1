# OrBlitz v1.3 — Challenge Edition

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## How to play

- Create a room and share the 4-character code.
- 2–8 players can join.
- Host starts the 60-second round.
- PC: WASD / Arrow Keys. Mobile: drag on the arena.
- Cyan energy = 1, gold = 3, red volatile = 5 + bonus, purple multiplier = 2×, void = -2, orange bounty = 5.
- Chain pickups to build combo multipliers up to ×4.
- Dodge rivals and use power-ups.
- Stay inside the full arena during the final 30 seconds.
- Collect temporary power-ups: dash, shield, magnet, overdrive, phase.
- The current leader is marked as the bounty target.
- Highest score after 60 seconds wins.

## Public deployment

Use the included `render.yaml` or deploy as a Node web service with:

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

The service listens on `process.env.PORT` and `0.0.0.0`, so it can be reached from devices on different networks after deployment.

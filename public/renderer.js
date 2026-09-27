// OrBlitz arena renderer. Same neon look as before, but every glow is drawn once into a cached sprite (rebuilt
// when the resolution or quality changes) instead of being blurred again for every shape on every frame.
(() => {
const W = 1600, H = 900, TAU = Math.PI * 2;
const ORBS = { energy: ['#77e6ff', '1'], rare: ['#ffd66b', '3'], volatile: ['#ff5577', '5'], multiplier: ['#b77dff', '2×'], void: ['#69728d', '−2'], bounty: ['#ff8b3d', 'BOUNTY'] };
const POWERUPS = { dash: '#ff5eea', shield: '#57d7ff', magnet: '#ffd35e', overdrive: '#ff714b', phase: '#a88cff' };
const TRAIL_MS = { long: 333, medium: 220, short: 120, off: 0 }; // long = the original 20 frames at 60 fps
const BURST = { full: 12, half: 6, off: 0 };
const SAMPLE_MS = 16;   // trail points stay about one 60 fps frame apart at any frame rate
const GLOW_R = 5;       // trail glow stamp = the blurred shadow of a disc this big (arena units)
const FLAME = 30;       // flame length the flame glow sprite is drawn at; scaled to the live length
const OFF = 1e5;        // a shape drawn this far off-canvas leaves only its shifted-back shadow: a pure glow
const LABEL_FONT = '900 8px Orbitron,system-ui';
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const margin = blur => blur ? Math.ceil(blur * 1.5) + 2 : 2; // room around a shape for its blur
function flame1(g, len, flicker) { g.beginPath(); g.moveTo(-17, 0); g.lineTo(-len * flicker, -6); g.lineTo(-len * 1.15, 0); g.lineTo(-len * flicker, 6); g.closePath(); g.fill(); }
function flame2(g, len) { g.beginPath(); g.moveTo(-20, 0); g.lineTo(-len * 1.45, -4); g.lineTo(-len * 1.65, 0); g.lineTo(-len * 1.45, 4); g.closePath(); g.fill(); }

function create(canvas, ctxOptions) {
  const ctx = canvas.getContext('2d', { alpha: false, ...ctxOptions });
  // sprites live on the same kind of canvas (GPU or software) as the arena, so drawing them never copies across
  const spriteOpts = ctxOptions && ctxOptions.willReadFrequently ? { willReadFrequently: true } : undefined;
  const ctx2d = (c, opts) => c.getContext('2d', { ...spriteOpts, ...opts });
  const measure = ctx2d(makeCanvas(1, 1));
  const q = { glow: 'full', trails: 'long', particles: 'full' };
  const sprites = new Map(), colors = new Map(), sparks = [];
  let kx = 1, ky = 1, bg = null; // kx, ky: canvas pixels per arena unit

  if (document.fonts) document.fonts.load(LABEL_FONT).then(() => sprites.clear(), () => {}); // labels need Orbitron
  const blurOf = b => q.glow === 'off' ? 0 : b;
  function glow(g, blur, color) { if (blur) { g.shadowBlur = blur; g.shadowColor = color; } }
  function hue(h) {
    let c = colors.get(h);
    if (!c) colors.set(h, c = { trail: `hsl(${h} 95% 68%)`, tail: `hsl(${h} 95% 70%)`, body: `hsl(${h} 95% 62%)`, halo: `hsla(${h},95%,68%,.12)`, spark: `hsl(${h} 95% 70%)` });
    return c;
  }

  // A sprite drawn straight in canvas pixels, centred on its anchor (orbs, labels, sparks, trail glow).
  // hw/hh: half size in arena units; pad: pixels of room for the blur. Blur sizes stay in canvas pixels, as before.
  function flatSprite(key, hw, hh, pad, paint, glowOnly) {
    let cv = sprites.get(key);
    if (cv) return cv;
    cv = makeCanvas(2 * (hw * kx + pad), 2 * (hh * ky + pad));
    const g = ctx2d(cv);
    g.setTransform(kx, 0, 0, ky, cv.width / 2 - (glowOnly ? OFF : 0), cv.height / 2);
    if (glowOnly) g.shadowOffsetX = OFF;
    paint(g);
    sprites.set(key, cv);
    return cv;
  }
  // A sprite in rotating local space (rockets, tails, flames, power-up frames), drawn under the arena transform.
  // The arena is usually stretched more one way than the other, so blur is sized for the average stretch (bs).
  function localSprite(key, x0, y0, x1, y1, blur, paint, glowOnly) {
    let s = sprites.get(key);
    if (s) return s;
    const sc = Math.max(kx, ky), bs = sc / Math.sqrt(kx * ky), m = margin(blurOf(blur) * bs);
    const cv = makeCanvas((x1 - x0) * sc + 2 * m, (y1 - y0) * sc + 2 * m), g = ctx2d(cv);
    g.setTransform(sc, 0, 0, sc, m - x0 * sc - (glowOnly ? OFF : 0), m - y0 * sc);
    if (glowOnly) g.shadowOffsetX = OFF;
    paint(g, bs);
    sprites.set(key, s = { cv, x: x0 - m / sc, y: y0 - m / sc, w: cv.width / sc, h: cv.height / sc });
    return s;
  }

  function background() {
    if (bg) return bg;
    bg = makeCanvas(canvas.width, canvas.height);
    const b = ctx2d(bg, { alpha: false });
    b.setTransform(kx, 0, 0, ky, 0, 0);
    b.fillStyle = '#070912'; b.fillRect(0, 0, W, H);
    b.strokeStyle = '#151a2d'; b.lineWidth = 2; b.beginPath();
    for (let x = 0; x < W; x += 80) { b.moveTo(x, 0); b.lineTo(x, H); }
    for (let y = 0; y < H; y += 80) { b.moveTo(0, y); b.lineTo(W, y); }
    b.stroke();
    b.strokeStyle = '#26304d'; b.lineWidth = 4; b.strokeRect(12, 12, 1576, 876);
    return bg;
  }

  // Orb = base (halo + glowing core, scaled by the pulse) + top (white centre + value label, never scaled)
  function orbBase(kind) {
    const [color] = ORBS[kind] || ORBS.energy, bounty = kind === 'bounty', blur = blurOf(bounty ? 35 : 25), halo = bounty ? 34 : 26;
    const pad = Math.max(1, 14 * kx + margin(blur) - halo * kx, 14 * ky + margin(blur) - halo * ky);
    return flatSprite('ob' + kind, halo, halo, pad, g => {
      g.beginPath(); g.arc(0, 0, halo, 0, TAU); g.fillStyle = color + '22'; g.fill();
      g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fillStyle = color; glow(g, blur, color); g.fill();
    });
  }
  function orbTop(kind) {
    const [color, label] = ORBS[kind] || ORBS.energy, blur = blurOf(kind === 'bounty' ? 35 : 25);
    measure.font = LABEL_FONT;
    return flatSprite('ot' + kind, Math.max(4, measure.measureText(label).width / 2), 6, margin(blur), g => {
      glow(g, blur, color);
      g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fillStyle = '#fff'; g.fill();
      g.fillStyle = '#071019'; g.font = LABEL_FONT; g.textAlign = 'center'; g.fillText(label, 0, 3);
    });
  }
  function powerupLabel(type, color) {
    const label = type.toUpperCase(), blur = blurOf(25);
    measure.font = LABEL_FONT;
    return flatSprite('pl' + type, measure.measureText(label).width / 2 + 1, 6, margin(blur), g => {
      glow(g, blur, color); g.fillStyle = color; g.font = LABEL_FONT; g.textAlign = 'center'; g.fillText(label, 0, 3);
    });
  }
  function powerupFrame(type, color) {
    return localSprite('pf' + type, -18, -18, 18, 18, 25, (g, bs) => {
      glow(g, blurOf(25) * bs, color); g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(-16, -16, 32, 32);
    });
  }
  function rocket(h, bounty) {
    const c = hue(h), glowColor = bounty ? '#ff9a4a' : c.trail;
    return localSprite((bounty ? 'rb' : 'r') + h, -31, -21, 31, 21, 22, (g, bs) => {
      glow(g, blurOf(22) * bs, glowColor);
      g.fillStyle = bounty ? 'rgba(255,154,74,.14)' : c.halo; g.beginPath(); g.ellipse(0, 0, 31, 21, 0, 0, TAU); g.fill();
      g.fillStyle = c.body; g.beginPath(); g.moveTo(25, 0); g.quadraticCurveTo(10, -16, -13, -13); g.lineTo(-20, 0); g.lineTo(-13, 13); g.quadraticCurveTo(10, 16, 25, 0); g.closePath(); g.fill();
      g.fillStyle = '#f8fbff'; g.beginPath(); g.arc(8, 0, 6, 0, TAU); g.fill();
      g.fillStyle = '#10131d'; g.beginPath(); g.arc(10, 0, 2.5, 0, TAU); g.fill();
      g.fillStyle = glowColor; g.beginPath(); g.moveTo(-18, -7); g.lineTo(-30, 0); g.lineTo(-18, 7); g.closePath(); g.fill();
    });
  }
  // glow-only sprites: the crisp shapes are still drawn live on top
  function tailGlow(h) {
    const color = hue(h).tail;
    return localSprite('tg' + h, -75.5, -3.5, 3.5, 3.5, 24, (g, bs) => {
      glow(g, 24 * bs, color); g.strokeStyle = color; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-72, 0); g.stroke();
    }, true);
  }
  function flameGlow() {
    return localSprite('fg', -FLAME * 1.65, -6, -17, 6, 20, (g, bs) => {
      glow(g, 20 * bs, '#ff3b6b');
      g.globalAlpha = .85; g.fillStyle = '#fff'; flame1(g, FLAME, 1);
      g.globalAlpha = .65; g.fillStyle = '#ff3155'; flame2(g, FLAME);
    }, true);
  }
  function trailStamp(h) {
    const color = hue(h).trail;
    return flatSprite('ts' + h, GLOW_R, GLOW_R, margin(18), g => {
      glow(g, 18, color); g.beginPath(); g.arc(0, 0, GLOW_R, 0, TAU); g.fillStyle = color; g.fill();
    }, true);
  }
  function spark(h) {
    const color = hue(h).spark, blur = blurOf(14);
    return flatSprite('sp' + h, 5, 5, margin(blur), g => {
      glow(g, blur, color); g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fillStyle = color; g.fill();
    });
  }

  // Each trail segment used to cast its own blurred shadow. Now a pre-blurred stamp per segment carries the
  // same amount of glow (alpha scaled by the segment's area), then the crisp segments go on top.
  function drawTrail(v, c, trailMs, k, now) {
    const tr = v.trail, fadeOf = t => (1 - (now - t.t) / trailMs) * t.a * k;
    if (q.glow === 'full') {
      const g = trailStamp(v.hue), area0 = Math.PI * GLOW_R * GLOW_R;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = tr.length - 1; i >= 1; i--) {
        const t = tr[i], p = tr[i - 1], fade = fadeOf(t);
        if (fade <= .01) continue;
        const w = Math.max(2, 12 * fade), len = Math.hypot(t.x - p.x, t.y - p.y);
        ctx.globalAlpha = Math.min(1, fade * (w * len + Math.PI * w * w / 4) / area0);
        // whole-pixel positions let the browser copy the stamp instead of resampling it; the glow is soft anyway
        ctx.drawImage(g, Math.round((t.x + p.x) / 2 * kx - g.width / 2), Math.round((t.y + p.y) / 2 * ky - g.height / 2));
      }
    }
    ctx.setTransform(kx, 0, 0, ky, 0, 0); ctx.strokeStyle = c.trail; ctx.lineCap = 'round';
    for (let i = tr.length - 1; i >= 1; i--) {
      const t = tr[i], p = tr[i - 1], fade = fadeOf(t);
      if (fade <= .01) continue;
      ctx.globalAlpha = fade; ctx.lineWidth = Math.max(2, 12 * fade);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    }
  }

  function draw(state, players, myId, now, dt) {
    const full = q.glow === 'full', trailMs = TRAIL_MS[q.trails] || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(background(), 0, 0);
    for (const o of state.orbs) {
      const base = orbBase(o.kind), top = orbTop(o.kind), p = 1 + Math.sin(now / 220 + o.pulse) * .12, x = o.x * kx, y = o.y * ky, w = base.width * p, h = base.height * p;
      ctx.drawImage(base, x - w / 2, y - h / 2, w, h);
      ctx.drawImage(top, Math.round(x - top.width / 2), Math.round(y - top.height / 2));
    }
    for (const p of state.powerups) {
      const pulse = 1 + Math.sin(now / 180 + p.pulse) * .16, c = POWERUPS[p.type] || '#fff', f = powerupFrame(p.type, c), l = powerupLabel(p.type, c);
      ctx.setTransform(kx, 0, 0, ky, 0, 0); ctx.translate(p.x, p.y); ctx.rotate(now / 800);
      ctx.drawImage(f.cv, f.x * pulse, f.y * pulse, f.w * pulse, f.h * pulse);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(l, Math.round(p.x * kx - l.width / 2), Math.round(p.y * ky - l.height / 2));
    }
    for (const p of state.players) {
      const v = players.get(p.id);
      if (!v) continue;
      const c = hue(v.hue), speed = Math.hypot(v.vx, v.vy), bounty = p.id === state.bountyId, a = Math.min(1, speed / 260);
      const tr = v.trail || (v.trail = []);
      if (tr.length && now - tr[0].t < SAMPLE_MS) { tr[0].x = v.x; tr[0].y = v.y; tr[0].a = a; }
      else tr.unshift({ x: v.x, y: v.y, t: now, a });
      while (tr.length > 1 && now - tr[tr.length - 1].t >= Math.max(trailMs, SAMPLE_MS)) tr.pop();
      if (speed > 25) {
        if (trailMs) drawTrail(v, c, trailMs, p.id === myId ? .72 : .42, now);
        const tail = Math.min(72, 20 + speed * .13);
        ctx.globalAlpha = .18 + Math.min(.28, speed / 850);
        if (full) {
          const tg = tailGlow(v.hue), f = tail / 72;
          ctx.setTransform(kx, 0, 0, ky, 0, 0); ctx.translate(v.x, v.y); ctx.rotate(Math.atan2(v.vy, v.vx));
          ctx.drawImage(tg.cv, tg.x * f, tg.y, tg.w * f, tg.h);
        }
        ctx.setTransform(kx, 0, 0, ky, 0, 0); ctx.strokeStyle = c.tail; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.x - v.vx / speed * tail, v.y - v.vy / speed * tail); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const r = rocket(v.hue, bounty);
      ctx.setTransform(kx, 0, 0, ky, 0, 0); ctx.translate(v.x, v.y); ctx.rotate(Math.atan2(v.vy, v.vx) || 0);
      ctx.drawImage(r.cv, r.x, r.y, r.w, r.h);
      if (speed > 12) {
        const len = 10 + Math.min(24, speed * .07), flicker = 1 + Math.sin(now / 55 + v.hue) * .18;
        if (full) { // glow sprite stretched from the flame's root (x = -17) to the live length
          const fg = flameGlow(), f = len * flicker / FLAME;
          ctx.drawImage(fg.cv, -17 + (fg.x + 17) * f, fg.y, fg.w * f, fg.h);
        }
        ctx.globalAlpha = .85; ctx.fillStyle = '#fff'; flame1(ctx, len, flicker);
        ctx.globalAlpha = .65; ctx.fillStyle = '#ff3155'; flame2(ctx, len);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(kx, 0, 0, ky, 0, 0);
      ctx.fillStyle = '#f7f9ff'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.name.slice(0, 10), v.x, v.y + 34);
      if (bounty) { ctx.fillStyle = '#ffb066'; ctx.font = LABEL_FONT; ctx.fillText('BOUNTY', v.x, v.y - 31); }
    }
    // pickup sparks move by real time, so they look the same at any frame rate
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 2.2;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      const img = spark(s.hue || 190), f = (3 + s.life * 2) / 5, w = img.width * f, h = img.height * f;
      ctx.globalAlpha = s.life; ctx.drawImage(img, s.x * kx - w / 2, s.y * ky - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  return {
    ctx,
    // cssW/cssH: the canvas's size on the page; pixelRatio: canvas pixels per CSS pixel
    resize(cssW, cssH, pixelRatio) {
      if (!(cssW > 0 && cssH > 0)) return false;
      const w = Math.max(1, Math.round(cssW * pixelRatio)), h = Math.max(1, Math.round(cssH * pixelRatio));
      if (w === canvas.width && h === canvas.height && bg) return false;
      canvas.width = w; canvas.height = h; kx = w / W; ky = h / H; bg = null; sprites.clear();
      return true;
    },
    setQuality(next) {
      if (next.glow && next.glow !== q.glow) sprites.clear();
      for (const k of ['glow', 'trails', 'particles']) if (next[k]) q[k] = next[k];
      if (!BURST[q.particles]) sparks.length = 0;
    },
    burst(x, y, h, random = Math.random) {
      for (let i = 0, n = BURST[q.particles] || 0; i < n && sparks.length < 240; i++) sparks.push({ x, y, vx: (random() - .5) * 220, vy: (random() - .5) * 220, life: 1, hue: h });
    },
    draw,
  };
}

window.OrbRenderer = { create };
})();

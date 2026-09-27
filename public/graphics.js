// OrBlitz graphics settings: quality presets, an Auto mode that adapts to the device while you play,
// a frame-rate limit and an FPS meter. Choices are remembered on each device.
const GFX = (() => {
const KEY = 'orblitz.gfx.v1';
const PRESETS = {
  ultra:  { res: 2,    glow: 'full',    trails: 'long',   particles: 'full', arena: true },
  high:   { res: 1.5,  glow: 'full',    trails: 'long',   particles: 'full', arena: true },
  medium: { res: 1.25, glow: 'reduced', trails: 'medium', particles: 'half', arena: false },
  low:    { res: .85,  glow: 'off',     trails: 'short',  particles: 'off',  arena: false },
};
const LADDER = ['ultra', 'high', 'medium', 'low']; // Auto moves along this, best first
const LABEL = { auto: 'Auto', ultra: 'Ultra', high: 'High', medium: 'Medium', low: 'Low', custom: 'Custom' };
const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];
const $ = id => document.getElementById(id);

// The kind of device decides where Auto starts and how high it may climb.
const coarse = matchMedia('(pointer: coarse)').matches, side = Math.min(screen.width, screen.height);
const kind = coarse ? (side < 600 ? 'phone' : 'tablet') : 'computer';
const cores = navigator.hardwareConcurrency || 4, memory = navigator.deviceMemory || 8;
const START = kind === 'phone' ? 2 : kind === 'tablet' ? (cores >= 8 ? 1 : 2) : (cores >= 4 && memory >= 4 ? 1 : 2);
const BEST = kind === 'phone' ? 1 : 0; // phones top out at High to spare battery and heat

let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
const opts = { preset: 'auto', fps: 'auto', showFps: false, ...PRESETS.high, ...saved };
delete opts.autoLevel;
let level = Number.isInteger(saved.autoLevel) ? Math.min(LADDER.length - 1, Math.max(BEST, saved.autoLevel)) : START;
let onBattery = false, refreshMs = 1000 / 60, listeners = [];
// frame pacing and Auto bookkeeping
let lastRaf = 0, lastDraw = 0, tick = 0, holdUntil = 0, good = 0;
const deltas = [], fails = {}, blockedUntil = {}, stats = { frames: 0, slow: 0, time: 0, work: 0 };

const native = () => Math.min(window.devicePixelRatio || 1, 2);
const hz = () => Math.round(1000 / refreshMs);
const fpsCap = () => opts.fps === 'auto' ? (kind !== 'computer' || onBattery ? 60 : 0) : +opts.fps || 0;
const skip = () => { const cap = fpsCap(); return cap ? Math.max(1, Math.floor(1000 / refreshMs / cap + .25)) : 1; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...opts, autoLevel: level })); } catch {} };

function current() {
  const name = opts.preset === 'auto' ? LADDER[level] : opts.preset;
  const p = opts.preset === 'custom' ? opts : PRESETS[name] || PRESETS.high;
  return { preset: opts.preset, level: name, res: p.res, pixelRatio: Math.min(native(), p.res), glow: p.glow, trails: p.trails, particles: p.particles, arena: p.arena, fpsCap: fpsCap(), showFps: opts.showFps };
}
function changed() {
  save();
  const s = current();
  $('arena')?.classList.toggle('fx', s.arena);
  $('fpsMeter')?.classList.toggle('hidden', !s.showFps);
  listeners.forEach(f => f(s));
  renderMenu();
}
function set(patch) { Object.assign(opts, patch); resetStats(); holdUntil = performance.now() + 2500; changed(); }
// Editing a single option turns the current preset into a Custom one
function custom(patch) { const s = current(); set({ preset: 'custom', res: s.res, glow: s.glow, trails: s.trails, particles: s.particles, arena: s.arena, ...patch }); }
function resetStats() { stats.frames = stats.slow = stats.time = stats.work = 0; }

// Call first thing in every animation frame; returns false for frames skipped by the frame-rate limit.
function frame(t) {
  const d = lastRaf ? t - lastRaf : 0;
  lastRaf = t;
  if (d > 0 && d < 100 && deltas.push(d) >= 120) learnRefresh(false);
  const n = skip();
  if (++tick % n) return false;
  const iv = lastDraw ? t - lastDraw : Infinity;
  lastDraw = t;
  if (iv > 250) { resetStats(); holdUntil = Math.max(holdUntil, t + 1500); return true; } // (re)starting: let caches warm up
  stats.frames++; stats.time += iv;
  if (iv > refreshMs * n * 1.5) stats.slow++; // missed at least one display refresh
  return true;
}
// Report how long drawing took (ms). About once a second Auto decides whether to step quality down or up.
function work(ms) {
  stats.work += ms;
  if (stats.time < 1000) return;
  const budget = refreshMs * skip(), slowRate = stats.slow / stats.frames, avg = stats.work / stats.frames;
  meter(stats.frames * 1000 / stats.time, avg);
  if (opts.preset === 'auto' && lastDraw > holdUntil) {
    if ((slowRate > .1 || avg > budget * .8) && level < LADDER.length - 1) {
      fails[level] = (fails[level] || 0) + 1;
      blockedUntil[level] = lastDraw + 20000 * fails[level]; // wait longer before retrying a level that failed
      step(level + 1);
    } else if (slowRate < .02 && avg < budget * .45 && level > BEST && (fails[level - 1] || 0) < 3 && lastDraw > (blockedUntil[level - 1] || 0)) {
      if (++good >= 5) step(level - 1); // five steady seconds with headroom
    } else good = 0;
  }
  resetStats();
}
function step(to) { level = to; good = 0; holdUntil = lastDraw + 2500; changed(); }

function meter(fps, ms) {
  const el = $('fpsMeter');
  if (!el || !opts.showFps) return;
  const s = current();
  el.textContent = `${Math.round(fps)} FPS · ${ms.toFixed(1)} ms · ${LABEL[s.level]}${opts.preset === 'auto' ? ' (Auto)' : ''} · ${+s.pixelRatio.toFixed(2)}× · ${hz()} Hz`;
}

// Display refresh rate: the fastest steady frame interval, snapped to a common rate. While playing it only moves
// toward faster rates, because slow frames there may be the game's fault rather than the display's.
function learnRefresh(idle) {
  deltas.sort((a, b) => a - b);
  const est = deltas[Math.floor(deltas.length * .2)], rate = 1000 / est;
  deltas.length = 0;
  const snap = RATES.reduce((a, b) => Math.abs(b - rate) < Math.abs(a - rate) ? b : a), ms = Math.abs(snap - rate) / snap < .08 ? 1000 / snap : est;
  if (idle || ms < refreshMs * .9) { refreshMs = ms; renderMenu(); }
}
function probe() { // measure on the menu screens, where drawing is light
  const d = [];
  let last = 0;
  const f = t => {
    if (last && t - last < 100) d.push(t - last);
    last = t;
    if (d.length < 45) return requestAnimationFrame(f);
    deltas.length = 0; deltas.push(...d); learnRefresh(true);
  };
  requestAnimationFrame(f);
}

function renderMenu() {
  const modal = $('gfxModal');
  if (!modal) return;
  const s = current(), n = native(), res = $('gfxRes');
  modal.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === opts.preset));
  const values = [...new Set([n, 2, 1.5, 1.25, 1, .85, .7].filter(v => v <= n + 1e-6))].sort((a, b) => b - a);
  res.innerHTML = values.map(v => `<option value="${v}">${v === n ? `Native (${+v.toFixed(2)}×)` : `${v}×`}</option>`).join('');
  res.value = String(values.reduce((a, b) => Math.abs(b - s.pixelRatio) < Math.abs(a - s.pixelRatio) ? b : a));
  $('gfxGlow').value = s.glow; $('gfxTrails').value = s.trails; $('gfxParticles').value = s.particles;
  $('gfxArena').value = s.arena ? 'on' : 'off'; $('gfxFps').value = String(opts.fps); $('gfxShowFps').checked = opts.showFps;
  $('gfxDevice').textContent = `This device: ${{ phone: 'phone', tablet: 'tablet', computer: 'computer' }[kind]} · ${hz()} Hz display · ${+n.toFixed(2)}× screen${onBattery ? ' · on battery' : ''}`;
  const limit = s.fpsCap ? `${s.fpsCap} FPS limit` : 'no FPS limit';
  $('gfxStatus').textContent = opts.preset === 'auto'
    ? `Auto is using ${LABEL[s.level]} (${+s.pixelRatio.toFixed(2)}× resolution, ${limit}) and adjusts while you play to keep the frame rate steady.`
    : `${LABEL[opts.preset]}: ${+s.pixelRatio.toFixed(2)}× resolution, ${limit}. Choose Auto to let the game adapt to this device.`;
}
function bindMenu() {
  const modal = $('gfxModal');
  if (!modal) return;
  const open = () => { renderMenu(); modal.classList.remove('hidden'); }, close = () => modal.classList.add('hidden');
  for (const id of ['gfxBtn', 'gfxLobby', 'gfxGame']) if ($(id)) $(id).onclick = open;
  $('closeGfx').onclick = $('closeGfx2').onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  modal.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => set({ preset: b.dataset.preset }));
  $('gfxRes').onchange = e => custom({ res: +e.target.value });
  $('gfxGlow').onchange = e => custom({ glow: e.target.value });
  $('gfxTrails').onchange = e => custom({ trails: e.target.value });
  $('gfxParticles').onchange = e => custom({ particles: e.target.value });
  $('gfxArena').onchange = e => custom({ arena: e.target.value === 'on' });
  $('gfxFps').onchange = e => set({ fps: e.target.value });
  $('gfxShowFps').onchange = e => set({ showFps: e.target.checked });
}

// On laptops, Auto limits to 60 FPS while running on battery
navigator.getBattery?.().then(b => { const u = () => { onBattery = !b.charging; changed(); }; b.addEventListener('chargingchange', u); u(); }, () => {});
bindMenu();
changed();
probe();

return {
  onChange(f) { listeners.push(f); f(current()); },
  current, frame, work,
};
})();

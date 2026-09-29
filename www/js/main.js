import { World } from './world.js?v=202609291751';
import { SwingDetector } from './motion.js?v=202609291751';
import { sfx } from './audio.js?v=202609291751';
import { haptics, hapticSettings } from './haptics.js?v=202609291751';

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NAMES = { glass: 'グラス', egg: '卵', can: '缶' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無視 */ } }
};

const world = new World($('#view'));
const det = new SwingDetector();
window.__bunnage = { world, det }; // 調整用

function resize() { world.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize); resize();

// ---------------- 状態 ----------------
let mode = 'stage';          // stage | item | play
let item = 'glass';
let holding = false, holdEnding = false;
let lockUntil = 0;           // 投擲完了までカメラとUIをロック
let permAsked = false;
let lastThrow = null;
let debugOn = false;

// ---------------- 画面遷移 ----------------
function show(id) {
  $('#stageScreen').hidden = id !== 'stage';
  $('#itemScreen').hidden = id !== 'item';
  $('#hud').hidden = id !== 'play';
  mode = id;
}

async function enterStage(type) {
  sfx.unlock();
  if (!permAsked) { permAsked = true; await det.requestPermission(); det.start(); }
  if (type === 'photo' && !world.photoTex) {
    const note = $('#photoNote'), btn = $('#stagePhoto');
    btn.disabled = true; note.textContent = '写真を読み込み中…';
    try {
      [world.photoTex, world.photoItemsTex] = await Promise.all([
        World.loadPhoto('./assets/real-kitchen/front120.jpg'),
        World.loadPhoto('./assets/real-kitchen/front120_items.jpg').catch(() => null)
      ]);
      world.photoBounds = await fetch('./assets/real-kitchen/photo.json').then(r => r.json()).then(j => j.bounds).catch(() => null);
    }
    catch (e) { note.textContent = '写真を読み込めませんでした。もう一度押してください'; btn.disabled = false; return; }
    btn.disabled = false; note.textContent = '正面だけ見られる、写真の台所（試作）';
  }
  world.reset(type);
  world.yaw = 0; world.pitch = type === 'photo' ? 0 : -0.12;
  show('item');
}
$('#stageKitchen').addEventListener('click', () => enterStage('cg'));
$('#stagePhoto').addEventListener('click', () => enterStage('photo'));

document.querySelectorAll('#itemScreen [data-kind]').forEach(b => b.addEventListener('click', () => {
  sfx.unlock();
  setItem(b.dataset.kind, false);
  show('play');
  if (!store.get('bunnage_tut')) $('#tutorial').hidden = false;
  setTimeout(checkSensors, 1500);
}));

function setItem(kind, tick = true) {
  if (item === kind && world.heldKind === kind) return;
  item = kind;
  world.equip(kind);
  $('#itemBtn use').setAttribute('href', '#i-' + kind);
  $('#itemName').textContent = NAMES[kind];
  if (tick) haptics.tick();
}

function checkSensors() {
  if (mode !== 'play') return;
  const n = $('#notice');
  if (!det.hasMotion) {
    n.textContent = '振りセンサーが使えない環境です（https以外のページやPCなど）。テスト用に、押さえたまま指を払っても投げられます。';
    n.hidden = false;
  } else n.hidden = true;
}

// ---------------- 投擲 ----------------
det.onRelease = (sw) => {
  if (!world.heldMesh) return;
  haptics.release(sw.power);          // 最優先：手から離れた感覚
  world.throwHeld(sw);
  sfx.whoosh(sw.power);
  lastThrow = sw;
  window.__bunnage.throws = (window.__bunnage.throws || 0) + 1;
  lockUntil = performance.now() + 450;
  document.body.classList.add('locked');
  if (holdEnding) endHold();
};

function startHold() {
  holding = true; holdEnding = false;
  document.body.classList.add('holding');
  world.setHold(true);
  haptics.hold(); sfx.grab();
  if (!$('#tutorial').hidden) { $('#tutorial').hidden = true; store.set('bunnage_tut', '1'); }
  if (world.handReady) det.arm();
}
function endHold() {
  holding = false; holdEnding = false;
  det.disarm();
  world.setHold(false);
  document.body.classList.remove('holding');
}

// ---------------- タッチ（HOLD とカメラ） ----------------
const touch = $('#touch');
let ptr = null; // {id, x, y, t, kind: 'pending'|'hold'|'cam', hist}
const HOLD_DELAY = 130, MOVE_TOL = 12;

function inHoldZone(x, y) {
  const w = window.innerWidth, h = window.innerHeight;
  return x > w * 0.12 && x < w * 0.88 && y > h * 0.2 && y < h - 110;
}
function camLocked() { return holding || performance.now() < lockUntil; }

touch.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || ptr) return;
  sfx.unlock();
  try { touch.setPointerCapture(e.pointerId); } catch (_) { /* 無視 */ }
  const now = performance.now();
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: now, kind: 'cam', hist: [[e.clientX, e.clientY, now]], peak: 0 };
  if (inHoldZone(e.clientX, e.clientY)) {
    ptr.kind = 'pending';
    ptr.timer = setTimeout(() => { if (ptr && ptr.kind === 'pending') { ptr.kind = 'hold'; ptr.hx = ptr.lx; ptr.hy = ptr.ly; startHold(); } }, HOLD_DELAY);
  }
});

touch.addEventListener('pointermove', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const now = performance.now();
  const dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly;
  ptr.lx = e.clientX; ptr.ly = e.clientY;
  if (ptr.kind === 'pending' && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > MOVE_TOL) { clearTimeout(ptr.timer); ptr.kind = 'cam'; }
  if (ptr.kind === 'cam') {
    if (camLocked()) return;
    const L = world.viewLimits();
    [world.yaw, world.pitch] = world.clampView(
      clamp(world.yaw + dx * 0.0048, -L.yaw, L.yaw),
      clamp(world.pitch + dy * 0.0048, L.pitchMin, L.pitchMax));
  } else if (ptr.kind === 'hold' && !det.hasMotion && det.armed) {
    // センサーなしのテスト用：払う速さのピークを過ぎたら投げる
    ptr.hist.push([e.clientX, e.clientY, now]);
    while (ptr.hist.length && now - ptr.hist[0][2] > 90) ptr.hist.shift();
    const h0 = ptr.hist[0];
    const sp = Math.hypot(e.clientX - h0[0], e.clientY - h0[1]) / Math.max(16, now - h0[2]);
    const travel = Math.hypot(e.clientX - ptr.hx, e.clientY - ptr.hy);
    if (sp > ptr.peak) { ptr.peak = sp; ptr.pdx = e.clientX - ptr.hx; ptr.pdy = e.clientY - ptr.hy; }
    if (travel > 40 && ptr.peak > 0.5 && sp < ptr.peak * 0.55) {
      det.simulate(ptr.pdx, ptr.pdy, ptr.peak);
      ptr.hx = e.clientX; ptr.hy = e.clientY; ptr.peak = 0;
    }
  }
});

function pointerEnd(e) {
  if (!ptr || e.pointerId !== ptr.id) return;
  clearTimeout(ptr.timer);
  if (ptr.kind === 'hold') {
    // 振っている最中に指が浮いても、振り切りまでは待つ
    if (det.swinging) { holdEnding = true; setTimeout(() => { if (holdEnding) endHold(); }, 400); }
    else endHold();
  }
  ptr = null;
}
touch.addEventListener('pointerup', pointerEnd);
touch.addEventListener('pointercancel', pointerEnd);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------- アイテムのダイヤル ----------------
const dial = $('#dial');
const dialItems = [...dial.querySelectorAll('.dial-item')];
$('#itemBtn').addEventListener('click', () => {
  if (holding) return;
  $('#carousel').hidden = false;
  const el = dialItems.find(d => d.dataset.kind === item);
  dial.scrollLeft = el.offsetLeft - (dial.clientWidth - el.clientWidth) / 2;
  markDial();
});
function markDial() {
  const mid = dial.scrollLeft + dial.clientWidth / 2;
  let best = null, bd = 1e9;
  for (const d of dialItems) { const c = d.offsetLeft + d.clientWidth / 2, dd = Math.abs(c - mid); if (dd < bd) { bd = dd; best = d; } }
  dialItems.forEach(d => d.classList.toggle('on', d === best));
  if (best && best.dataset.kind !== item) setItem(best.dataset.kind);
}
dial.addEventListener('scroll', markDial, { passive: true });
dialItems.forEach(d => d.addEventListener('click', (e) => {
  e.stopPropagation();
  if (d.classList.contains('on')) { $('#carousel').hidden = true; return; }
  dial.scrollTo({ left: d.offsetLeft - (dial.clientWidth - d.clientWidth) / 2, behavior: 'smooth' });
}));
$('#carousel').addEventListener('click', (e) => { if (e.target === $('#carousel')) $('#carousel').hidden = true; });

// ---------------- メニュー ----------------
$('#menuBtn').addEventListener('click', () => {
  if (holding) return;
  const k = haptics.kind;
  $('#hapNote').textContent = k === 'native' ? '振動：アプリ（Core Haptics）' : k === 'vibrate' ? '振動：ブラウザの振動機能' : 'この環境では振動は出ません（iPhoneのブラウザなど）。アプリ版で動きます。';
  $('#menu').hidden = false;
});
$('#mClose').addEventListener('click', () => { $('#menu').hidden = true; });
$('#menu').addEventListener('click', (e) => { if (e.target === $('#menu')) $('#menu').hidden = true; });
function sw(el, on) { el.setAttribute('aria-checked', on ? 'true' : 'false'); }
$('#mHit').addEventListener('click', () => { hapticSettings.hit = !hapticSettings.hit; sw($('#mHit'), hapticSettings.hit); });
$('#mBreak').addEventListener('click', () => { hapticSettings.break = !hapticSettings.break; sw($('#mBreak'), hapticSettings.break); });
$('#mDebug').addEventListener('click', () => { debugOn = !debugOn; sw($('#mDebug'), debugOn); $('#debug').hidden = !debugOn; });
$('#mClean').addEventListener('click', () => { $('#menu').hidden = true; $('#confirm').hidden = false; });
$('#cCancel').addEventListener('click', () => { $('#confirm').hidden = true; });
$('#cOk').addEventListener('click', () => {
  $('#confirm').hidden = true;
  const f = $('#fade'); f.classList.add('on');
  setTimeout(() => { world.reset(); world.equip(item); setTimeout(() => f.classList.remove('on'), 120); }, 320);
});
$('#mStage').addEventListener('click', () => { $('#menu').hidden = true; endHold(); show('stage'); });

// ---------------- 調整用の表示 ----------------
function renderDebug() {
  const d = det.debug;
  const t = lastThrow;
  const lines = [
    `センサー  ${det.hasMotion ? 'OK' : 'なし'}  姿勢 ${det.orientOK ? 'OK' : 'なし'}  符号 ${det.signFix}`,
    `加速度 ${d.acc.toFixed(1).padStart(5)} m/s²  回転 ${Math.round(d.rot).toString().padStart(4)} °/s`,
    `状態 ${holding ? (det.swinging ? 'スイング中' : det.armed ? 'HOLD' : 'HOLD（補充待ち）') : '待機'}`,
    t ? `前回 ${t.cls}  速さ ${t.speed.toFixed(2)} m/s  強さ ${(t.power * 100) | 0}` : '前回 —',
    t ? `方向 左右 ${Math.round(t.yaw / D2R)}°  上下 ${Math.round(t.pitch / D2R)}°` : '',
    `振動 ${haptics.kind}`
  ];
  $('#debug').innerHTML = lines.join('\n') + `<span class="bar" style="width:${Math.min(100, d.acc / 25 * 100)}%"></span>`;
}

// ---------------- ループ ----------------
let prev = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - prev) / 1000); prev = now;
  // 補充されたら、押さえたままなら次の投擲を受け付ける
  if (holding && !det.armed && world.handReady && now > lockUntil) { det.arm(); haptics.hold(); }
  if (!holding && now > lockUntil) document.body.classList.remove('locked');
  world.update(dt);
  if (debugOn && mode === 'play') renderDebug();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('stage');

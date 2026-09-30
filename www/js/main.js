import { World, STAGE_ITEMS, ITEM_NAMES } from './world.js?v=202609301324';
import { SwingDetector } from './motion.js?v=202609301324';
import { sfx } from './audio.js?v=202609301324';
import { haptics, hapticSettings } from './haptics.js?v=202609301324';

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NAMES = ITEM_NAMES;
const ITEM_SOUND = { glass: 'パリーン', egg: 'ベチャッ', can: 'カンッ', bottle: 'ガシャン', paint: 'バシャッ', pot: 'ゴシャッ', phone: 'バキッ', tomato: 'グシャッ', chuhai: 'ベコッ' };
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
let mode = 'title';          // title | mode | stage | item | hammer | play
let item = 'glass';
let holding = false, holdEnding = false;
let lockUntil = 0;           // 投擲完了までカメラとUIをロック
let permAsked = false;
let lastThrow = null;
let debugOn = false;

// ---------------- 画面遷移 ----------------
function show(id) {
  const prev = mode;
  $('#titleScreen').hidden = id !== 'title';
  $('#modeScreen').hidden = id !== 'mode';
  $('#stageScreen').hidden = id !== 'stage';
  $('#itemScreen').hidden = id !== 'item';
  $('#hammerScreen').hidden = id !== 'hammer';
  $('#hud').hidden = id !== 'play';
  mode = id;
  // メニュー画面はブラウン管が点くように出す
  const el = { mode: '#modeScreen', stage: '#stageScreen', item: '#itemScreen', hammer: '#hammerScreen' }[id];
  if (el && prev !== id) { const e = $(el); e.classList.remove('power-on'); void e.offsetWidth; e.classList.add('power-on'); }
}

// ---------------- タイトル：タップするとロゴにひびが入って割れる ----------------
let titleBusy = false;
function crackPaths(cx, cy) {
  let d = '';
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + Math.random() * 0.5;
    let x = cx, y = cy; d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const len = 12 + Math.random() * 22;
    for (let s = 0; s < 5; s++) { const r = len / 5; x += Math.cos(a + (Math.random() - 0.5) * 0.7) * r; y += Math.sin(a + (Math.random() - 0.5) * 0.7) * r * 1.2; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
  }
  // 中心のまわりの輪っか状のひび
  for (const rr of [5, 11]) { d += ` M${(cx + rr).toFixed(1)} ${cy.toFixed(1)}`; for (let k = 1; k <= 12; k++) { const a = k / 12 * Math.PI * 2; d += ` L${(cx + Math.cos(a) * rr * (0.8 + Math.random() * 0.4)).toFixed(1)} ${(cy + Math.sin(a) * rr * 1.2 * (0.8 + Math.random() * 0.4)).toFixed(1)}`; } }
  return d;
}
function shatterTitle(ev) {
  if (titleBusy) return; titleBusy = true;
  sfx.unlock(); sfx.coin();
  const scr = $('#titleScreen'), logo = $('#tLogo'), svg = $('#tCrack');
  const box = logo.getBoundingClientRect(), sbox = svg.getBoundingClientRect(), scb = scr.getBoundingClientRect();
  // ひびの中心：タップした所（ロゴの外なら中心あたり）
  let px = ev && ev.clientX != null ? ev.clientX : box.left + box.width / 2, py = ev && ev.clientY != null ? ev.clientY : box.top + box.height / 2;
  if (px < box.left || px > box.right || py < box.top || py > box.bottom) { px = box.left + box.width / 2; py = box.top + box.height * 0.45; }
  const cx = (px - sbox.left) / sbox.width * 100, cy = (py - sbox.top) / sbox.height * 100;
  setTimeout(() => {
    svg.innerHTML = `<path d="${crackPaths(cx, cy)}"/>`;
    const path = svg.querySelector('path'), L = 2000;
    path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
    path.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    sfx.glass(0.5); sfx.knock(6, 0.5);
  }, 260);
  setTimeout(() => {
    // ロゴを放射状のかけらに分けて、飛び散らせる
    const lx = (px - box.left) / box.width * 100, ly = (py - box.top) / box.height * 100;
    const N = 10, rim = [];
    const corner = [[102, -2], [102, 102], [-2, 102], [-2, -2]];
    for (let k = 0; k < N; k++) {
      const t = k / N * 4, side = Math.floor(t), f = Math.min(1, Math.max(0, t - side + (Math.random() - 0.5) * 0.12));
      rim.push({ side, p: side === 0 ? [f * 104 - 2, -2] : side === 1 ? [102, f * 104 - 2] : side === 2 ? [102 - f * 104, 102] : [-2, 102 - f * 104] });
    }
    for (let k = 0; k < N; k++) {
      const a = rim[k], b = rim[(k + 1) % N];
      const pts = [[lx, ly], a.p];
      // 辺をまたぐかけらは角も含める
      let sd = a.side; while (sd !== b.side) { pts.push(corner[sd]); sd = (sd + 1) % 4; }
      pts.push(b.p);
      const c = logo.cloneNode(true); c.removeAttribute('id'); c.classList.add('t-shard');
      c.style.cssText = `left:${box.left - scb.left}px;top:${box.top - scb.top}px;width:${box.width}px;height:${box.height}px;margin:0;clip-path:polygon(${pts.map(p => p[0].toFixed(1) + '% ' + p[1].toFixed(1) + '%').join(',')})`;
      scr.appendChild(c);
      const mx = (a.p[0] + b.p[0]) / 2 - lx, my = (a.p[1] + b.p[1]) / 2 - ly, m = Math.hypot(mx, my) || 1;
      const dx = mx / m * (60 + Math.random() * 120), dy = my / m * 60 + 380 + Math.random() * 200, rot = (Math.random() - 0.5) * 80;
      c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx * 0.3}px,${my / m * 20 - 30}px) rotate(${rot * 0.3}deg)`, opacity: 1, offset: 0.25 }, { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)`, opacity: 0 }], { duration: 900 + Math.random() * 250, easing: 'cubic-bezier(.3,0,.9,.6)', fill: 'forwards' });
    }
    scr.classList.add('broken'); svg.innerHTML = '';
    sfx.glass(1); setTimeout(() => sfx.glass(0.7), 70); setTimeout(() => sfx.ceramic(0.6), 150);
    $('#tFlash').animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }, 700);
  setTimeout(() => {
    show('mode');
    scr.classList.remove('broken'); scr.querySelectorAll('.t-shard').forEach(e => e.remove());
    titleBusy = false;
  }, 1750);
}
$('#titleScreen').addEventListener('click', shatterTitle);
// メニューのボタンはピッと鳴って一瞬光る
document.addEventListener('click', (e) => {
  const b = e.target.closest('.screen.arcade button, .arcade-sheet button');
  if (!b) return;
  sfx.unlock(); sfx.blip();
  b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180);
}, true);

const TUT_THROW = 'ここを押さえたまま、<br>スマホを振ってみよう';
const TUT_HAMMER = 'ここを押さえたまま、<br>スマホを振り下ろしてみよう';
async function enterStage(type, hammerKind) {
  sfx.unlock();
  if (!permAsked) { permAsked = true; await det.requestPermission(); det.start(); }
  if (hammerKind) world.hammerKind = hammerKind;
  world.reset(type);
  world.yaw = 0; world.pitch = type === 'warehouse' ? -0.04 : type === 'car' ? -0.24 : type === 'hammer' ? world.hammerPitch : type === 'street' ? 0.02 : type === 'train' ? -0.04 : -0.12;
  const hammer = type === 'hammer';
  $('#wheel').hidden = hammer; $('#walkHint').hidden = !hammer;
  $('#tutorial').innerHTML = hammer ? TUT_HAMMER : TUT_THROW;
  if (hammer) {
    // 手に持つのはハンマーだけ。アイテム選択は飛ばす
    item = 'hammer'; world.equip('hammer');
    show('play');
    if (!store.get('bunnage_tut_hammer')) $('#tutorial').hidden = false;
    setTimeout(checkSensors, 1500);
  } else { setupItems(type); show('item'); }
}
document.querySelectorAll('#hammerScreen [data-hk]').forEach(b => b.addEventListener('click', () => enterStage('hammer', b.dataset.hk)));
$('#hammerBack').addEventListener('click', () => show('mode'));
$('#stageBack').addEventListener('click', () => show('mode'));
document.querySelectorAll('#modeScreen [data-mode]').forEach(b => b.addEventListener('click', () => show(b.dataset.mode === 'hammer' ? 'hammer' : 'stage')));
$('#itemBack').addEventListener('click', () => show('stage'));
$('#stageKitchen').addEventListener('click', () => enterStage('cg'));
$('#stageWarehouse').addEventListener('click', () => enterStage('warehouse'));
$('#stageCar').addEventListener('click', () => enterStage('car'));
$('#stageStreet').addEventListener('click', () => enterStage('street'));
$('#stageTrain').addEventListener('click', () => enterStage('train'));
if (/[?&]car\b/.test(location.search)) $('#stageCar').hidden = false; // 隠しステージ

// ステージに合わせて、投げる物の選択肢とダイヤルを入れ替える
function setupItems(type) {
  const items = STAGE_ITEMS[type] || STAGE_ITEMS.cg;
  $('#itemScreen .pick').innerHTML = items.map(k => `<button data-kind="${k}" type="button"><svg><use href="#i-${k}"/></svg>${NAMES[k]}<small>${ITEM_SOUND[k]}</small></button>`).join('');
  wBuild(items.concat(items));
}
$('#itemScreen .pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  sfx.unlock();
  setItem(b.dataset.kind, false); wShow(b.dataset.kind);
  show('play');
  if (!store.get('bunnage_tut')) $('#tutorial').hidden = false;
  setTimeout(checkSensors, 1500);
});

function setItem(kind, tick = true) {
  if (item === kind && world.heldKind === kind) return;
  item = kind;
  world.equip(kind);
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
  if (world.heldKind === 'hammer') {
    // 振動は当たった瞬間に出す
    world.swingHammer(sw); sfx.whoosh(sw.power * 0.8);
    lastThrow = sw;
    lockUntil = performance.now() + 450;
    document.body.classList.add('locked');
    if (holdEnding) endHold();
    return;
  }
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
  if (!$('#tutorial').hidden) { $('#tutorial').hidden = true; store.set(world.stageType === 'hammer' ? 'bunnage_tut_hammer' : 'bunnage_tut', '1'); }
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
  return x > w * 0.12 && x < w * 0.88 && y > h * 0.2 && y < h - 175;
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
    if (world.stageType === 'hammer') {
      // 左右：対象のまわりを歩く。上下：見上げる／見下ろす
      world.orbitA -= dx * 0.006;
      world.pitch = clamp(world.pitch + dy * 0.0048, L.pitchMin, L.pitchMax);
      return;
    }
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
// 回すダイヤル：下から半分のぞく円盤に投げる物が並ぶ。指で円をなぞるように回すと、慣性でくるくる回って一番上の物で止まる
const WHEEL = { slots: [], step: 60, R: 104, cx: 170, cy: 188 };
const wheelEl = $('#wheel'), wheelDisc = $('#wheelDisc'), wheelItems = $('#wheelItems');
let wAngle = 0, wVel = 0, wDrag = null, wAnim = false, wLastIdx = 0;
let wEls = [];
function wBuild(slots) {
  WHEEL.slots = slots; wheelItems.innerHTML = '';
  wEls = slots.map(k => { const d = document.createElement('div'); d.className = 'w-item'; d.innerHTML = `<svg><use href="#i-${k}"/></svg>`; wheelItems.appendChild(d); return d; });
}
function wIndex(a) { const n = WHEEL.slots.length; return ((Math.round(-a / WHEEL.step) % n) + n) % n; }
function wRender() {
  wheelDisc.style.transform = `rotate(${wAngle}deg)`;
  const idx = wIndex(wAngle);
  wEls.forEach((el, k) => {
    const th = (k * WHEEL.step + wAngle) * D2R;
    const x = Math.sin(th) * WHEEL.R, y = -Math.cos(th) * WHEEL.R;
    const near = Math.max(0, Math.cos(th));
    el.style.transform = `translate(${x}px,${y}px) scale(${0.62 + 0.5 * Math.pow(near, 3)})`;
    el.style.opacity = (0.25 + 0.75 * Math.pow(near, 4)).toFixed(2);
    el.classList.toggle('on', k === idx);
  });
  if (idx !== wLastIdx) { wLastIdx = idx; sfx.tick ? sfx.tick() : sfx.blip(); $('#itemName').textContent = NAMES[WHEEL.slots[idx]]; }
}
function wAngleAt(e) { const r = wheelEl.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + WHEEL.cx), -(e.clientY - (r.top + WHEEL.cy))) / D2R; }
wheelEl.addEventListener('pointerdown', (e) => {
  if (holding) return;
  sfx.unlock();
  try { wheelEl.setPointerCapture(e.pointerId); } catch (_) { /* 無視 */ }
  wDrag = { id: e.pointerId, a: wAngleAt(e), t: performance.now(), x: e.clientX, y: e.clientY, moved: 0 };
  wVel = 0; wAnim = false;
});
wheelEl.addEventListener('pointermove', (e) => {
  if (!wDrag || e.pointerId !== wDrag.id) return;
  const a = wAngleAt(e), now = performance.now();
  let d = a - wDrag.a; if (d > 180) d -= 360; if (d < -180) d += 360;
  wAngle += d; wDrag.moved += Math.abs(d);
  const dt = Math.max(8, now - wDrag.t); wVel = wVel * 0.5 + (d / dt * 16) * 0.5;
  wDrag.a = a; wDrag.t = now;
  wRender();
});
function wEnd(e) {
  if (!wDrag || e.pointerId !== wDrag.id) return;
  const tap = wDrag.moved < 3;
  wDrag = null;
  if (tap) {
    // 横の物をタップしたら、そこまで回す
    const r = wheelEl.getBoundingClientRect(), x = e.clientX - (r.left + WHEEL.cx);
    if (Math.abs(x) > 45) { wSnapTo(Math.round(wAngle / WHEEL.step) * WHEEL.step - Math.sign(x) * WHEEL.step); return; }
  }
  wAnim = true; requestAnimationFrame(wSpin);
}
wheelEl.addEventListener('pointerup', wEnd); wheelEl.addEventListener('pointercancel', wEnd);
function wSpin() {
  if (!wAnim) return;
  wAngle += wVel; wVel *= 0.93;
  if (Math.abs(wVel) < 0.6) { wSnapTo(Math.round(wAngle / WHEEL.step) * WHEEL.step); return; }
  wRender(); requestAnimationFrame(wSpin);
}
function wSnapTo(target) {
  wAnim = true; const from = wAngle, t0 = performance.now();
  const go = (now) => {
    if (!wAnim) return;
    const k = Math.min(1, (now - t0) / 220), e2 = 1 - Math.pow(1 - k, 3);
    wAngle = from + (target - from) * e2; wRender();
    if (k < 1) requestAnimationFrame(go); else { wAnim = false; setItem(WHEEL.slots[wIndex(wAngle)]); }
  };
  requestAnimationFrame(go);
}
function wShow(kind) { const k = WHEEL.slots.indexOf(kind); wAngle = -k * WHEEL.step; wLastIdx = wIndex(wAngle); wRender(); $('#itemName').textContent = NAMES[kind]; }

// ---------------- メニュー ----------------
$('#menuBtn').addEventListener('click', () => {
  if (holding) return;
  $('#menu').hidden = false;
});
$('#mClose').addEventListener('click', () => { $('#menu').hidden = true; });
$('#menu').addEventListener('click', (e) => { if (e.target === $('#menu')) $('#menu').hidden = true; });
function sw(el, on) { el.setAttribute('aria-checked', on ? 'true' : 'false'); }
$('#mDebug').addEventListener('click', () => { debugOn = !debugOn; sw($('#mDebug'), debugOn); $('#debug').hidden = !debugOn; });
$('#mClean').addEventListener('click', () => { $('#menu').hidden = true; $('#confirm').hidden = false; });
$('#cCancel').addEventListener('click', () => { $('#confirm').hidden = true; });
$('#cOk').addEventListener('click', () => {
  $('#confirm').hidden = true;
  const f = $('#fade'); f.classList.add('on');
  setTimeout(() => { world.reset(); world.equip(item); setTimeout(() => f.classList.remove('on'), 120); }, 320);
});
$('#mStage').addEventListener('click', () => { $('#menu').hidden = true; endHold(); show(world.stageType === 'hammer' ? 'hammer' : 'stage'); });

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
  if (mode === 'play') world.update(dt); // メニュー中は3Dを止める（画面は不透明）
  if (debugOn && mode === 'play') renderDebug();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('title');

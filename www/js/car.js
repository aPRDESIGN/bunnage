// 壊せる車：凹むボディ、割れるガラス、ライト、ミラー、防犯アラーム
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as TX from './textures.js?v=202609300334';
import { sfx } from './audio.js?v=202609300334';
import { haptics } from './haptics.js?v=202609300334';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- 車の形（ローカル座標：x=前後（前が−）、y=上、z=左右） ----
const HALF = 2.25, BOT = 0.26, WB = 0.89, PE = 0.3;
const TOPS = [[-2.25, 0.72], [-2.12, 0.84], [-1.9, 0.9], [-1.18, 0.98], [-0.55, 1.42], [0.78, 1.45], [1.42, 1.04], [2.05, 0.99], [2.25, 0.8]];
function top(x) {
  for (let i = 1; i < TOPS.length; i++) if (x <= TOPS[i][0]) {
    const a = TOPS[i - 1], b = TOPS[i], u = (x - a[0]) / (b[0] - a[0]);
    return lerp(a[1], b[1], (1 - Math.cos(u * Math.PI)) / 2);
  }
  return TOPS[TOPS.length - 1][1];
}
const sp = (t) => Math.sign(t) * Math.pow(Math.abs(t), PE);
function halfW(x, y) {
  const T = top(x), cab = T > 1.12;
  const k = cab ? clamp((y - 0.98) / (T - 0.98), 0, 1) : 0;
  let w = lerp(WB, 0.74, k * k);
  const e = Math.min(1, (HALF - Math.abs(x)) / 0.4);
  return w * (0.84 + 0.16 * Math.sqrt(Math.max(0, e)));
}
function shellPoint(x, phi, out = new THREE.Vector3()) {
  const T = top(x), mid = (T + BOT) / 2, hh = (T - BOT) / 2;
  const y = mid + hh * sp(Math.sin(phi));
  return out.set(x, y, halfW(x, y) * sp(Math.cos(phi)));
}
// 高さyに対応する角度（+z側）
function phiAtY(x, y, side) {
  const T = top(x), mid = (T + BOT) / 2, hh = (T - BOT) / 2;
  const q = clamp((y - mid) / hh, -1, 1);
  const s = Math.sign(q) * Math.pow(Math.abs(q), 1 / PE);
  const a = Math.asin(clamp(s, -1, 1));
  return side > 0 ? a : Math.PI - a;
}
const SIDE_WINDOWS = [
  { id: 'fr', x0: -0.6, x1: 0.26, side: 1 }, { id: 'rr', x0: 0.42, x1: 1.28, side: 1 },
  { id: 'fl', x0: -0.6, x1: 0.26, side: -1 }, { id: 'rl', x0: 0.42, x1: 1.28, side: -1 }
];
const PHI_A = Math.acos(0.72);
function isWindow(x, y, phi) {
  const T = top(x); if (T < 1.15) return false;
  const c = Math.cos(phi), s = Math.sin(phi);
  if (x > -1.16 && x < -0.6 && s > 0.3 && Math.abs(c) < 0.72) return true;   // フロント
  if (x > 0.82 && x < 1.38 && s > 0.3 && Math.abs(c) < 0.72) return true;    // リア
  if (Math.abs(c) > 0.3 && y > 1.04 && y < T - 0.07 && ((x > -0.6 && x < 0.26) || (x > 0.42 && x < 1.28))) return true;
  return false;
}

const PAINTS = ['#e8e9e6', '#8c1c1c', '#2d3e55', '#1a1a1c', '#b9bec2'];
let paintIdx = 0;

export class Car {
  constructor(world, pos, yaw, opts = {}) {
    this.world = world;
    this.home = pos.clone(); this.yaw = yaw;
    this.group = new THREE.Group(); this.group.position.copy(pos); this.group.rotation.y = yaw;
    world.stage.add(this.group);
    this.paint = new THREE.Color(PAINTS[paintIdx++ % PAINTS.length]);
    this.bodies = []; this.mirrors = []; this.panes = {}; this.lights = {};
    this.dents = 0; this.lastHit = 0; this.alarmStop = null; this.alarmUntil = 0; this.blink = 0;
    this._shell(); this._glass(); this._details();
    this.group.updateMatrixWorld(true);
    this.arrive = opts.arrive ? { t: 0 } : null;
    if (this.arrive) { this.group.position.copy(this._offsetPos(-9)); }
    else this._addBodies();
  }

  _offsetPos(d) {
    // 車の前方（ローカル−x）にdだけずらした位置
    const f = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return this.home.clone().addScaledVector(f, -d);
  }

  // ---- ボディ（細かい網目で、どこでも凹む） ----
  _shell() {
    const NX = 110, M = 72;
    const pos = [], col = [], idx = [];
    const p = new THREE.Vector3(), c = new THREE.Color();
    const dark = new THREE.Color('#0d0f12'), trim = new THREE.Color('#26282b'), grille = new THREE.Color('#141516');
    for (let i = 0; i <= NX; i++) {
      const x = -HALF + (i / NX) * HALF * 2;
      for (let j = 0; j < M; j++) {
        const phi = (j / M) * Math.PI * 2;
        shellPoint(x, phi, p); pos.push(p.x, p.y, p.z);
        if (isWindow(x, p.y, phi)) c.copy(dark);
        else if (p.y < 0.38) c.copy(trim);
        else if (x < -2.12 && p.y > 0.42 && p.y < 0.66 && Math.abs(p.z) < 0.5) c.copy(grille);
        else c.copy(this.paint);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M, cI = (i + 1) * M + (j + 1) % M, d = (i + 1) * M + j;
      idx.push(a, b, cI, a, cI, d);
    }
    // 前後のふた
    for (const [i, flip] of [[0, true], [NX, false]]) {
      const x = -HALF + (i / NX) * HALF * 2, ci = pos.length / 3;
      pos.push(x, (top(x) + BOT) / 2, 0); col.push(trim.r, trim.g, trim.b);
      for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + (j + 1) % M; flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
    this.shell = new THREE.Mesh(g, mat); this.shell.castShadow = true; this.shell.receiveShadow = true;
    this.group.add(this.shell);
  }

  // ---- ガラス（ボディの面に沿った曲面） ----
  _glass() {
    const mat = new THREE.MeshStandardMaterial({ color: '#23323c', roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.62, envMapIntensity: 2.2, side: THREE.DoubleSide });
    const make = (id, fn, U, V, type) => {
      const pos = [], idx = [];
      const q = new THREE.Vector3();
      for (let a = 0; a <= U; a++) for (let b = 0; b <= V; b++) { fn(a / U, b / V, q); pos.push(q.x, q.y, q.z); }
      for (let a = 0; a < U; a++) for (let b = 0; b < V; b++) { const i0 = a * (V + 1) + b, i1 = (a + 1) * (V + 1) + b; idx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); this.group.add(m);
      // 当たり判定用：中心・向き・大きさ
      const cen = new THREE.Vector3(), n = new THREE.Vector3(), t0 = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
      fn(0.5, 0.5, cen); fn(0.5 + 0.01, 0.5, t1); fn(0.5, 0.5 + 0.01, t2);
      const du = t1.clone().sub(cen).normalize(), dv = t2.clone().sub(cen).normalize();
      n.crossVectors(du, dv).normalize(); if (n.dot(new THREE.Vector3(0, cen.y - 0.8, cen.z)) < 0) n.negate();
      fn(0, 0.5, t0); fn(1, 0.5, t1); const w = t0.distanceTo(t1);
      fn(0.5, 0, t0); fn(0.5, 1, t1); const h = t0.distanceTo(t1);
      this.panes[id] = { id, mesh: m, type, broken: false, cracks: 0, center: cen, normal: n, du, w, h };
    };
    const off = (x, phi, q, k = 0.012) => { shellPoint(x, phi, q); const n2 = shellPoint(x, phi + 0.01, new THREE.Vector3()).sub(q); const n1 = shellPoint(x + 0.01, phi, new THREE.Vector3()).sub(q); const n = new THREE.Vector3().crossVectors(n1, n2).normalize(); const outward = new THREE.Vector3(0, q.y - 0.8, q.z); if (n.dot(outward) < 0) n.negate(); return q.addScaledVector(n, k); };
    make('front', (u, v, q) => off(lerp(-1.14, -0.62, v), lerp(PHI_A + 0.02, Math.PI - PHI_A - 0.02, u), q), 14, 10, 'laminated');
    make('rear', (u, v, q) => off(lerp(0.84, 1.36, v), lerp(PHI_A + 0.02, Math.PI - PHI_A - 0.02, u), q), 14, 10, 'tempered');
    for (const w of SIDE_WINDOWS) {
      make(w.id, (u, v, q) => { const x = lerp(w.x0 + 0.02, w.x1 - 0.02, u); const T = top(x); const y = lerp(1.06, T - 0.09, v); return off(x, phiAtY(x, y, w.side), q); }, 10, 6, 'tempered');
    }
  }

  // ---- タイヤ、ライト、ナンバー、ミラー ----
  _details() {
    const G = this.group;
    const tire = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.25, metalness: 0.9 });
    for (const x of [-1.38, 1.36]) for (const z of [-0.8, 0.8]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 28), tire); t.rotation.x = Math.PI / 2; t.position.set(x, 0.32, z); t.castShadow = true; G.add(t);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.225, 20), rim); r.rotation.x = Math.PI / 2; r.position.set(x, 0.32, z); G.add(r);
    }
    const lamp = (id, x, y, z, color, emissive, w, h) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.2 }));
      m.position.set(x, y, z); G.add(m);
      this.lights[id] = { id, mesh: m, broken: false, base: emissive };
    };
    lamp('hl', -2.2, 0.72, 0.6, '#dfe6ea', '#fff6dd', 0.36, 0.12); lamp('hr', -2.2, 0.72, -0.6, '#dfe6ea', '#fff6dd', 0.36, 0.12);
    lamp('tl', 2.2, 0.82, 0.62, '#7a0d0d', '#ff2a1a', 0.3, 0.12); lamp('tr', 2.2, 0.82, -0.62, '#7a0d0d', '#ff2a1a', 0.3, 0.12);
    // ウインカー（アラームで点滅）
    this.blinkers = [];
    for (const [x, z] of [[-2.18, 0.84], [-2.18, -0.84], [2.18, 0.84], [2.18, -0.84]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: '#b86a12', emissive: '#ff8c1a', emissiveIntensity: 0 }));
      b.position.set(x, 0.62, z); G.add(b); this.blinkers.push(b);
    }
    for (const x of [-2.26, 2.26]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), new THREE.MeshStandardMaterial({ map: TX.plate(), roughness: 0.5 }));
      p.position.set(x, 0.5, 0); p.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2; G.add(p);
    }
    // ミラー（当たると落ちる）
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), new THREE.MeshPhysicalMaterial({ color: this.paint, roughness: 0.3, metalness: 0.3, clearcoat: 1 }));
      const glassM = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ color: '#9fb2bf', metalness: 1, roughness: 0.05 }));
      glassM.position.set(0.051, 0, 0); glassM.rotation.y = Math.PI / 2; m.add(glassM);
      m.userData.color = this.paint.clone();
      this.mirrors.push({ mesh: m, local: new THREE.Vector3(-0.5, 1.07, s * 0.98), body: null });
    }
  }

  // ---- 当たり判定 ----
  _addBodies() {
    const W = this.world, G = this.group;
    G.updateMatrixWorld(true);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    const add = (hx, hy, hz, lx, ly, lz, part, lq = null) => {
      const b = new CANNON.Body({ mass: 0, material: W.matDefault });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      const wp = G.localToWorld(new THREE.Vector3(lx, ly, lz));
      const wq = lq ? q.clone().multiply(lq) : q;
      b.position.set(wp.x, wp.y, wp.z); b.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      b.ud = { static: true, surface: 'car', car: this, part };
      W.physics.addBody(b); this.bodies.push(b); return b;
    };
    // 下半分・ボンネット・トランク・屋根
    add(2.2, 0.27, 0.86, 0, 0.52, 0, 'body');
    add(0.46, 0.1, 0.84, -1.62, 0.86, 0, 'body');
    add(0.34, 0.12, 0.84, 1.74, 0.9, 0, 'body');
    add(0.68, 0.05, 0.7, 0.11, 1.4, 0, 'body');
    // 柱（Aピラー・Cピラー）の代わりに窓枠の低い壁
    add(1.0, 0.04, 0.8, 0.35, 1.0, 0, 'body');
    // ガラス
    for (const p of Object.values(this.panes)) {
      const lq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(p.du, new THREE.Vector3().crossVectors(p.normal, p.du).normalize(), p.normal));
      const c = p.center.clone().addScaledVector(p.normal, -0.03);
      p.body = add(p.w / 2, p.h / 2, 0.045, c.x, c.y, c.z, 'glass:' + p.id, lq);
    }
    // ライト
    for (const l of Object.values(this.lights)) l.body = add(0.05, 0.08, 0.2, l.mesh.position.x, l.mesh.position.y, l.mesh.position.z, 'light:' + l.id);
    // ミラー：落ちる物として置いておく
    for (const m of this.mirrors) {
      const wp = G.localToWorld(m.local.clone());
      m.body = W.addDynamic(m.mesh, new CANNON.Box(new CANNON.Vec3(0.05, 0.05, 0.09)), 0.6, wp, { kind: 'mirror', breakable: true, breakV: 5, shards: 10 }, { rotY: this.yaw + 0.0001 });
      m.mesh.castShadow = true;
    }
  }

  get glassLeft() { return Object.values(this.panes).filter(p => !p.broken).length; }
  get done() { return (this.glassLeft === 0 && this.dents >= 8) || this.dents >= 24; }

  // ---- 当たったとき ----
  hit(part, point, outward, v, mass, kind) {
    const W = this.world;
    this.lastHit = W.clock;
    if (v > 2 && kind !== 'shard') this._alarm();
    const E = 0.5 * mass * v * v;
    if (part === 'body') {
      if (kind === 'egg') return;
      const s = clamp(E / 18, 0.15, 1.4);
      this._dent(point, outward, s);
      sfx.thunk(v * Math.sqrt(mass / 0.35)); haptics.hit(clamp(s, 0.3, 1));
      const d = W._decal(point, outward, TX.scuff('steel', Math.floor(Math.random() * 3)), 0.16 + s * 0.1, null, 0.006);
      this.group.attach(d);
      for (let i = 0; i < Math.round(2 + s * 5); i++) W._shard(point.clone().addScaledVector(outward, 0.02), outward.clone().multiplyScalar(rand(0.4, 1.4)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 1), rand(-0.6, 0.6))), rand(0.006, 0.015), 0.002, this.paint.clone(), false);
      this.dents++;
    } else if (part.startsWith('glass:')) {
      const p = this.panes[part.slice(6)];
      if (!p || p.broken) return;
      if (kind === 'egg') { sfx.tink(2); return; }
      if (p.type === 'laminated') {
        // フロントガラスはひびが広がり、5回目で崩れる
        p.cracks++;
        const d = W._decal(point, outward, TX.glassCrack(p.cracks + 10), 0.45 + Math.min(0.4, E * 0.02), null, 0.004);
        this.group.attach(d);
        sfx.glass(0.55); haptics.break();
        if (p.cracks >= 5 || E > 40) this._shatter(p, point, outward, 0.6);
      } else if (E > 1.5) this._shatter(p, point, outward, 1);
      else { const d = W._decal(point, outward, TX.glassCrack(p.cracks++ + 20), 0.25, null, 0.004); this.group.attach(d); sfx.glass(0.3); }
    } else if (part.startsWith('light:')) {
      const l = this.lights[part.slice(6)];
      if (!l || l.broken) return;
      l.broken = true; l.mesh.material = l.mesh.material.clone(); l.mesh.material.emissiveIntensity = 0; l.mesh.material.color.set('#1a1a1a');
      if (l.body && l.body.world) W.physics.removeBody(l.body);
      const wp = l.mesh.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 12; i++) W._shard(wp.clone().addScaledVector(outward, 0.04), outward.clone().multiplyScalar(rand(0.5, 1.5)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6))), rand(0.01, 0.025), 0.003, new THREE.Color(l.id.startsWith('t') ? '#c21a12' : '#e8eef2'), true);
      sfx.glass(0.5); haptics.break();
    }
  }

  // 近くの網目を、当たった向きに押し込む
  _dent(point, outward, s) {
    const g = this.shell.geometry, P = g.attributes.position;
    const lp = this.group.worldToLocal(point.clone());
    const inward = outward.clone().negate().transformDirection(new THREE.Matrix4().copy(this.group.matrixWorld).invert()).normalize();
    const r = 0.14 + 0.1 * s, depth = Math.min(0.11, 0.025 + 0.05 * s);
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const d2 = v.distanceToSquared(lp); if (d2 > 9 * r * r) continue;
      const k = depth * Math.exp(-d2 / (r * r)) * rand(0.85, 1.15);
      P.setXYZ(i, v.x + inward.x * k, v.y + inward.y * k, v.z + inward.z * k);
    }
    P.needsUpdate = true; g.computeVertexNormals();
  }

  // 強化ガラスは一気に粒になって崩れる
  _shatter(p, point, outward, k) {
    const W = this.world;
    p.broken = true; p.mesh.visible = false;
    if (p.body && p.body.world) W.physics.removeBody(p.body);
    const c = p.mesh.localToWorld(p.center.clone());
    const n = p.type === 'laminated' ? 30 : 60;
    for (let i = 0; i < n; i++) {
      const at = c.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(Math.max(p.w, p.h) * 0.4));
      const vel = outward.clone().multiplyScalar(rand(-1.5, 0.8)).add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.3, 1.2), rand(-0.7, 0.7)));
      W._shard(at, vel, rand(0.008, 0.02), 0.006, new THREE.Color('#bcd4de'), true);
    }
    sfx.glass(k); setTimeout(() => sfx.glass(0.5 * k), 70); haptics.break();
    W._puff(point, outward, '#dfe9ee', 0.6);
  }

  _alarm() {
    const W = this.world;
    if (W.clock < this.alarmUntil - 7) return; // 鳴り始めたばかりなら延長だけ
    if (this.alarmStop) this.alarmStop();
    this.alarmStop = sfx.alarm(8); this.alarmUntil = W.clock + 8;
  }

  // 走り去る
  leave() {
    const W = this.world;
    for (const b of this.bodies) if (b.world) W.physics.removeBody(b);
    this.bodies = [];
    for (const m of this.mirrors) if (m.body && m.body.world && m.body.sleepState === CANNON.Body.SLEEPING) W._remove(m.body);
    if (this.alarmStop) this.alarmStop();
    this.leaving = { t: 0 };
    sfx.knock(3, 0.5);
  }

  update(dt) {
    const W = this.world;
    // ハザードの点滅
    const on = W.clock < this.alarmUntil && Math.floor(W.clock * 2.4) % 2 === 0;
    for (const b of this.blinkers) b.material.emissiveIntensity = on ? 2.5 : 0;
    for (const l of Object.values(this.lights)) if (!l.broken) l.mesh.material.emissiveIntensity = on && l.id.startsWith('h') ? 1.8 : 0.25;
    if (this.arrive) {
      this.arrive.t = Math.min(1, this.arrive.t + dt / 1.8);
      const e = 1 - Math.pow(1 - this.arrive.t, 3);
      this.group.position.copy(this._offsetPos(-9 * (1 - e)));
      if (this.arrive.t >= 1) { this.arrive = null; this._addBodies(); }
    }
    if (this.leaving) {
      this.leaving.t += dt;
      const d = 12 * Math.pow(this.leaving.t / 2, 2);
      this.group.position.copy(this._offsetPos(d));
      if (this.leaving.t > 2) { this.group.parent && this.group.parent.remove(this.group); this.gone = true; }
    }
  }
}

// PCのモニター：机の上。画面を叩くとひびと液晶のにじみ、3回で画面が割れる。さらに叩くと机から落ちる
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as TX from './textures.js?v=202609300508';
import { sfx } from './audio.js?v=202609300508';
import { haptics } from './haptics.js?v=202609300508';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SW = 0.6, SH = 0.345;        // 画面の大きさ
const PY = 0.39;                    // 画面の中心の高さ（机の天板から）
const CW = 768, CH = 442;           // 画面テクスチャの大きさ

// 仕事中っぽいデスクトップ（表計算と、急ぎのメールの通知）
function drawDesktop(g) {
  const gr = g.createLinearGradient(0, 0, CW, CH);
  gr.addColorStop(0, '#2b5f86'); gr.addColorStop(1, '#173550');
  g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
  // ウィンドウ
  const x0 = 46, y0 = 34, w = 560, h = 340;
  g.fillStyle = '#f4f5f6'; g.fillRect(x0, y0, w, h);
  g.fillStyle = '#1f6f45'; g.fillRect(x0, y0, w, 26);
  g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('売上集計_最終_v3_修正版(2).xlsx', x0 + 12, y0 + 18);
  g.strokeStyle = '#c9cdd1'; g.lineWidth = 1;
  const cw = 70, rh = 18, top = y0 + 50;
  g.fillStyle = '#e3e6e9'; g.fillRect(x0, y0 + 26, w, 24);
  for (let r = 0; r < 17; r++) {
    for (let c = 0; c < 8; c++) {
      const x = x0 + c * cw, y = top + r * rh;
      g.strokeRect(x, y, cw, rh);
      if (r === 0) { g.fillStyle = '#dde7df'; g.fillRect(x + 1, y + 1, cw - 2, rh - 2); }
      g.fillStyle = r === 0 ? '#234' : '#333'; g.font = '11px sans-serif';
      if (r === 0) g.fillText(['項目', '4月', '5月', '6月', '7月', '8月', '9月', '合計'][c], x + 6, y + 13);
      else if (c === 0) g.fillText('項目' + r, x + 6, y + 13);
      else g.fillText(String(Math.floor(1000 + Math.sin(r * 7 + c * 3) * 900 + 900)), x + 18, y + 13);
    }
  }
  g.fillStyle = '#f7d7d7'; g.fillRect(x0 + 7 * cw + 1, top + 9 * rh + 1, cw - 2, rh - 2);
  g.fillStyle = '#c00'; g.fillText('#REF!', x0 + 7 * cw + 14, top + 9 * rh + 13);
  // 通知
  g.fillStyle = 'rgba(30,32,36,.95)'; g.fillRect(CW - 262, CH - 132, 244, 82);
  g.fillStyle = '#ff6b5b'; g.fillRect(CW - 262, CH - 132, 5, 82);
  g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('【至急】修正のお願い', CW - 246, CH - 106);
  g.fillStyle = '#b9bec6'; g.font = '12px sans-serif'; g.fillText('先ほどの件ですが、やはり最初の', CW - 246, CH - 84); g.fillText('案に戻していただけますか…', CW - 246, CH - 66);
  // タスクバー
  g.fillStyle = 'rgba(10,14,20,.88)'; g.fillRect(0, CH - 30, CW, 30);
  g.fillStyle = '#9fb3c8'; g.font = '12px sans-serif'; g.fillText('23:48', CW - 50, CH - 10);
  for (let i = 0; i < 6; i++) { g.fillStyle = ['#4b8bd6', '#e0a13a', '#3fa66a', '#8e6bd6', '#d65b5b', '#cfd6de'][i]; g.fillRect(14 + i * 30, CH - 23, 18, 16); }
}

export class Monitor {
  // base：机の天板の中心
  constructor(world, base, opts = {}) {
    this.world = world; this.center = base.clone();
    this.hits = 0; this.screenHits = 0; this.afterDead = 0; this.lastHit = 0;
    this.screenDead = false; this.toppled = false; this.toppleAt = 0;
    const G = this.group = new THREE.Group(); G.position.copy(base); world.stage.add(G);
    const plastic = new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.45, metalness: 0.1 });
    const metal = new THREE.MeshStandardMaterial({ color: '#8a8d92', roughness: 0.35, metalness: 0.8 });
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; G.add(o); return o; };
    const foot = box(0.26, 0.014, 0.2, 0, 0.007, -0.02, metal);
    const neck = box(0.06, 0.3, 0.025, 0, 0.16, -0.075, metal);
    const bezel = box(SW + 0.024, SH + 0.034, 0.022, 0, PY, -0.045, plastic);
    const back = box(0.34, 0.22, 0.04, 0, PY - 0.01, -0.075, plastic);
    // 画面
    this.canvas = document.createElement('canvas'); this.canvas.width = CW; this.canvas.height = CH;
    this.g = this.canvas.getContext('2d'); drawDesktop(this.g);
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex, color: '#d6d6d6', toneMapped: false });
    const screen = this.screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), this.screenMat);
    screen.position.set(0, PY + 0.004, -0.0335); G.add(screen);
    this.glow = new THREE.PointLight('#9cc3ff', 0.9, 1.6, 2); this.glow.position.set(0, PY, 0.25); G.add(this.glow);
    this.pieces = [
      { mesh: screen, part: 'screen', attached: true },
      { mesh: bezel, part: 'body', attached: true },
      { mesh: back, part: 'body', attached: true },
      { mesh: neck, part: 'stand', attached: true },
      { mesh: foot, part: 'stand', attached: true }
    ];
    this.bodies = [];
    this.drop = opts.drop ? { y: 1.2, vy: 0 } : null;
    if (this.drop) G.position.y = base.y + this.drop.y; else this._addBodies();
  }

  get done() { return this.toppled && this.world.clock - this.toppleAt > 2; }
  bakeNear() {}

  _addBodies() {
    const W = this.world, c = this.center;
    const add = (hx, hy, hz, x, y, z) => {
      const b = new CANNON.Body({ mass: 0, material: W.matDefault });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      b.position.set(c.x + x, c.y + y, c.z + z);
      b.ud = { static: true, surface: 'monitor' };
      W.physics.addBody(b); this.bodies.push(b);
    };
    add(SW / 2 + 0.012, SH / 2 + 0.017, 0.03, 0, PY, -0.055);
    add(0.13, 0.16, 0.05, 0, 0.16, -0.05);
  }

  // 画面の点 → テクスチャ上の位置
  _uv(point) {
    const l = this.screen.worldToLocal(point.clone());
    return [clamp(l.x / SW + 0.5, 0, 1) * CW, clamp(0.5 - l.y / SH, 0, 1) * CH];
  }

  // 液晶のにじみ：黒いしみと、縦に走る色の線
  _lcdDamage(x, y, k) {
    const g = this.g;
    const r = 26 + k * 30;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(8,6,20,.92)'); gr.addColorStop(1, 'rgba(40,10,60,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = r * rand(0.6, 1.15); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
    for (let i = 0; i < 3 + k * 4; i++) {
      const lx = Math.round(x + rand(-80, 80));
      g.fillStyle = ['#ff2bd6', '#2bff7a', '#ffffff', '#35d7ff', '#ffe93b'][i % 5];
      g.globalAlpha = rand(0.6, 1); g.fillRect(lx, 0, rand(1, 3), CH); g.globalAlpha = 1;
    }
    if (k > 1) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, y + rand(-40, 40), CW, rand(3, 9)); }
    this.tex.needsUpdate = true;
  }

  _chips(point, n, color, dir) {
    const W = this.world, c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const pv = dir.clone().multiplyScalar(-rand(0.5, 2)).add(new THREE.Vector3(rand(-1, 1), rand(0.2, 1.6), rand(-1, 1)));
      W._shard(point.clone().addScaledVector(dir, -0.02), pv, rand(0.006, 0.02), 0.004, c, false);
    }
  }

  _killScreen(point, dir) {
    const W = this.world;
    this.screenDead = true;
    // ガラスが砕けて、画面は真っ暗に。線だけ残る
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.93)'; g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff2bd6', '#2bff7a', '#35d7ff', '#ffffff'][i % 4]; g.globalAlpha = 0.5; g.fillRect(rand(0, CW), 0, 2, CH); }
    g.globalAlpha = 1; this.tex.needsUpdate = true;
    this.glow.intensity = 0;
    const c = this.screen.localToWorld(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);
    for (let i = 0; i < 40; i++) {
      const at = c.clone().addScaledVector(right, rand(-SW / 2, SW / 2)).add(new THREE.Vector3(0, rand(-SH / 2, SH / 2), 0)).addScaledVector(dir, -0.01);
      const pv = dir.clone().multiplyScalar(-rand(0.2, 1.4)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.2, 1.2), rand(-0.6, 0.6)));
      W._shard(at, pv, rand(0.01, 0.03), 0.002, new THREE.Color('#2a343c'), true);
    }
    W._puff(point, dir.clone().negate(), '#ffcf7a', 0.5);
    sfx.glass(1); setTimeout(() => sfx.glass(0.6), 60); sfx.zap();
    haptics.break();
  }

  hit(idx, point, v, mass, dir) {
    if (this.drop || this.toppled) return;
    const W = this.world;
    const E = 0.5 * mass * v * v;
    const part = this.pieces[idx].part;
    this.hits++; this.lastHit = W.clock;
    if (part === 'screen' && !this.screenDead) {
      this.screenHits += E > 55 ? 2 : 1;
      const sn = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
      const d = W._decal(point, sn, TX.glassCrack(30 + this.screenHits), 0.22 + Math.min(0.2, E * 0.003), null, 0.003);
      this.screen.attach(d);
      const [x, y] = this._uv(point);
      this._lcdDamage(x, y, this.screenHits);
      sfx.glass(0.45); sfx.knock(5, 0.6); haptics.break();
      this._chips(point, 4, '#2a343c', dir);
      if (this.screenHits >= 3) this._killScreen(point, dir);
    } else {
      if (this.screenDead) this.afterDead++;
      sfx.knock(Math.max(5, v * 0.8), part === 'stand' ? 1.3 : 0.7); if (part === 'stand') sfx.can(4);
      haptics.hit(1);
      const d = W._decal(point, dir.clone().negate(), TX.scuff('steel', Math.floor(Math.random() * 3)), 0.12, null, 0.004);
      this.pieces[idx].mesh.attach(d);
      this._chips(point, 6, '#1c1d20', dir);
      if (this.screenDead && Math.random() < 0.5) { sfx.zap(); W._puff(point, dir.clone().negate(), '#ffcf7a', 0.3); }
    }
    if ((this.screenDead && this.afterDead >= 2) || this.hits >= 7) this._topple(dir, v);
  }

  // 机から落とす
  _topple(dir, v) {
    const W = this.world;
    if (this.toppled) return;
    this.toppled = true; this.toppleAt = W.clock;
    const c = this.center;
    W.clearDebrisIn(new THREE.Vector3(c.x - 0.45, c.y + 0.012, c.z - 0.3), new THREE.Vector3(c.x + 0.45, c.y + 0.9, c.z + 0.12));
    for (const b of this.bodies) if (b.world) W.physics.removeBody(b);
    this.bodies = [];
    for (const p of this.pieces) p.attached = false;
    this.glow.intensity = 0;
    const shapes = [
      [new CANNON.Box(new CANNON.Vec3(SW / 2 + 0.012, SH / 2 + 0.017, 0.03)), new CANNON.Vec3(0, PY, -0.055)],
      [new CANNON.Box(new CANNON.Vec3(0.03, 0.15, 0.013)), new CANNON.Vec3(0, 0.16, -0.075)],
      [new CANNON.Box(new CANNON.Vec3(0.13, 0.007, 0.1)), new CANNON.Vec3(0, 0.007, -0.02)]
    ];
    const pos = this.group.position.clone(); pos.y += 0.003;
    const b = this.body = W.addDynamic(this.group, shapes, 5, pos, { kind: 'monitorBody' }, { sleep: false });
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    b.velocity.set(flat.x * (1.2 + v * 0.08), 1.0, flat.z * (1.2 + v * 0.08));
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), flat).normalize();
    b.angularVelocity.set(axis.x * 5, rand(-1, 1), axis.z * 5);
    sfx.knock(9, 0.5);
    setTimeout(() => { sfx.metal(5); sfx.knock(10, 0.4); }, 420);
  }

  // 次のモニターを置く前に、落ちた古いモニターを片付ける
  dispose() {
    const W = this.world;
    if (this.body) {
      const p = this.body.position;
      W.clearDebrisIn(new THREE.Vector3(p.x - 0.6, p.y - 0.05, p.z - 0.6), new THREE.Vector3(p.x + 0.6, p.y + 0.8, p.z + 0.6));
      if (this.body.world) W.physics.removeBody(this.body);
      W.dyn = W.dyn.filter(r => r.body !== this.body);
    }
    this.group.parent && this.group.parent.remove(this.group);
  }

  collapseAll() { if (!this.toppled) this._topple(new THREE.Vector3(0, 0, -1), 6); }

  update(dt) {
    const W = this.world;
    if (this.drop) {
      this.drop.vy -= 9.8 * dt; this.drop.y += this.drop.vy * dt;
      if (this.drop.y <= 0) { this.drop = null; this.group.position.y = this.center.y; this._addBodies(); sfx.knock(7, 0.6); haptics.hit(0.7); }
      else this.group.position.y = this.center.y + this.drop.y;
    }
    // 液晶が傷むと、ちらつく
    if (!this.toppled && this.screenHits > 0) {
      const f = this.screenDead ? (Math.random() < 0.08 ? 0.35 : 0.12) : (Math.random() < 0.05 * this.screenHits ? 0.45 : 0.84);
      this.screenMat.color.setScalar(f);
      if (!this.screenDead) this.glow.intensity = 0.9 * f;
    }
    if (this.toppled) this.screenMat.color.setScalar(0.08);
  }
}

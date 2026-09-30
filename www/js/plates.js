// 皿の山：テーブルの上に積んだ白い皿。叩いた所の皿は割れ、その上に積まれていた皿は崩れ落ちて床で割れる
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sfx } from './audio.js?v=202609301439';
import { haptics } from './haptics.js?v=202609301439';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PH = 0.021, PR = 0.105;

export class PlateStack {
  // base：テーブルの天板の中心
  constructor(world, base, opts = {}) {
    this.world = world; this.center = base.clone();
    this.group = new THREE.Group(); world.stage.add(this.group);
    this.pieces = []; this.hits = 0; this.lastHit = 0;
    const cols = [[-0.3, 0.02, 13], [-0.06, -0.08, 17], [0.2, 0.05, 15], [0.43, -0.04, 10]];
    cols.forEach(([dx, dz, n], s) => {
      for (let i = 0; i < n; i++) {
        const m = world.makePlate();
        m.castShadow = true; m.receiveShadow = true;
        m.rotation.y = rand(0, Math.PI * 2);
        const p = new THREE.Vector3(base.x + dx + rand(-0.006, 0.006), base.y + 0.011 + i * PH, base.z + dz + rand(-0.006, 0.006));
        m.position.copy(p); this.group.add(m);
        this.pieces.push({ mesh: m, attached: true, stack: s, level: i, pos: p, body: null });
      }
    });
    // 立っている間の当たり判定：列ごとに1本の円柱
    this.colBodies = cols.map(([dx, dz, n], s) => {
      const b = new CANNON.Body({ mass: 0, material: world.matDefault });
      const h = n * PH;
      b.addShape(new CANNON.Cylinder(PR, PR, h, 16));
      b.position.set(base.x + dx, base.y + h / 2, base.z + dz);
      b.ud = { static: true, surface: 'plates' };
      world.physics.addBody(b);
      return { body: b, dx, dz, s };
    });
    // 新しく積む場所に残っていた破片は片付ける
    world.clearDebrisIn(new THREE.Vector3(base.x - 0.6, base.y + 0.004, base.z - 0.32), new THREE.Vector3(base.x + 0.75, base.y + 2, base.z + 0.3));
    this.drop = opts.drop ? { t: 0 } : null;
    if (this.drop) for (const p of this.pieces) p.mesh.position.y = p.pos.y + 1.4 + p.level * 0.05;
  }

  get done() { return this.pieces.every(p => !p.attached); }
  bakeNear() {}

  // 列の当たり判定を、残っている一番下からの高さに合わせる
  _refit(s) {
    const c = this.colBodies[s]; const W = this.world;
    if (c.body.world) W.physics.removeBody(c.body);
    let top = -1; for (const p of this.pieces) if (p.stack === s && p.attached) top = Math.max(top, p.level);
    const cx = this.center.x + c.dx, cz = this.center.z + c.dz, ty = this.center.y + (top + 1) * PH;
    W.clearDebrisIn(new THREE.Vector3(cx - 0.2, ty + 0.004, cz - 0.2), new THREE.Vector3(cx + 0.2, ty + 2, cz + 0.2));
    if (top < 0) return;
    const h = (top + 1) * PH;
    const b = new CANNON.Body({ mass: 0, material: W.matDefault });
    b.addShape(new CANNON.Cylinder(PR, PR, h, 16));
    b.position.set(this.center.x + c.dx, this.center.y + h / 2, this.center.z + c.dz);
    b.ud = { static: true, surface: 'plates' };
    W.physics.addBody(b); c.body = b;
  }

  _shatter(p, dir, v) {
    const W = this.world;
    p.attached = false;
    const pos = p.mesh.position.clone();
    this.group.remove(p.mesh);
    const white = new THREE.Color('#f3f1ea'), blue = new THREE.Color('#2e56a0');
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2);
      const off = new THREE.Vector3(Math.cos(a) * rand(0, PR), rand(-0.005, 0.01), Math.sin(a) * rand(0, PR));
      const pv = dir.clone().multiplyScalar(rand(0.2, 0.8) * v * 0.25).add(off.clone().normalize().multiplyScalar(rand(0.5, 2))).add(new THREE.Vector3(0, rand(0.4, 2), 0));
      W._shard(pos.clone().add(off), pv, rand(0.02, 0.045), 0.004, Math.random() < 0.85 ? white : blue, false);
    }
  }

  _release(p, vel) {
    const W = this.world;
    p.attached = false;
    const m = p.mesh; m.updateMatrixWorld(true); this.group.remove(m);
    const b = W.addDynamic(m, new CANNON.Cylinder(PR, PR, 0.022, 12), 0.35, m.position.clone(), { breakable: true, kind: 'ceramic', shards: 12, breakV: 2.3 }, { sleep: false });
    b.quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w);
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set(rand(-6, 6), rand(-3, 3), rand(-6, 6));
  }

  hit(idx, point, v, mass, dir) {
    if (this.drop) return;
    const W = this.world;
    const E = 0.5 * mass * v * v;
    const R = 0.07 + 0.018 * Math.sqrt(E);
    const hitP = this.pieces[idx];
    const broken = [];
    for (const p of this.pieces) {
      if (!p.attached) continue;
      const d = p.mesh.position.distanceTo(point);
      if (p === hitP || d < R) broken.push(p);
    }
    const lowest = {};
    for (const p of broken) { this._shatter(p, dir, v); lowest[p.stack] = Math.min(lowest[p.stack] ?? 99, p.level); }
    // 割れた皿より上に積まれていた皿は、崩れて飛ぶ
    let flew = 0;
    for (const p of this.pieces) {
      if (!p.attached) continue;
      const lo = lowest[p.stack];
      const near = p.mesh.position.distanceTo(point) < R * 1.4 && E > 50;
      if ((lo !== undefined && p.level > lo) || near) {
        const up = (p.level - (lo ?? p.level)) * 0.05;
        this._release(p, dir.clone().multiplyScalar(rand(0.4, 1.3) * (0.5 + v * 0.12)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(0.2, 1.2) + up, rand(-0.6, 0.6))));
        flew++;
      }
    }
    for (const s of new Set(this.pieces.map(p => p.stack))) this._refit(s);
    this.hits++; this.lastHit = W.clock;
    sfx.ceramic(1); sfx.knock(5, 0.5);
    if (broken.length > 1) setTimeout(() => sfx.ceramic(0.8), 40);
    if (broken.length > 3) setTimeout(() => sfx.ceramic(0.7), 110);
    haptics.break();
    W._puff(point, dir.clone().negate(), '#f1eee6', 0.6 + broken.length * 0.12);
    // 6回叩いたら残りも全部崩す
    if (this.hits >= 6) setTimeout(() => this.collapseAll(), 200);
  }

  collapseAll() {
    for (const p of this.pieces) if (p.attached) this._release(p, new THREE.Vector3(rand(-1.2, 1.2), rand(0, 1.2), rand(-1.2, 1.2)));
    for (const s of new Set(this.pieces.map(p => p.stack))) this._refit(s);
  }

  update(dt) {
    if (!this.drop) return;
    // 上から1枚ずつ重なっていく
    this.drop.t += dt;
    let settled = true;
    for (const p of this.pieces) {
      const t0 = p.level * 0.035 + p.stack * 0.05;
      const k = clamp((this.drop.t - t0) / 0.28, 0, 1);
      p.mesh.position.y = p.pos.y + (1 - k * k) * (1.4 + p.level * 0.05);
      if (k < 1) settled = false;
      else if (!p.clacked) { p.clacked = true; if (Math.random() < 0.35) sfx.tink(2 + Math.random() * 2); }
    }
    if (settled) { this.drop = null; sfx.ceramic(0.2); }
  }
}

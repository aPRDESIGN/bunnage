// 投げるステージ用の、当たると壊れる・揺れる備品
//  Pane    ：ガラス（ショーウィンドウ、電車の窓、自販機の前面）。ひびが入り、最後は砕ける
//  Fixture ：光る物（ネオン、蛍光灯、街灯、提灯、案内表示）。割れると火花が出て消える
//  Swinger ：吊られた物（吊り革、中吊り広告、のれん）。当たると揺れる
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as TX from './textures.js?v=202609301033';
import { sfx } from './audio.js?v=202609301033';
import { haptics } from './haptics.js?v=202609301033';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function staticBox(world, half, pos, rotY, ud) {
  const b = new CANNON.Body({ mass: 0, material: world.matDefault });
  b.addShape(new CANNON.Box(new CANNON.Vec3(half[0], half[1], half[2])));
  b.position.set(pos.x, pos.y, pos.z);
  if (rotY) b.quaternion.setFromEuler(0, rotY, 0);
  b.ud = { static: true, ...ud };
  world.physics.addBody(b);
  return b;
}

export class Pane {
  // pos：ガラスの中心、rotY：ガラスの向き（0なら+z向き）、w,h：大きさ
  constructor(world, { pos, w, h, rotY = 0, tint = '#a9c4cf', opacity = 0.22, cracks = 2, frame = null }) {
    this.world = world; this.pos = pos.clone(); this.w = w; this.h = h; this.rotY = rotY;
    this.normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.cracks = 0; this.maxCracks = cracks; this.broken = false;
    this.mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.3, transparent: true, opacity, envMapIntensity: 2.5, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.position.copy(pos); this.mesh.rotation.y = rotY;
    world.stage.add(this.mesh);
    if (frame) {
      const f = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.4, metalness: 0.6 });
      const t = 0.04, g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY;
      for (const [bw, bh, x, y] of [[w + t * 2, t, 0, h / 2 + t / 2], [w + t * 2, t, 0, -h / 2 - t / 2], [t, h, -w / 2 - t / 2, 0], [t, h, w / 2 + t / 2, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), f); m.position.set(x, y, 0); g.add(m); }
      world.stage.add(g);
    }
    this.body = staticBox(world, [w / 2, h / 2, 0.03], pos, rotY, { surface: 'pane', prop: this });
    this.decals = [];
  }

  hit(point, dir, v, mass, kind) {
    if (this.broken || kind === 'egg') return;
    const W = this.world, E = 0.5 * mass * v * v;
    if (this.cracks < this.maxCracks && E < 12) {
      this.cracks++;
      const n = this.normal.clone(); if (n.dot(dir) > 0) n.negate();
      const d = W._decal(point, n, TX.glassCrack(40 + this.cracks + Math.floor(Math.random() * 3)), 0.35 + Math.min(0.35, E * 0.03), null, 0.004);
      this.decals.push(d);
      sfx.glass(0.45); haptics.break();
      return;
    }
    this.shatter(point, dir, v);
  }

  shatter(point, dir, v = 6) {
    const W = this.world;
    this.broken = true;
    // 枠には、ぎざぎざの割れ残りを残す（割れたことがひと目で分かるように）
    this.mesh.material = new THREE.MeshStandardMaterial({ map: TX.paneBroken(Math.floor(Math.random() * 4)), transparent: true, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 });
    if (this.body.world) W.physics.removeBody(this.body);
    for (const d of this.decals) d.parent && d.parent.remove(d);
    // このガラスに付いていた卵などの跡も一緒に落ちる
    W.splats = W.splats.filter(s => { const l = s.position.clone().sub(this.pos); if (Math.abs(l.dot(this.normal)) < 0.03 && l.length() < Math.max(this.w, this.h) * 0.7) { s.parent && s.parent.remove(s); return false; } return true; });
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotY);
    const n = Math.round(clamp(this.w * this.h * 70, 20, 90));
    for (let i = 0; i < n; i++) {
      const at = this.pos.clone().addScaledVector(right, rand(-this.w / 2, this.w / 2)).add(new THREE.Vector3(0, rand(-this.h / 2, this.h / 2), 0));
      const vel = dir.clone().multiplyScalar(rand(0.3, 1.4) * (0.5 + v * 0.1)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 1.0), rand(-0.6, 0.6)));
      W._shard(at, vel, rand(0.015, 0.05), 0.003, new THREE.Color('#d7e6ec'), true);
    }
    W._puff(point, dir.clone().negate(), '#e8f0f4', 1.1);
    sfx.glass(1); setTimeout(() => sfx.glass(0.7), 70); setTimeout(() => sfx.glass(0.4), 170);
    haptics.break();
  }
}

export class Fixture {
  // meshes：光っている部分（emissiveを消す）、lights：一緒に消える明かり
  constructor(world, { meshes, lights = [], pos, half, rotY = 0, color = '#ffffff', neon = false, glassColor = '#f4f1ea', hp = 1 }) {
    this.world = world; this.meshes = meshes; this.lights = lights; this.pos = pos.clone(); this.half = half;
    this.color = new THREE.Color(color); this.neon = neon; this.glassColor = new THREE.Color(glassColor); this.hp = hp;
    this.base = meshes.map(m => m.material.emissiveIntensity);
    this.lightBase = lights.map(l => l.intensity);
    this.broken = false; this.flicker = 0;
    this.body = staticBox(world, half, pos, rotY, { surface: 'fixture', prop: this });
  }
  hit(point, dir, v, mass, kind) {
    if (this.broken) return;
    if (kind === 'egg') { this.flicker = 0.4; sfx.zap(); return; }
    if (--this.hp > 0) { this.flicker = 0.6; sfx.glass(0.3); sfx.zap(); return; }
    this.break(point, dir);
  }
  break(point, dir) {
    const W = this.world;
    this.broken = true; this.flicker = 0.45;
    if (this.body.world) W.physics.removeBody(this.body);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const at = this.pos.clone().add(new THREE.Vector3(rand(-1, 1) * this.half[0], rand(-1, 1) * this.half[1], rand(-1, 1) * this.half[2]));
      W._shard(at, dir.clone().multiplyScalar(rand(0.2, 1)).add(new THREE.Vector3(rand(-0.8, 0.8), rand(-0.2, 1.2), rand(-0.8, 0.8))), rand(0.01, 0.03), 0.003, this.glassColor, true);
    }
    W._puff(point, dir.clone().negate(), '#ffcf7a', 0.7);
    sfx.glass(0.9); sfx.zap(); setTimeout(() => sfx.zap(), 180);
    haptics.break();
  }
  update(dt) {
    if (this.flicker > 0) {
      this.flicker -= dt;
      const on = Math.random() < 0.5 ? 1 : 0.1;
      this.meshes.forEach((m, i) => { m.material.emissiveIntensity = this.base[i] * on; });
      this.lights.forEach((l, i) => { l.intensity = this.lightBase[i] * on; });
      if (this.flicker <= 0) this._settle();
    }
  }
  _settle() {
    const k = this.broken ? 0 : 1;
    this.meshes.forEach((m, i) => { m.material.emissiveIntensity = this.base[i] * k; if (this.broken) m.material.color.multiplyScalar(0.45); });
    this.lights.forEach((l, i) => { l.intensity = this.lightBase[i] * k; });
  }
}

export class Swinger {
  // pivot：吊っている点のGroup（中身はその下にぶら下げておく）。axis：揺れる向き
  constructor(world, { pivot, half, center, k = 30, damp = 1.6 }) {
    this.world = world; this.pivot = pivot; this.ax = 0; this.az = 0; this.vx = 0; this.vz = 0; this.k = k; this.damp = damp;
    this.body = staticBox(world, half, center, 0, { surface: 'soft', prop: this });
  }
  hit(point, dir, v) {
    const s = clamp(v * 0.35, 0.5, 4);
    this.vx += dir.z * s; this.vz += -dir.x * s;
    sfx.knock(Math.min(3, v * 0.3), 1.6);
  }
  update(dt) {
    this.vx += (-this.k * this.ax - this.damp * this.vx) * dt; this.ax += this.vx * dt;
    this.vz += (-this.k * this.az - this.damp * this.vz) * dt; this.az += this.vz * dt;
    this.pivot.rotation.x = this.ax; this.pivot.rotation.z = this.az;
  }
}

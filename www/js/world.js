// キッチンの3D・物理・破壊・痕跡
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import * as TX from './textures.js?v=202609300913';
import { sfx } from './audio.js?v=202609300913';
import { Car } from './car.js?v=202609300913';
import { PlateStack } from './plates.js?v=202609300913';
import { Monitor } from './monitor.js?v=202609300913';
import { GiantVase } from './vase.js?v=202609300913';
import { haptics } from './haptics.js?v=202609300913';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const D2R = Math.PI / 180;

// 部屋の寸法（m）
const ROOM = { x0: -2.3, x1: 2.3, z0: -0.95, z1: 2.8, h: 2.4 };
export const EYE = new THREE.Vector3(0, 1.52, 1.75);
const COUNTER_Y = 0.85, COUNTER_FRONT = -0.3;

// 投げる物は実物より一回り大きく（画面で見やすく、当てやすく）
const THROW_SCALE = 1.3;
const LIMITS = { activeShards: 140, cans: 40, splats: 120 };

// ---- 破片を1つのメッシュにまとめて描画負荷を抑える ----
class Debris {
  constructor(material) {
    this.pos = []; this.nor = []; this.col = [];
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.dirty = false;
  }
  add(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal;
    const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
    const c = mesh.userData.color || new THREE.Color(1, 1, 1);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      if (g.attributes.color) this.col.push(g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i));
      else this.col.push(c.r, c.g, c.b);
    }
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    this.mesh.geometry.dispose(); this.mesh.geometry = g; this.dirty = false;
  }
  clear() { this.pos = []; this.nor = []; this.col = []; this.dirty = true; this.flush(); }
  // 箱の中にある三角形を取り除く（支えが無くなった所の破片が宙に浮かないように）
  removeIn(min, max) {
    const P = this.pos, N = this.nor, C = this.col, np = [], nn = [], nc = [];
    let removed = 0;
    for (let i = 0; i < P.length; i += 9) {
      const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cy = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      if (cx > min.x && cx < max.x && cy > min.y && cy < max.y && cz > min.z && cz < max.z) { removed++; continue; }
      for (let k = 0; k < 9; k++) { np.push(P[i + k]); nn.push(N[i + k]); nc.push(C[i + k]); }
    }
    if (removed) { this.pos = np; this.nor = nn; this.col = nc; this.dirty = true; }
    return removed;
  }
}

// 破片1枚のジオメトリ（不規則な三角形の薄板）
function shardGeometry(size, thick) {
  const pts = [];
  const n = Math.random() < 0.6 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.5, 0.5), r = size * rand(0.45, 1);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2); g.rotateX(Math.PI / 2);
  return g.index ? g.toNonIndexed() : g;
}

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d0e0f');
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.18;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 30);
    this.camera.position.copy(EYE);
    this.scene.add(this.camera);
    this.yaw = 0; this.pitch = -0.12;

    this.hand = new THREE.Group(); this.camera.add(this.hand);
    this.handBase = new THREE.Vector3(0.1, -0.17, -0.56);
    this.hand.position.copy(this.handBase);
    this.heldKind = null; this.heldMesh = null; this.holding = false; this.handT = 0; this.refillAt = 0;

    this._lights();
    // ハンマーのステージだけ使う、手元を照らす弱い明かり
    this.headLamp = new THREE.PointLight('#fff1dc', 0, 3.2, 2); this.headLamp.position.set(0.25, 0.3, 0); this.camera.add(this.headLamp);

    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = true;
    this.physics.solver.iterations = 10;
    this.matDefault = new CANNON.Material('default');
    this.matCan = new CANNON.Material('can');
    this.matEgg = new CANNON.Material('egg');
    this.physics.defaultContactMaterial.friction = 0.4;
    this.physics.defaultContactMaterial.restitution = 0.12;
    this.physics.addContactMaterial(new CANNON.ContactMaterial(this.matCan, this.matDefault, { friction: 0.25, restitution: 0.32 }));
    this.physics.addContactMaterial(new CANNON.ContactMaterial(this.matCan, this.matCan, { friction: 0.2, restitution: 0.4 }));

    this.debrisSolid = new Debris(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }));
    this.debrisGlass = new Debris(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.8, envMapIntensity: 3.2, side: THREE.DoubleSide }));
    this.scene.add(this.debrisSolid.mesh, this.debrisGlass.mesh);

    this.events = [];
    this.clock = 0;
    this.stageType = 'cg';
    this.build();
  }

  // 夜。天井の蛍光灯は弱く、ときどきちらつく。手元灯だけが少し明るい。窓の外は暗い青
  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#9aa3a8', '#2a241e', 0.16); s.add(this.hemi);
    const ceil = this.ceilLight = new THREE.PointLight('#ffe7c2', 2.0, 0, 2); ceil.position.set(0, 2.25, 0.5); s.add(ceil);
    const d = this.sun = new THREE.DirectionalLight('#ffdcae', 0.55);
    d.position.set(0.3, 2.35, 0.6); d.target.position.set(0, 0.4, -0.6);
    d.castShadow = true; d.shadow.mapSize.set(1024, 1024);
    const sc = d.shadow.camera; sc.left = -2.6; sc.right = 2.6; sc.top = 2.4; sc.bottom = -2.2; sc.near = 0.3; sc.far = 6;
    d.shadow.bias = -0.0008; d.shadow.normalBias = 0.02;
    s.add(d, d.target);
    const under = this.underLight = new THREE.PointLight('#e9f3de', 1.6, 2.4, 2); under.position.set(-0.55, 1.45, -0.7); s.add(under);
    const win = this.winLight = new THREE.PointLight('#5f7894', 0.9, 3.2, 2); win.position.set(-1.95, 1.5, 1.15); s.add(win);
  }

  // 明るさ（写真のステージは写真に合わせて明るめ）
  _setLightLevel(k) {
    this.ceilLight.intensity = 2.0 * k; this.sun.intensity = 0.55 * k; this.underLight.intensity = 1.6 * k;
    this.winLight.intensity = 0.9 * k; this.hemi.intensity = k > 0 ? 0.16 : (this.stageType === 'car' ? 0.13 : 0.07);
    if (this.lampMat) this.lampMat.emissiveIntensity = 0.9;
  }

  // 蛍光灯のちらつき（今は使っていない）
  _updateFlicker(dt) {
    const f = this.flicker; if (!f) return;
    f.next -= dt;
    if (f.next <= 0) { f.t = 0.08 + Math.random() * 0.35; f.next = 5 + Math.random() * 12; }
    let k = 1;
    if (f.t > 0) { f.t -= dt; k = Math.random() < 0.55 ? 0.15 : 0.8; }
    this.ceilLight.intensity = 2.0 * k; this.sun.intensity = 0.55 * k;
    if (this.lampMat) this.lampMat.emissiveIntensity = 0.9 * k;
  }

  resize(w, h) {
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 縦長画面でも左右が狭くなりすぎないように。写真のステージは写真の外が見えないよう少し狭く
    this.camera.fov = w < h ? 74 : 60;
    this.camera.updateProjectionMatrix();
  }

  // 見回せる範囲（ラジアン）
  viewLimits() {
    return { yaw: 90 * D2R, pitchMin: -65 * D2R, pitchMax: 50 * D2R };
  }
  // 見たい向き → 実際に向ける向き（写真の外が見えそうなら、端に沿って止める）
  clampView(yaw, pitch) { return [yaw, pitch]; }


  // ================= ステージ構築 =================
  build() {
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this.dyn = []; this.shards = []; this.cans = []; this.splats = []; this.drips = []; this.trails = []; this.puffs = [];
    this.lampBroken = false; this.windowState = 0;
    this.statics = [];
    this.fridgeFront = null;
    this.vases = []; this.vaseSlots = [];
    this.car = null;
    this.orbitA = 0; this.hammerAnim = null; this.orbitC = null;
    this.headLamp.intensity = this.stageType === 'hammer' ? 1.4 : 0;
    if (this.stageType === 'warehouse') this._warehouse();
    else if (this.stageType === 'hammer') this._hammerRoom();
    else if (this.stageType === 'car') this._parking();
    else { this._room(); this._counter(); this._fridge(); this._cupboard(); this._rack(); this._items(); }
    this._setLightLevel(this.stageType === 'cg' || !this.stageType ? 1 : 0);
    this.resize(this._w || 1, this._h || 1);
    // 写真の明るさに3Dの小物を少し寄せる
    this.renderer.toneMappingExposure = 0.8;
    this._wakeGuard = this.clock + 0.3;
  }

  // すべて片付けて初期状態に戻す
  reset(type) {
    if (type) this.stageType = type;
    for (const b of [...this.physics.bodies]) this.physics.removeBody(b);
    this.stage.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.stage);
    this.debrisSolid.clear(); this.debrisGlass.clear();
    this.events.length = 0;
    this.build();
  }

  mat(color, rough = 0.6, metal = 0, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  }

  // 静的な箱（見た目＋物理）
  box(w, h, d, x, y, z, material, opt = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); if (opt.rotY) m.rotation.y = opt.rotY;
    m.receiveShadow = opt.receive !== false; m.castShadow = !!opt.cast;
    this.stage.add(m);
    if (opt.phys !== false) {
      const b = new CANNON.Body({ mass: 0, material: this.matDefault });
      const [pw, ph, pd] = opt.pd || [w, h, d];
      const [px, py, pz] = opt.pp || [x, y, z];
      b.addShape(new CANNON.Box(new CANNON.Vec3(pw / 2, ph / 2, pd / 2)));
      b.position.set(px, py, pz); if (opt.rotY) b.quaternion.setFromEuler(0, opt.rotY, 0);
      b.ud = { surface: opt.surface || 'wood', mesh: m, static: true };
      this.physics.addBody(b);
    }
    return m;
  }
  // 見た目だけの板
  plane(w, h, x, y, z, material, rotY = 0, rotX = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z); m.rotation.set(rotX, rotY, 0, 'YXZ'); m.receiveShadow = true;
    this.stage.add(m); return m;
  }

  _recOf(body) { return this.dyn.find(r => r.body === body); }

  // ================ 地下駐車場と車 =================
  _parking() {
    const X = 7, Z0 = -9, Z1 = 4, Hh = 2.9, W = X * 2, D = Z1 - Z0, T = 1.0;
    this.box(W, 0.1, D, 0, -0.05, (Z0 + Z1) / 2, this.mat('#9a9a96', 0.8, 0, { map: TX.concreteFloor(W / 2, D / 2) }), { surface: 'floor', pd: [W + 2, T, D + 2], pp: [0, -T / 2, (Z0 + Z1) / 2] });
    const wall = (rx, ry) => this.mat('#bdbcb6', 0.9, 0, { map: TX.concreteWall(rx, ry) });
    this.box(W, Hh, 0.1, 0, Hh / 2, Z0 - 0.05, wall(W / 1.8, Hh / 0.9), { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z0 - T / 2] });
    this.box(W, Hh, 0.1, 0, Hh / 2, Z1 + 0.05, wall(W / 1.8, Hh / 0.9), { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z1 + T / 2] });
    this.box(0.1, Hh, D, -X - 0.05, Hh / 2, (Z0 + Z1) / 2, wall(D / 1.8, Hh / 0.9), { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [-X - T / 2, Hh / 2, (Z0 + Z1) / 2] });
    this.box(0.1, Hh, D, X + 0.05, Hh / 2, (Z0 + Z1) / 2, wall(D / 1.8, Hh / 0.9), { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [X + T / 2, Hh / 2, (Z0 + Z1) / 2] });
    this.box(W, 0.1, D, 0, Hh + 0.05, (Z0 + Z1) / 2, this.mat('#4a4a47', 0.95), { surface: 'wall', pd: [W + 2, T, D + 2], pp: [0, Hh + T / 2, (Z0 + Z1) / 2] });
    // 天井の梁・配管・蛍光灯
    for (let z = Z0 + 1; z < Z1; z += 3.2) this.box(W, 0.4, 0.35, 0, Hh - 0.2, z, this.mat('#5a5955', 0.9), { phys: false });
    const pipe = this.mat('#8a8f93', 0.4, 0.6);
    for (const x of [-2.4, -2.1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, D, 12), pipe); m.rotation.x = Math.PI / 2; m.position.set(x, Hh - 0.12, (Z0 + Z1) / 2); this.stage.add(m); }
    for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, -5.2], [1.6, -5.2]]) {
      this.box(0.14, 0.05, 1.3, x, Hh - 0.06, z, this.mat('#ffffff', 0.4, 0, { emissive: '#e8f1ff', emissiveIntensity: 1.3 }), { phys: false });
      const l = new THREE.PointLight('#dfe9ff', 5, 8, 2); l.position.set(x, Hh - 0.3, z); this.stage.add(l);
    }
    const near = new THREE.PointLight('#cfd8e6', 3, 7, 2); near.position.set(0, 2.5, 1.2); this.stage.add(near);
    const key = new THREE.SpotLight('#e9f0ff', 45, 10, 0.7, 0.6, 2);
    key.position.set(0.9, Hh - 0.15, -0.6); key.target.position.set(0.75, 0.4, -2.8);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
    this.stage.add(key, key.target);
    // 柱（下に黄色と黒の帯）
    const col = this.mat('#b3b2ac', 0.9, 0, { map: TX.concreteWall(0.4, 3) });
    const tape = this.mat('#ffffff', 0.7, 0, { map: TX.hazard() });
    for (const [x, z] of [[-3.6, -4.2], [4.0, -5.4], [-3.6, 1.2]]) {
      this.box(0.6, Hh, 0.6, x, Hh / 2, z, col, { surface: 'wall', cast: true });
      for (const [dx, dz, r] of [[0, 0.301, 0], [0, -0.301, Math.PI], [0.301, 0, Math.PI / 2], [-0.301, 0, -Math.PI / 2]]) this.plane(0.6, 0.35, x + dx, 0.2, z + dz, tape, r);
    }
    this.plane(0.5, 0.5, -3.6, 1.9, -3.895, this.mat('#ffffff', 0.5, 0, { map: TX.parkingSign() }));
    // 車と、車に合わせた白線
    const carPos = new THREE.Vector3(0.75, 0, -2.8), carYaw = 1.0;
    const line = this.mat('#e9e8e2', 0.8);
    const R = new THREE.Matrix4().makeRotationY(carYaw);
    const put = (lx, lz, len, alongX) => { const p = new THREE.Vector3(lx, 0.004, lz).applyMatrix4(R).add(carPos); const m = this.plane(alongX ? len : 0.12, alongX ? 0.12 : len, p.x, 0.004, p.z, line, carYaw, -Math.PI / 2); m.receiveShadow = true; };
    put(0.2, 1.3, 5.4, true); put(0.2, -1.3, 5.4, true); put(2.9, 0, 2.6, false);
    // 周りのカラーコーン
    for (const [x, z] of [[-2.6, -3.4], [3.3, -3.6]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 20), this.mat('#e0551f', 0.6)); c.castShadow = true;
      this.addDynamic(c, new CANNON.Cylinder(0.02, 0.16, 0.5, 10), 0.8, new THREE.Vector3(x, 0.251, z), { kind: 'plastic' });
    }
    this.car = new Car(this, carPos, carYaw);
  }

  // ================ 倉庫と巨大な壺 =================
  // ハンマー：1つのステージに叩く物は1種類だけ。物ごとに部屋が違う
  //  皿の山→閉店後のレストランの厨房、壺・石の甕→夜の美術館、モニター→深夜のオフィス
  _hammerRoom() {
    const K = {
      plates: { opts: { type: 'plates' }, room: 'restaurant', furniture: 'table', r: 1.3, pitch: -0.42 },
      vase: { opts: { style: 'sometsuke', finishHits: 3 }, room: 'museum', r: 2.6, pitch: -0.12 },
      stone: { opts: { style: 'stone', tough: true, finishHits: 8 }, room: 'museum', r: 2.6, pitch: -0.12 },
      monitor: { opts: { type: 'monitor' }, room: 'office', furniture: 'desk', r: 1.2, pitch: -0.3 }
    }[this.hammerKind] || { opts: { style: 'sometsuke', finishHits: 3 }, room: 'museum', r: 2.2, pitch: -0.2 };
    const C = new THREE.Vector3(0, 0, -2.3);
    if (K.room === 'museum') this._museum(C, this.hammerKind === 'stone');
    else if (K.room === 'office') this._office(C);
    else this._restaurant(C);
    const center = C.clone();
    if (K.furniture) center.y = this._furniture(K.furniture, C.x, C.z);
    else center.y = 0.14;
    const slot = { center, opts: { ...K.opts }, vase: null, pending: false, cycle: true };
    this.vaseSlots = [slot];
    slot.vase = this._makeTarget(center, { ...slot.opts }); this.vases.push(slot.vase);
    this.orbitC = C.clone(); this.orbitR = K.r; this.hammerPitch = K.pitch;
  }

  // 床・壁・天井（すり抜けないよう当たり判定は厚め）
  _shell(X, Z0, Z1, Hh, floorMat, wallMat, ceilMat) {
    const W = X * 2, D = Z1 - Z0, T = 1.0, cz = (Z0 + Z1) / 2;
    const f = this.box(W, 0.1, D, 0, -0.05, cz, floorMat, { surface: 'floor', pd: [W + 2, T, D + 2], pp: [0, -T / 2, cz] }); f.userData.surface = 'floor';
    const walls = [
      this.box(W, Hh, 0.1, 0, Hh / 2, Z0 - 0.05, wallMat, { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z0 - T / 2] }),
      this.box(W, Hh, 0.1, 0, Hh / 2, Z1 + 0.05, wallMat, { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z1 + T / 2] }),
      this.box(0.1, Hh, D, -X - 0.05, Hh / 2, cz, wallMat, { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [-X - T / 2, Hh / 2, cz] }),
      this.box(0.1, Hh, D, X + 0.05, Hh / 2, cz, wallMat, { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [X + T / 2, Hh / 2, cz] })
    ];
    walls.forEach(w => { w.userData.surface = 'wall'; });
    this.box(W, 0.1, D, 0, Hh + 0.05, cz, ceilMat, { surface: 'wall', pd: [W + 2, T, D + 2], pp: [0, Hh + T / 2, cz] });
    // 幅木
    const base = this.mat('#1c1c1c', 0.6);
    this.box(W, 0.1, 0.02, 0, 0.05, Z0 + 0.01, base, { phys: false }); this.box(W, 0.1, 0.02, 0, 0.05, Z1 - 0.01, base, { phys: false });
    this.box(0.02, 0.1, D, -X + 0.01, 0.05, cz, base, { phys: false }); this.box(0.02, 0.1, D, X - 0.01, 0.05, cz, base, { phys: false });
  }
  // 壁に貼る板（見た目だけ）。side: 'back'|'front'|'left'|'right'
  _wallPlane(side, X, Z0, Z1, w, h, a, y, material, off = 0.012) {
    if (side === 'back') return this.plane(w, h, a, y, Z0 + off, material, 0);
    if (side === 'front') return this.plane(w, h, a, y, Z1 - off, material, Math.PI);
    if (side === 'left') return this.plane(w, h, -X + off, y, a, material, Math.PI / 2);
    return this.plane(w, h, X - off, y, a, material, -Math.PI / 2);
  }
  _keySpot(C, color, intensity, from, angle = 0.5) {
    const spot = new THREE.SpotLight(color, intensity, 12, angle, 0.55, 2);
    spot.position.copy(from); spot.target.position.set(C.x, 0.9, C.z);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.02;
    this.stage.add(spot, spot.target);
    return spot;
  }

  // ---- 夜の美術館 ----
  _museum(C, stone) {
    const X = 4.2, Z0 = -6.4, Z1 = 1.6, Hh = 4.2;
    this._shell(X, Z0, Z1, Hh, this.mat('#ffffff', 0.25, 0, { map: TX.marble(X * 2 / 1.2, (Z1 - Z0) / 1.2) }), this.mat('#6d6860', 0.9, 0, { map: TX.wallpaper(4, 2) }), this.mat('#161617', 0.95));
    // 額縁の絵（ほのかに照らされているように少し光らせる）
    const frame = this.mat('#3b2f1f', 0.4, 0.5);
    const hang = (side, a, i, w = 1.0, h = 1.25) => {
      const tex = TX.painting(i);
      this._wallPlane(side, X, Z0, Z1, w + 0.12, h + 0.12, a, 1.75, frame, 0.01);
      this._wallPlane(side, X, Z0, Z1, w, h, a, 1.75, this.mat('#ffffff', 0.8, 0, { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 }), 0.02);
    };
    hang('back', -2.3, 0); hang('back', 2.3, 1); hang('left', -3.4, 2, 1.2, 0.9); hang('right', -3.4, 3, 1.2, 0.9); hang('front', -2.4, 1, 0.9, 1.1); hang('front', 2.4, 2, 0.9, 1.1);
    // 絵の上の小さなライト（器具だけ）
    for (const x of [-2.3, 2.3]) this.box(0.5, 0.04, 0.12, x, 2.55, Z0 + 0.1, this.mat('#1a1a1a', 0.5, 0.5), { phys: false });
    // 展示台（壺・甕を置く低い台）
    const plinth = this.box(1.4, 0.14, 1.4, C.x, 0.07, C.z, this.mat(stone ? '#3a3a3c' : '#ece9e2', 0.5), { surface: 'wood' }); plinth.userData.surface = 'wood';
    // 説明パネル（斜めの小さな台）
    const cap = stone ? TX.caption('石の大甕', '制作年不詳・とても重い') : TX.caption('染付大壺', '伝 江戸時代・作者不詳');
    const post = this.box(0.05, 0.9, 0.05, C.x + 1.05, 0.45, C.z + 1.05, this.mat('#1d1d1d', 0.5, 0.4), { phys: false });
    const card = this.plane(0.36, 0.18, C.x + 1.05, 0.95, C.z + 1.08, this.mat('#ffffff', 0.7, 0, { map: cap, emissive: '#ffffff', emissiveMap: cap, emissiveIntensity: 0.25 }), 0, -0.6);
    // 立入禁止のロープ
    const chrome = this.mat('#c8cacc', 0.2, 1), velvet = this.mat('#7a1020', 0.8);
    const posts = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, R = 1.55; // 手前（+z）が入口になるように
      const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R;
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 12), chrome); pm.position.set(x, 0.45, z); pm.castShadow = true; this.stage.add(pm);
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 20), chrome); bm.position.set(x, 0.015, z); this.stage.add(bm);
      const tm = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), chrome); tm.position.set(x, 0.92, z); this.stage.add(tm);
      posts.push(new THREE.Vector3(x, 0.86, z));
    }
    for (let k = 0; k < posts.length; k++) {
      if (k === 1) continue; // 1か所は開いている（入口）
      const a = posts[k], b = posts[(k + 1) % posts.length], m = a.clone().lerp(b, 0.5); m.y -= 0.18;
      const curve = new THREE.QuadraticBezierCurve3(a, m, b);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.016, 6), velvet); rope.castShadow = true; this.stage.add(rope);
    }
    // 両脇の小さな展示（ガラスケースの中の器。割れない飾り）
    const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false });
    for (const sx of [-1, 1]) {
      const x = sx * 3.1, z = -4.6;
      this.box(0.6, 1.0, 0.6, x, 0.5, z, this.mat('#e7e4dd', 0.5), { surface: 'wood', cast: true });
      const vm = new THREE.Mesh(this.lathe([[0, 0], [0.08, 0], [0.12, 0.08], [0.14, 0.2], [0.09, 0.32], [0.06, 0.36], [0.08, 0.4], [0, 0.4]], 24), this.mat(sx < 0 ? '#2f5d4a' : '#8a3b2a', 0.3));
      vm.position.set(x, 1.0, z); vm.castShadow = true; this.stage.add(vm);
      this.box(0.58, 0.6, 0.58, x, 1.3, z, glassMat, { phys: false });
    }
    // 非常口の誘導灯
    const ex = TX.exitSign();
    this._wallPlane('front', X, Z0, Z1, 0.6, 0.22, -3.2, 2.7, this.mat('#ffffff', 0.5, 0, { map: ex, emissive: '#ffffff', emissiveMap: ex, emissiveIntensity: 1.0 }), 0.02);
    const exl = new THREE.PointLight('#5cff9c', 0.8, 3, 2); exl.position.set(-3.2, 2.5, Z1 - 0.3); this.stage.add(exl);
    // 明かり：展示物だけを強く、あとは暗く
    this._keySpot(C, '#fff0d8', 80, new THREE.Vector3(0.6, Hh - 0.1, C.z + 1.6), 0.42);
    const fill = new THREE.PointLight('#8fa2bb', 3, 9, 2); fill.position.set(0, 3.2, 0.6); this.stage.add(fill);
    const back = new THREE.PointLight('#aebfd6', 3, 6, 2); back.position.set(0.8, 2.6, -4.8); this.stage.add(back);
  }

  // ---- 深夜のオフィス ----
  _office(C) {
    const X = 4.0, Z0 = -5.6, Z1 = 1.4, Hh = 2.7;
    this._shell(X, Z0, Z1, Hh, this.mat('#ffffff', 0.95, 0, { map: TX.carpet(X * 2, Z1 - Z0) }), this.mat('#b3b1aa', 0.9, 0, { map: TX.wallpaper(4, 2) }), this.mat('#ffffff', 0.9, 0, { map: TX.ceilPanel(X * 2 / 0.6, (Z1 - Z0) / 0.6) }));
    // 奥の窓（夜のビル）
    const bl = TX.nightBlinds();
    this._wallPlane('back', X, Z0, Z1, 6.4, 1.5, 0, 1.45, this.mat('#ffffff', 0.6, 0, { map: bl, emissive: '#ffffff', emissiveMap: bl, emissiveIntensity: 0.55 }), 0.01);
    this.box(6.5, 0.06, 0.08, 0, 0.67, Z0 + 0.04, this.mat('#8d8f92', 0.4, 0.6), { phys: false });
    // ホワイトボードと、キャビネット
    const wb = TX.whiteboard();
    this._wallPlane('left', X, Z0, Z1, 1.8, 0.9, -2.6, 1.5, this.mat('#ffffff', 0.35, 0, { map: wb }), 0.02);
    for (let k = 0; k < 3; k++) {
      const z = -3.6 + k * 0.5;
      this.box(0.5, 1.1, 0.46, X - 0.26, 0.55, z, this.mat('#9ea3a8', 0.45, 0.5), { surface: 'steel', cast: true });
      for (let d = 0; d < 3; d++) this.box(0.01, 0.02, 0.2, X - 0.51, 0.25 + d * 0.33, z, this.mat('#555', 0.4, 0.6), { phys: false });
    }
    // 他の席（消えたモニターと椅子）
    const desk = this.mat('#cfc9bd', 0.5), leg = this.mat('#55585c', 0.6, 0.6), dark = this.mat('#141518', 0.4, 0.2);
    for (const [x, z] of [[-2.5, -1.2], [-2.5, -3.4], [2.3, -0.9], [-2.5, 0.6]]) {
      this.box(1.2, 0.04, 0.65, x, 0.7, z, desk, { surface: 'wood', cast: true });
      for (const sx of [-1, 1]) this.box(0.04, 0.68, 0.6, x + sx * 0.56, 0.34, z, leg, { phys: false });
      this.box(0.55, 0.33, 0.03, x, 1.1, z - 0.18, dark, { phys: false });
      this.box(0.05, 0.22, 0.03, x, 0.83, z - 0.2, leg, { phys: false });
      // 椅子
      const cx = x + 0.1, cz = z + 0.55;
      this.box(0.46, 0.08, 0.46, cx, 0.46, cz, dark, { surface: 'wood', cast: true });
      this.box(0.46, 0.5, 0.06, cx, 0.78, cz + 0.22, dark, { phys: false });
      this.box(0.05, 0.4, 0.05, cx, 0.22, cz, leg, { phys: false });
    }
    // 観葉植物
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 16), this.mat('#e5e2dc', 0.6)); pot.position.set(3.4, 0.2, 0.7); pot.castShadow = true; this.stage.add(pot);
    for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.mat('#2f5a33', 0.8)); l.scale.set(1, 1.4, 1); l.position.set(3.4 + Math.cos(k) * 0.14, 0.7 + k * 0.1, 0.7 + Math.sin(k * 2) * 0.14); this.stage.add(l); }
    // 天井の照明：この席の上だけ点いている
    const tube = (x, z, on) => this.box(1.2, 0.03, 0.22, x, Hh - 0.02, z, this.mat('#ffffff', 0.4, 0, { emissive: '#e8f1ff', emissiveIntensity: on ? 1.4 : 0.06 }), { phys: false });
    for (const x of [-2.4, 0, 2.4]) for (const z of [-4.2, -2.3, -0.4]) tube(x, z, x === 0 && z === -2.3);
    this._keySpot(C, '#eef4ff', 34, new THREE.Vector3(0.1, Hh - 0.08, C.z + 0.3), 0.8);
    const fill = new THREE.PointLight('#6f85a8', 2.5, 8, 2); fill.position.set(0, 2.2, -4.6); this.stage.add(fill);
    const fr = new THREE.PointLight('#8a93a3', 1.2, 6, 2); fr.position.set(0, 2.2, 0.8); this.stage.add(fr);
  }

  // ---- 閉店後の和食屋（定食屋）の厨房 ----
  _restaurant(C) {
    const X = 3.8, Z0 = -5.2, Z1 = 1.4, Hh = 2.7;
    this._shell(X, Z0, Z1, Hh, this.mat('#ffffff', 0.7, 0, { map: TX.kitchenTile(X * 2 / 0.6, (Z1 - Z0) / 0.6) }), this.mat('#e9e1d2', 0.9, 0, { map: TX.wallpaper(4, 2) }), this.mat('#2a2119', 0.9));
    // 腰壁は白いタイル
    const tile = (side, a, len) => this._wallPlane(side, X, Z0, Z1, len, 1.2, a, 0.6, this.mat('#ffffff', 0.35, 0, { map: TX.tiles(len / 0.4, 3) }), 0.01);
    tile('back', 0, X * 2); tile('front', 0, X * 2); tile('left', (Z0 + Z1) / 2, Z1 - Z0); tile('right', (Z0 + Z1) / 2, Z1 - Z0);
    // 天井の梁（木）
    const wood = this.mat('#6b4a2b', 0.7), woodL = this.mat('#a07a4f', 0.65);
    for (const z of [-4.2, -2.3, -0.4]) this.box(X * 2, 0.14, 0.14, 0, Hh - 0.07, z, wood, { phys: false });
    const steel = this.mat('#b9bcbf', 0.28, 0.9), steelDark = this.mat('#6f7275', 0.35, 0.8);
    // 奥：ステンレスの調理台とコンロ、フード
    this.box(6.4, 0.9, 0.7, 0, 0.45, Z0 + 0.35, steel, { surface: 'steel', cast: true });
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20), this.mat('#1a1a1a', 0.6)); b.position.set(-1.2 + k * 0.5, 0.91, Z0 + 0.35); this.stage.add(b); }
    this.box(2.6, 0.45, 0.8, -0.45, 2.1, Z0 + 0.4, steelDark, { phys: false });
    // 寸胴鍋・雪平鍋・土鍋
    const pot = (x, r, h, c, rough = 0.3, metal = 0.9) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, h, 20), this.mat(c, rough, metal)); m.position.set(x, 0.92 + h / 2, Z0 + 0.35); m.castShadow = true; this.stage.add(m); return m; };
    pot(-1.2, 0.17, 0.32, '#a7aaad'); pot(-0.2, 0.12, 0.09, '#b58a55', 0.35, 0.8);
    const donabe = pot(1.5, 0.17, 0.12, '#3b2a22', 0.6, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), this.mat('#4a362b', 0.6)); lid.position.set(1.5, 1.04, Z0 + 0.35); lid.scale.y = 0.5; this.stage.add(lid);
    // 短冊のお品書き（奥の壁の上）
    const menu = [['焼魚定食', '八五〇'], ['唐揚定食', '八八〇'], ['生姜焼き', '八二〇'], ['だし巻き', '四八〇'], ['冷奴', '三〇〇'], ['味噌汁', '一五〇'], ['おでん', '四〇〇'], ['瓶ビール', '六〇〇']];
    menu.forEach(([t, pr], k) => this.plane(0.13, 0.52, 1.05 + k * 0.28, 2.0, Z0 + 0.02, this.mat('#ffffff', 0.8, 0, { map: TX.tanzaku(t, pr) }), 0));
    this.box(2.4, 0.03, 0.03, 2.03, 2.28, Z0 + 0.02, wood, { phys: false });
    // 横：客席への出入口と暖簾、赤提灯
    this._wallPlane('right', X, Z0, Z1, 1.1, 2.0, -2.3, 1.0, this.mat('#0b0806', 0.9), 0.012);
    for (let k = 0; k < 3; k++) {
      const m = this.plane(0.34, 0.75, X - 0.03, 1.6, -2.3 - 0.36 + k * 0.36, this.mat('#ffffff', 0.9, 0, { map: TX.noren(['定', '食', '処'][k]), side: THREE.DoubleSide }), -Math.PI / 2);
      m.rotation.z = (k - 1) * 0.02;
    }
    this.box(0.04, 0.04, 1.2, X - 0.04, 1.99, -2.3, wood, { phys: false });
    const chochin = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), this.mat('#b0261d', 0.7, 0, { emissive: '#ff5a2a', emissiveIntensity: 0.55 }));
    chochin.scale.y = 1.35; chochin.position.set(X - 0.35, 2.05, -1.35); this.stage.add(chochin);
    for (const dy of [0.26, -0.26]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), this.mat('#1a1a1a', 0.6)); r.position.set(X - 0.35, 2.05 + dy, -1.35); this.stage.add(r); }
    const chl = new THREE.PointLight('#ff6a3a', 1.4, 3, 2); chl.position.set(X - 0.5, 2.0, -1.35); this.stage.add(chl);
    // 手前の壁際：木の食器棚に丼と湯呑
    this.box(1.8, 1.5, 0.4, -2.0, 0.75, Z1 - 0.22, woodL, { surface: 'wood', cast: true });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) {
      const bowl = new THREE.Mesh(this.lathe([[0, 0], [0.04, 0], [0.07, 0.04], [0.075, 0.07], [0, 0.06]], 16), this.mat(k % 2 ? '#2f4f6f' : '#efe7d6', 0.35));
      bowl.position.set(-2.7 + k * 0.34, 1.5 + r * 0.001, Z1 - 0.44 - r * 0.001); if (r) bowl.position.y = 1.52; this.stage.add(bowl);
    }
    // 左の壁：黒板（今日の定食）
    const mb = TX.menuBoard();
    this._wallPlane('left', X, Z0, Z1, 0.8, 1.0, -2.2, 1.7, this.mat('#ffffff', 0.8, 0, { map: mb, emissive: '#ffffff', emissiveMap: mb, emissiveIntensity: 0.12 }), 0.02);
    // 和紙のペンダントライト
    const lamp = (x, z, on) => {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.2, 20, 1, true), this.mat('#f3e6c8', 0.9, 0, { side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: on ? 0.6 : 0.05 }));
      shade.position.set(x, 2.15, z); this.stage.add(shade);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, Hh - 2.25, 4), this.mat('#111', 0.8)); cord.position.set(x, (Hh + 2.25) / 2, z); this.stage.add(cord);
    };
    lamp(0, C.z, true); lamp(-2.2, -1.0, false); lamp(2.0, -0.6, false);
    this._keySpot(C, '#ffdcae', 40, new THREE.Vector3(0, 2.1, C.z), 0.9);
    const fill = new THREE.PointLight('#9aa6b8', 2.0, 8, 2); fill.position.set(0, 2.3, 0.6); this.stage.add(fill);
  }

  // 支えが無くなった所に積もっていた破片を消す
  clearDebrisIn(min, max) {
    this.debrisSolid.removeIn(min, max); this.debrisGlass.removeIn(min, max);
    // 止まっていた破片や物も、支えが無くなったら落ちるように起こす
    const bx = new THREE.Box3(min.clone().addScalar(-0.1), max.clone().addScalar(0.1)), v = new THREE.Vector3();
    for (const b of [...this.shards, ...this.dyn.map(r => r.body)]) if (b.world && b.sleepState !== 0 && bx.containsPoint(v.set(b.position.x, b.position.y, b.position.z))) b.wakeUp();
  }
  _makeTarget(center, opts) {
    if (opts.type === 'plates') return new PlateStack(this, center, opts);
    if (opts.type === 'monitor') return new Monitor(this, center, opts);
    return new GiantVase(this, center, opts);
  }
  _respawn(slot, delay) {
    slot.pending = true;
    const stageNow = this.stage;
    const old = slot.vase;
    setTimeout(() => {
      if (this.stage !== stageNow) return;
      if (old && old.dispose) old.dispose();
      if (slot.cycle && !slot.opts.tough && !slot.opts.type) { const st = ['sometsuke', 'seiji', 'kuro']; slot.opts.style = st[(st.indexOf(slot.opts.style) + 1) % 3]; }
      slot.vase = this._makeTarget(slot.center, { ...slot.opts, drop: true });
      this.vases.push(slot.vase); slot.pending = false;
    }, delay);
  }
  // 作業台（皿用）と事務机（モニター用）
  _furniture(kind, x, z) {
    const table = kind === 'table' || kind === 'steel', st = kind === 'steel';
    const H = table ? 0.78 : 0.72, w = table ? 1.3 : 1.2, d = table ? 0.75 : 0.65;
    const top = st ? this.mat('#c3c6c9', 0.25, 0.9) : this.mat(table ? '#8c6a45' : '#cfc9bd', table ? 0.75 : 0.5);
    const leg = st ? this.mat('#9a9da0', 0.3, 0.9) : this.mat(table ? '#5d4630' : '#55585c', 0.6, table ? 0 : 0.6);
    const tm = this.box(w, 0.04, d, x, H - 0.02, z, top, { surface: st ? 'steel' : 'wood', cast: true });
    if (tm) tm.userData.surface = st ? 'steel' : 'wood';
    if (st) this.box(w - 0.1, 0.03, d - 0.1, x, 0.2, z, top, { phys: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.05, H - 0.04, 0.05, x + sx * (w / 2 - 0.06), (H - 0.04) / 2, z + sz * (d / 2 - 0.06), leg, { surface: 'wood', cast: true });
    if (!table) {
      // キーボードとマウス（飾り）
      const kb = this.box(0.44, 0.02, 0.14, x, H + 0.01, z + 0.2, this.mat('#2a2b2e', 0.5), { surface: 'wood' });
      if (kb) kb.userData.surface = 'wood';
      this.box(0.06, 0.02, 0.1, x + 0.34, H + 0.01, z + 0.2, this.mat('#2a2b2e', 0.5), { phys: false });
    }
    return H;
  }

  _warehouse(slotDefs = [{ x: -1.9, opts: { style: 'seiji' } }, { x: 0, opts: { style: 'sometsuke' } }, { x: 1.9, opts: { style: 'kuro' } }]) {
    const hammer = this.stageType === 'hammer';
    const X = 7, Z0 = -8, Z1 = 4, Hh = 6, W = X * 2, D = Z1 - Z0, T = 1.0;
    const floorMat = this.mat('#ffffff', 0.85, 0, { map: TX.concreteFloor(W / 2, D / 2) });
    this.box(W, 0.1, D, 0, -0.05, (Z0 + Z1) / 2, floorMat, { surface: 'floor', pd: [W + 2, T, D + 2], pp: [0, -T / 2, (Z0 + Z1) / 2] });
    const wall = (rx, ry) => this.mat('#ffffff', 0.9, 0, { map: TX.concreteWall(rx, ry) });
    this.box(W, Hh, 0.1, 0, Hh / 2, Z0 - 0.05, wall(W / 1.8, Hh / 0.9), { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z0 - T / 2] });
    this.box(W, Hh, 0.1, 0, Hh / 2, Z1 + 0.05, wall(W / 1.8, Hh / 0.9), { surface: 'wall', pd: [W + 2, Hh + 2, T], pp: [0, Hh / 2, Z1 + T / 2] });
    this.box(0.1, Hh, D, -X - 0.05, Hh / 2, (Z0 + Z1) / 2, wall(D / 1.8, Hh / 0.9), { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [-X - T / 2, Hh / 2, (Z0 + Z1) / 2] });
    this.box(0.1, Hh, D, X + 0.05, Hh / 2, (Z0 + Z1) / 2, wall(D / 1.8, Hh / 0.9), { surface: 'wall', pd: [T, Hh + 2, D + 2], pp: [X + T / 2, Hh / 2, (Z0 + Z1) / 2] });
    this.box(W, 0.1, D, 0, Hh + 0.05, (Z0 + Z1) / 2, this.mat('#3a3a38', 0.95), { surface: 'wall', pd: [W + 2, T, D + 2], pp: [0, Hh + T / 2, (Z0 + Z1) / 2] });
    // 天井の梁と、遠くの蛍光灯
    for (let z = Z0 + 1.5; z < Z1; z += 3) this.box(W, 0.35, 0.25, 0, Hh - 0.18, z, this.mat('#2e2e2c', 0.8), { phys: false });
    for (const [x, z] of [[-3.5, -6], [3.5, -6], [-3.5, 0.5], [3.5, 0.5]]) {
      this.box(1.2, 0.05, 0.12, x, Hh - 0.4, z, this.mat('#ffffff', 0.4, 0, { emissive: '#dfe9f2', emissiveIntensity: 0.9 }), { phys: false });
      const l = new THREE.PointLight('#cfdbe6', 1.2, 7, 2); l.position.set(x, Hh - 0.5, z); this.stage.add(l);
    }
    // 壺を3つ並べ、それぞれスポットライトで照らす
    const wood = this.mat('#9c7a52', 0.8);
    const tape = this.mat('#ffffff', 0.7, 0, { map: TX.hazard() });
    this.vaseSlots = [];
    slotDefs.forEach(({ x, opts, furniture }) => {
      const center = new THREE.Vector3(x, 0.14, -2.3);
      if (furniture) center.y = this._furniture(furniture, x, -2.3);
      const spot = new THREE.SpotLight('#fff0d8', 55, 12, 0.33, 0.55, 2);
      spot.position.set(x + 0.4, 6.0, -0.9); spot.target.position.set(x, 1.0, -2.3);
      if (x === 0) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.02; spot.angle = 0.62; spot.intensity = 70; spot.target.position.set(0, 0.8, -2.3); }
      this.stage.add(spot, spot.target);
      if (!furniture) { const pm = this.box(1.3, 0.14, 1.3, center.x, 0.07, center.z, wood, { surface: 'wood' }); if (pm) pm.userData.surface = 'wood'; }
      this.vaseSlots.push({ center, opts: { ...opts }, vase: null, pending: false, cycle: hammer });
    });
    const fill = new THREE.PointLight('#8fa2bb', 5, 10, 2); fill.position.set(0, 3.2, 2.6); this.stage.add(fill);
    // 区画線
    const sx = hammer ? 3.7 : 3.0, sz = 1.3, cz = -2.3;
    [[0, -sz, 0, sx * 2 + 0.1], [0, sz, 0, sx * 2 + 0.1], [-sx, 0, Math.PI / 2, sz * 2 + 0.1], [sx, 0, Math.PI / 2, sz * 2 + 0.1]].forEach(([dx, dz, r, len]) => {
      const m = this.plane(len, 0.12, dx, 0.003, cz + dz, tape, r, -Math.PI / 2); m.receiveShadow = true;
    });
    // 脇の積まれたパレットとドラム缶
    for (let k = 0; k < 4; k++) this.box(1.2, 0.14, 1.0, -5.0, 0.07 + k * 0.15, -3.5 + (k % 2) * 0.05, wood, { surface: 'wood', cast: true });
    [['#2f5d8a', 4.6, -3.4], ['#8a2f2f', 5.2, -2.8], ['#2f5d8a', 4.9, -4.2]].forEach(([c, x, z]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), this.mat(c, 0.5, 0.4)); m.position.set(x, 0.44, z); m.castShadow = m.receiveShadow = true; this.stage.add(m);
      const b = new CANNON.Body({ mass: 0 }); b.addShape(new CANNON.Cylinder(0.29, 0.29, 0.88, 12)); b.position.set(x, 0.44, z); b.ud = { static: true, surface: 'steel' }; this.physics.addBody(b);
    });
    for (const slot of this.vaseSlots) { slot.vase = this._makeTarget(slot.center, { ...slot.opts }); this.vases.push(slot.vase); }
  }

  _room() {
    const { x0, x1, z0, z1, h } = ROOM;
    const W = x1 - x0, D = z1 - z0;
    const wallMat = (rx, ry) => this.mat('#cfc6b4', 0.9, 0, { map: TX.wallpaper(rx, ry) });
    // 床
    const T = 1.0;
    this.box(W, 0.1, D, 0, -0.05, (z0 + z1) / 2, this.mat('#ffffff', 0.55, 0, { map: TX.floor(W / 0.6, D / 1.2) }), { surface: 'floor', pd: [W + 2, T, D + 2], pp: [0, -T / 2, (z0 + z1) / 2] });
    // 天井
    this.box(W, 0.1, D, 0, h + 0.05, (z0 + z1) / 2, this.mat('#bdb5a6', 0.95), { surface: 'wall', pd: [W + 2, T, D + 2], pp: [0, h + T / 2, (z0 + z1) / 2] });
    // 奥の壁・左右の壁・背後の壁
    this.box(W, h, 0.1, 0, h / 2, z0 - 0.05, wallMat(W / 0.8, h / 0.8), { surface: 'wall', pd: [W + 2, h + 2, T], pp: [0, h / 2, z0 - T / 2] });
    this.box(0.1, h, D, x0 - 0.05, h / 2, (z0 + z1) / 2, wallMat(D / 0.8, h / 0.8), { surface: 'wall', pd: [T, h + 2, D + 2], pp: [x0 - T / 2, h / 2, (z0 + z1) / 2] });
    this.box(0.1, h, D, x1 + 0.05, h / 2, (z0 + z1) / 2, wallMat(D / 0.8, h / 0.8), { surface: 'wall', pd: [T, h + 2, D + 2], pp: [x1 + T / 2, h / 2, (z0 + z1) / 2] });
    this.box(W, h, 0.1, 0, h / 2, z1 + 0.05, wallMat(W / 0.8, h / 0.8), { surface: 'wall', pd: [W + 2, h + 2, T], pp: [0, h / 2, z1 + T / 2] });
    // 巾木
    const skirting = this.mat('#8a7b68', 0.6);
    this.box(W, 0.06, 0.01, 0, 0.03, z0 + 0.005, skirting, { phys: false });
    this.box(0.01, 0.06, D, x0 + 0.005, 0.03, (z0 + z1) / 2, skirting, { phys: false });
    this.box(0.01, 0.06, D, x1 - 0.005, 0.03, (z0 + z1) / 2, skirting, { phys: false });
    // 丸い蛍光灯
    this.lampMat = this.mat('#ffffff', 0.4, 0, { emissive: '#ffe9c8', emissiveIntensity: 0.9 });
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 40), this.lampMat);
    lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 2.33, 0.5); this.stage.add(lamp);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 40), this.mat('#f7f5ef', 0.3, 0, { transparent: true, opacity: 0.55, emissive: '#f3dcb8', emissiveIntensity: 0.18 }));
    shade.position.set(0, 2.34, 0.5); this.stage.add(shade);
    this.lampMeshes = [lamp, shade];
    { const lb = new CANNON.Body({ mass: 0 }); lb.addShape(new CANNON.Cylinder(0.3, 0.3, 0.08, 12)); lb.position.set(0, 2.33, 0.5); lb.ud = { static: true, surface: 'lamp' }; this.physics.addBody(lb); this.lampBody = lb; }
    // 左の壁の窓（型板ガラスの引き違い窓）
    const frame = this.mat('#b8bcbf', 0.35, 0.6);
    this.plane(0.72, 0.92, x0 + 0.004, 1.45, 1.15, this.mat('#0c1320', 1), Math.PI / 2); // 窓の外（夜）
    this.windowPane = this.plane(0.72, 0.92, x0 + 0.012, 1.45, 1.15, this.mat('#ffffff', 0.3, 0, { map: TX.frosted(), color: '#6f8196', emissive: '#2c3b4d', emissiveIntensity: 0.6 }), Math.PI / 2);
    { const wb = new CANNON.Body({ mass: 0 }); wb.addShape(new CANNON.Box(new CANNON.Vec3(0.02, 0.46, 0.36))); wb.position.set(x0 + 0.02, 1.45, 1.15); wb.ud = { static: true, surface: 'window' }; this.physics.addBody(wb); }
    this.box(0.04, 0.04, 0.8, x0 + 0.02, 1.93, 1.15, frame, { phys: false });
    this.box(0.04, 0.04, 0.8, x0 + 0.02, 0.97, 1.15, frame, { phys: false });
    this.box(0.04, 0.96, 0.04, x0 + 0.02, 1.45, 0.77, frame, { phys: false });
    this.box(0.04, 0.96, 0.04, x0 + 0.02, 1.45, 1.53, frame, { phys: false });
    this.box(0.03, 0.92, 0.03, x0 + 0.03, 1.45, 1.15, frame, { phys: false });
    // 右の壁のカレンダー
    this.plane(0.3, 0.4, x1 - 0.005, 1.55, -0.05, this.mat('#ffffff', 0.8, 0, { map: TX.calendar() }), -Math.PI / 2);
  }

  _counter() {
    const Y = COUNTER_Y, F = COUNTER_FRONT, B = ROOM.z0;
    const cream = this.mat('#e4d4b4', 0.55);
    const cream2 = this.mat('#dccba8', 0.55);
    const handleMat = this.mat('#6d5237', 0.5, 0.1);
    const steelMat = this.mat('#ffffff', 0.32, 0.85, { map: TX.steel() });
    const X0 = -1.35, X1 = 1.25;
    // 下の収納本体（物理はひとまとめ）
    this.box(X1 - X0, 0.74, 0.63, (X0 + X1) / 2, 0.45, (B + F - 0.02) / 2, cream2, { surface: 'wood', pd: [X1 - X0, 0.62, 0.63], pp: [(X0 + X1) / 2, 0.31, (B + F - 0.02) / 2] });
    this.box(X1 - X0, 0.08, 0.58, (X0 + X1) / 2, 0.04, (B + F - 0.07) / 2, this.mat('#3c3a36', 0.8), { phys: false });
    // 扉
    const doors = [[-1.35, -0.8], [-0.8, -0.3], [-0.3, 0.2], [0.2, 0.55], [0.9, 1.25]];
    doors.forEach(([a, b], i) => {
      this.box(b - a - 0.008, 0.7, 0.018, (a + b) / 2, 0.45, F + 0.009, i % 2 ? cream : this.mat('#e8dabd', 0.55), { phys: false });
      this.box(0.012, 0.16, 0.02, i % 2 ? a + 0.04 : b - 0.04, 0.65, F + 0.028, handleMat, { phys: false });
    });
    // 魚焼きグリルの扉とつまみ
    this.box(0.34, 0.14, 0.02, 0.725, 0.72, F + 0.01, this.mat('#2d2f31', 0.35, 0.3), { phys: false });
    this.box(0.26, 0.05, 0.005, 0.725, 0.73, F + 0.021, this.mat('#111', 0.1, 0.2, { transparent: true, opacity: 0.8 }), { phys: false });
    this.box(0.34, 0.54, 0.018, 0.725, 0.37, F + 0.009, this.mat('#e3e0d8', 0.4, 0.2), { phys: false });
    [0.6, 0.85].forEach(x => {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.025, 20), this.mat('#1d1e20', 0.4));
      k.rotation.x = Math.PI / 2; k.position.set(x, 0.61, F + 0.03); this.stage.add(k);
    });
    // タオル掛けとタオル
    this.box(0.3, 0.012, 0.012, -1.07, 0.78, F + 0.04, this.mat('#c9c9c9', 0.3, 0.8), { phys: false });
    const towel = this.box(0.26, 0.34, 0.012, -1.07, 0.62, F + 0.052, this.mat('#9fb7c9', 0.95), { phys: false });
    towel.material.map = TX.label('towel', '#a9c0cf', '', '#fff', '#e8eef2'); towel.material.map.rotation = Math.PI / 2;

    // ステンレス天板（シンクの穴を開けて4枚）
    // 見た目は3cmの天板、物理はシンク底の高さまでの厚い塊（すり抜け防止）
    const top = (x0, x1, z0, z1) => this.box(x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, Y - 0.015, (z0 + z1) / 2, steelMat, { surface: 'steel', pd: [x1 - x0, Y - 0.62, z1 - z0], pp: [(x0 + x1) / 2, (Y + 0.62) / 2, (z0 + z1) / 2] });
    const SX0 = -0.75, SX1 = 0.15, SZ0 = -0.8, SZ1 = -0.4;
    top(X0 - 0.02, SX0, B, F + 0.02); top(SX1, X1 + 0.02, B, F + 0.02);
    top(SX0, SX1, SZ1, F + 0.02); top(SX0, SX1, B, SZ0);
    // シンク
    const sinkMat = this.mat('#c7cacb', 0.25, 0.9);
    this.box(SX1 - SX0, 0.02, SZ1 - SZ0, (SX0 + SX1) / 2, 0.63, (SZ0 + SZ1) / 2, sinkMat, { surface: 'steel' });
    this.box(0.01, 0.2, SZ1 - SZ0, SX0 + 0.005, 0.74, (SZ0 + SZ1) / 2, sinkMat, { surface: 'steel' });
    this.box(0.01, 0.2, SZ1 - SZ0, SX1 - 0.005, 0.74, (SZ0 + SZ1) / 2, sinkMat, { surface: 'steel' });
    this.box(SX1 - SX0, 0.2, 0.01, (SX0 + SX1) / 2, 0.74, SZ0 + 0.005, sinkMat, { surface: 'steel' });
    this.box(SX1 - SX0, 0.2, 0.01, (SX0 + SX1) / 2, 0.74, SZ1 - 0.005, sinkMat, { surface: 'steel' });
    // 水栓
    const chrome = this.mat('#dfe2e4', 0.12, 1);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 16), chrome);
    post.position.set(-0.3, Y + 0.12, -0.87); this.stage.add(post);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 12), chrome);
    spout.rotation.x = Math.PI / 2; spout.position.set(-0.3, Y + 0.22, -0.77); this.stage.add(spout);
    this.box(0.1, 0.012, 0.02, -0.3, Y + 0.26, -0.9, chrome, { phys: false });
    const fb = new CANNON.Body({ mass: 0 }); fb.addShape(new CANNON.Cylinder(0.025, 0.025, 0.26, 8)); fb.position.set(-0.3, Y + 0.13, -0.87); fb.ud = { surface: 'steel', static: true }; this.physics.addBody(fb);

    // ガスコンロ（2口＋グリル）
    const stove = this.box(0.75, 0.02, 0.45, 0.725, Y + 0.01, -0.625, this.mat('#ffffff', 0.25, 0.3, { map: TX.stoveTop() }), { surface: 'steel' });
    stove.material.map.repeat.set(1, 1);
    [0.52, 0.93].forEach(x => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), this.mat('#151515', 0.5, 0.4));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, Y + 0.03, -0.62); this.stage.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.012), this.mat('#101010', 0.6, 0.3));
        t.position.set(x + Math.cos(a) * 0.09, Y + 0.035, -0.62 + Math.sin(a) * 0.09); t.rotation.y = -a; this.stage.add(t);
      }
      // ゴトク（物理は平らな台として）
      const gb = new CANNON.Body({ mass: 0 }); gb.addShape(new CANNON.Box(new CANNON.Vec3(0.13, 0.01, 0.13))); gb.position.set(x, Y + 0.035, -0.62); gb.ud = { surface: 'steel', static: true }; this.physics.addBody(gb);
    });
    // 奥の壁のタイル
    this.plane(X1 - X0, 0.67, (X0 + X1) / 2, Y + 0.335, B + 0.002, this.mat('#ffffff', 0.25, 0, { map: TX.tiles((X1 - X0) / 0.4, 0.67 / 0.4) }));
    this.plane(0.9, 0.2, 0.75, Y + 0.77, B + 0.002, this.mat('#ffffff', 0.25, 0, { map: TX.tiles(0.9 / 0.4, 0.2 / 0.4) }));
    // 吊り戸棚
    this.box(1.63, 0.8, 0.33, -0.535, 1.9, B + 0.165, cream2, { surface: 'wood' });
    [[-1.35, -0.8], [-0.8, -0.26], [-0.26, 0.28]].forEach(([a, b]) => {
      this.box(b - a - 0.008, 0.78, 0.018, (a + b) / 2, 1.9, B + 0.34, cream, { phys: false });
      this.box(0.14, 0.012, 0.02, (a + b) / 2, 1.54, B + 0.36, handleMat, { phys: false });
    });
    // 手元灯
    this.box(0.9, 0.025, 0.05, -0.55, 1.487, B + 0.25, this.mat('#ffffff', 0.4, 0, { emissive: '#fffaf0', emissiveIntensity: 1.2 }), { phys: false });
    // レンジフード
    const hoodMat = this.mat('#cfccc3', 0.45, 0.2);
    this.box(0.9, 0.6, 0.5, 0.75, 2.1, B + 0.25, hoodMat, { surface: 'steel' });
    this.box(0.9, 0.06, 0.5, 0.75, 1.77, B + 0.25, this.mat('#d6d4ce', 0.4, 0.3), { surface: 'steel' });
    // マット
    const m = this.plane(1.2, 0.5, -0.3, 0.004, 0.0, this.mat('#ffffff', 0.95, 0, { map: TX.mat() }), 0, -Math.PI / 2);
    m.receiveShadow = true;
  }

  _fridge() {
    const x0 = 1.33, x1 = 1.99, z0 = ROOM.z0, zf = -0.3, h = 1.78;
    const body = this.mat('#e6e7e4', 0.3, 0.25);
    this.box(x1 - x0, h, zf - z0, (x0 + x1) / 2, h / 2, (z0 + zf) / 2, body, { surface: 'fridge', cast: false });
    // 凹む前面（細かく分割した板）
    const W = 0.64, H = 1.72;
    const g = new THREE.PlaneGeometry(W, H, 36, 96);
    const front = new THREE.Mesh(g, this.mat('#ffffff', 0.2, 0.35, { map: TX.fridgeFront(), envMapIntensity: 1.3 }));
    front.position.set((x0 + x1) / 2, 0.04 + H / 2, zf + 0.004); front.receiveShadow = true;
    this.stage.add(front); this.fridgeFront = front; this.fridgeZ = zf;
    // 取っ手
    const hm = this.mat('#c9cbcc', 0.25, 0.8);
    this.box(0.02, 0.35, 0.03, x0 + 0.06, 1.35, zf + 0.02, hm, { phys: false });
    this.box(0.2, 0.02, 0.03, (x0 + x1) / 2, 0.93, zf + 0.02, hm, { phys: false });
    this.box(0.2, 0.02, 0.03, (x0 + x1) / 2, 0.5, zf + 0.02, hm, { phys: false });
    // メモとマグネット
    this.plane(0.1, 0.125, 1.8, 1.3, zf + 0.008, this.mat('#ffffff', 0.9, 0, { map: TX.memo() }), 0);
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), this.mat('#d23b2f', 0.4));
    mag.rotation.x = Math.PI / 2; mag.position.set(1.8, 1.355, zf + 0.012); this.stage.add(mag);
    const mag2 = mag.clone(); mag2.material = this.mat('#2f6fd2', 0.4); mag2.position.set(1.55, 1.62, zf + 0.012); this.stage.add(mag2);
  }

  _cupboard() {
    // 左の壁のオープン食器棚
    const x0 = ROOM.x0, x1 = -1.88, z0 = -0.55, z1 = 0.55, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dz = z1 - z0, dx = x1 - x0;
    const wood = this.mat('#b98f62', 0.6), woodD = this.mat('#a47b52', 0.6);
    this.box(dx, 0.85, dz, cx, 0.425, cz, woodD, { surface: 'wood' });
    [z0 + 0.275, z0 + 0.825].forEach(z => this.box(0.012, 0.12, 0.02, x1 + 0.012, 0.7, z, this.mat('#5b4530', 0.4), { phys: false }));
    this.box(0.004, 0.8, dz - 0.02, x1 + 0.003, 0.43, cz, this.mat('#9c744c', 0.6), { phys: false });
    this.box(dx, 0.03, dz, cx, 0.865, cz, wood, { surface: 'wood' });
    this.box(0.02, 1.25, dz, x0 + 0.01, 1.5, cz, woodD, { surface: 'wood' });
    this.box(dx, 1.25, 0.02, cx, 1.5, z0 + 0.01, wood, { surface: 'wood' });
    this.box(dx, 1.25, 0.02, cx, 1.5, z1 - 0.01, wood, { surface: 'wood' });
    [1.28, 1.6, 1.9].forEach(y => this.box(dx, 0.025, dz - 0.04, cx, y, cz, wood, { surface: 'wood' }));
    this.box(dx, 0.03, dz, cx, 2.12, cz, wood, { surface: 'wood' });
    this.cup = { x: cx + 0.02, z0: z0 + 0.06, z1: z1 - 0.06 };
    // ゴミ箱（奥の左の角）
    this.bins = [[-2.1, '#8c9398'], [-1.72, '#6f8fa3']];
  }

  _rack() {
    // 右の壁のスチールラック
    const x0 = 1.84, x1 = 2.27, z0 = 0.15, z1 = 0.75;
    const chrome = this.mat('#d6d9db', 0.2, 0.9);
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 10), chrome); p.position.set(x, 0.75, z); this.stage.add(p);
    });
    this.rackShelves = [0.4, 0.88, 1.36];
    this.rackShelves.forEach(y => this.box(x1 - x0 + 0.03, 0.02, z1 - z0 + 0.03, (x0 + x1) / 2, y, (z0 + z1) / 2, this.mat('#cfd3d5', 0.35, 0.8), { surface: 'steel' }));
    this.rack = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }

  // ================ 動く小物 =================
  addDynamic(mesh, shape, mass, pos, ud, opt = {}) {
    const b = new CANNON.Body({ mass, material: opt.material || this.matDefault });
    if (Array.isArray(shape)) shape.forEach(([s, off, q]) => b.addShape(s, off, q)); else b.addShape(shape);
    b.position.set(pos.x, pos.y, pos.z);
    if (opt.rotY) b.quaternion.setFromEuler(opt.rotX || 0, opt.rotY, opt.rotZ || 0);
    else if (opt.rotX || opt.rotZ) b.quaternion.setFromEuler(opt.rotX || 0, 0, opt.rotZ || 0);
    b.linearDamping = 0.02; b.angularDamping = 0.05;
    b.sleepSpeedLimit = 0.12; b.sleepTimeLimit = 0.6;
    b.ud = { mesh, ...ud, born: this.clock };
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.stage.add(mesh); this.physics.addBody(b);
    if (opt.sleep !== false) b.sleep();
    b.addEventListener('collide', (e) => this._queue(b, e));
    const rec = { body: b, mesh };
    this.dyn.push(rec);
    mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion);
    return b;
  }

  _queue(self, e) {
    const c = e.contact, other = e.body;
    const v = Math.abs(c.getImpactVelocityAlongNormal());
    const selfIsI = c.bi === self;
    const p = selfIsI ? c.bj.position.vadd(c.rj) : c.bi.position.vadd(c.ri);
    const n = selfIsI ? c.ni.negate() : c.ni.clone();
    this.events.push({ self, other, v, point: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(n.x, n.y, n.z) });
  }

  // 形の定義
  lathe(pts, seg = 24) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); }

  makePlate() {
    const g = this.lathe([[0, 0], [0.07, 0], [0.075, 0.004], [0.105, 0.014], [0.11, 0.02], [0.104, 0.021], [0.07, 0.008], [0, 0.007]], 32);
    g.translate(0, -0.011, 0);
    const m = new THREE.Mesh(g, this.mat('#f6f4ee', 0.25, 0, { side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.002, 4, 40), this.mat('#2e56a0', 0.3));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.007; m.add(rim);
    m.userData.color = new THREE.Color('#f3f1ea');
    return m;
  }
  makeBowl(color = '#efe9dd', band = '#8a3b2a') {
    const g = this.lathe([[0, 0], [0.028, 0], [0.03, 0.005], [0.05, 0.022], [0.06, 0.055], [0.056, 0.056], [0.046, 0.024], [0.026, 0.01], [0, 0.009]], 28);
    g.translate(0, -0.028, 0);
    const m = new THREE.Mesh(g, this.mat(color, 0.3, 0, { side: THREE.DoubleSide }));
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.0025, 4, 32), this.mat(band, 0.4));
    r.rotation.x = Math.PI / 2; r.position.y = 0.022; m.add(r);
    m.userData.color = new THREE.Color(color);
    return m;
  }
  makeMug(color) {
    const g = this.lathe([[0, 0], [0.038, 0], [0.04, 0.004], [0.04, 0.09], [0.036, 0.09], [0.036, 0.008], [0, 0.008]], 24);
    g.translate(0, -0.045, 0);
    const m = new THREE.Mesh(g, this.mat(color, 0.35, 0, { side: THREE.DoubleSide }));
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16, Math.PI), m.material);
    h.rotation.z = -Math.PI / 2; h.position.set(0.04, 0, 0); m.add(h);
    m.userData.color = new THREE.Color(color);
    return m;
  }
  makeGlass() {
    const g = this.lathe([[0, 0], [0.028, 0], [0.03, 0.002], [0.035, 0.1], [0.032, 0.1], [0.027, 0.008], [0, 0.008]], 24);
    g.translate(0, -0.05, 0);
    const m = new THREE.Mesh(g, this.mat('#dff0f5', 0.04, 0, { transparent: true, opacity: 0.42, side: THREE.DoubleSide, envMapIntensity: 2.2 }));
    m.userData.color = new THREE.Color('#d8eef4');
    m.castShadow = false;
    return m;
  }
  makeEgg() {
    const g = new THREE.SphereGeometry(0.024, 20, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * 1.3); if (y > 0) { p.setX(i, p.getX(i) * (1 - y * 6)); p.setZ(i, p.getZ(i) * (1 - y * 6)); } }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat('#f1e3cc', 0.55));
    m.userData.color = new THREE.Color('#f1e8d8');
    return m;
  }
  makeCan() {
    const i = Math.floor(Math.random() * TX.canLabels.length);
    const g = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 28, 10, false);
    const side = this.mat('#ffffff', 0.25, 0.6, { map: TX.canLabels[i]() });
    const top = this.mat('#cfd2d4', 0.3, 0.9);
    const m = new THREE.Mesh(g, [side, top, top]);
    m.userData.color = new THREE.Color('#b8bcc0');
    return m;
  }
  makeBottle(color, labelTex, pts, opacity = 1) {
    const g = this.lathe(pts, 20);
    const hgt = pts[pts.length - 1][1];
    g.translate(0, -hgt / 2, 0);
    const m = new THREE.Mesh(g, this.mat(color, 0.15, 0, opacity < 1 ? { transparent: true, opacity, envMapIntensity: 1.8 } : {}));
    if (labelTex) {
      const r = pts[1][0] + 0.001;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt * 0.32, 20, 1, true), this.mat('#ffffff', 0.6, 0, { map: labelTex }));
      l.position.y = -hgt * 0.12; m.add(l);
    }
    m.userData.color = new THREE.Color(color);
    return m;
  }

  _items() {
    const Y = COUNTER_Y;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const cyl = (r, h, n = 12) => new CANNON.Cylinder(r, r, h, n);
    const brk = (kind, shards, color) => ({ breakable: true, kind, shards, breakV: 2.1 });

    // 水切りカゴ（左の天板）
    const tray = this.mat('#dfe7ea', 0.4, 0, { transparent: true, opacity: 0.9 });
    this.box(0.46, 0.015, 0.34, -1.06, Y + 0.008, -0.62, tray, { surface: 'plastic' });
    const wire = this.mat('#d0d4d6', 0.3, 0.8);
    this.box(0.46, 0.13, 0.008, -1.06, Y + 0.075, -0.45, wire, { surface: 'steel', receive: false });
    this.box(0.46, 0.13, 0.008, -1.06, Y + 0.075, -0.79, wire, { surface: 'steel', receive: false });
    this.box(0.008, 0.13, 0.34, -0.83, Y + 0.075, -0.62, wire, { surface: 'steel', receive: false });
    this.box(0.008, 0.13, 0.34, -1.29, Y + 0.075, -0.62, wire, { surface: 'steel', receive: false });
    // 皿の山
    for (let i = 0; i < 3; i++) this.addDynamic(this.makePlate(), cyl(0.105, 0.022), 0.35, V(-1.16, Y + 0.027 + i * 0.022, -0.66), brk('ceramic', 16));
    // 伏せた茶碗
    this.addDynamic(this.makeBowl(), cyl(0.058, 0.056), 0.18, V(-0.96, Y + 0.044, -0.72), brk('ceramic', 12), { rotX: Math.PI });
    this.addDynamic(this.makeBowl('#f4efe5', '#2e56a0'), cyl(0.058, 0.056), 0.18, V(-0.96, Y + 0.044, -0.54), brk('ceramic', 12), { rotX: Math.PI });
    this.addDynamic(this.makeGlass(), cyl(0.034, 0.1), 0.2, V(-1.2, Y + 0.066, -0.5), brk('glass', 18));
    this.addDynamic(this.makeMug('#c9583e'), cyl(0.04, 0.09), 0.3, V(-1.05, Y + 0.061, -0.5), brk('ceramic', 12));
    // シンクの縁：洗剤とスポンジ
    this.addDynamic(this.makeBottle('#7fc3a0', TX.label('soap', '#ffffff', '洗剤', '#2d7a55'), [[0, 0], [0.03, 0], [0.03, 0.15], [0.012, 0.18], [0.012, 0.2], [0, 0.2]], 0.85), cyl(0.03, 0.2), 0.45, V(0.05, Y + 0.101, -0.87), { kind: 'plastic' });
    const sponge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.065), [this.mat('#f2d23c', 0.9), this.mat('#f2d23c', 0.9), this.mat('#3d8b4a', 0.95), this.mat('#f2d23c', 0.9), this.mat('#f2d23c', 0.9), this.mat('#f2d23c', 0.9)]);
    this.addDynamic(sponge, new CANNON.Box(new CANNON.Vec3(0.05, 0.015, 0.0325)), 0.02, V(-0.12, Y + 0.016, -0.87), { kind: 'soft' });

    // コンロ：フライパンとやかん
    const pan = new THREE.Mesh(this.lathe([[0, 0], [0.1, 0], [0.13, 0.045], [0.125, 0.046], [0.096, 0.006], [0, 0.006]], 32), this.mat('#2c2d2f', 0.45, 0.5, { side: THREE.DoubleSide }));
    pan.geometry.translate(0, -0.023, 0);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.03), this.mat('#1b1411', 0.6)); handle.position.set(0.21, 0.012, 0); pan.add(handle);
    this.addDynamic(pan, [[new CANNON.Cylinder(0.13, 0.1, 0.046, 12)], [new CANNON.Box(new CANNON.Vec3(0.09, 0.01, 0.015)), new CANNON.Vec3(0.21, 0.012, 0)]], 1.0, V(0.52, Y + 0.07, -0.62), { kind: 'metal' }, { rotY: -0.5 });
    const ket = new THREE.Mesh(this.lathe([[0, 0], [0.1, 0], [0.105, 0.06], [0.09, 0.13], [0.03, 0.16], [0, 0.165]], 28), this.mat('#d9dcdd', 0.2, 0.9));
    ket.geometry.translate(0, -0.08, 0);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.11, 10), ket.material); sp.rotation.z = -1.0; sp.position.set(0.12, 0.02, 0); ket.add(sp);
    const kh = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.007, 8, 20, Math.PI), this.mat('#222', 0.5)); kh.position.y = 0.08; ket.add(kh);
    this.addDynamic(ket, cyl(0.1, 0.16), 0.8, V(0.93, Y + 0.126, -0.62), { kind: 'metal' }, { rotY: 2.3 });

    // コンロの奥の調味料
    const S = Y + 0.001;
    this.addDynamic(this.makeBottle('#3a1f12', TX.label('soy', '#f3eee4', 'しょうゆ', '#7a1d12', '#b8322a'), [[0, 0], [0.04, 0], [0.04, 0.17], [0.016, 0.2], [0.015, 0.23], [0, 0.23]], 0.9), cyl(0.04, 0.23), 0.9, V(0.42, S + 0.115, -0.9), { ...brk('glass', 20), liquid: '#2a1209' });
    this.addDynamic(this.makeBottle('#b88a3c', TX.label('mirin', '#2e2a26', 'みりん', '#e7c56d'), [[0, 0], [0.034, 0], [0.034, 0.16], [0.013, 0.22], [0.013, 0.26], [0, 0.26]], 0.8), cyl(0.034, 0.26), 0.7, V(0.52, S + 0.13, -0.9), { ...brk('glass', 20), liquid: '#b07a2a' });
    this.addDynamic(this.makeBottle('#e8c64a', TX.label('oil', '#ffffff', 'サラダ油', '#8a6a12'), [[0, 0], [0.038, 0], [0.038, 0.18], [0.016, 0.22], [0.016, 0.24], [0, 0.24]], 0.8), cyl(0.038, 0.24), 0.9, V(0.62, S + 0.12, -0.9), { ...brk('glass', 20), liquid: '#d7a52a' });
    const salt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.075), this.mat('#ffffff', 0.5, 0, { map: TX.label('salt', '#ffffff', '食塩', '#2455a4', '#2455a4') }));
    this.addDynamic(salt, new CANNON.Box(new CANNON.Vec3(0.0375, 0.055, 0.0375)), 0.25, V(0.74, S + 0.055, -0.9), { kind: 'plastic' });
    const pepper = this.makeBottle('#6a5a48', null, [[0, 0], [0.022, 0], [0.022, 0.1], [0, 0.11]]);
    this.addDynamic(pepper, cyl(0.022, 0.11), 0.1, V(0.83, S + 0.055, -0.9), brk('glass', 10));
    // 菜箸立て
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.14, 20), this.mat('#c9c2b4', 0.5));
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 6), this.mat('#b0875a', 0.6)); st.position.set(rand(-0.02, 0.02), 0.1, rand(-0.02, 0.02)); st.rotation.z = rand(-0.1, 0.1); holder.add(st); }
    this.addDynamic(holder, cyl(0.045, 0.14), 0.3, V(0.25, Y + 0.071, -0.8), { kind: 'plastic' });

    // 冷蔵庫の上のカゴ
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.26), this.mat('#c7a574', 0.9));
    this.addDynamic(basket, new CANNON.Box(new CANNON.Vec3(0.18, 0.06, 0.13)), 0.5, V(1.66, 1.78 + 0.061, -0.62), { kind: 'soft' });
    const tissue = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.12), this.mat('#f1f0ea', 0.8, 0, { map: TX.label('tissue', '#f1f0ea', 'tissue', '#9ab', '#bcd') }));
    this.addDynamic(tissue, new CANNON.Box(new CANNON.Vec3(0.12, 0.045, 0.06)), 0.15, V(1.63, 1.78 + 0.168, -0.62), { kind: 'soft' });

    // 食器棚の中身
    const cx = this.cup.x, zs = (i, n) => this.cup.z0 + (this.cup.z1 - this.cup.z0) * (i + 0.5) / n;
    // 下段の台：電気ポットとトースター
    const pot = new THREE.Mesh(this.lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.09, 0.22], [0.07, 0.25], [0, 0.25]], 28), this.mat('#f2f0ea', 0.35));
    pot.geometry.translate(0, -0.125, 0);
    this.addDynamic(pot, cyl(0.093, 0.25), 1.6, V(cx, 0.88 + 0.126, zs(0, 3)), { kind: 'plastic' });
    const toaster = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), this.mat('#e9e6df', 0.35, 0.1));
    this.addDynamic(toaster, new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.15)), 2.0, V(cx, 0.88 + 0.101, zs(2, 3) + 0.04), { kind: 'plastic' });
    // 棚1：皿の山×2、茶碗
    for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) this.addDynamic(this.makePlate(), cyl(0.105, 0.022), 0.35, V(cx, 1.293 + 0.012 + i * 0.022, zs(s * 2, 3)), brk('ceramic', 16));
    this.addDynamic(this.makeBowl(), cyl(0.058, 0.056), 0.18, V(cx, 1.293 + 0.029, zs(1, 3) - 0.03), brk('ceramic', 12));
    this.addDynamic(this.makeBowl('#3b4a5a', '#c8b27a'), cyl(0.058, 0.056), 0.18, V(cx, 1.293 + 0.029, zs(1, 3) + 0.1), brk('ceramic', 12));
    // 棚2：マグとグラス
    const mugs = ['#f0ede4', '#5a7d9a', '#d8b64a'];
    for (let i = 0; i < 6; i++) {
      const z = this.cup.z0 + 0.06 + i * 0.16;
      if (i % 2) this.addDynamic(this.makeGlass(), cyl(0.034, 0.1), 0.2, V(cx, 1.6125 + 0.051, z), brk('glass', 18));
      else this.addDynamic(this.makeMug(mugs[i / 2]), cyl(0.04, 0.09), 0.3, V(cx, 1.6125 + 0.046, z), brk('ceramic', 12), { rotY: Math.PI });
    }
    // 棚3：どんぶりと大皿
    this.addDynamic(this.makeBowl('#eae3d3', '#6b3b2a'), cyl(0.058, 0.056), 0.18, V(cx, 1.9125 + 0.029, zs(0, 3)), brk('ceramic', 12));
    this.addDynamic(this.makePlate(), cyl(0.105, 0.022), 0.35, V(cx, 1.9125 + 0.012, zs(2, 3)), brk('ceramic', 16));

    // ラック：電子レンジ、炊飯器、2Lペットボトル
    const mw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.46), [this.mat('#efeee9', 0.4), this.mat('#efeee9', 0.4), this.mat('#efeee9', 0.4), this.mat('#efeee9', 0.4), this.mat('#efeee9', 0.4), this.mat('#efeee9', 0.4)]);
    mw.material[1] = this.mat('#ffffff', 0.3, 0.1, { map: TX.microwave() });
    this.addDynamic(mw, new CANNON.Box(new CANNON.Vec3(0.18, 0.14, 0.23)), 12, V(this.rack.x, 0.89 + 0.141, this.rack.z), { kind: 'plastic', crackable: true });
    const rc = new THREE.Mesh(this.lathe([[0, 0], [0.12, 0], [0.135, 0.03], [0.135, 0.17], [0.11, 0.21], [0, 0.215]], 28), this.mat('#f4f3ef', 0.3));
    rc.geometry.translate(0, -0.107, 0);
    this.addDynamic(rc, cyl(0.135, 0.215), 3.5, V(this.rack.x, 1.37 + 0.108, this.rack.z), { kind: 'plastic' });
    for (let i = 0; i < 2; i++) {
      const pet = this.makeBottle('#cfe6f0', TX.label('water', '#2f7fb8', 'おいしい水', '#fff'), [[0, 0], [0.05, 0], [0.05, 0.26], [0.02, 0.3], [0.014, 0.31], [0, 0.31]], 0.55);
      this.addDynamic(pet, cyl(0.05, 0.31), 2.0, V(this.rack.x, 0.41 + 0.156, this.rack.z - 0.12 + i * 0.24), { kind: 'plastic' });
    }

    // 食器棚の台：湯呑みと麦茶ポット
    const yunomi = (c1) => { const m = new THREE.Mesh(this.lathe([[0, 0], [0.026, 0], [0.028, 0.004], [0.034, 0.075], [0.031, 0.075], [0.025, 0.008], [0, 0.008]], 24), this.mat(c1, 0.45, 0, { side: THREE.DoubleSide })); m.geometry.translate(0, -0.0375, 0); m.userData.color = new THREE.Color(c1); return m; };
    this.addDynamic(yunomi('#5f7a4e'), cyl(0.033, 0.075), 0.15, V(cx + 0.03, 0.88 + 0.039, 0.03), brk('ceramic', 10));
    this.addDynamic(yunomi('#8a5a3a'), cyl(0.033, 0.075), 0.15, V(cx - 0.05, 0.88 + 0.039, 0.12), brk('ceramic', 10));
    const pitcher = this.makeBottle('#e8f2f0', null, [[0, 0], [0.048, 0], [0.05, 0.22], [0.046, 0.23], [0, 0.23]], 0.35);
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.15, 20), this.mat('#8a4b16', 0.2, 0, { transparent: true, opacity: 0.75 })); tea.position.y = -0.035; pitcher.add(tea);
    pitcher.userData.color = new THREE.Color('#dff0f4');
    this.addDynamic(pitcher, cyl(0.05, 0.23), 1.2, V(cx, 0.88 + 0.116, -0.12), { ...brk('glass', 22), liquid: '#7a4214' });
    // ゴミの日に出しそびれた空きビン
    for (let i = 0; i < 3; i++) {
      const b = this.makeBottle('#5a3312', TX.label('beer' + i, '#e9dcc0', '', '#fff', '#b8322a'), [[0, 0], [0.036, 0], [0.036, 0.17], [0.014, 0.23], [0.013, 0.29], [0, 0.29]], 0.85);
      this.addDynamic(b, cyl(0.036, 0.29), 0.4, V(-2.18 + i * 0.09, 0.146, -0.52 + (i % 2) * 0.03), brk('glass', 16));
    }
    // 掛け時計（右の壁）。当たると割れて落ちる
    const clock = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.045, 32), this.mat('#3b3530', 0.5)); clock.add(rim);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.135, 32), this.mat('#ffffff', 0.4, 0, { map: TX.clockFace() }));
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    face.position.y = 0.0235; clock.add(face);
    clock.userData.color = new THREE.Color('#3b3530');
    this.addDynamic(clock, cyl(0.15, 0.045), 0.8, V(ROOM.x1 - 0.024, 2.02, -0.05), { kind: 'clock' }, { rotZ: Math.PI / 2, rotY: 0.0001 });

    // ゴミ箱
    this.bins.forEach(([x, c]) => {
      const bin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.28), this.mat(c, 0.55));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.03, 0.29), this.mat('#e7e7e3', 0.5)); lid.position.y = 0.3; bin.add(lid);
      this.addDynamic(bin, new CANNON.Box(new CANNON.Vec3(0.15, 0.3, 0.14)), 1.5, V(x, 0.301, -0.78), { kind: 'plastic' });
    });
  }

  // ================ 手元のアイテム =================
  equip(kind) {
    this.heldKind = kind;
    if (this.heldMesh) { this.hand.remove(this.heldMesh); this.heldMesh = null; }
    this._refill(0);
  }
  _refill(delay) { this.refillAt = this.clock + delay + 1e-4; } // 0だと「補充なし」と区別できないので少し足す
 _spawnHeld() {
    if (this.heldKind === 'hammer') { const h = this.makeHammer(); this.heldMesh = h; this.hand.add(h); this.handT = 0; return; }
    const m = this.heldKind === 'glass' ? this.makeGlass() : this.heldKind === 'egg' ? this.makeEgg() : this.makeCan();
    m.castShadow = false;
    if (this.heldKind === 'can') m.rotation.z = 0.25;
    m.scale.setScalar(THROW_SCALE * 0.8);
    this.heldMesh = m; this.hand.add(m); this.handT = 0;
  }
  setHold(on) { this.holding = on; }
  get handReady() { return !!this.heldMesh && this.handT > 0.25 && !this.hammerAnim; }

  // ================ ハンマー =================
  makeHammer() {
    const g = new THREE.Group();
    const wood = this.mat('#8a5e36', 0.6), grip = this.mat('#1c1c1c', 0.8), steel = this.mat('#8d9296', 0.3, 0.9);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.4, 12), wood); handle.position.y = 0.16; g.add(handle);
    const rub = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 12), grip); rub.position.y = 0.0; g.add(rub);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), steel); head.position.set(0, 0.35, -0.01); g.add(head);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.03, 16), steel); face.rotation.x = Math.PI / 2; face.position.set(0, 0.35, -0.095); g.add(face);
    g.traverse(o => { o.castShadow = false; });
    g.userData.pose = { x: 0.35, z: 0.3 };
    g.rotation.set(0.35, 0, 0.3);
    return g;
  }

  // 振り下ろす。当たるのは画面の真ん中の先
  swingHammer(swing) {
    if (!this.heldMesh || this.hammerAnim) return;
    const v = 3 + 18 * clamp(swing.power - 0.5, 0, 0.5);
    this.hammerAnim = { t: 0, v, struck: false, power: swing.power };
  }

  _strike(v) {
    const cam = this.camera;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.stage.updateMatrixWorld(true);
    const pieceOf = (o) => { for (let q = o; q; q = q.parent) for (const vs of this.vases) { const i = vs.pieces.findIndex(p => p.mesh === q && p.attached); if (i >= 0) return [vs, i]; } return null; };
    // 飛んでいる破片や外れたかけらは素通りして、その奥の本体を叩く
    const moving = new Set(this.dyn.map(r => r.mesh));
    for (const sb of this.shards) if (sb.ud && sb.ud.mesh) moving.add(sb.ud.mesh);
    const isMoving = (o) => { for (let q = o; q; q = q.parent) if (moving.has(q)) return true; return false; };
    const rc = new THREE.Raycaster(); rc.near = 0.1; rc.far = 3.0;
    const cast = (dir) => {
      rc.set(cam.position, dir);
      for (const h of rc.intersectObjects(this.stage.children, true)) {
        if (!h.object.isMesh) continue;
        const pc = pieceOf(h.object);
        if (pc) return { pc, h };
        if (isMoving(h.object)) continue;
        if (h.object.material && h.object.material.depthWrite === false) continue; // 跡やしぶきは素通り
        return { h };
      }
      return null;
    };
    // 真ん中が穴を抜けたときは、すぐ周りの縁を叩く
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    let res = cast(look);
    if (!res || !res.pc) {
      search: for (const a of [0.05, 0.1, 0.16, 0.23, 0.31, 0.4]) for (let k = 0; k < 10; k++) {
        const t = k / 10 * Math.PI * 2 + a * 7;
        const d = look.clone().addScaledVector(right, Math.cos(t) * a).addScaledVector(up, Math.sin(t) * a).normalize();
        const r2 = cast(d); if (r2 && r2.pc) { res = r2; break search; }
      }
    }
    if (!res) return false;
    const h = res.h;
    haptics.hit(clamp(v / 10, 0.4, 1));
    if (res.pc) {
      const [vs, i] = res.pc;
      if (!vs.drop) vs.hit(i, h.point, v, 1.2, look, 'hammer');
      return true;
    }
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : look.clone().negate();
    if (n.dot(look) > 0) n.negate();
    const surface = h.object.userData.surface || (h.point.y < 0.02 ? 'floor' : 'wall');
    this._scuff(h.point, n, { ud: { static: true, surface } }, Math.max(2.6, v), 1.2);
    sfx.knock(Math.max(3, v * 0.7), surface === 'wood' ? 0.8 : 0.5);
    return true;
  }

  _updateHammer(dt) {
    const h = this.heldMesh, a = this.hammerAnim;
    if (!h || this.heldKind !== 'hammer') return;
    const P = h.userData.pose;
    let rx = P.x, rz = P.z, px = 0, py = 0, pz = 0;
    if (a) {
      a.t += dt;
      const T1 = 0.13, T2 = 0.2, T3 = 0.52;
      if (a.t < T1) { const k = a.t / T1, e = k * k; rx = lerp(P.x, -1.25, e); rz = lerp(P.z, 0.55, e); px = -0.07 * e; pz = -0.06 * e; py = 0.06 * e; }
      else if (a.t < T2) { rx = -1.25; rz = 0.55; px = -0.07; pz = -0.06; py = 0.06; }
      else { const k = Math.min(1, (a.t - T2) / (T3 - T2)), e = 1 - Math.pow(1 - k, 3); rx = lerp(-1.25, P.x, e); rz = lerp(0.55, P.z, e); px = -0.07 * (1 - e); pz = -0.06 * (1 - e); py = 0.06 * (1 - e); }
      if (!a.struck && a.t >= T1 * 0.85) { a.struck = true; if (!this._strike(a.v)) sfx.whoosh(0.3); }
      if (a.t >= T3) this.hammerAnim = null;
    }
    h.rotation.set(rx, 0, rz);
    h.position.set(px, py, pz);
  }

  // 投げる。yaw:右が正、pitch:上が正（振りの成分）
  throwHeld(swing) {
    if (!this.heldMesh) return null;
    const cam = this.camera;
    // 見ている方向 ＋ 振った方向。
    // センサーの方向はブレるので、はっきり横／下に振ったときだけ曲げる（それ以外はまっすぐ）
    let sy = 0, sp = 0;
    // 横は「はっきり横に振った」ときだけ。曲げても画面の中に収まる範囲まで
    const ay = Math.abs(swing.yaw);
    const hHalf = Math.atan(Math.tan(cam.fov / 2 * D2R) * cam.aspect);
    if (ay > 42 * D2R) sy = Math.sign(swing.yaw) * clamp(8 * D2R + (ay - 42 * D2R) * 0.5, 8 * D2R, hHalf * 0.8);
    if (swing.pitch < -32 * D2R) sp = -clamp(30 * D2R + (-swing.pitch - 32 * D2R) * 0.9, 30 * D2R, 65 * D2R);
    else if (swing.pitch > 35 * D2R) sp = 12 * D2R;
    const speed = 6 + 5 * swing.power;
    // 画面中央の先にある面までの距離（まっすぐ投げたらそこに当たるように重力分を補正）
    const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const hit = new THREE.Raycaster(cam.position, look, 0.2, 8).intersectObjects(this.stage.children, true)[0];
    const dist = hit ? hit.distance : 3;
    const comp = 0.5 * Math.asin(clamp(9.82 * dist / (speed * speed), 0, 1));
    // 手元から「画面中央の先の点」へ向ける（手が右下にあるぶんのズレをなくす）
    const handPos = new THREE.Vector3(); this.heldMesh.getWorldPosition(handPos);
    const aim = cam.position.clone().addScaledVector(look, dist).sub(handPos).normalize();
    const yaw0 = Math.atan2(-aim.x, -aim.z), pitch0 = Math.asin(clamp(aim.y, -1, 1));
    let yaw = yaw0 - sy;
    let pitch = clamp(pitch0 + sp + comp * Math.max(0, 1 + sp / (40 * D2R)), -85 * D2R, 70 * D2R);
    // 写真のステージでは、写真の範囲の外へは飛ばさない
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

    const world = new THREE.Vector3(); this.heldMesh.getWorldPosition(world);
    const q = new THREE.Quaternion(); this.heldMesh.getWorldQuaternion(q);
    this.hand.remove(this.heldMesh);
    const mesh = this.heldMesh; this.heldMesh = null;
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(THROW_SCALE);
    const S = THROW_SCALE;

    let body;
    const kind = this.heldKind;
    if (kind === 'glass') body = this.addDynamic(mesh, new CANNON.Cylinder(0.034 * S, 0.03 * S, 0.1 * S, 12), 0.26, world, { breakable: true, kind: 'glass', shards: 22, breakV: 0.9, thrown: true }, { sleep: false });
    else if (kind === 'egg') body = this.addDynamic(mesh, new CANNON.Sphere(0.026 * S), 0.08, world, { kind: 'egg', thrown: true }, { sleep: false, material: this.matEgg });
    else { body = this.addDynamic(mesh, new CANNON.Cylinder(0.033 * S, 0.033 * S, 0.122 * S, 12), 0.42, world, { kind: 'can', thrown: true, dents: 0 }, { sleep: false, material: this.matCan }); this.cans.push(body); }
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.velocity.set(dir.x * speed, dir.y * speed, dir.z * speed);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const spin = kind === 'can' ? rand(8, 18) : rand(4, 10);
    body.angularVelocity.set(right.x * spin + rand(-2, 2), rand(-3, 3), right.z * spin + rand(-2, 2));
    this._addTrail(body, kind);
    this._trimCans();
    this._refill(0.34);
    return { dir, speed };
  }

  // 飛んでいる物の軌跡（カメラに向いた細い帯）
  _addTrail(body, kind) {
    const N = 14;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const alpha = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const a = Math.pow(1 - i / (N - 1), 1.6); alpha[i * 2] = a; alpha[i * 2 + 1] = a; }
    g.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
    const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    if (!this._trailMat) {
      this._trailMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#fff3e0') }, uFade: { value: 1 } },
        vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * 0.55 * uFade); }'
      });
    }
    const mat = this._trailMat.clone();
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
    this.stage.add(mesh);
    const p = body.position;
    const pts = Array.from({ length: N }, () => new THREE.Vector3(p.x, p.y, p.z));
    this.trails.push({ body, mesh, pts, width: kind === 'can' ? 0.05 : 0.04, fade: 1, done: false });
  }
  _updateTrails(dt) {
    const cam = this.camera.position;
    const tmp = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (const t of this.trails) {
      const b = t.body;
      if (!t.done && (b.ud.hit || b.ud.dead || !b.world)) t.done = true;
      if (!t.done) { t.pts.pop(); t.pts.unshift(new THREE.Vector3(b.position.x, b.position.y, b.position.z)); }
      else { t.fade -= dt / 0.25; t.pts.pop(); t.pts.push(t.pts[t.pts.length - 1].clone()); }
      const pos = t.mesh.geometry.attributes.position;
      for (let i = 0; i < t.pts.length; i++) {
        const a = t.pts[i], b2 = t.pts[Math.min(i + 1, t.pts.length - 1)], c = t.pts[Math.max(i - 1, 0)];
        tmp.subVectors(c, b2); if (tmp.lengthSq() < 1e-8) tmp.set(0, 0, 1);
        toCam.subVectors(cam, a);
        side.crossVectors(tmp, toCam).normalize().multiplyScalar(t.width * (1 - i / t.pts.length) * 0.5);
        pos.setXYZ(i * 2, a.x + side.x, a.y + side.y, a.z + side.z);
        pos.setXYZ(i * 2 + 1, a.x - side.x, a.y - side.y, a.z - side.z);
      }
      pos.needsUpdate = true;
      t.mesh.material.uniforms.uFade.value = Math.max(0, t.fade);
    }
    for (const t of this.trails) if (t.fade <= 0) { t.mesh.parent && t.mesh.parent.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
    this.trails = this.trails.filter(t => t.fade > 0);
  }

  _trimCans() {
    while (this.cans.length > LIMITS.cans) {
      const b = this.cans.shift();
      this._freeze(b);
    }
  }
  // 物理から外して見た目だけ残す
  _freeze(b) {
    if (!b.world) return;
    this.physics.removeBody(b);
    this.dyn = this.dyn.filter(r => r.body !== b);
  }
  _remove(b) {
    if (b.world) this.physics.removeBody(b);
    const m = b.ud.mesh; if (m && m.parent) m.parent.remove(m);
    this.dyn = this.dyn.filter(r => r.body !== b);
  }

  // ================ 衝突の処理 =================
  _processEvents() {
    const evs = this.events; this.events = [];
    for (const e of evs) {
      const b = e.self, ud = b.ud;
      if (!b.world || ud.dead) continue;
      const oud = e.other.ud || {};
      const v = e.v;
      if (ud.thrown && !ud.hit) { ud.hit = true; haptics.hit(clamp(v / 10, 0, 1)); }
      // 冷蔵庫が凹む
      if (oud.surface === 'fridge' && v > 2 && ud.kind !== 'egg' && ud.kind !== 'shard' && ud.kind !== 'shell') {
        this._dentFridge(e.point, v, b.mass);
        sfx.metal(v * Math.min(1, b.mass * 2.5));
      }
      const solid = ud.kind !== 'shard' && ud.kind !== 'shell';
      // 車に当たった
      if (oud.car && solid && (ud.carHits || 0) < 2 && (ud.thrown || v > 3)) {
        ud.carHits = (ud.carHits || 0) + 1;
        oud.car.hit(oud.part, e.point, e.normal.clone(), v, b.mass, ud.kind);
      }
      // 巨大な壺に当たった
      if (oud.vase && solid && v > 1.5 && (ud.thrown || ud.kind === 'vasePiece') && (ud.vaseHits || 0) < 2) {
        ud.vaseHits = (ud.vaseHits || 0) + 1;
        const vs = oud.vase; if (vs.pieces[oud.idx].attached) vs.hit(oud.idx, e.point, v, b.mass, e.normal.clone().negate(), ud.kind);
      }
      // 窓ガラス・天井の照明
      if (oud.surface === 'window' && solid && v > 2) this._hitWindow(e.point, e.normal, v);
      if (oud.surface === 'lamp' && solid && v > 1.8) this._breakLamp();
      // レンジの扉ガラスにひび（レンジ側のイベント。法線はレンジの内向きなので反転）
      if (ud.crackable && v > 2.5 && (ud.cracks || 0) < 3 && (e.other.ud || {}).kind !== 'shard') {
        ud.cracks = (ud.cracks || 0) + 1;
        this._decal(e.point, e.normal.clone().negate(), TX.glassCrack(ud.cracks), 0.16 + Math.min(0.1, v * 0.01), b, 0.004);
        sfx.glass(0.25);
      }
      // 当たった所に傷（投げた物、または重い物が勢いよく当たったとき）
      if (oud.static && oud.surface !== 'window' && oud.surface !== 'lamp' && oud.surface !== 'vase' && oud.surface !== 'car' && ud.kind !== 'vasePiece' && v > 2.5 && ud.kind !== 'egg' && solid && (ud.scuffs || 0) < 4 && (ud.thrown || b.mass >= 0.5)) {
        ud.scuffs = (ud.scuffs || 0) + 1;
        this._scuff(e.point, e.normal, e.other, v, b.mass);
      }
      switch (ud.kind) {
        case 'egg':
          if (v > 0.5) { ud.dead = true; this._splat(e.point, e.normal, e.other, v); this._remove(b); }
          break;
        case 'can':
          if (v > 0.5) sfx.can(v);
          if (v > 2.6) this._dentCan(b, e.point, v);
          break;
        case 'vasePiece':
          if (v > 2.2 && oud.static && !oud.vase) {
            sfx.ceramic(clamp(v / 14, 0.15, 0.5));
            if (v > 3.5 && Math.random() < 0.6) for (let i = 0; i < 3; i++) this._shard(e.point.clone().addScaledVector(e.normal, 0.02), new THREE.Vector3(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)), rand(0.01, 0.025), 0.006, (Math.random() < 0.5 && b.ud.color) ? b.ud.color.clone() : new THREE.Color('#cdb592'), false);
          }
          break;
        case 'clock':
          if (!ud.cracked && v > 1.2) {
            ud.cracked = true;
            const c = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshStandardMaterial({ map: TX.glassCrack(7), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            c.quaternion.copy(ud.mesh.children[1].quaternion); c.position.y = 0.025; ud.mesh.add(c);
            sfx.glass(0.45); this._breakHaptic();
          } else if (ud.cracked && oud.static && oud.surface === 'floor' && v > 3) {
            ud.dead = true; ud.shards = 18; this._break(b, v, e.point, e.normal);
          } else if (v > 1) sfx.knock(v, 0.8);
          break;
        case 'shard': case 'shell':
          if (v > 0.7 && Math.random() < 0.5) sfx.tink(v);
          break;
        default:
          if (ud.breakable && v > ud.breakV) { ud.dead = true; this._break(b, v, e.point, e.normal); }
          else if (v > 1.2 && !this._early()) {
            if (ud.kind === 'metal') sfx.can(v * 0.6);
            else if (ud.kind === 'glass' || ud.kind === 'ceramic') sfx.tink(v * 2);
            else sfx.knock(v, ud.kind === 'soft' ? 0.7 : 1);
          }
      }
    }
  }
  _early() { return this.clock < this._wakeGuard; }

  _break(b, v, point, normal) {
    const ud = b.ud, m = ud.mesh;
    const glass = ud.kind === 'glass';
    let pos = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
    // 高速で壁にめり込んだときは、ぶつかった面の手前から破片を出す
    if (point && normal && pos.distanceTo(point) > 0.04) pos = point.clone().addScaledVector(normal, 0.05);
    const vel = b.velocity;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const rad = Math.max(size.x, size.y, size.z) / 2;
    const color = m.userData.color || new THREE.Color('#fff');
    this._remove(b);
    const n = ud.shards || 14;
    for (let i = 0; i < n; i++) {
      const s = rad * rand(0.25, 0.5);
      const off = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(rad * 0.6);
      if (normal && off.dot(normal) < 0) off.addScaledVector(normal, -2 * off.dot(normal));
      const dir = off.clone().normalize();
      const pv = new THREE.Vector3(vel.x * 0.35, vel.y * 0.2, vel.z * 0.35)
        .addScaledVector(dir, rand(0.6, 1.4) * (0.8 + v * 0.22)).add(new THREE.Vector3(0, rand(0.3, 1.4), 0));
      if (normal) pv.addScaledVector(normal, rand(0.4, 1.6));
      this._shard(pos.clone().add(off), pv, s, glass ? 0.002 : 0.004, color, glass);
    }
    if (glass) sfx.glass(clamp(v / 9, 0.3, 1)); else sfx.ceramic(clamp(v / 9, 0.3, 1));
    this._breakHaptic();
    if (ud.liquid) this._spill(ud.liquid, pos, point, normal, rad);
  }

  _shard(pos, vel, size, thick, color, glass, kind = 'shard') {
    const g = shardGeometry(size, thick);
    const c = color.clone().offsetHSL(0, 0, rand(-0.06, 0.04));
    const mat = glass ? this._glassShardMat || (this._glassShardMat = this.mat('#e6f6fb', 0.04, 0.35, { transparent: true, opacity: 0.8, envMapIntensity: 3.2, side: THREE.DoubleSide }))
      : this.mat(c, 0.35, 0, { side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat); m.userData.color = c;
    const b = new CANNON.Body({ mass: 0.004, material: this.matDefault });
    b.addShape(new CANNON.Box(new CANNON.Vec3(size * 0.55, Math.max(0.002, thick), size * 0.55)));
    b.position.set(pos.x, pos.y, pos.z);
    b.quaternion.setFromEuler(rand(0, 6), rand(0, 6), rand(0, 6));
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
    b.linearDamping = 0.05; b.angularDamping = 0.3;
    b.sleepSpeedLimit = 0.08; b.sleepTimeLimit = 0.35;
    b.ud = { mesh: m, kind, glass, born: this.clock };
    m.castShadow = !glass;
    this.stage.add(m); this.physics.addBody(b);
    b.addEventListener('collide', (e) => this._queue(b, e));
    this.dyn.push({ body: b, mesh: m }); this.shards.push(b);
    // 動いている破片が多すぎたら古いものから床に固定
    while (this.shards.length > LIMITS.activeShards) this._bake(this.shards[0]);
  }

  // 落ち着いた破片をまとめ描画へ移す
  _bake(b) {
    this.shards = this.shards.filter(x => x !== b);
    const m = b.ud.mesh;
    m.position.copy(b.position); m.quaternion.copy(b.quaternion);
    (b.ud.glass ? this.debrisGlass : this.debrisSolid).add(m);
    this._remove(b);
    m.geometry.dispose();
  }

  _splat(point, normal, other, v) {
    const oud = other.ud || {};
    const size = rand(0.13, 0.2) * (0.8 + Math.min(1, v / 10) * 0.5) * THROW_SCALE;
    const tex = TX.splat(Math.floor(Math.random() * 3));
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    m.quaternion.copy(q); m.rotateZ(rand(0, Math.PI * 2));
    m.position.copy(point).addScaledVector(normal, 0.003);
    const target = oud.car ? oud.car.group : oud.vase ? oud.vase.pieces[oud.idx].mesh : (oud.static ? this.stage : (oud.mesh || this.stage));
    this.stage.add(m); m.updateMatrixWorld(true);
    if (target !== this.stage) target.attach(m);
    this.splats.push(m);
    // 壁などの垂直面は垂れる
    if (Math.abs(normal.y) < 0.5 && Math.random() < 0.85) {
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.14), new THREE.MeshStandardMaterial({ map: TX.drip(), transparent: true, depthWrite: false, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -4 }));
      dm.geometry.translate(0, -0.07, 0);
      const dq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
      dm.quaternion.copy(dq);
      // 板の「下」を世界の下向きにそろえる
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dq);
      const want = new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
      const ang = up.angleTo(want) * Math.sign(new THREE.Vector3().crossVectors(up, want).dot(normal));
      dm.rotateZ(ang);
      dm.position.copy(point).addScaledVector(normal, 0.004).add(new THREE.Vector3(rand(-0.02, 0.02), -0.01, 0));
      dm.scale.y = 0.05; dm.userData.grow = { t: 0, len: rand(0.5, 1.4) };
      this.stage.add(dm); dm.updateMatrixWorld(true);
      if (target !== this.stage) target.attach(dm);
      this.drips.push(dm); this.splats.push(dm);
    }
    while (this.splats.length > LIMITS.splats) { const o = this.splats.shift(); o.parent && o.parent.remove(o); }
    // 殻のかけら
    for (let i = 0; i < 6; i++) {
      const pv = normal.clone().multiplyScalar(rand(0.3, 1.2)).add(new THREE.Vector3(rand(-0.8, 0.8), rand(0, 0.8), rand(-0.8, 0.8)));
      this._shard(point.clone().addScaledVector(normal, 0.02), pv, rand(0.006, 0.012), 0.0015, new THREE.Color('#f3ead8'), false, 'shell');
    }
    sfx.egg(clamp(v / 9, 0.3, 1));
    this._breakHaptic();
  }

  // 面に貼るデカール（卵の跡・傷の共通）
  _decal(point, normal, tex, size, other, offset = 0.003) {
    const oud = (other && other.ud) || { static: true };
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    m.rotateZ(rand(0, Math.PI * 2));
    m.position.copy(point).addScaledVector(normal, offset);
    this.stage.add(m); m.updateMatrixWorld(true);
    if (!oud.static && oud.mesh) oud.mesh.attach(m);
    this.splats.push(m);
    while (this.splats.length > LIMITS.splats) { const o = this.splats.shift(); o.parent && o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); }
    return m;
  }

  // 当たった面の材質に合わせて傷を残す
  _scuff(point, normal, other, v, mass) {
    const oud = other.ud || {};
    if (!oud.static) return;
    let kind = oud.surface || 'wall';
    if (kind === 'fridge') kind = 'steel';
    if (kind === 'plastic') kind = 'wood';
    // 奥の壁のタイル部分
    if (kind === 'wall' && normal.z > 0.7 && point.z < -0.9 && point.y > 0.85 && point.y < 1.75 && point.x > -1.35 && point.x < 1.25) kind = 'tile';
    const heavy = Math.min(1.6, Math.sqrt(mass / 0.3));
    const strength = Math.min(1, (v - 2) / 7) * heavy;
    if (strength <= 0.05) return;
    // 強く当たると壁に穴
    if (kind === 'wall' && v > 8 && mass >= 0.3) {
      const d = this._decal(point, normal, TX.hole(Math.floor(Math.random() * 3)), 0.16 + strength * 0.1, other, 0.0025);
      d.material.opacity = 1;
    } else {
      const base = kind === 'tile' ? 0.26 : kind === 'floor' ? 0.24 : kind === 'steel' ? 0.16 : 0.2;
      const d = this._decal(point, normal, TX.scuff(kind === 'floor' ? 'floor' : kind, Math.floor(Math.random() * 3)), base * (0.8 + strength * 0.6), other, 0.0025);
      d.material.opacity = Math.min(1, 0.75 + strength * 0.35);
    }
    // 壁のかけらと粉ぼこり
    const chip = { wall: '#e6dfd0', tile: '#f1f0ea', wood: '#b88a58', floor: '#c9a577' }[kind];
    if (chip) {
      const n = Math.round(3 + strength * 9);
      for (let i = 0; i < n; i++) {
        const pv = normal.clone().multiplyScalar(rand(0.4, 1.6)).add(new THREE.Vector3(rand(-0.7, 0.7), rand(0, 0.9), rand(-0.7, 0.7)));
        this._shard(point.clone().addScaledVector(normal, 0.02), pv, rand(0.006, 0.02), 0.004, new THREE.Color(chip), false);
      }
      this._puff(point, normal, kind === 'wood' ? '#cdb08a' : '#e9e4da', 0.6 + strength * 0.8);
    }
  }

  // 中身が飛び散る：当たった面にしぶき、真下（天板か床）に水たまり
  _spill(color, pos, point, normal, rad) {
    const tex = TX.liquid(color);
    if (point && normal) { const d = this._decal(point, normal, tex, 0.22 + rad, null, 0.003); d.material.roughness = 0.1; }
    const onCounter = pos.x > -1.35 && pos.x < 1.25 && pos.z < -0.3 && pos.z > -0.95 && pos.y > 0.84 && !(pos.x > -0.75 && pos.x < 0.15 && pos.z > -0.8 && pos.z < -0.4);
    const y = onCounter ? COUNTER_Y + 0.001 : 0.002;
    const p = new THREE.Vector3(clamp(pos.x, ROOM.x0 + 0.1, ROOM.x1 - 0.1), y, clamp(pos.z, ROOM.z0 + 0.1, ROOM.z1 - 0.1));
    const d2 = this._decal(p, new THREE.Vector3(0, 1, 0), tex, 0.3 + rad * 2, null, 0.002);
    d2.material.roughness = 0.08; d2.scale.setScalar(0.3); d2.userData.grow = { t: 0, len: 1, spread: true };
    this.drips.push(d2);
  }

  // 窓：1回目はひび、2回目（または強く当たると）割れて穴が空く
  _hitWindow(point, normal, v) {
    if (this.windowState >= 2) return;
    if (this.windowState === 0 && v < 9) {
      this.windowState = 1;
      this._decal(point, new THREE.Vector3(1, 0, 0), TX.glassCrack(3), 0.45, null, 0.004);
      sfx.glass(0.6); this._breakHaptic();
      return;
    }
    this.windowState = 2;
    const pane = this.windowPane;
    pane.material = pane.material.clone(); pane.material.map = TX.windowBroken(); pane.material.emissiveIntensity = 0.3;
    for (let i = 0; i < 34; i++) {
      const p = new THREE.Vector3(ROOM.x0 + 0.05, 1.45 + rand(-0.35, 0.35), 1.15 + rand(-0.28, 0.28));
      this._shard(p, new THREE.Vector3(rand(0.5, 2.2), rand(-0.5, 1.2), rand(-0.8, 0.8)), rand(0.015, 0.045), 0.003, new THREE.Color('#dfe9ee'), true);
    }
    this._puff(point, new THREE.Vector3(1, 0, 0), '#e8f0f4', 1.2);
    sfx.glass(1); setTimeout(() => sfx.glass(0.6), 90); this._breakHaptic();
  }

  // 天井の照明：割れて部屋が暗くなる
  _breakLamp() {
    if (this.lampBroken) return;
    this.lampBroken = true;
    this.lampMeshes.forEach(m => { m.visible = false; });
    if (this.lampBody && this.lampBody.world) this.physics.removeBody(this.lampBody);
    for (let i = 0; i < 28; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, 0.26);
      this._shard(new THREE.Vector3(Math.cos(a) * r, 2.3, 0.5 + Math.sin(a) * r), new THREE.Vector3(rand(-0.8, 0.8), rand(-0.5, 0.3), rand(-0.8, 0.8)), rand(0.02, 0.05), 0.003, new THREE.Color('#f4f1ea'), i % 3 === 0);
    }
    this.ceilLight.intensity = 0.25; this.sun.intensity = 0.06;
    sfx.glass(1); sfx.metal(2); this._breakHaptic();
  }

  // 粉ぼこり
  _puff(p, n, color, k = 1) {
    const N = 16, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = p.x + n.x * 0.01; pos[i * 3 + 1] = p.y + n.y * 0.01; pos[i * 3 + 2] = p.z + n.z * 0.01;
      vel.push(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 0.6), rand(-0.6, 0.6)).addScaledVector(n, rand(0.3, 1.3)).multiplyScalar(k));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.05, map: TX.dot(), color, transparent: true, depthWrite: false, opacity: 0.75 });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; this.stage.add(pts);
    this.puffs.push({ pts, vel, t: 0, life: 1.1 });
  }
  _updatePuffs(dt) {
    for (const f of this.puffs) {
      f.t += dt; const a = f.pts.geometry.attributes.position;
      for (let i = 0; i < f.vel.length; i++) {
        const v = f.vel[i]; v.multiplyScalar(Math.exp(-4 * dt)); v.y -= 0.25 * dt;
        a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt);
      }
      a.needsUpdate = true;
      f.pts.material.size = 0.05 + 0.12 * f.t; f.pts.material.opacity = 0.75 * Math.max(0, 1 - f.t / f.life);
    }
    for (const f of this.puffs) if (f.t >= f.life) { f.pts.parent && f.pts.parent.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); }
    this.puffs = this.puffs.filter(f => f.t < f.life);
  }

  _breakHaptic() {
    if (this.clock - (this._lastBreakHap || -1) < 0.18) return;
    this._lastBreakHap = this.clock; haptics.break();
  }

  _dentFridge(point, v, mass) {
    const f = this.fridgeFront; if (!f) return;
    const local = f.worldToLocal(point.clone());
    if (Math.abs(local.x) > 0.34 || Math.abs(local.y) > 0.88) return;
    const depth = Math.min(0.02, 0.0022 * v * Math.sqrt(mass / 0.3));
    const r = rand(0.035, 0.06) * (0.8 + Math.min(1, v / 12) * 0.6);
    const p = f.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - local.x, dy = p.getY(i) - local.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 9 * r * r) continue;
      p.setZ(i, p.getZ(i) - depth * Math.exp(-d2 / (r * r)) * rand(0.9, 1.1));
    }
    p.needsUpdate = true; f.geometry.computeVertexNormals();
  }

  _dentCan(b, point, v) {
    const m = b.ud.mesh; if ((b.ud.dents || 0) > 5) return;
    b.ud.dents = (b.ud.dents || 0) + 1;
    const local = m.worldToLocal(point.clone());
    const p = m.geometry.attributes.position;
    const amt = Math.min(0.012, 0.0022 * v);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = Math.hypot(x - local.x, y - local.y, z - local.z);
      if (d > 0.045) continue;
      const k = amt * Math.exp(-(d * d) / (0.022 * 0.022));
      const rl = Math.hypot(x, z) || 1;
      p.setX(i, x - (x / rl) * k); p.setZ(i, z - (z / rl) * k);
      if (Math.abs(y) > 0.055) p.setY(i, y - Math.sign(y) * k * 0.4);
    }
    p.needsUpdate = true; m.geometry.computeVertexNormals();
  }

  // ================ 毎フレーム =================
  update(dt) {
    this.clock += dt;
    this.physics.step(1 / 120, dt, 8);
    this._processEvents();

    const tq = this._tq || (this._tq = new THREE.Quaternion());
    for (const r of this.dyn) {
      if (r.off) {
        tq.set(r.body.quaternion.x, r.body.quaternion.y, r.body.quaternion.z, r.body.quaternion.w);
        r.mesh.quaternion.copy(tq).multiply(r.meshQuat);
        r.mesh.position.copy(r.off).applyQuaternion(tq).add(r.body.position);
      } else { r.mesh.position.copy(r.body.position); r.mesh.quaternion.copy(r.body.quaternion); }
    }
    // 車：壊し切ったら走り去って、次の車が入ってくる
    if (this.car) {
      const c = this.car; c.update(dt);
      if (c.done && !c.leaving && !c.arrive && this.clock - c.lastHit > 2.5) c.leave();
      if (c.gone) this.car = new Car(this, c.home, c.yaw, { arrive: true });
    }
    // 壺：割り切ったら、少しして同じ場所に次の壺を落とす
    for (const v of this.vases) v.update(dt);
    for (const slot of this.vaseSlots || []) {
      const cur = slot.vase;
      if (cur && cur.done && !cur.drop && !slot.pending && this.clock - cur.lastHit > 1.2) {
        cur.collapseAll();
        this._respawn(slot, 1600);
      }
    }
    this.vases = this.vases.filter(v => (this.vaseSlots || []).some(s => s.vase === v) || v.pieces.some(p => p.dyn));

    // 破片が落ち着いたらまとめ描画へ
    for (const b of [...this.shards]) {
      const age = this.clock - b.ud.born;
      if ((b.sleepState === CANNON.Body.SLEEPING && age > 0.5) || age > 7) this._bake(b);
    }
    this.debrisSolid.flush(); this.debrisGlass.flush();

    this._updateTrails(dt);
    this._updatePuffs(dt);

    // 缶が転がる音
    for (const b of this.cans) {
      if (!b.world) continue;
      const sp = b.velocity.length(), av = b.angularVelocity.length();
      const touching = b.position.y < 0.05 && sp > 0.15 && av > 2.5;
      if (touching) { b.ud.roll = (b.ud.roll || 0) - dt; if (b.ud.roll <= 0) { sfx.canRoll(sp); b.ud.roll = 0.04 + 0.12 / (sp + 0.5); } }
    }
    // 卵の垂れ
    for (const d of this.drips) {
      const gw = d.userData.grow; if (!gw || gw.t >= 1) continue;
      gw.t = Math.min(1, gw.t + dt / 3.5);
      const e = 1 - Math.pow(1 - gw.t, 2);
      if (gw.spread) d.scale.setScalar(0.3 + 0.7 * e); else d.scale.y = 0.05 + (gw.len - 0.05) * e;
    }

    // 手元
    if (!this.heldMesh && this.heldKind && this.refillAt && this.clock >= this.refillAt) { this.refillAt = 0; this._spawnHeld(); }
    if (this.heldMesh) {
      this.handT += dt;
      const k = Math.min(1, this.handT / 0.25), e = 1 - Math.pow(1 - k, 3);
      const grip = this.holding ? 1 : 0;
      const hb = this.heldKind === 'hammer' ? this._hammerBase || (this._hammerBase = new THREE.Vector3(0.2, -0.36, -0.52)) : this.handBase;
      this.hand.position.set(hb.x - grip * 0.02, hb.y - (1 - e) * 0.2 + grip * 0.03 + Math.sin(this.clock * 1.6) * 0.003, hb.z + grip * 0.03);
      this._updateHammer(dt);
    }

    if (this.stageType === 'hammer' && this.orbitC) {
      const c = this.orbitC, r = this.orbitR;
      this.camera.position.set(c.x + Math.sin(this.orbitA) * r, EYE.y, c.z + Math.cos(this.orbitA) * r);
      this.camera.rotation.set(this.pitch, this.orbitA + this.yaw, 0, 'YXZ');
    } else {
      this.camera.position.copy(EYE);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    this.renderer.render(this.scene, this.camera);
  }
}

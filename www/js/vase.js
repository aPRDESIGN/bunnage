// 巨大な壺：最初から見えない割れ目で細かいかけらに分けておき、
// 当たった周りのかけらだけを外す。支えを失ったかけらは崩れ落ちる。
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sfx } from './audio.js?v=202609301439';
import { haptics } from './haptics.js?v=202609301439';
import * as TX from './textures.js?v=202609301439';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 壺の形（高さ→半径）
const PROFILE = [[0, 0.42], [0.08, 0.5], [0.35, 0.72], [0.7, 0.84], [1.05, 0.8], [1.4, 0.64], [1.72, 0.42], [1.9, 0.31], [2.05, 0.33], [2.2, 0.4]];
const H = 2.2, T = 0.05;
function radius(y) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (y <= PROFILE[i][0]) {
      const a = PROFILE[i - 1], b = PROFILE[i], u = (y - a[0]) / (b[0] - a[0]);
      return lerp(a[1], b[1], (1 - Math.cos(u * Math.PI)) / 2);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}
const dRadius = (y) => (radius(Math.min(H, y + 0.005)) - radius(Math.max(0, y - 0.005))) / 0.01;

// 釉薬の模様。3種類（白地に藍の染付／青磁／黒釉に錆色の帯）
const C_BISQUE = new THREE.Color('#cdb592');
const STYLES = {
  sometsuke: { base: '#eceee8', a: '#1f3f86', b: '#3a5fa8' },
  seiji: { base: '#8fb9a3', a: '#6f9d86', b: '#a9cdb9' },
  kuro: { base: '#26211e', a: '#8a4a26', b: '#3a302a' },
  stone: { base: '#8b877f', a: '#6c6861', b: '#aaa69c' }
};
function glazeFor(style) {
  const P = STYLES[style] || STYLES.sometsuke;
  const base = new THREE.Color(P.base), A = new THREE.Color(P.a), B = new THREE.Color(P.b);
  return (th, y, out) => {
    const band = (y > 0.1 && y < 0.16) || (y > 1.62 && y < 1.7) || (y > 2.12 && y < 2.18);
    if (style === 'seiji') {
      // 青磁：ほぼ無地、下に向かって釉溜まりで濃く、細かい貫入
      out.copy(base).lerp(A, clamp(1 - y / 1.2, 0, 0.6));
      if (Math.sin(th * 40 + y * 30) > 0.97 || Math.sin(th * 23 - y * 41) > 0.985) out.lerp(B, 0.8);
      return out;
    }
    if (style === 'stone') {
      // 石：ざらっとした斑点と、うっすら縞
      const n = Math.sin(th * 97 + y * 131) * Math.sin(th * 53 - y * 77);
      const h = Math.sin(th * 1234.5 + y * 4321.7) * 43758.5; const r = h - Math.floor(h);
      out.copy(base).lerp(n > 0.3 ? B : A, clamp(Math.abs(n) * 1.1, 0, 0.85));
      out.multiplyScalar(0.86 + r * 0.26);
      if (Math.sin(y * 9 + Math.sin(th * 2) * 1.5) > 0.93) out.lerp(A, 0.5);
      return out;
    }
    if (style === 'kuro') {
      out.copy(base);
      if (band || (y > 1.35 && y < 1.55)) out.copy(A);
      else if (Math.sin(y * 18 + Math.sin(th * 3) * 2) > 0.8) out.copy(B);
      return out;
    }
    const wave = Math.sin(th * 6 + Math.sin(y * 5) * 1.8) + Math.sin(th * 11 - y * 3) * 0.35;
    const inPanel = y > 0.3 && y < 1.5;
    if (band) out.copy(A);
    else if (inPanel && wave > 0.95) out.copy(B);
    else if (!inPanel && y > 1.72 && y < 2.1 && Math.sin(th * 18) > 0.7) out.copy(B);
    else out.copy(base);
    return out;
  };
}

export class GiantVase {
  constructor(world, center, opts = {}) {
    this.world = world; this.center = center.clone();
    this.nT = opts.nT || 12; this.nY = opts.nY || 8;
    this.glaze = glazeFor(opts.style); this.style = opts.style || 'sometsuke';
    this.baseColor = new THREE.Color((STYLES[this.style] || STYLES.sometsuke).base);
    this.hits = 0;
    // かたい物（石の甕）：弱い一撃では欠けるだけ。強く何回も叩いてやっと割れる
    this.tough = !!opts.tough;
    this.T = this.tough ? 0.09 : T;
    this.finishHits = opts.finishHits || (this.tough ? 8 : 5);
    this.inner = this.tough ? new THREE.Color('#6f6b64') : C_BISQUE;
    this.group = new THREE.Group(); world.stage.add(this.group);
    this.pieces = []; this.detached = 0; this.lastHit = 0;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: this.tough ? 0.85 : 0.22, metalness: 0, envMapIntensity: this.tough ? 0.5 : 1.1 });
    this.drop = opts.drop ? { y: 3.5, vy: 0 } : null;
    this._build();
    if (!this.drop) this._addBodies();
    else this.group.position.y = this.drop.y;
  }

  _build() {
    const { nT, nY } = this;
    // 共有する格子点（少しずらして不規則な割れ目に）
    const G = [];
    for (let i = 0; i <= nT; i++) {
      G.push([]);
      for (let j = 0; j <= nY; j++) {
        const wrap = i === nT;
        const base = wrap ? G[0][j] : null;
        const th = wrap ? base.th + Math.PI * 2 : (i + (j > 0 && j < nY ? rand(-0.32, 0.32) : rand(-0.2, 0.2))) / nT * Math.PI * 2;
        const y = wrap ? base.y : (j === 0 ? 0 : j === nY ? H : (j + rand(-0.3, 0.3)) / nY * H);
        G[i].push({ th, y });
      }
    }
    const S = 3, col = new THREE.Color();
    for (let j = 0; j < nY; j++) for (let i = 0; i < nT; i++) {
      const A = G[i][j], B = G[i + 1][j], C = G[i + 1][j + 1], D = G[i][j + 1];
      const at = (u, v) => ({ th: lerp(lerp(A.th, B.th, u), lerp(D.th, C.th, u), v), y: lerp(lerp(A.y, B.y, u), lerp(D.y, C.y, u), v) });
      const P = (p, r) => new THREE.Vector3(this.center.x + Math.cos(p.th) * r, this.center.y + p.y, this.center.z + Math.sin(p.th) * r);
      const nOut = (p) => new THREE.Vector3(Math.cos(p.th), -dRadius(p.y), Math.sin(p.th)).normalize();
      const pos = [], nor = [], cols = [];
      const tri = (a, b, c, na, nb, nc, ca, cb, cc) => {
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        if (!na) { const f = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize(); na = nb = nc = f; }
        nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
        cols.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
      };
      const grid = [];
      for (let a = 0; a <= S; a++) { grid.push([]); for (let b = 0; b <= S; b++) grid[a].push(at(a / S, b / S)); }
      const TT = this.T, CB = this.inner;
      const outer = (p) => P(p, radius(p.y)), inner = (p) => P(p, Math.max(0.05, radius(p.y) - TT));
      const gc = (p) => this.glaze(p.th, p.y, new THREE.Color());
      // 外側（釉薬）と内側（素焼き）
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
        const p00 = grid[a][b], p10 = grid[a + 1][b], p11 = grid[a + 1][b + 1], p01 = grid[a][b + 1];
        const o = [outer(p00), outer(p10), outer(p11), outer(p01)], n = [nOut(p00), nOut(p10), nOut(p11), nOut(p01)], c = [gc(p00), gc(p10), gc(p11), gc(p01)];
        tri(o[0], o[2], o[1], n[0], n[2], n[1], c[0], c[2], c[1]); tri(o[0], o[3], o[2], n[0], n[3], n[2], c[0], c[3], c[2]);
        const q = [inner(p00), inner(p10), inner(p11), inner(p01)], m = n.map(v => v.clone().negate());
        tri(q[0], q[1], q[2], m[0], m[1], m[2], CB, CB, CB); tri(q[0], q[2], q[3], m[0], m[2], m[3], CB, CB, CB);
      }
      // 割れ口（側面）
      const edge = (list) => {
        for (let k = 0; k < list.length - 1; k++) {
          const p = list[k], q = list[k + 1];
          const a = outer(p), b = outer(q), c = inner(q), d = inner(p);
          tri(a, b, c, null, null, null, CB, CB, CB); tri(a, c, d, null, null, null, CB, CB, CB);
        }
      };
      const bottom = [], right = [], top = [], left = [];
      for (let k = 0; k <= S; k++) { bottom.push(grid[k][0]); right.push(grid[S][k]); top.push(grid[S - k][S]); left.push(grid[0][S - k]); }
      edge(bottom); edge(right); edge(top); edge(left);

      // かけらの中心に寄せる
      const cen = new THREE.Vector3();
      for (let k = 0; k < pos.length; k += 3) cen.add(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]));
      cen.multiplyScalar(3 / pos.length);
      for (let k = 0; k < pos.length; k += 3) { pos[k] -= cen.x; pos[k + 1] -= cen.y; pos[k + 2] -= cen.z; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.copy(cen); mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      // 当たり判定の箱（かけらの中央で面に沿わせる）
      const mid = at(0.5, 0.5), rm = radius(mid.y) - TT / 2;
      const w = Math.abs(lerp(B.th, C.th, 0.5) - lerp(A.th, D.th, 0.5)) * rm, h = Math.abs(lerp(D.y, C.y, 0.5) - lerp(A.y, B.y, 0.5));
      const nrm = nOut(mid), tan = new THREE.Vector3(-Math.sin(mid.th), 0, Math.cos(mid.th)), up = new THREE.Vector3().crossVectors(nrm, tan).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, up, nrm));
      const bodyPos = P(mid, rm);
      this.pieces.push({ i, j, mesh, attached: true, body: null, w: Math.max(0.05, w), h: Math.max(0.05, h), bodyPos, bodyQuat: q, normal: nrm, area: w * h, cracked: 0, hp: this.tough ? 3 : 1 });
    }
  }

  // 壺として立っている間の当たり判定（動かない箱）
  _addBodies() {
    const W = this.world;
    this.pieces.forEach((p, idx) => {
      const b = new CANNON.Body({ mass: 0, material: W.matDefault });
      // すり抜け防止に厚め（外側の面はそのまま、内側へ厚くする）
      const HT = Math.max(0.075, this.T);
      b.addShape(new CANNON.Box(new CANNON.Vec3(p.w / 2 * 0.96, p.h / 2 * 0.96, HT)));
      const c = p.bodyPos.clone().addScaledVector(p.normal, this.T / 2 - HT);
      b.position.set(c.x, c.y, c.z);
      b.quaternion.set(p.bodyQuat.x, p.bodyQuat.y, p.bodyQuat.z, p.bodyQuat.w);
      b.ud = { static: true, surface: 'vase', vase: this, idx };
      W.physics.addBody(b); p.body = b;
    });
  }

  get done() { return this.detached >= this.pieces.length * 0.85; }
  idx(i, j) { const n = this.nT; return j * n + ((i % n) + n) % n; }

  // 当たった：勢いに応じた範囲のかけらを外す。周りにはひび
  hit(idx, point, v, mass, dir, kind) {
    const W = this.world;
    if (kind === 'vasePiece' && W.clock < (this.readyAt || 0)) return;
    const E = 0.5 * mass * v * v;
    if (this.tough && kind !== 'vasePiece') return this._hitTough(idx, point, dir, E);
    let R = 0.2 + 0.055 * Math.sqrt(E);
    if (kind === 'hammer') R *= 0.55; // 6回くらい叩いて割り切れるように、1回で外れる範囲は小さめ
    if (kind === 'egg') R *= 0.2;
    if (kind === 'vasePiece') R *= 0.6;
    const hitP = this.pieces[idx];
    const out = [];
    for (const p of this.pieces) {
      if (!p.attached) continue;
      const d = p.bodyPos.distanceTo(point);
      if (d < R || (p === hitP && E > 4)) out.push([p, d]);
      else if (d < R * 1.7 && !p.cracked) this._crack(p);
    }
    for (const [p, d] of out) {
      const k = 1 - clamp(d / R, 0, 1);
      const vel = dir.clone().multiplyScalar(rand(0.3, 1.2) * v * 0.22 * (0.4 + k))
        .addScaledVector(p.normal, rand(0.2, 1.4) * (0.5 + k))
        .add(new THREE.Vector3(0, rand(0, 1.2), 0));
      this._detach(p, vel);
    }
    if (out.length && kind !== 'vasePiece') this.hits++;
    // だいたい5回で割り切れるように：5回目で残りが一気に崩れる
    if (this.hits >= this.finishHits && !this._finishing) {
      this._finishing = true;
      setTimeout(() => this.collapseAll(), 180);
    }
    if (out.length) {
      sfx.ceramic(clamp(E / 25, 0.5, 1)); sfx.knock(6, 0.45);
      if (out.length > 4) setTimeout(() => sfx.ceramic(0.6), 60);
      haptics.break();
      W._puff(point, hitP.normal, '#efe9dc', 0.8 + Math.min(1, out.length / 10));
      // 小さな破片も散らす
      const n = Math.min(14, 3 + out.length * 2);
      for (let i = 0; i < n; i++) {
        const pv = hitP.normal.clone().multiplyScalar(rand(0.5, 2)).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)));
        W._shard(point.clone().addScaledVector(hitP.normal, 0.03), pv, rand(0.01, 0.035), 0.006, Math.random() < 0.6 ? this.baseColor.clone() : this.inner.clone(), false);
      }
      this._collapse();
    } else if (kind !== 'egg') {
      sfx.knock(4, 0.6); sfx.tink(3);
    }
    this.lastHit = W.clock;
  }

  // かたい物：一撃ごとに傷とひび。かけらごとの体力が尽きたら外れる
  _hitTough(idx, point, dir, E) {
    const W = this.world, hitP = this.pieces[idx];
    this.lastHit = W.clock;
    const n = hitP.normal;
    const mark = W._decal(point, n, TX.scuff('wall', Math.floor(Math.random() * 3)), 0.14 + Math.min(0.16, E * 0.002), null, 0.004);
    mark.material.opacity = 1; mark.material.color.set('#5a5650'); hitP.mesh.attach(mark);
    const chips = (k, size) => {
      for (let i = 0; i < k; i++) {
        const pv = n.clone().multiplyScalar(rand(0.6, 2.2)).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.6), rand(-1, 1)));
        W._shard(point.clone().addScaledVector(n, 0.03), pv, rand(0.008, size), 0.008, Math.random() < 0.5 ? this.baseColor.clone() : this.inner.clone(), false);
      }
    };
    if (E < 25) {
      // 弱い：ゴツッと鈍い音で、表面が少し欠けるだけ
      sfx.knock(5, 0.32); sfx.tink(2); haptics.hit(0.6);
      W._puff(point, n, '#bdb8ae', 0.45); chips(3, 0.02);
      if (!hitP.cracked) this._crack(hitP);
      return;
    }
    const dmg = E > 55 ? 2 : 1;
    const R = 0.16 + 0.025 * Math.sqrt(E);
    const out = [];
    for (const p of this.pieces) {
      if (!p.attached) continue;
      const d = p.bodyPos.distanceTo(point);
      if (p !== hitP && d > R) continue;
      p.hp -= (p === hitP || d < R * 0.6) ? dmg : 1;
      if (p.hp <= 0) out.push([p, d]); else this._crack(p);
    }
    this.hits++;
    for (const [p, d] of out) {
      const k = 1 - clamp(d / R, 0, 1);
      this._detach(p, dir.clone().multiplyScalar(rand(0.3, 1.0) * (0.5 + k)).addScaledVector(p.normal, rand(0.1, 0.8)).add(new THREE.Vector3(0, rand(0, 0.6), 0)));
    }
    sfx.knock(9, 0.28); sfx.thunk(4);
    if (out.length) { sfx.ceramic(0.55); haptics.break(); } else haptics.hit(1);
    W._puff(point, n, '#c9c4b9', 0.9 + out.length * 0.15); chips(6 + out.length * 2, 0.035);
    if (this.hits >= this.finishHits && !this._finishing) { this._finishing = true; setTimeout(() => this.collapseAll(), 180); }
    this._collapse();
  }

  _crack(p) {
    if (p.cracked >= 3) return;
    p.cracked++;
    // ひびが入ったかけらは少しずれて、割れ目が見える
    p.mesh.position.addScaledVector(p.normal, rand(0.003, 0.009));
    p.mesh.rotateOnAxis(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), rand(0.01, 0.03));
  }

  _detach(p, vel) {
    if (!p.attached) return;
    const W = this.world;
    p.attached = false; this.detached++;
    const bp = p.bodyPos, m = Math.max(p.w, p.h) / 2 + 0.08;
    W.clearDebrisIn(new THREE.Vector3(bp.x - m, Math.max(0.35, bp.y - m), bp.z - m), new THREE.Vector3(bp.x + m, bp.y + m + 0.1, bp.z + m));
    if (p.body && p.body.world) W.physics.removeBody(p.body);
    const mesh = p.mesh;
    mesh.updateMatrixWorld(true);
    W.stage.attach(mesh);
    const mass = clamp(p.area * this.T * 2000, 0.4, 8);
    const b = new CANNON.Body({ mass, material: W.matDefault });
    b.addShape(new CANNON.Box(new CANNON.Vec3(p.w / 2 * 0.9, p.h / 2 * 0.9, this.T / 2)));
    b.position.set(p.bodyPos.x, p.bodyPos.y, p.bodyPos.z);
    b.quaternion.set(p.bodyQuat.x, p.bodyQuat.y, p.bodyQuat.z, p.bodyQuat.w);
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
    b.linearDamping = 0.05; b.angularDamping = 0.2; b.sleepSpeedLimit = 0.15; b.sleepTimeLimit = 0.5;
    // 見た目の中心と当たり判定の中心のずれを保つ
    const off = mesh.position.clone().sub(p.bodyPos).applyQuaternion(p.bodyQuat.clone().invert());
    b.ud = { mesh, kind: 'vasePiece', born: W.clock, vase: null, off, color: this.baseColor };
    W.physics.addBody(b);
    b.addEventListener('collide', (e) => W._queue(b, e));
    W.dyn.push({ body: b, mesh, off: new THREE.Vector3().copy(off), meshQuat: p.bodyQuat.clone().invert().multiply(mesh.quaternion.clone()) });
    p.body = b; p.dyn = true;
  }

  // 床から支えがつながっていないかけらを落とす
  _collapse() {
    const { nT, nY } = this;
    const ok = new Set(), q = [];
    for (let i = 0; i < nT; i++) { const p = this.pieces[this.idx(i, 0)]; if (p.attached) { ok.add(p); q.push([i, 0]); } }
    while (q.length) {
      const [i, j] = q.shift();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jj = j + dj; if (jj < 0 || jj >= nY) continue;
        const p = this.pieces[this.idx(i + di, jj)];
        if (p.attached && !ok.has(p)) { ok.add(p); q.push([i + di, jj]); }
      }
    }
    let n = 0;
    for (const p of this.pieces) if (p.attached && !ok.has(p)) { this._detach(p, p.normal.clone().multiplyScalar(rand(0, 0.4)).add(new THREE.Vector3(0, rand(-0.2, 0.3), 0))); n++; }
    // 横のつながりが細くなった段も崩れやすく：1段の残りが3片以下なら上ごと落とす
    for (let j = 1; j < nY; j++) {
      let alive = 0; for (let i = 0; i < nT; i++) if (this.pieces[this.idx(i, j)].attached) alive++;
      if (alive > 0 && alive <= Math.ceil(nT * 0.25)) {
        for (let jj = j; jj < nY; jj++) for (let i = 0; i < nT; i++) { const p = this.pieces[this.idx(i, jj)]; if (p.attached) { this._detach(p, new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3))); n++; } }
        break;
      }
    }
    if (n > 6) { setTimeout(() => { sfx.ceramic(1); sfx.knock(8, 0.35); }, 250); setTimeout(() => sfx.ceramic(0.8), 520); }
  }

  // 残りを一気に崩す
  collapseAll() {
    let n = 0;
    for (const p of this.pieces) if (p.attached) {
      const up = clamp(p.bodyPos.y - this.center.y, 0, 2.2);
      this._detach(p, p.normal.clone().multiplyScalar(rand(0.3, 1.6)).add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.5, 0.8) + up * 0.2, rand(-0.3, 0.3))));
      n++;
    }
    if (n) { sfx.ceramic(1); sfx.knock(10, 0.3); setTimeout(() => sfx.ceramic(1), 120); setTimeout(() => { sfx.ceramic(0.8); sfx.knock(7, 0.35); }, 380); haptics.break(); this.world._puff(this.center.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(0, 1, 0), '#d9d3c6', 2); }
  }

  _bake(p) {
    const W = this.world;
    p.mesh.updateMatrixWorld(true);
    W.debrisSolid.add(p.mesh);
    if (p.body && p.body.world) W.physics.removeBody(p.body);
    W.dyn = W.dyn.filter(r => r.body !== p.body);
    p.mesh.parent && p.mesh.parent.remove(p.mesh);
    p.dyn = false;
  }
  bakeAll() { for (const p of this.pieces) if (p.dyn) this._bake(p); }
  bakeNear(c, r) { for (const p of this.pieces) if (p.dyn && p.mesh.position.distanceTo(c) < r + 1.2) this._bake(p); }

  update(dt) {
    const W = this.world;
    if (this.drop) {
      this.drop.vy -= 9.8 * dt; this.drop.y += this.drop.vy * dt;
      if (this.drop.y <= 0) {
        this.drop = null; this.group.position.y = 0;
        // 前の壺のかけらはその場で止めて床に残す（新しい壺とぶつからないように）
        for (const o of W.vases) if (o !== this) o.bakeNear(this.center, 1.3);
        this.readyAt = W.clock + 1;
        this._addBodies();
        sfx.knock(10, 0.3); sfx.metal(3); haptics.hit(1);
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; W._puff(new THREE.Vector3(this.center.x + Math.cos(a) * 0.6, this.center.y + 0.05, this.center.z + Math.sin(a) * 0.6), new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)), '#b8b4aa', 1.2); }
      } else this.group.position.y = this.drop.y;
    }
    // 落ち着いたかけらはまとめ描画へ
    for (const p of this.pieces) {
      if (!p.dyn || !p.body || !p.body.world) continue;
      const age = W.clock - p.body.ud.born;
      if ((p.body.sleepState === CANNON.Body.SLEEPING && age > 1) || age > 10) this._bake(p);
    }
  }
}

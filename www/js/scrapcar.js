// ハンマーで叩く廃車（スクラップ工場）。車本体は car.js をそのまま使い、叩く用の窓口だけここで用意する
import * as THREE from 'three';
import { Car } from './car.js?v=202609301352';
import { sfx } from './audio.js?v=202609301352';
import { haptics } from './haptics.js?v=202609301352';

export class ScrapCar {
  constructor(world, center, opts = {}) {
    this.world = world; this.center = center.clone();
    this.hits = 0; this.lastHit = 0;
    // 車は横向き（長い方がx）に置く。落としてくるときは作ってから体を後で付ける
    this.car = new Car(world, new THREE.Vector3(center.x, 0, center.z), 0, { scrap: true, arrive: !!opts.drop });
    this.car.arrive = null;
    this.drop = opts.drop ? { y: 4.5, vy: 0 } : null;
    this.car.group.position.set(center.x, this.drop ? this.drop.y : 0, center.z);
    this._pieces();
    this.car.onHood = (mesh) => this.pieces.push({ mesh, part: 'hood', attached: true });
  }

  // 叩いて当たる部品の一覧（ボディ・ガラス・ライト）
  _pieces() {
    const c = this.car;
    this.pieces = [{ mesh: c.shell, part: 'body', attached: true }];
    for (const p of Object.values(c.panes)) this.pieces.push({ mesh: p.mesh, part: 'glass:' + p.id, attached: !p.broken, pane: p });
    for (const l of Object.values(c.lights)) this.pieces.push({ mesh: l.mesh, part: 'light:' + l.id, attached: !l.broken, light: l });
    c.wheels.forEach((w, i) => { this.pieces.push({ mesh: w.tire, part: 'wheel:' + i, attached: true }); this.pieces.push({ mesh: w.face, part: 'wheel:' + i, attached: true, cap: w }); });
  }

  // 叩いた物（メッシュ）が車のどこか：部品ならその番号、ほかの車の一部はボディ扱い
  pieceFor(o) {
    let inCar = false;
    for (let q = o; q; q = q.parent) { const i = this.pieces.findIndex(p => p.mesh === q && p.attached); if (i >= 0) return i; if (q === this.car.group) { inCar = true; break; } }
    return inCar ? 0 : -1;
  }

  // 車は勝手に入れ替えない（入れ替えたいときはメニューの「きれいにする」）
  get done() { return false; }
  bakeNear() {}
  collapseAll() {}

  hit(idx, point, v, mass, dir) {
    if (this.drop) return;
    const pc = this.pieces[idx]; if (!pc) return;
    this.hits++; this.lastHit = this.world.clock;
    if (pc.part.startsWith('wheel:')) this.car.hitWheel(+pc.part.slice(6), point, dir);
    else this.car.hit(pc.part, point, dir.clone().negate(), v, mass, 'hammer');
    if (pc.part === 'body') haptics.hit(1);
    for (const p of this.pieces) { if (p.pane) p.attached = !p.pane.broken; if (p.light) p.attached = !p.light.broken; if (p.cap) p.attached = !p.cap.capOff; }
  }

  update(dt) {
    const W = this.world;
    this.car.update(dt);
    if (this.drop) {
      // クレーンから落ちてくる
      this.drop.vy -= 9.8 * dt; this.drop.y += this.drop.vy * dt;
      if (this.drop.y <= 0) {
        this.drop = null; this.car.group.position.y = 0; this.car.group.updateMatrixWorld(true);
        this.car._addBodies();
        sfx.metal(9); sfx.knock(10, 0.3); sfx.thunk(8); haptics.hit(1);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; W._puff(new THREE.Vector3(this.center.x + Math.cos(a) * 2.2, 0.05, this.center.z + Math.sin(a) * 1.1), new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)), '#8a7a66', 1.4); }
      } else this.car.group.position.y = this.drop.y;
    }
  }

  // 次の車を落とす前に片付ける
  dispose() {
    const W = this.world, c = this.car;
    for (const b of c.bodies) if (b.world) W.physics.removeBody(b);
    for (const m of c.mirrors) if (m.body && m.body.world) W._remove(m.body);
    const p = this.center;
    W.clearDebrisIn(new THREE.Vector3(p.x - 2.6, 0.25, p.z - 1.3), new THREE.Vector3(p.x + 2.6, 2.0, p.z + 1.3));
    c.group.parent && c.group.parent.remove(c.group);
  }
}

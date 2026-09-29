// 振り検出
// HOLD中だけ動く。端末の加速度を姿勢（deviceorientation）で世界座標に直し、
// 速度を積分して「上昇 → ピーク → 低下」を見たら自動でリリースする。
// 方向は、HOLD成立時のスマホの向きを基準に「前・左右・上下」に分解して返す。
import * as THREE from 'three';

const D2R = Math.PI / 180;

export const SWING = {
  startAccel: 12,      // 振り始めとみなす加速度（m/s²）。傾けただけでは届かない値
  minPeakAccel: 17,    // 投擲として認める最大加速度の下限
  minRot: 150,         // 腕を振ると必ず手首も回る。回転の最大値の下限（°/s）
  minSpeed: 1.3,       // 投擲として認める腕の速さの下限（m/s）
  lightSpeed: 2.0,     // LIGHT/NORMALの境目
  hardSpeed: 3.2,      // NORMAL/HARDの境目
  fullSpeed: 4.0,      // これ以上は同じ強さ（上限）
  maxDuration: 450,    // 振り始めからこの時間で打ち切り（ms）
  minDuration: 70,     // これより短い揺れは無視（ms）
  settleAfterHold: 180 // HOLDした直後の指の押し込みの揺れは無視（ms）
};

export class SwingDetector {
  constructor() {
    this.hasMotion = false; this.hasOrient = false;
    this.orientQ = new THREE.Quaternion(); this.orientOK = false;
    this.euler = new THREE.Euler();
    this.signFix = 1;           // iOSの古い実装で符号が逆の場合の補正
    this.armed = false; this.state = 'idle';
    this.onRelease = null; this.onSample = null;
    this.buf = [];              // 直近の世界座標加速度
    this.lastT = 0;
    this.v = new THREE.Vector3(); this.peakV = new THREE.Vector3();
    this.basis = null;
    this.debug = { speed: 0, acc: 0, rot: 0, status: 'センサー待ち' };
    this._m = this._onMotion.bind(this); this._o = this._onOrient.bind(this);
  }

  async requestPermission() {
    let ok = true;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        ok = (await DeviceMotionEvent.requestPermission()) === 'granted';
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { ok = false; }
    return ok;
  }

  start() {
    window.addEventListener('devicemotion', this._m);
    window.addEventListener('deviceorientation', this._o);
  }

  _onOrient(e) {
    if (e.alpha == null && e.beta == null) return;
    this.hasOrient = true;
    // W3C: 端末座標→地球座標 = Rz(alpha)·Rx(beta)·Ry(gamma)
    this.euler.set((e.beta || 0) * D2R, (e.gamma || 0) * D2R, (e.alpha || 0) * D2R, 'ZXY');
    this.orientQ.setFromEuler(this.euler); this.orientOK = true;
  }

  // 端末座標のベクトル → 世界座標（z上向き）。姿勢がなければ端末座標のまま
  toWorld(v) {
    if (this.orientOK) v.applyQuaternion(this.orientQ);
    return v;
  }

  // HOLD成立時に呼ぶ。今のスマホの向きから「前・右・上」を決める
  arm() {
    this.armed = true; this.state = 'idle'; this.buf.length = 0;
    this.armedAt = performance.now(); this.ignoreUntil = this.armedAt + SWING.settleAfterHold;
    this.basis = this._makeBasis();
    this.debug.status = this.hasMotion ? '振ってOK' : 'センサーなし';
  }
  disarm() { this.armed = false; this.state = 'idle'; }
  get swinging() { return this.armed && this.state === 'swing'; }

  _makeBasis() {
    if (!this.orientOK) {
      // 姿勢が取れないとき：縦持ちで画面を自分に向けている前提
      return { mode: 'device', f: new THREE.Vector3(0, 0, -1), r: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 1, 0) };
    }
    const up = new THREE.Vector3(0, 0, 1);
    const back = this.toWorld(new THREE.Vector3(0, 0, -1)); // 画面の裏側方向
    const top = this.toWorld(new THREE.Vector3(0, 1, 0));   // スマホの上端方向
    back.z = 0; top.z = 0;
    const f = back.add(top);
    if (f.lengthSq() < 1e-4) f.set(0, 1, 0);
    f.normalize();
    const r = new THREE.Vector3().crossVectors(f, up).normalize();
    return { mode: 'world', f, r, u: up };
  }

  _onMotion(e) {
    const a = e.acceleration, g = e.accelerationIncludingGravity, rr = e.rotationRate;
    let ax, ay, az;
    if (a && a.x != null) { ax = a.x; ay = a.y; az = a.z; }
    else if (g && g.x != null) {
      // 重力抜きが無い端末：ざっくり重力を引く
      const gw = this.toWorld(new THREE.Vector3(g.x, g.y, g.z));
      if (this.orientOK) { gw.z -= 9.81 * this.signFix; const back = gw.applyQuaternion(this.orientQ.clone().invert()); ax = back.x; ay = back.y; az = back.z; }
      else { ax = g.x; ay = g.y; az = g.z; const m = Math.hypot(ax, ay, az) || 1; const k = (m - 9.81) / m; ax *= k; ay *= k; az *= k; }
    } else return;
    this.hasMotion = true;

    // 符号の自動補正：静止に近いとき重力込みの値が「上向き」になるはず
    if (this.orientOK && g && g.x != null) {
      const gw = this.toWorld(new THREE.Vector3(g.x, g.y, g.z));
      if (Math.abs(Math.hypot(gw.x, gw.y, gw.z) - 9.81) < 1.2) this.signFix = gw.z >= 0 ? 1 : -1;
    }

    const now = performance.now();
    let dt = (e.interval && e.interval > 0 ? (e.interval > 1 ? e.interval / 1000 : e.interval) : (now - (this.lastT || now)) / 1000) || 1 / 60;
    dt = Math.min(0.05, Math.max(0.004, dt));
    this.lastT = now;

    const aw = this.toWorld(new THREE.Vector3(ax, ay, az).multiplyScalar(this.signFix));
    const accMag = aw.length();
    const rot = rr ? Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0) : 0;
    if (rr && rr.alpha != null) this.hasRotationRate = true;
    this.debug.acc = accMag; this.debug.rot = rot;
    if (this.onSample) this.onSample(accMag, rot);

    this.buf.push({ t: now, a: aw, dt });
    while (this.buf.length && now - this.buf[0].t > 300) this.buf.shift();

    if (!this.armed) return;
    if (this.state === 'idle') {
      // 回転だけ（傾けただけ）では始めない。はっきりした加速度が必要
      if (now > this.ignoreUntil && accMag > SWING.startAccel) {
        // 姿勢が後から取れた場合は基準を作り直す
        if (!this.basis || (this.basis.mode === 'device' && this.orientOK)) this.basis = this._makeBasis();
        this.state = 'swing'; this.t0 = now; this.v.set(0, 0, 0); this.peakSpeed = 0; this.peakAcc = 0; this.peakRot = 0;
        for (const s of this.buf) if (now - s.t <= 60) this.v.addScaledVector(s.a, s.dt);
      }
      return;
    }
    // swing中
    this.v.addScaledVector(aw, dt);
    const sp = this.v.length();
    if (sp > this.peakSpeed) { this.peakSpeed = sp; this.peakV.copy(this.v); }
    this.peakAcc = Math.max(this.peakAcc, accMag);
    this.peakRot = Math.max(this.peakRot, rot);
    this.debug.speed = sp;
    const el = now - this.t0;
    const dropped = el > SWING.minDuration && sp < this.peakSpeed * 0.7;
    const calmed = el > SWING.minDuration && accMag < 3 && sp < this.peakSpeed * 0.85;
    if (dropped || calmed || el > SWING.maxDuration) this._release(el);
  }

  _release(el) {
    const peak = this.peakSpeed;
    this.state = 'idle';
    const reason = this._reject(peak, el);
    if (reason) {
      this.debug.status = reason;
      this.ignoreUntil = performance.now() + 120; // 振りかぶりの戻りなどを拾わないよう少し待つ
      return;
    }
    this.debug.status = '投げた';
    this.armed = false;
    this.onRelease && this.onRelease(this.describe(this.peakV, peak));
  }

  // 投擲として認めない理由（認めるなら null）
  _reject(peak, el) {
    if (el < SWING.minDuration) return '短すぎる揺れ';
    if (this.peakAcc < SWING.minPeakAccel) return '振りが弱い';
    if (peak < SWING.minSpeed) return '振りが弱い';
    if (this.hasRotationRate && this.peakRot < SWING.minRot) return '腕の振りになっていない';
    // 振りかぶり（手前・上に引く動き）は投擲にしない
    const b = this.basis || this._makeBasis();
    const vf = this.peakV.dot(b.f), vu = this.peakV.dot(b.u);
    if (vf < 0.25 * peak && vu > -0.5 * peak) return '振りかぶり';
    return null;
  }

  // 速度ベクトル → 投擲パラメータ
  describe(vec, speed) {
    const b = this.basis || this._makeBasis();
    const vf = vec.dot(b.f), vr = vec.dot(b.r), vu = vec.dot(b.u);
    let yaw = Math.atan2(vr, Math.max(0.2 * speed, vf));       // 右が正
    let pitch = Math.atan2(vu, Math.hypot(Math.max(0, vf), vr)); // 上が正
    const cls = speed < SWING.lightSpeed ? 'LIGHT' : speed < SWING.hardSpeed ? 'NORMAL' : 'HARD';
    // NORMALの真ん中あたりで十分な強さ。上限あり
    const x = Math.min(1, Math.max(0, (speed - SWING.minSpeed) / (SWING.fullSpeed - SWING.minSpeed)));
    const power = 0.5 + 0.5 * (x * x * (3 - 2 * x));
    return { yaw, pitch, speed, power, cls, raw: { vf, vr, vu } };
  }

  // センサーが無い環境のテスト用：HOLD中の指の払いを「振り」とみなす
  simulate(dx, dy, pxPerMs) {
    if (!this.armed) return false;
    const len = Math.hypot(dx, dy) || 1;
    const speed = Math.min(4.2, 1.3 + pxPerMs * 1.0);
    const vec = new THREE.Vector3();
    const b = this.basis || this._makeBasis();
    // 上へ払う＝前、下へ払う＝下、左右＝左右
    vec.addScaledVector(b.f, Math.max(0.35, -dy / len) * speed);
    vec.addScaledVector(b.r, (dx / len) * speed);
    if (dy > 0) vec.addScaledVector(b.u, -(dy / len) * speed * 1.2);
    this.armed = false; this.state = 'idle';
    this.onRelease && this.onRelease(this.describe(vec, speed));
    return true;
  }
}

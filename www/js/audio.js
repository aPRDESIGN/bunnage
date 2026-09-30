// 効果音はすべてWeb Audioでその場で合成する（音源ファイルなし）

const rand = (a, b) => a + Math.random() * (b - a);

class Sfx {
  constructor() { this.ac = null; this.out = null; this.noise = null; this.last = {}; }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = this.ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.out = ac.createGain(); this.out.gain.value = 0.9;
      this.out.connect(comp); comp.connect(ac.destination);
      const len = ac.sampleRate * 2;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // iOSの無音解除
      const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
  }

  get t() { return this.ac ? this.ac.currentTime : 0; }

  // 同じ種類の音を短時間に鳴らしすぎない
  throttle(key, gap) {
    const now = this.t;
    if (this.last[key] && now - this.last[key] < gap) return false;
    this.last[key] = now; return true;
  }

  nz(t, dur, type, f0, q, gain, f1, att = 0.003) {
    const ac = this.ac; if (!ac) return;
    const s = ac.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  tone(t, f0, f1, dur, type, gain, att = 0.002) {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.03);
  }

  // シュッ
  whoosh(p) {
    if (!this.ac) return; const t = this.t;
    this.nz(t, 0.22 + 0.08 * p, 'bandpass', 380, 1.1, 0.18 + 0.3 * p, 2400, 0.06);
  }

  grab() {
    if (!this.ac) return; const t = this.t;
    this.nz(t, 0.05, 'bandpass', 1800, 3, 0.05);
  }

  // パリーン（グラス）＋余韻のカラカラ
  glass(p) {
    if (!this.ac || !this.throttle('glass', 0.03)) return; const t = this.t;
    this.nz(t, 0.08 + 0.06 * p, 'highpass', 3500, 0.7, 0.9);
    this.nz(t, 0.5 + 0.4 * p, 'bandpass', 6500, 0.8, 0.28);
    this.tone(t, 2600, 2550, 0.35, 'sine', 0.08);
    const n = 14 + Math.round(18 * p);
    for (let i = 0; i < n; i++) {
      const d = Math.pow(Math.random(), 1.7) * (0.7 + 0.6 * p) + 0.02;
      const f = rand(3800, 9000);
      this.tone(t + d, f, f * rand(0.97, 1), rand(0.03, 0.1), 'triangle', rand(0.02, 0.065));
    }
  }

  // 食器（陶器）が割れる
  ceramic(p) {
    if (!this.ac || !this.throttle('ceramic', 0.03)) return; const t = this.t;
    this.nz(t, 0.1 + 0.08 * p, 'highpass', 1800, 0.7, 0.85);
    this.nz(t, 0.35 + 0.3 * p, 'bandpass', 3000, 0.9, 0.3);
    this.tone(t, 220, 60, 0.16, 'sine', 0.35 + 0.3 * p);
    const n = 10 + Math.round(12 * p);
    for (let i = 0; i < n; i++) {
      const d = Math.pow(Math.random(), 1.8) * (0.5 + 0.4 * p) + 0.02;
      const f = rand(2200, 5600);
      this.tone(t + d, f, f * rand(0.96, 1), rand(0.03, 0.1), 'triangle', rand(0.02, 0.06));
    }
  }

  // 破片が転がる・当たる小さな音
  tink(v) {
    if (!this.ac || !this.throttle('tink', 0.025)) return; const t = this.t;
    const f = rand(4000, 8500);
    this.tone(t, f, f, rand(0.03, 0.07), 'triangle', Math.min(0.05, 0.012 + v * 0.012));
  }

  // ベチャッ（卵）
  egg(p) {
    if (!this.ac || !this.throttle('egg', 0.04)) return; const t = this.t;
    this.nz(t, 0.05, 'bandpass', 2600, 2, 0.35);                  // 殻が割れるパキッ
    this.nz(t + 0.01, 0.22, 'lowpass', 1400, 1.2, 0.7 * (0.6 + 0.4 * p), 180, 0.01); // ベチャ
    this.nz(t + 0.03, 0.18, 'bandpass', 900, 4, 0.25, 300, 0.02);  // 湿った粘り
    this.tone(t, 140, 60, 0.12, 'sine', 0.3);
  }

  // カンッ（缶）
  can(v) {
    if (!this.ac || !this.throttle('can', 0.035)) return; const t = this.t;
    const g = Math.min(0.5, 0.08 + v * 0.06);
    const base = rand(900, 1300);
    [1, 2.31, 3.47, 4.9].forEach((m, i) => this.tone(t, base * m, base * m * 0.995, rand(0.12, 0.35) / (1 + i * 0.4), 'sine', g / (1 + i * 0.7)));
    this.nz(t, 0.03, 'highpass', 3000, 0.7, g * 0.9);
  }

  // カラカラ（缶が転がる）
  canRoll(v) {
    if (!this.ac) return; const t = this.t;
    const g = Math.min(0.09, 0.02 + v * 0.02);
    this.nz(t, 0.035, 'bandpass', rand(2200, 3200), 5, g);
    this.tone(t, rand(1500, 2200), 1400, 0.04, 'triangle', g * 0.4);
  }

  // 冷蔵庫などの金属面
  metal(v) {
    if (!this.ac || !this.throttle('metal', 0.05)) return; const t = this.t;
    const g = Math.min(0.6, 0.1 + v * 0.07);
    this.tone(t, 150, 120, 0.4, 'sine', g); this.tone(t, 410, 380, 0.25, 'sine', g * 0.4);
    this.nz(t, 0.08, 'lowpass', 1200, 0.7, g * 0.7);
  }

  // 木・プラスチック・壁などの鈍い音
  knock(v, pitch = 1) {
    if (!this.ac || !this.throttle('knock', 0.04)) return; const t = this.t;
    const g = Math.min(0.45, 0.05 + v * 0.05);
    this.tone(t, 260 * pitch, 110 * pitch, 0.09, 'triangle', g);
    this.nz(t, 0.06, 'bandpass', 900 * pitch, 1.5, g * 0.8);
  }

  // 車の防犯アラーム（ピーポー）。止める関数を返す
  alarm(dur = 8) {
    if (!this.ac) return () => {};
    const ac = this.ac, t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'square';
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = 0.0001;
    for (let t = 0; t < dur; t += 0.6) {
      o.frequency.setValueAtTime(900, t0 + t); o.frequency.setValueAtTime(1250, t0 + t + 0.3);
    }
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.05);
    g.gain.setValueAtTime(0.07, t0 + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t0); o.stop(t0 + dur + 0.05);
    return () => { try { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(0.0001, ac.currentTime); o.stop(ac.currentTime + 0.02); } catch (e) { /* 無視 */ } };
  }

  // 電気がバチッとショートする音
  zap() {
    if (!this.ac || !this.throttle('zap', 0.08)) return; const t = this.t;
    this.nz(t, 0.09, 'highpass', 2500, 0.8, 0.5);
    for (let i = 0; i < 4; i++) this.tone(t + i * 0.025 + Math.random() * 0.01, 120 + Math.random() * 60, 100, 0.03, 'square', 0.12);
    this.nz(t + 0.03, 0.18, 'bandpass', 5200, 2, 0.12, 2400);
  }

  // ボディが凹む「ボコッ」
  thunk(v) {
    if (!this.ac || !this.throttle('thunk', 0.05)) return; const t = this.t;
    const g = Math.min(0.7, 0.15 + v * 0.06);
    this.tone(t, 95, 55, 0.3, 'sine', g); this.tone(t, 240, 170, 0.18, 'triangle', g * 0.45);
    this.nz(t, 0.12, 'lowpass', 900, 0.8, g * 0.6);
    [620, 1130, 1760].forEach((f, i) => this.tone(t, f, f * 0.98, 0.25 / (1 + i), 'sine', g * 0.12));
  }
}

export const sfx = new Sfx();

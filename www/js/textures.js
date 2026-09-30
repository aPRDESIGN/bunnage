// キャンバスで描くテクスチャ（画像ファイルなし）
import * as THREE from 'three';

const cache = new Map();
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function make(key, w, h, draw, { repeat = [1, 1], color = true } = {}) {
  const k = key + repeat.join('x');
  if (cache.has(k)) return cache.get(k);
  let base = cache.get('__c_' + key);
  if (!base) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    seed = key.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7) * 97 + 1;
    draw(c.getContext('2d'), w, h);
    base = c; cache.set('__c_' + key, c);
  }
  const t = new THREE.CanvasTexture(base);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  cache.set(k, t);
  return t;
}

function noise(g, w, h, n, a, dark = true) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = (dark && rnd() < 0.6) ? `rgba(0,0,0,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

// 10cm角の白いタイル（1枚のテクスチャで40cm角）
export const tiles = (rx, ry) => make('tiles', 256, 256, (g, w, h) => {
  g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = `rgb(${240 + rnd() * 8},${239 + rnd() * 8},${232 + rnd() * 8})`;
    g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  g.fillStyle = '#cfcbc0';
  for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1.5, 0, 3, h); g.fillRect(0, i * 64 - 1.5, w, 3); }
  noise(g, w, h, 900, 0.05);
}, { repeat: [rx, ry] });

// 白っぽいビニールクロス
export const wallpaper = (rx, ry) => make('wall', 256, 256, (g, w, h) => {
  g.fillStyle = '#ece8df'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 5000, 0.06);
  g.strokeStyle = 'rgba(0,0,0,.025)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(rnd() * w, 0); g.lineTo(rnd() * w, h); g.stroke(); }
}, { repeat: [rx, ry] });

// 木目調クッションフロア（1枚で幅60cm×長さ120cm）
export const floor = (rx, ry) => make('floor', 256, 512, (g, w, h) => {
  const pw = w / 4;
  for (let i = 0; i < 4; i++) {
    const off = rnd() * h;
    for (let seg = -1; seg < 2; seg++) {
      const y0 = off + seg * h;
      const tone = 150 + rnd() * 25;
      g.fillStyle = `rgb(${tone + 30},${tone + 5},${tone - 30})`;
      g.fillRect(i * pw, y0, pw, h);
      g.strokeStyle = 'rgba(90,60,30,.18)';
      for (let k = 0; k < 9; k++) {
        g.beginPath(); const x = i * pw + rnd() * pw;
        g.moveTo(x, y0); g.bezierCurveTo(x + rnd() * 10 - 5, y0 + h * .3, x + rnd() * 10 - 5, y0 + h * .6, x + rnd() * 6 - 3, y0 + h); g.stroke();
      }
      g.fillStyle = 'rgba(60,40,20,.5)'; g.fillRect(i * pw, y0, pw, 2);
    }
    g.fillStyle = 'rgba(60,40,20,.45)'; g.fillRect(i * pw, 0, 2, h);
  }
  noise(g, w, h, 3000, 0.07);
}, { repeat: [rx, ry] });

// キッチンマット
export const mat = () => make('mat', 256, 128, (g, w, h) => {
  g.fillStyle = '#5d6b7a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8cfbd'; g.fillRect(10, 10, w - 20, h - 20);
  for (let x = 16; x < w - 16; x += 12) { g.fillStyle = (x / 12) % 2 < 1 ? '#c9bea8' : '#b9ad96'; g.fillRect(x, 14, 6, h - 28); }
  noise(g, w, h, 2500, 0.1);
});

// ステンレス天板（ヘアライン）
export const steel = () => make('steel', 256, 256, (g, w, h) => {
  g.fillStyle = '#b9bcbd'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${rnd() * .07})`; g.fillRect(0, y, w, 1); }
}, { repeat: [3, 1] });

// 冷蔵庫の前面（扉の分割線）幅64cm×高さ172cm
export const fridgeFront = () => make('fridge', 128, 344, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#e9eae7'); gr.addColorStop(.5, '#f4f4f1'); gr.addColorStop(1, '#e2e3e0');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const line = (y) => { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, y + 2, w, 1); };
  line(h * (1 - 0.96 / 1.72)); line(h * (1 - 0.53 / 1.72));
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(w * .5 - 1, h * (1 - 0.53 / 1.72) + 3, 2, h * (0.53 / 1.72));
  noise(g, w, h, 600, 0.03);
});

// 買い物メモ
export const memo = () => make('memo', 128, 160, (g, w, h) => {
  g.fillStyle = '#fbf6df'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,120,190,.35)'; for (let y = 30; y < h; y += 22) { g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
  g.fillStyle = '#2f3a57'; g.font = '15px sans-serif';
  ['たまご', '牛乳', '洗剤', 'ゴミ 火・金'].forEach((s, i) => g.fillText(s, 12, 26 + i * 22));
});

// カレンダー
export const calendar = () => make('cal', 192, 256, (g, w, h) => {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2d2d2d'; g.font = 'bold 44px sans-serif'; g.fillText('10', 12, 52);
  g.font = '14px sans-serif'; g.fillText('OCTOBER', 70, 50);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  g.font = '12px sans-serif';
  days.forEach((d, i) => { g.fillStyle = i === 0 ? '#c33' : i === 6 ? '#35a' : '#444'; g.fillText(d, 10 + i * 26, 84); });
  let day = 1;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) {
    if (r === 0 && c < 4) continue; if (day > 31) break;
    g.fillStyle = c === 0 ? '#c33' : c === 6 ? '#35a' : '#333';
    g.fillText(String(day++), 10 + c * 26, 110 + r * 30);
  }
  g.strokeStyle = '#d33'; g.lineWidth = 2; g.beginPath(); g.arc(10 + 2 * 26 + 6, 110 + 30 - 5, 11, 0, 7); g.stroke();
});

// 型板ガラスの窓
export const frosted = () => make('frost', 128, 128, (g, w, h) => {
  g.fillStyle = '#dfe8ea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 3;
    g.fillStyle = `rgba(255,255,255,${.2 + rnd() * .4})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = `rgba(120,150,160,${rnd() * .15})`; g.beginPath(); g.arc(x + 1, y + 1, r * .8, 0, 7); g.fill();
  }
}, { repeat: [2, 3] });

// ラベル付きボトル（ぐるっと一周分）
export function label(key, bg, text, fg = '#fff', band = null) {
  return make('lbl_' + key, 256, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (band) { g.fillStyle = band; g.fillRect(0, h * .72, w, h * .1); g.fillRect(0, h * .12, w, h * .06); }
    g.fillStyle = fg; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w * .25, h * .45); g.fillText(text, w * .75, h * .45);
    noise(g, w, h, 300, .06);
  });
}

// 電子レンジの前面
export const microwave = () => make('mw', 256, 160, (g, w, h) => {
  g.fillStyle = '#f0efea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#23282b'; g.fillRect(14, 14, w * .66, h - 28);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(20, 20, w * .66 - 12, 20);
  g.fillStyle = '#d7d5ce'; g.fillRect(w * .72, 14, w * .24, h - 28);
  g.fillStyle = '#2d6a4f'; g.fillRect(w * .75, 24, w * .18, 18);
  g.fillStyle = '#8a8880';
  for (let i = 0; i < 4; i++) g.fillRect(w * .76, 56 + i * 20, w * .16, 10);
});

// ガスコンロの天板
export const stoveTop = () => make('stove', 256, 160, (g, w, h) => {
  g.fillStyle = '#2b2c2e'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a3b3e'; g.fillRect(w * .42, h * .25, w * .16, h * .5);
});

// 缶のラベル
export const canLabels = [
  () => make('can0', 256, 128, (g, w, h) => { g.fillStyle = '#c8d6de'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c5d8c'; g.fillRect(0, h * .3, w, h * .4); g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.fillText('炭酸水', 20, h * .6); g.fillText('炭酸水', 148, h * .6); }),
  () => make('can1', 256, 128, (g, w, h) => { g.fillStyle = '#4a2b1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9b27c'; g.fillRect(0, h * .2, w, 6); g.fillRect(0, h * .78, w, 6); g.fillStyle = '#f1e4cf'; g.font = 'bold 24px sans-serif'; g.fillText('COFFEE', 16, h * .58); g.fillText('COFFEE', 144, h * .58); }),
  () => make('can2', 256, 128, (g, w, h) => { g.fillStyle = '#f2df4c'; g.fillRect(0, 0, w, h); g.fillStyle = '#3e7d2e'; g.beginPath(); g.arc(64, 64, 26, 0, 7); g.arc(192, 64, 26, 0, 7); g.fill(); g.fillStyle = '#2b3d1f'; g.font = 'bold 18px sans-serif'; g.fillText('LEMON', 100, 70); g.fillText('LEMON', 228 - 256 + 256 - 30, 110); })
];

// 卵の跡（黄身＋白身）
export const splat = (i) => make('splat' + i, 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  g.fillStyle = 'rgba(245,238,205,.55)';
  g.beginPath();
  for (let a = 0; a <= 24; a++) {
    const ang = a / 24 * Math.PI * 2, r = 30 + rnd() * 22 + (a % 5 === 0 ? 10 : 0);
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    a ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(cx + (rnd() - .5) * 100, cy + (rnd() - .5) * 100, 2 + rnd() * 5, 0, 7); g.fill(); }
  const yx = cx + (rnd() - .5) * 14, yy = cy + (rnd() - .5) * 14;
  const yg = g.createRadialGradient(yx - 4, yy - 4, 2, yx, yy, 22);
  yg.addColorStop(0, 'rgba(255,214,90,1)'); yg.addColorStop(.7, 'rgba(242,170,30,.95)'); yg.addColorStop(1, 'rgba(230,150,20,0)');
  g.fillStyle = yg; g.beginPath(); g.ellipse(yx, yy, 20 + rnd() * 8, 15 + rnd() * 6, rnd() * 3, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(yx - 6, yy - 5, 5, 3, -.5, 0, 7); g.fill();
});

// 垂れた跡
export const drip = () => make('drip', 32, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(240,190,60,.8)'); gr.addColorStop(.8, 'rgba(245,225,170,.45)'); gr.addColorStop(1, 'rgba(245,225,170,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(8, 0); g.lineTo(24, 0); g.lineTo(19, h * .85); g.quadraticCurveTo(16, h, 13, h * .85); g.closePath(); g.fill();
});

// 当たった跡（材質ごと）。透明背景に描く
function crack(g, cx, cy, n, len, color, width = 1.2) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let a = rnd() * Math.PI * 2, x = cx, y = cy, l = len * (0.5 + rnd() * 0.6);
    g.beginPath(); g.moveTo(x, y);
    const steps = 4 + Math.floor(rnd() * 3);
    for (let s = 0; s < steps; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * l / steps; y += Math.sin(a) * l / steps; g.lineTo(x, y); }
    g.stroke();
  }
}
export const scuff = (kind, i) => make('scuff_' + kind + i, 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2 + (rnd() - .5) * 8, cy = h / 2 + (rnd() - .5) * 8;
  if (kind === 'wall') {
    // 壁紙のへこみと破れ
    const rg = g.createRadialGradient(cx, cy, 2, cx, cy, 34);
    rg.addColorStop(0, 'rgba(70,60,50,.55)'); rg.addColorStop(.5, 'rgba(90,80,70,.25)'); rg.addColorStop(1, 'rgba(90,80,70,0)');
    g.fillStyle = rg; g.beginPath(); g.ellipse(cx, cy, 34, 26, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(40,34,28,.5)'; g.beginPath(); g.ellipse(cx, cy, 9 + rnd() * 5, 6 + rnd() * 4, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,252,245,.85)';
    for (let k = 0; k < 3; k++) { g.beginPath(); const a = rnd() * 6.28; g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); g.lineTo(cx + Math.cos(a + .4) * 20, cy + Math.sin(a + .4) * 20); g.lineTo(cx + Math.cos(a + .7) * 10, cy + Math.sin(a + .7) * 10); g.fill(); }
    crack(g, cx, cy, 4, 34, 'rgba(60,52,44,.55)');
  } else if (kind === 'tile') {
    // タイルのひび
    g.fillStyle = 'rgba(60,62,64,.6)'; g.beginPath();
    for (let a = 0; a < 7; a++) { const ang = a / 7 * 6.28, r = 5 + rnd() * 6; a ? g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r) : g.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); }
    g.closePath(); g.fill();
    crack(g, cx, cy, 6, 60, 'rgba(50,52,55,.75)', 1.1);
    crack(g, cx, cy, 5, 30, 'rgba(255,255,255,.6)', .8);
  } else if (kind === 'wood') {
    // 扉・棚のえぐれ
    g.fillStyle = 'rgba(80,55,30,.6)'; g.beginPath(); g.ellipse(cx, cy, 16 + rnd() * 8, 8 + rnd() * 5, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(245,225,190,.8)'; g.beginPath(); g.ellipse(cx - 3, cy - 3, 10, 4, rnd() * 3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,60,30,.55)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(cx + (rnd() - .5) * 20, cy + (rnd() - .5) * 10); g.lineTo(cx + (rnd() - .5) * 60, cy + (rnd() - .5) * 20); g.stroke(); }
  } else if (kind === 'steel') {
    // 金属のひっかき傷
    const ang = rnd() * 3;
    for (let k = 0; k < 9; k++) {
      const off = (rnd() - .5) * 26, len = 20 + rnd() * 40;
      g.strokeStyle = k % 2 ? 'rgba(255,255,255,.7)' : 'rgba(60,62,66,.55)'; g.lineWidth = .8 + rnd();
      g.beginPath(); g.moveTo(cx + Math.cos(ang) * -len / 2 - Math.sin(ang) * off, cy + Math.sin(ang) * -len / 2 + Math.cos(ang) * off);
      g.lineTo(cx + Math.cos(ang) * len / 2 - Math.sin(ang) * off, cy + Math.sin(ang) * len / 2 + Math.cos(ang) * off); g.stroke();
    }
    const rg = g.createRadialGradient(cx, cy, 1, cx, cy, 14); rg.addColorStop(0, 'rgba(50,50,55,.45)'); rg.addColorStop(1, 'rgba(50,50,55,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill();
  } else {
    // 床：黒いこすれ跡と小さなへこみ
    const ang = rnd() * 3;
    g.save(); g.translate(cx, cy); g.rotate(ang);
    for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(30,24,20,${.15 + rnd() * .25})`; g.fillRect(-40 + rnd() * 20, -6 + k * 3 + rnd() * 2, 50 + rnd() * 30, 1.5 + rnd() * 2); }
    g.restore();
    g.fillStyle = 'rgba(40,30,20,.5)'; g.beginPath(); g.ellipse(cx, cy, 5, 3.5, ang, 0, 7); g.fill();
  }
}, { });

// 壁に空いた穴（強く当たったとき）
export const hole = (i) => make('hole' + i, 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  // 周りの破れた壁紙とへこみ
  const rg = g.createRadialGradient(cx, cy, 8, cx, cy, 58);
  rg.addColorStop(0, 'rgba(60,50,40,.7)'); rg.addColorStop(.55, 'rgba(90,78,64,.3)'); rg.addColorStop(1, 'rgba(90,78,64,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  const pts = []; for (let a = 0; a < 14; a++) { const ang = a / 14 * 6.283, r = 16 + rnd() * 14; pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * .85]); }
  g.fillStyle = 'rgba(250,246,236,.95)'; g.beginPath(); pts.forEach((p, k) => { const q = [cx + (p[0] - cx) * 1.35, cy + (p[1] - cy) * 1.35]; k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
  g.fillStyle = 'rgba(214,206,190,1)'; g.beginPath(); pts.forEach((p, k) => { const q = [cx + (p[0] - cx) * 1.12, cy + (p[1] - cy) * 1.12]; k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
  g.fillStyle = 'rgba(22,18,15,1)'; g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
  crack(g, cx, cy, 7, 60, 'rgba(50,42,34,.7)', 1.4);
});

// ガラスのひび（窓・レンジ・時計）
export const glassCrack = (i) => make('gcrack' + i, 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.3;
  const rays = 11 + Math.floor(rnd() * 5), ends = [];
  for (let k = 0; k < rays; k++) {
    let a = k / rays * 6.283 + rnd() * .3, x = cx, y = cy; const L = 70 + rnd() * 55; g.beginPath(); g.moveTo(x, y);
    const pts = [];
    for (let s = 1; s <= 6; s++) { a += (rnd() - .5) * .25; x = cx + Math.cos(a) * L * s / 6; y = cy + Math.sin(a) * L * s / 6; g.lineTo(x, y); pts.push([x, y]); }
    g.stroke(); ends.push(pts);
  }
  g.lineWidth = .9; g.strokeStyle = 'rgba(255,255,255,.6)';
  for (let ring = 1; ring <= 4; ring++) {
    g.beginPath();
    ends.forEach((pts, k) => { const p = pts[Math.min(5, ring)]; k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.closePath(); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
});

// 掛け時計の文字盤
export const clockFace = () => make('clock', 256, 256, (g, w, h) => {
  const c = w / 2;
  g.fillStyle = '#f6f3ea'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
  g.fillStyle = '#222'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let n = 1; n <= 12; n++) { const a = n / 12 * 6.283 - 1.5708; g.fillText(String(n), c + Math.cos(a) * 96, c + Math.sin(a) * 96); }
  g.strokeStyle = '#222'; g.lineCap = 'round';
  const hand = (a, len, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a - 1.5708) * len, c + Math.sin(a - 1.5708) * len); g.stroke(); };
  hand(10.2 / 12 * 6.283, 55, 7); hand(0.25 * 6.283 * 0.8, 82, 4);
  g.strokeStyle = '#c33'; hand(0.62 * 6.283, 88, 1.5);
  g.fillStyle = '#222'; g.beginPath(); g.arc(c, c, 6, 0, 7); g.fill();
}, { repeat: [1, 1] });

// 割れた窓（型板ガラスに穴、穴の向こうは夜の外）
export const windowBroken = () => make('winbroken', 256, 320, (g, w, h) => {
  g.fillStyle = '#dfe8ea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 3; g.fillStyle = `rgba(255,255,255,${.2 + rnd() * .4})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const cx = w * (.4 + rnd() * .2), cy = h * (.4 + rnd() * .2);
  g.fillStyle = '#0c1320'; g.beginPath();
  for (let a = 0; a < 16; a++) { const ang = a / 16 * 6.283, r = (a % 2 ? 40 : 95) + rnd() * 40; const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 1.2; a ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill();
  crack(g, cx, cy, 14, 170, 'rgba(255,255,255,.8)', 1.2);
});

// こぼれた液体（しょうゆ・油など）
export const liquid = (color) => make('liq' + color, 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  g.fillStyle = color; g.globalAlpha = .85; g.beginPath();
  for (let a = 0; a <= 30; a++) { const ang = a / 30 * 6.283, r = 34 + rnd() * 20 + (a % 6 === 0 ? 12 : 0); const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill();
  for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(cx + (rnd() - .5) * 110, cy + (rnd() - .5) * 110, 2 + rnd() * 5, 0, 7); g.fill(); }
  g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx - 10, cy - 12, 14, 5, -.4, 0, 7); g.fill();
});

// 粉ぼこりの粒
export const dot = () => make('dot', 64, 64, (g, w, h) => {
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.5, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
});

// 倉庫：コンクリートの床（しみ・ひび）1枚で2m角
export const concreteFloor = (rx, ry) => make('cfloor', 512, 512, (g, w, h) => {
  g.fillStyle = '#6b6a66'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 120; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${rnd() < .6 ? '20,18,15' : '255,255,255'},${.04 + rnd() * .08})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  noise(g, w, h, 16000, .09);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  crack(g, rnd() * w, rnd() * h, 3, 180, 'rgba(30,28,25,.35)', 1);
}, { repeat: [rx, ry] });

// 倉庫：打ちっぱなしの壁（型枠の継ぎ目とPコン跡）1枚で1.8m×0.9m
export const concreteWall = (rx, ry) => make('cwall', 512, 256, (g, w, h) => {
  g.fillStyle = '#7d7c77'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${.04 + rnd() * .05})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  noise(g, w, h, 9000, .08);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  for (const [fx, fy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
    const cx = w * fx, cy = h * fy; const rg = g.createRadialGradient(cx - 1, cy - 1, 0, cx, cy, 9);
    rg.addColorStop(0, 'rgba(25,25,25,.8)'); rg.addColorStop(.6, 'rgba(50,50,50,.5)'); rg.addColorStop(.8, 'rgba(255,255,255,.15)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
  }
}, { repeat: [rx, ry] });

// 床の黄色と黒の区画線
export const hazard = () => make('hazard', 256, 32, (g, w, h) => {
  g.fillStyle = '#e0b21e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1b1b'; for (let x = -h; x < w + h; x += h * 1.4) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * .7, h); g.lineTo(x + h * 1.4, 0); g.lineTo(x + h * .7, 0); g.closePath(); g.fill(); }
  noise(g, w, h, 900, .25);
}, { repeat: [6, 1] });

// ナンバープレート（架空）
export const plate = () => make('plate', 256, 128, (g, w, h) => {
  g.fillStyle = '#f4f4ee'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2f6b3a'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#2f6b3a'; g.textAlign = 'center';
  g.font = 'bold 24px sans-serif'; g.fillText('なにわ 500', w / 2, 38);
  g.font = 'bold 56px sans-serif'; g.fillText('ぶ 12-34', w / 2, 104);
});
// 駐車場の床（コンクリート＋白線は別）
export const parkingSign = () => make('psign', 128, 128, (g, w, h) => {
  g.fillStyle = '#1f4fa3'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', w / 2, h / 2 + 6);
});

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
export const splat = (i, style = 'egg') => make('splat' + style + i, 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const blob = (r0, jag, color, n = 28) => { g.fillStyle = color; g.beginPath(); for (let a = 0; a <= n; a++) { const ang = a / n * Math.PI * 2, r = r0 * (1 + (rnd() - .5) * jag) + (a % 5 === 0 ? r0 * .25 * rnd() : 0); const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill(); };
  const drops = (n, rmin, rmax, dmin, dmax, color) => { g.fillStyle = color; for (let k = 0; k < n; k++) { const a = rnd() * 6.283, d = dmin + rnd() * (dmax - dmin), r = rmin + rnd() * (rmax - rmin); g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 1.6, r, a, 0, 7); g.fill(); } };
  const rays = (n, len, wdt, color) => { g.fillStyle = color; for (let k = 0; k < n; k++) { const a = rnd() * 6.283, l = len * (.5 + rnd() * .6); g.beginPath(); g.moveTo(cx + Math.cos(a - .08) * 30, cy + Math.sin(a - .08) * 30); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.lineTo(cx + Math.cos(a + .08) * 30, cy + Math.sin(a + .08) * 30); g.fill(); g.beginPath(); g.arc(cx + Math.cos(a) * l, cy + Math.sin(a) * l, wdt, 0, 7); g.fill(); } };
  if (style === 'paint') {
    // 防犯カラーボール：蛍光オレンジが放射状に飛び散る
    rays(16, 118, 4, 'rgba(255,100,0,.95)');
    blob(52, .5, 'rgba(255,96,0,.97)');
    drops(40, 1.5, 5, 55, 122, 'rgba(255,110,10,.95)');
    const hg = g.createRadialGradient(cx - 12, cy - 14, 2, cx, cy, 50); hg.addColorStop(0, 'rgba(255,220,150,.55)'); hg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = hg; g.beginPath(); g.arc(cx, cy, 50, 0, 7); g.fill();
    return;
  }
  if (style === 'tomato') {
    // トマト：赤い果肉と種、ちぎれた皮
    rays(9, 90, 3, 'rgba(200,24,16,.85)');
    blob(46, .6, 'rgba(190,22,14,.92)');
    blob(30, .5, 'rgba(232,58,34,.9)');
    for (let k = 0; k < 40; k++) { const a = rnd() * 6.283, d = rnd() * 36; g.fillStyle = 'rgba(245,215,120,.95)'; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.4, 1.4, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,190,160,.5)'; for (let k = 0; k < 8; k++) { g.beginPath(); g.ellipse(cx + (rnd() - .5) * 50, cy + (rnd() - .5) * 50, 6, 2, rnd() * 3, 0, 7); g.fill(); }
    drops(22, 1.5, 4, 50, 110, 'rgba(200,24,16,.9)');
    return;
  }
  if (style === 'soil') {
    blob(60, .7, 'rgba(58,40,26,.75)');
    for (let k = 0; k < 500; k++) { const a = rnd() * 6.283, d = rnd() * rnd() * 110; g.fillStyle = `rgba(${40 + rnd() * 40},${28 + rnd() * 25},${18 + rnd() * 15},${.6 + rnd() * .4})`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rnd() * 3, 1 + rnd() * 3); }
    return;
  }
  // 卵：白身と黄身
  g.fillStyle = 'rgba(245,238,205,.55)';
  g.beginPath();
  for (let a = 0; a <= 24; a++) {
    const ang = a / 24 * Math.PI * 2, r = 60 + rnd() * 44 + (a % 5 === 0 ? 20 : 0);
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    a ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(cx + (rnd() - .5) * 200, cy + (rnd() - .5) * 200, 4 + rnd() * 10, 0, 7); g.fill(); }
  const yx = cx + (rnd() - .5) * 28, yy = cy + (rnd() - .5) * 28;
  const yg = g.createRadialGradient(yx - 8, yy - 8, 4, yx, yy, 44);
  yg.addColorStop(0, 'rgba(255,214,90,1)'); yg.addColorStop(.7, 'rgba(242,170,30,.95)'); yg.addColorStop(1, 'rgba(230,150,20,0)');
  g.fillStyle = yg; g.beginPath(); g.ellipse(yx, yy, 40 + rnd() * 16, 30 + rnd() * 12, rnd() * 3, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(yx - 12, yy - 10, 10, 6, -.5, 0, 7); g.fill();
});

// 垂れた跡
export const drip = (style = 'egg') => make('drip' + style, 32, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const c = { egg: ['rgba(240,190,60,.8)', 'rgba(245,225,170,.45)', 'rgba(245,225,170,0)'], paint: ['rgba(255,100,0,.95)', 'rgba(255,110,10,.8)', 'rgba(255,110,10,0)'], tomato: ['rgba(200,24,16,.9)', 'rgba(200,40,24,.6)', 'rgba(200,40,24,0)'] }[style] || ['rgba(240,190,60,.8)', 'rgba(245,225,170,.45)', 'rgba(245,225,170,0)'];
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, c[0]); gr.addColorStop(.8, c[1]); gr.addColorStop(1, c[2]);
  g.fillStyle = gr; g.beginPath(); g.moveTo(8, 0); g.lineTo(24, 0); g.lineTo(19, h * .85); g.quadraticCurveTo(16, h, 13, h * .85); g.closePath(); g.fill();
});

// スマホのロック画面（架空）
export const lockScreen = () => make('lock', 128, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d3b6a'); gr.addColorStop(1, '#6a2d5a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 34px sans-serif'; g.fillText('0:42', w / 2, 62);
  g.font = '11px sans-serif'; g.fillText('10月1日 木曜日', w / 2, 80);
  for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(10, 110 + k * 38, w - 20, 30); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 9px sans-serif'; g.fillText(['上司', 'カレンダー', 'グループ(12)'][k], 16, 123 + k * 38); g.font = '8px sans-serif'; g.fillText(['明日の朝イチで確認お願い…', '9:00 定例ミーティング', '未読のメッセージ 48件'][k], 16, 134 + k * 38); }
  g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(w / 2 - 20, h - 10, 40, 3);
});

// 缶チューハイのラベル（架空）
export const chuhaiLabel = () => make('chuhai', 256, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4f7fb'); gr.addColorStop(1, '#cfe0f0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f0d23a'; g.beginPath(); g.ellipse(70, 64, 34, 26, -.3, 0, 7); g.fill();
  g.fillStyle = '#3f8a2e'; g.beginPath(); g.ellipse(96, 40, 12, 5, .6, 0, 7); g.fill();
  g.fillStyle = '#1b3f86'; g.font = 'bold 26px sans-serif'; g.fillText('レモン', 130, 58); g.font = 'bold 20px sans-serif'; g.fillText('サワー', 132, 86);
  g.fillStyle = '#c8261d'; g.fillRect(0, 108, w, 20); g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText('おさけ', 12, 123);
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
// 本物っぽいひび：枝分かれしながら細くなる線。暗い線の脇に明るい縁を添えて、割れ目の段差に見せる
function fracture(g, x, y, a, len, w, depth, dark, light, bend = 0.2, branch = 0.12, pts = null) {
  const steps = Math.max(3, Math.floor(len / 9));
  let px = x, py = y;
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  for (let s = 0; s < steps; s++) {
    a += (rnd() - 0.5) * bend;
    const nx = px + Math.cos(a) * len / steps, ny = py + Math.sin(a) * len / steps;
    const ww = Math.max(0.4, w * (1 - s / steps * 0.7));
    g.strokeStyle = light; g.lineWidth = ww * 0.8; g.beginPath(); g.moveTo(px + 0.7, py + 0.7); g.lineTo(nx + 0.7, ny + 0.7); g.stroke();
    g.strokeStyle = dark; g.lineWidth = ww; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
    if (pts) pts.push([nx, ny, s / steps]);
    if (depth > 0 && rnd() < branch) fracture(g, nx, ny, a + (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.4), len * (0.2 + rnd() * 0.3) * (1 - s / steps), ww * 0.7, depth - 1, dark, light, bend, branch * 0.5);
    px = nx; py = ny;
  }
}
// ぎざぎざの多角形
function jag(g, cx, cy, r, n, k) { g.beginPath(); for (let a = 0; a < n; a++) { const ang = a / n * 6.283 + rnd() * .3, rr = r * (1 - k + rnd() * k * 2); a ? g.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr) : g.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); } g.closePath(); }

export const scuff = (kind, i) => make('scuff2_' + kind + i, (kind === 'tile' || kind === 'wall') ? 256 : 128, (kind === 'tile' || kind === 'wall') ? 256 : 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2 + (rnd() - .5) * 8, cy = h / 2 + (rnd() - .5) * 8;
  if (kind === 'wall') {
    // 壁のへこみ：左上が明るく右下が暗い（くぼみの陰影）。破れた壁紙の下に石膏がのぞく
    const R = 30 + rnd() * 10;
    let rg = g.createRadialGradient(cx + 6, cy + 6, 2, cx, cy, R * 1.6);
    rg.addColorStop(0, 'rgba(60,52,44,.42)'); rg.addColorStop(.6, 'rgba(80,70,60,.16)'); rg.addColorStop(1, 'rgba(80,70,60,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    rg = g.createRadialGradient(cx - 8, cy - 8, 2, cx - 8, cy - 8, R);
    rg.addColorStop(0, 'rgba(255,255,255,.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // 破れ目
    g.fillStyle = 'rgba(214,205,188,.97)'; jag(g, cx, cy, 11 + rnd() * 6, 16, .35); g.fill();
    g.strokeStyle = 'rgba(70,60,50,.6)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = 'rgba(120,108,92,.5)'; jag(g, cx + 2, cy + 2, 5 + rnd() * 3, 10, .3); g.fill();
    // めくれた壁紙の小片
    for (let k = 0; k < 4; k++) {
      const a = rnd() * 6.283, r0 = 12 + rnd() * 6;
      g.fillStyle = 'rgba(250,247,240,.95)'; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a + .25) * (r0 + 7 + rnd() * 6), cy + Math.sin(a + .25) * (r0 + 7 + rnd() * 6)); g.lineTo(cx + Math.cos(a + .45) * r0, cy + Math.sin(a + .45) * r0); g.fill();
      g.strokeStyle = 'rgba(90,80,70,.35)'; g.lineWidth = .8; g.stroke();
    }
    for (let k = 0; k < 5; k++) fracture(g, cx, cy, rnd() * 6.283, 26 + rnd() * 40, 1.1, 1, 'rgba(70,60,50,.55)', 'rgba(255,255,255,.35)', 0.5, 0.18);
    for (let k = 0; k < 160; k++) { const a = rnd() * 6.283, r = 10 + rnd() * rnd() * 50; g.fillStyle = `rgba(240,235,225,${.3 + rnd() * .4})`; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + rnd(), 1 + rnd()); }
  } else if (kind === 'tile') {
    // タイルの割れ：中心で釉薬が欠けて素地が見え、そこから細いひびが枝分かれして走る
    const R = 7 + rnd() * 5;
    // 欠けた部分（明るい素地）と、その縁の陰
    g.fillStyle = 'rgba(60,58,55,.35)'; jag(g, cx + 1.5, cy + 1.5, R + 2, 11, .35); g.fill();
    g.fillStyle = 'rgba(214,208,196,.97)'; jag(g, cx, cy, R, 11, .35); g.fill();
    g.strokeStyle = 'rgba(50,48,45,.55)'; g.lineWidth = .9; g.stroke();
    const rg = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, R); rg.addColorStop(0, 'rgba(170,164,152,.8)'); rg.addColorStop(1, 'rgba(170,164,152,0)'); g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    // まわりの小さな欠け
    for (let k = 0; k < 4; k++) { const a = rnd() * 6.283, r = R + 3 + rnd() * 8; g.fillStyle = 'rgba(214,208,196,.9)'; jag(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5 + rnd() * 2.5, 6, .4); g.fill(); }
    // 同心円状の割れ（途切れ途切れ）
    g.strokeStyle = 'rgba(45,44,42,.55)'; g.lineWidth = .8;
    for (const rr of [R + 8 + rnd() * 4, R + 18 + rnd() * 8]) { let a = rnd() * 6.283; for (let k = 0; k < 4; k++) { const len = .3 + rnd() * .6; g.beginPath(); g.arc(cx, cy, rr + (rnd() - .5) * 3, a, a + len); g.stroke(); a += len + .3 + rnd() * .8; } }
    // 放射状のひび
    // 放射状のひび（ほぼまっすぐ、ところどころで折れる）と、それをつなぐ短い割れ
    const n = 4 + Math.floor(rnd() * 3), rays = [];
    for (let k = 0; k < n; k++) { const a = k / n * 6.283 + (rnd() - .5) * .7, pts = []; fracture(g, cx + Math.cos(a) * R * .8, cy + Math.sin(a) * R * .8, a, 45 + rnd() * 75, 1.3, 1, 'rgba(38,37,36,.8)', 'rgba(255,255,255,.8)', 0.22, 0.1, pts); rays.push(pts); }
    g.strokeStyle = 'rgba(40,39,38,.6)'; g.lineWidth = .7;
    for (let k = 0; k < n; k++) {
      const A = rays[k], B = rays[(k + 1) % n]; if (!A.length || !B.length || rnd() < .35) continue;
      const pa = A[Math.min(A.length - 1, 1 + Math.floor(rnd() * 2))], pb = B[Math.min(B.length - 1, 1 + Math.floor(rnd() * 2))];
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo((pa[0] + pb[0]) / 2 + (rnd() - .5) * 6, (pa[1] + pb[1]) / 2 + (rnd() - .5) * 6); g.lineTo(pb[0], pb[1]); g.stroke();
    }
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
  for (let k = 0; k < 7; k++) fracture(g, cx, cy, k / 7 * 6.283 + rnd() * .5, 30 + rnd() * 34, 1.3, 2, 'rgba(50,42,34,.65)', 'rgba(255,255,255,.3)');
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

// ================= ハンマーの部屋用 =================
// 美術館：磨いた石の床（1枚で1.2m角）
export const marble = (rx, ry) => make('marble', 512, 512, (g, w, h) => {
  g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) { const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 140; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${rnd() < .5 ? '120,115,105' : '255,255,255'},${.05 + rnd() * .08})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = `rgba(90,85,78,${.12 + rnd() * .2})`; g.lineWidth = .6 + rnd() * 1.6;
    let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (rnd() - .3) * 60; y += (rnd() - .5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  noise(g, w, h, 6000, .05);
  g.fillStyle = 'rgba(60,55,50,.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
}, { repeat: [rx, ry] });

// 美術館の壁に掛ける抽象画（架空）
export const painting = (i) => make('paint' + i, 256, 320, (g, w, h) => {
  const pal = [['#1d2a3a', '#c9472e', '#e8d9b5', '#3f6f8f'], ['#e9e2d0', '#2b2b2b', '#b8322a', '#d9a441'], ['#23321f', '#8fb07a', '#e0d2a8', '#6b3f2a'], ['#3a2233', '#d98c6a', '#f1e6d2', '#4c7a8c']][i % 4];
  g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 9; k++) {
    g.fillStyle = pal[1 + (k % 3)]; g.globalAlpha = .55 + rnd() * .4;
    if (rnd() < .5) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 20 + rnd() * 70, 0, 7); g.fill(); }
    else { g.save(); g.translate(rnd() * w, rnd() * h); g.rotate(rnd() * 3); g.fillRect(-60, -10, 60 + rnd() * 100, 10 + rnd() * 40); g.restore(); }
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 60; k++) { g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + rnd() * 30 - 15, y + rnd() * 30 - 15); g.stroke(); }
  noise(g, w, h, 3000, .08);
});

// 展示の説明パネル
export const caption = (title, sub) => make('cap' + title, 256, 128, (g, w, h) => {
  g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#222'; g.font = 'bold 26px serif'; g.fillText(title, 18, 42);
  g.fillStyle = '#555'; g.font = '15px serif'; g.fillText(sub, 18, 72);
  g.fillStyle = '#9b2a22'; g.font = 'bold 14px sans-serif'; g.fillText('作品に手を触れないでください', 18, 108);
});

// 非常口（緑の誘導灯・架空の簡略版）
export const exitSign = () => make('exit', 256, 96, (g, w, h) => {
  g.fillStyle = '#1f9a55'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#eafff2'; g.fillRect(14, 14, 60, 68);
  g.fillStyle = '#1f9a55'; g.beginPath(); g.arc(44, 28, 7, 0, 7); g.fill(); g.fillRect(38, 38, 12, 24);
  g.fillStyle = '#eafff2'; g.font = 'bold 44px sans-serif'; g.fillText('EXIT', 96, 64);
});

// オフィス：タイルカーペット（1枚で1m角）
export const carpet = (rx, ry) => make('carpet', 256, 256, (g, w, h) => {
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? '#454b55' : '#3e444d'; g.fillRect(x * 128, y * 128, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.035)';
    for (let k = 0; k < 128; k += 4) { g.beginPath(); if ((x + y) % 2) { g.moveTo(x * 128 + k, y * 128); g.lineTo(x * 128 + k, y * 128 + 128); } else { g.moveTo(x * 128, y * 128 + k); g.lineTo(x * 128 + 128, y * 128 + k); } g.stroke(); }
  }
  noise(g, w, h, 9000, .12);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 127, w, 2); g.fillRect(127, 0, 2, h);
}, { repeat: [rx, ry] });

// 天井のシステム天井（60cm角）
export const ceilPanel = (rx, ry) => make('ceilp', 128, 128, (g, w, h) => {
  g.fillStyle = '#cfcdc6'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, .08);
  g.fillStyle = '#9d9b94'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
}, { repeat: [rx, ry] });

// 夜の窓（ブラインド越しのビルの明かり）
export const nightBlinds = () => make('blinds', 512, 256, (g, w, h) => {
  g.fillStyle = '#0b1320'; g.fillRect(0, 0, w, h);
  for (let b = 0; b < 14; b++) {
    const bx = rnd() * w, bw = 30 + rnd() * 70, top = h * (.15 + rnd() * .5);
    g.fillStyle = '#121c2c'; g.fillRect(bx, top, bw, h - top);
    for (let y = top + 6; y < h; y += 9) for (let x = bx + 4; x < bx + bw - 4; x += 8) if (rnd() < .28) { g.fillStyle = rnd() < .8 ? '#e9d9a4' : '#a9d3ff'; g.globalAlpha = .5 + rnd() * .5; g.fillRect(x, y, 4, 4); g.globalAlpha = 1; }
  }
  for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(200,205,212,.28)'; g.fillRect(0, y, w, 5); }
});

// ホワイトボード（締切前）
export const whiteboard = () => make('wboard', 512, 256, (g, w, h) => {
  g.fillStyle = '#f4f6f6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b4fa0'; g.lineWidth = 3; g.font = 'bold 30px sans-serif'; g.fillStyle = '#2b4fa0';
  g.fillText('今週のタスク', 24, 44);
  g.font = '20px sans-serif';
  ['・資料 修正（3回目）', '・見積 再提出', '・定例MTG 準備', '・議事録…'].forEach((t, i) => g.fillText(t, 30, 86 + i * 32));
  g.fillStyle = '#c62b2b'; g.font = 'bold 42px sans-serif'; g.fillText('締切!!', 330, 110);
  g.strokeStyle = '#c62b2b'; g.beginPath(); g.ellipse(390, 96, 90, 38, -.1, 0, 7); g.stroke();
  g.strokeStyle = '#1e7a45'; g.beginPath(); g.moveTo(300, 220); g.lineTo(360, 180); g.lineTo(400, 200); g.lineTo(470, 140); g.stroke();
  noise(g, w, h, 800, .04);
});

// レストランの厨房：白黒の市松の床（1枚で60cm角）
export const checker = (rx, ry) => make('checker', 256, 256, (g, w, h) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2a2a2a' : '#e8e6df'; g.fillRect(x * 64, y * 64, 64, 64); }
  noise(g, w, h, 6000, .1);
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, h); g.fillRect(0, i * 64 - 1, w, 2); }
}, { repeat: [rx, ry] });

// 厨房の壁：白いサブウェイタイル（1枚で60cm×30cm）
export const subway = (rx, ry) => make('subway', 256, 128, (g, w, h) => {
  g.fillStyle = '#bdbab2'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let c = -1; c < 5; c++) {
    const x = c * 64 + (r % 2 ? 32 : 0) + 2, y = r * 32 + 2;
    const gr = g.createLinearGradient(x, y, x, y + 28); gr.addColorStop(0, '#fbfaf6'); gr.addColorStop(1, '#e6e3dc');
    g.fillStyle = gr; g.fillRect(x, y, 60, 28);
  }
  noise(g, w, h, 1500, .04);
}, { repeat: [rx, ry] });

// 黒板のメニュー
export const menuBoard = () => make('menub', 256, 320, (g, w, h) => {
  g.fillStyle = '#1f2a24'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.88)'; g.font = 'bold 28px sans-serif'; g.fillText('本日のおすすめ', 22, 48);
  g.font = '19px sans-serif';
  ['ハンバーグ定食', 'オムライス', 'ナポリタン', '日替わりパスタ', '食後のコーヒー'].forEach((t, i) => { g.fillText(t, 26, 98 + i * 40); g.fillText('¥' + (780 + i * 60), 180, 98 + i * 40); });
  g.fillStyle = '#e6b54a'; g.fillText('本日貸切', 70, 300);
  noise(g, w, h, 4000, .12, false);
});

// 和食屋の厨房：グレーの防滑タイル（1枚で60cm角・30cm目地）
export const kitchenTile = (rx, ry) => make('ktile', 256, 256, (g, w, h) => {
  g.fillStyle = '#5f5d58'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const t = 88 + rnd() * 12; g.fillStyle = `rgb(${t},${t - 2},${t - 6})`; g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122); }
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${.12 + rnd() * .15})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, .8 + rnd(), 0, 7); g.fill(); }
  noise(g, w, h, 5000, .08);
}, { repeat: [rx, ry] });

// 短冊のお品書き（木の札）
export const tanzaku = (text, price) => make('tz' + text, 64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#d9c29a'); gr.addColorStop(1, '#cbb186');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,85,45,.25)'; for (let k = 0; k < 8; k++) { g.beginPath(); const x = rnd() * w; g.moveTo(x, 0); g.lineTo(x + rnd() * 4 - 2, h); g.stroke(); }
  g.fillStyle = '#1b1510'; g.font = 'bold 30px serif'; g.textAlign = 'center';
  [...text].forEach((ch, i) => g.fillText(ch, w / 2, 40 + i * 32));
  g.fillStyle = '#8a1f16'; g.font = 'bold 18px serif'; g.fillText(price, w / 2, h - 14);
});

// 紺の暖簾（白抜きの文字）
export const noren = (ch) => make('noren' + ch, 128, 256, (g, w, h) => {
  g.fillStyle = '#1d2c4d'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 3000, .1, false);
  g.fillStyle = '#efe9dc'; g.font = 'bold 84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h * 0.45);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, 10);
});

// ================= 夜の街 =================
// 濡れたアスファルト（1枚で2m角）
export const asphalt = (rx, ry) => make('asph', 512, 512, (g, w, h) => {
  g.fillStyle = '#2b2b2d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) { const t = 30 + rnd() * 70; g.fillStyle = `rgba(${t},${t},${t + 3},${.35 + rnd() * .4})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  for (let i = 0; i < 8; i++) { const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 120; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(0,0,0,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  crack(g, rnd() * w, rnd() * h, 3, 200, 'rgba(10,10,10,.5)', 1.4);
}, { repeat: [rx, ry] });

// ビルの外壁（窓のあかりがぽつぽつ）1枚で6m×6m
export const facade = (i) => make('facade' + i, 512, 512, (g, w, h) => {
  const base = ['#3a3531', '#2f3338', '#3b3f3a', '#40362f'][i % 4];
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  noise(g, w, h, 12000, .12);
  const cols = 4 + (i % 2), rows = 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = 20 + c * (w - 40) / cols, y = 24 + r * (h - 40) / rows, ww = (w - 40) / cols - 26, hh = (h - 40) / rows - 38;
    const lit = rnd() < .35;
    g.fillStyle = lit ? (rnd() < .7 ? '#e9c98a' : '#bcd6f0') : '#15171a'; g.fillRect(x, y, ww, hh);
    if (lit) { g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 3; k++) g.fillRect(x + rnd() * ww, y, 3, hh); }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x - 3, y + hh, ww + 6, 4);
    // 室外機
    if (rnd() < .3) { g.fillStyle = '#a8aaa8'; g.fillRect(x + ww * .6, y + hh + 6, 30, 20); g.fillStyle = '#555'; g.beginPath(); g.arc(x + ww * .6 + 12, y + hh + 16, 7, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(0,0,0,.35)'; for (let x = 0; x < w; x += w / 2) g.fillRect(x, 0, 3, h);
});

// シャッター
export const shutter = () => make('shutter', 256, 256, (g, w, h) => {
  for (let y = 0; y < h; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#8e9194'); gr.addColorStop(.5, '#b4b7b9'); gr.addColorStop(1, '#6d7073'); g.fillStyle = gr; g.fillRect(0, y, w, 8); }
  noise(g, w, h, 5000, .15);
  g.fillStyle = 'rgba(120,70,30,.25)'; for (let i = 0; i < 20; i++) g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 20, 2 + rnd() * 5);
});

// ネオン管の文字（黒地に光る文字。emissiveMapに使う）
export const neon = (text, color, font = 'bold 96px sans-serif', vertical = false) => make('neon' + text + color + vertical, vertical ? 128 : 512, vertical ? 512 : 160, (g, w, h) => {
  g.fillStyle = '#050505'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
  const draw = () => { if (vertical) [...text].forEach((ch, k) => g.fillText(ch, w / 2, h / (text.length + 1) * (k + 1))); else g.fillText(text, w / 2, h / 2 + 4); };
  g.shadowColor = color; g.shadowBlur = 26; g.fillStyle = color; draw(); draw();
  g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.globalAlpha = .75; draw(); g.globalAlpha = 1;
});

// 自販機の前面（架空の飲み物）
export const vending = () => make('vend', 256, 512, (g, w, h) => {
  g.fillStyle = '#f2f4f5'; g.fillRect(0, 0, w, h);
  const cols = ['#c8261d', '#1d5fb0', '#e9a21b', '#1f8a4c', '#6b3fa0', '#d9d9d9', '#202020', '#c86a1d'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const x = 14 + c * 38, y = 30 + r * 92;
    g.fillStyle = cols[(r * 3 + c * 5) % cols.length]; g.fillRect(x, y, 26, 52);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 4, y + 4, 5, 44);
    g.fillStyle = '#222'; g.font = 'bold 12px sans-serif'; g.fillText(['130', '150', '160', '180'][r], x, y + 68);
    g.fillStyle = r === 3 && c === 2 ? '#e53' : '#2a8'; g.fillRect(x + 6, y + 74, 14, 6);
  }
  g.fillStyle = '#1c1c1c'; g.fillRect(0, 400, w, 112);
  g.fillStyle = '#333'; g.fillRect(30, 440, 196, 50);
  g.fillStyle = '#c8261d'; g.fillRect(0, 0, w, 18);
});

// ショーウィンドウの奥（あかりの付いた店内）
export const shopInside = (i) => make('shopin' + i, 512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, ['#f3e2c2', '#dfe9f2', '#f0d8d8'][i % 3]); gr.addColorStop(1, '#6f6358');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let s = 0; s < 3; s++) { const y = 60 + s * 62; g.fillStyle = '#8a6a48'; g.fillRect(0, y, w, 6); for (let x = 8; x < w - 10; x += 14 + rnd() * 20) { g.fillStyle = `hsl(${rnd() * 360},45%,${40 + rnd() * 30}%)`; const hh = 14 + rnd() * 30; g.fillRect(x, y - hh, 8 + rnd() * 14, hh); } }
  noise(g, w, h, 4000, .08);
});

// 遠くの夜空とビルのシルエット
export const skyline = () => make('skyline', 1024, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05070d'); gr.addColorStop(1, '#27213a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w;) { const bw = 30 + rnd() * 70, bh = 60 + rnd() * 170; g.fillStyle = '#0b0c12'; g.fillRect(x, h - bh, bw, bh); for (let y = h - bh + 8; y < h; y += 12) for (let xx = x + 5; xx < x + bw - 5; xx += 9) if (rnd() < .25) { g.fillStyle = rnd() < .8 ? '#e3c486' : '#9cc6ee'; g.fillRect(xx, y, 4, 5); } x += bw + rnd() * 6; }
  g.fillStyle = '#ff3b3b'; for (let i = 0; i < 6; i++) g.fillRect(rnd() * w, h - 200 + rnd() * 60, 3, 3);
});

// ================= 終電の車内 =================
// 座席のモケット（青緑に細かい柄）
export const moquette = (rx, ry) => make('moq', 128, 128, (g, w, h) => {
  g.fillStyle = '#23566a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 * 4; x < w; x += 8) { g.fillStyle = 'rgba(160,210,220,.18)'; g.fillRect(x, y, 3, 3); }
  noise(g, w, h, 4000, .12);
}, { repeat: [rx, ry] });

// 車内の床（グレーのゴムに細かい粒）
export const trainFloor = (rx, ry) => make('tfloor', 256, 256, (g, w, h) => {
  g.fillStyle = '#6c6a66'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(30,30,30,.35)' : 'rgba(230,228,220,.3)'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
}, { repeat: [rx, ry] });

// 窓の外：流れていく夜景（横に長い帯。オフセットを動かして流す）
export const passing = () => make('passing', 1024, 256, (g, w, h) => {
  g.fillStyle = '#04060b'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w;) { const bw = 20 + rnd() * 80, bh = 30 + rnd() * 150; g.fillStyle = '#0a0c13'; g.fillRect(x, h - bh, bw, bh); for (let y = h - bh + 6; y < h; y += 10) for (let xx = x + 4; xx < x + bw - 4; xx += 8) if (rnd() < .22) { g.fillStyle = rnd() < .8 ? '#d9b675' : '#8fbde6'; g.fillRect(xx, y, 3, 4); } x += bw + rnd() * 20; }
  // 近くを流れる街灯の光（横に伸びたすじ）
  for (let i = 0; i < 9; i++) { const y = 20 + rnd() * 120, x = rnd() * w; const gr = g.createLinearGradient(x, 0, x + 180, 0); gr.addColorStop(0, 'rgba(255,220,160,0)'); gr.addColorStop(.5, 'rgba(255,220,160,.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gr; g.fillRect(x, y, 180, 3); }
  // 架線の柱
  for (let x = 0; x < w; x += 170) { g.fillStyle = '#12141a'; g.fillRect(x + rnd() * 30, 0, 6, h); }
});

// 中吊り広告（架空）
export const trainAd = (i) => make('tad' + i, 512, 256, (g, w, h) => {
  const ads = [
    ['#f5d23a', '#1b1b1b', '月曜日が、つらい人へ。', '有給休暇、ちゃんと使ってますか？'],
    ['#1f5fa8', '#ffffff', '週末は、温泉へ。', '各駅停車で行く、ゆるい旅'],
    ['#ffffff', '#c8261d', '英会話、はじめよう', '3ヶ月で話せる（かもしれない）'],
    ['#2b2b2b', '#f0e0b0', '新ドラマ 金曜よる10時', '「定時で帰ります。」'],
    ['#e9f3ea', '#1f7a45', '転職するなら、今。', 'あなたの市場価値、しらべます']
  ][i % 5];
  g.fillStyle = ads[0]; g.fillRect(0, 0, w, h);
  g.fillStyle = ads[1]; g.font = 'bold 44px sans-serif'; g.fillText(ads[2], 28, 100);
  g.font = '24px sans-serif'; g.fillText(ads[3], 30, 160);
  g.globalAlpha = .15; g.beginPath(); g.arc(w - 70, h - 60, 90, 0, 7); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
});

// ドアの上の案内表示
export const trainLCD = () => make('tlcd', 512, 128, (g, w, h) => {
  g.fillStyle = '#060606'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff8a1c'; g.font = 'bold 50px sans-serif'; g.fillText('次は 終点', 22, 62);
  g.fillStyle = '#7fd0ff'; g.font = '26px sans-serif'; g.fillText('Next  Terminal', 24, 104);
  g.fillStyle = '#39d353'; g.font = 'bold 28px sans-serif'; g.fillText('0:42', 400, 104);
});

// 車内の壁（クリーム色の化粧板）
export const trainWall = (rx, ry) => make('twall', 128, 128, (g, w, h) => {
  g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, .04);
}, { repeat: [rx, ry] });

// 割れたあとの窓枠に残るガラス（まん中は抜けて、縁にぎざぎざの破片が残る）
export const paneBroken = (i) => make('pbroken' + i, 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w * (.4 + rnd() * .2), cy = h * (.4 + rnd() * .2);
  // 縁から中心に向かって伸びる、ぎざぎざの残りガラス
  const edge = [];
  for (let k = 0; k < 28; k++) { const t = k / 28; const side = Math.floor(t * 4), f = t * 4 - side; edge.push(side === 0 ? [f * w, 0] : side === 1 ? [w, f * h] : side === 2 ? [w - f * w, h] : [0, h - f * h]); }
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length];
    const depth = .12 + rnd() * .42;
    const tip = [a[0] + (cx - a[0]) * depth + (rnd() - .5) * 20, a[1] + (cy - a[1]) * depth + (rnd() - .5) * 20];
    g.fillStyle = `rgba(200,225,235,${.28 + rnd() * .2})`;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(tip[0], tip[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(tip[0], tip[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // 縁の近くのひび
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = .8;
  for (let k = 0; k < 20; k++) { const a = edge[Math.floor(rnd() * edge.length)]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (cx - a[0]) * rnd() * .3 + (rnd() - .5) * 30, a[1] + (cy - a[1]) * rnd() * .3 + (rnd() - .5) * 30); g.stroke(); }
});

// ================= 夜の街（細部） =================
// ビルの外壁（高解像度）：タイル張り、窓枠と手すり、雨だれの汚れ。1枚で6m×6m
export const facadeHi = (i) => make('facadeHi' + i, 1024, 1024, (g, w, h) => {
  const base = ['#4a433c', '#3c4147', '#4a4a42', '#523f35'][i % 4];
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // 小口タイルの目地
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
  for (let y = 0; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 12 % 2) * 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 12); g.stroke(); } }
  noise(g, w, h, 40000, .1);
  const cols = 3, rows = 4, cw = w / cols, rh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw + 40, y = r * rh + 46, ww = cw - 80, hh = rh - 110;
    const lit = rnd() < .38, warm = rnd() < .7;
    // 窓（カーテンやブラインド越しの明かり）
    const gr = g.createLinearGradient(x, y, x, y + hh);
    if (lit) { gr.addColorStop(0, warm ? '#f3d49a' : '#c7dcef'); gr.addColorStop(1, warm ? '#b88a4e' : '#7f98b3'); } else { gr.addColorStop(0, '#1c2026'); gr.addColorStop(1, '#0e1013'); }
    g.fillStyle = gr; g.fillRect(x, y, ww, hh);
    if (lit && rnd() < .6) { g.fillStyle = 'rgba(0,0,0,.28)'; for (let k = 0; k < hh; k += 7) g.fillRect(x, y + k, ww, 3); }
    if (!lit) { g.fillStyle = 'rgba(120,140,160,.12)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww * .4, y); g.lineTo(x, y + hh * .6); g.fill(); }
    // サッシ
    g.strokeStyle = '#8b8f93'; g.lineWidth = 5; g.strokeRect(x, y, ww, hh); g.lineWidth = 3; g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + hh); g.stroke();
    // ベランダの手すり
    g.fillStyle = 'rgba(40,42,46,.95)'; g.fillRect(x - 20, y + hh + 8, ww + 40, 8);
    for (let k = x - 16; k < x + ww + 20; k += 10) g.fillRect(k, y + hh + 16, 3, 44);
    g.fillRect(x - 20, y + hh + 58, ww + 40, 6);
    // 物干し・植木
    if (rnd() < .3) { g.fillStyle = `hsl(${rnd() * 360},30%,55%)`; g.fillRect(x + rnd() * ww * .6, y + hh + 18, 26, 34); }
    // 雨だれ
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 5; k++) g.fillRect(x + rnd() * ww, y + hh + 64, 3 + rnd() * 3, 30 + rnd() * 60);
  }
});

// エアコンの室外機の前面
export const acFront = () => make('acfront', 128, 96, (g, w, h) => {
  g.fillStyle = '#d7d8d4'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, .1);
  g.fillStyle = '#6a6c6e'; g.beginPath(); g.arc(46, 48, 36, 0, 7); g.fill();
  g.strokeStyle = '#d7d8d4'; g.lineWidth = 2; for (let r = 8; r < 36; r += 5) { g.beginPath(); g.arc(46, 48, r, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(10, 48); g.lineTo(82, 48); g.moveTo(46, 12); g.lineTo(46, 84); g.stroke();
  g.fillStyle = 'rgba(100,70,40,.3)'; g.fillRect(0, h - 10, w, 10);
});

// 袖看板・スタンド看板（光る四角い看板）
export const signBox = (text, bg, fg, vertical = true) => make('sbox' + text + bg, vertical ? 128 : 256, vertical ? 256 : 128, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(0,0,0,.15)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) { const n = [...text].length, fs = Math.min(64, (h - 30) / n); g.font = `bold ${fs}px sans-serif`; [...text].forEach((ch, k) => g.fillText(ch, w / 2, 20 + fs / 2 + k * fs)); }
  else { g.font = 'bold 60px sans-serif'; g.fillText(text, w / 2, h / 2 + 4); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
});

// マンホールの蓋
export const manhole = () => make('manhole', 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#3a3a3c'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.strokeStyle = '#262628'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.stroke();
  g.strokeStyle = '#4c4c4f'; g.lineWidth = 3;
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); g.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.stroke(); }
  for (const r of [30, 60, 90]) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
  noise(g, w, h, 5000, .2);
});

// ビールケースの側面（黄色いプラスチックの格子）
export const crateSide = () => make('crate', 128, 96, (g, w, h) => {
  g.fillStyle = '#e3b51f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b8900f'; for (let x = 8; x < w - 8; x += 20) g.fillRect(x, 14, 12, h - 28);
  g.fillStyle = '#f0c93a'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  g.fillStyle = '#a31b14'; g.font = 'bold 16px sans-serif'; g.fillText('BEER', 44, 56);
});

// バーの店内（棚にずらっと並んだ酒瓶）
export const barInside = () => make('barin', 1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a2414'); gr.addColorStop(1, '#120a06'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let s = 0; s < 4; s++) {
    const y = 110 + s * 90;
    const lg = g.createLinearGradient(0, y - 80, 0, y); lg.addColorStop(0, 'rgba(255,190,110,.0)'); lg.addColorStop(1, 'rgba(255,190,110,.35)'); g.fillStyle = lg; g.fillRect(0, y - 80, w, 80);
    g.fillStyle = '#6b4424'; g.fillRect(0, y, w, 8);
    for (let x = 10; x < w - 20;) {
      const bw = 16 + rnd() * 12, bh = 44 + rnd() * 30, hue = [30, 20, 120, 200, 0, 45][Math.floor(rnd() * 6)];
      g.fillStyle = `hsla(${hue},55%,${25 + rnd() * 25}%,.95)`; g.fillRect(x, y - bh, bw, bh);
      g.fillRect(x + bw * .3, y - bh - 14, bw * .4, 14);
      g.fillStyle = 'rgba(255,240,200,.5)'; g.fillRect(x + 2, y - bh + 4, 3, bh - 8);
      if (rnd() < .6) { g.fillStyle = '#efe6d0'; g.fillRect(x + 2, y - bh * .55, bw - 4, bh * .25); }
      x += bw + 4 + rnd() * 6;
    }
  }
  // カウンター
  g.fillStyle = '#2b180c'; g.fillRect(0, h - 70, w, 70); g.fillStyle = '#8a5a30'; g.fillRect(0, h - 76, w, 8);
});

// ================= スクラップ工場 =================
// 砂利と土の地面（1枚で2m角）
export const gravel = (rx, ry) => make('gravel', 512, 512, (g, w, h) => {
  g.fillStyle = '#4a4540'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const t = 50 + rnd() * 90; g.fillStyle = `rgba(${t},${t - 6},${t - 12},${.6 + rnd() * .4})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 1 + rnd() * 2.5, rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 10; i++) { const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 110; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(20,16,12,.35)'); rg.addColorStop(1, 'rgba(20,16,12,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
}, { repeat: [rx, ry] });

// 金網（透明な背景に菱形の網）
export const chainLink = (rx, ry) => make('chain', 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(170,175,178,1)'; g.lineWidth = 2.2;
  for (let k = -h; k < w + h; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
  g.fillStyle = 'rgba(120,120,120,1)'; g.fillRect(0, 0, w, 3);
}, { repeat: [rx, ry] });

// つぶされた車のかたまり（しわくちゃの鉄板とさび）
export const crushed = (i) => make('crushed' + i, 256, 128, (g, w, h) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${.08 + rnd() * .15})`; g.beginPath(); g.moveTo(rnd() * w, rnd() * h); g.lineTo(rnd() * w, rnd() * h); g.lineTo(rnd() * w, rnd() * h); g.fill(); }
  g.strokeStyle = 'rgba(20,20,20,.5)'; g.lineWidth = 2; for (let k = 0; k < 14; k++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rnd() - .5) * 60; y += (rnd() - .5) * 20; g.lineTo(x, y); } g.stroke(); }
  for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(110,55,25,${.3 + rnd() * .4})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 20, 3 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
  // 窓だった所の黒い穴、タイヤの一部
  g.fillStyle = 'rgba(10,12,14,.85)'; g.fillRect(40 + rnd() * 80, 20 + rnd() * 40, 40 + rnd() * 40, 14 + rnd() * 10);
  g.fillStyle = '#141414'; g.beginPath(); g.arc(rnd() * w, h - 10, 22, 0, 7); g.fill();
  noise(g, w, h, 5000, .15);
});

// ハンマーのへこみ跡（くぼみの陰、はがれた塗装のふち、地金のこすれ）
export const dentMark = (i) => make('dentmark' + i, 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2 + (rnd() - .5) * 10, cy = h / 2 + (rnd() - .5) * 10;
  // くぼみの陰（片側が暗く、反対側が明るい）
  let rg = g.createRadialGradient(cx + 10, cy + 10, 4, cx, cy, 90);
  rg.addColorStop(0, 'rgba(10,8,6,.55)'); rg.addColorStop(.5, 'rgba(20,16,12,.22)'); rg.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  rg = g.createRadialGradient(cx - 14, cy - 14, 2, cx - 14, cy - 14, 50);
  rg.addColorStop(0, 'rgba(255,255,255,.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
  // はがれた塗装のふち（ぎざぎざ）
  g.fillStyle = 'rgba(165,170,174,.95)'; g.beginPath();
  for (let a = 0; a < 18; a++) { const ang = a / 18 * 6.283, r = 20 + rnd() * 16; a ? g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r) : g.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(30,25,20,.7)'; g.lineWidth = 1.5; g.stroke();
  // 地金のこすれ（ハンマーが滑った筋）
  const ang0 = rnd() * 6.283;
  for (let k = 0; k < 14; k++) { const a = ang0 + (rnd() - .5) * .5, off = (rnd() - .5) * 24, len = 20 + rnd() * 50; g.strokeStyle = `rgba(230,232,235,${.35 + rnd() * .4})`; g.lineWidth = .8 + rnd() * 1.4; g.beginPath(); g.moveTo(cx - Math.sin(a) * off, cy + Math.cos(a) * off); g.lineTo(cx - Math.sin(a) * off + Math.cos(a) * len, cy + Math.cos(a) * off + Math.sin(a) * len); g.stroke(); }
  // 塗装のひび
  for (let k = 0; k < 9; k++) { let a = rnd() * 6.283, x = cx + Math.cos(a) * 30, y = cy + Math.sin(a) * 30; g.strokeStyle = 'rgba(25,20,15,.55)'; g.lineWidth = .9; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { a += (rnd() - .5) * .8; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
  // 飛び散った塗装のかけら跡
  for (let k = 0; k < 20; k++) { const a = rnd() * 6.283, d = 36 + rnd() * 40; g.fillStyle = 'rgba(160,165,170,.8)'; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, 7); g.fill(); }
});

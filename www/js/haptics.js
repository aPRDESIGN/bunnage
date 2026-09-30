// 振動の窓口。
// iPhoneアプリ（Capacitor）では @capacitor/haptics（Core Haptics）を使う。
// ブラウザでは navigator.vibrate（Androidのみ）。iPhoneのSafariでは何も起きない。

export const hapticSettings = { hit: true, break: true, iosSwitch: true };

function plugin() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  if (cap.Plugins && cap.Plugins.Haptics) return cap.Plugins.Haptics;
  if (typeof cap.registerPlugin === 'function') { cap.Plugins = cap.Plugins || {}; return (cap.Plugins.Haptics = cap.registerPlugin('Haptics')); }
  return null;
}

// iPhoneのブラウザ用の裏技：iOS 18以降のSafariは、スイッチ型のチェックボックスを切り替えると
// 「コツッ」と軽く振動する。見えないスイッチを押して、その振動を借りる（強さ・長さは選べない）
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let sw = null;
function iosTick() {
  try {
    if (!sw) {
      sw = document.createElement('label'); sw.setAttribute('aria-hidden', 'true');
      sw.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      sw.appendChild(i); document.body.appendChild(sw);
    }
    sw.click();
  } catch (e) { /* 無視 */ }
}
// パターン（ms）の「鳴らす」部分の数だけコツッを刻む
function iosPattern(pattern) {
  const p = Array.isArray(pattern) ? pattern : [pattern];
  let t = 0;
  for (let k = 0; k < p.length; k += 2) { if (t === 0) iosTick(); else setTimeout(iosTick, t); t += p[k] + (p[k + 1] || 0) + 40; }
}
const canVibrate = typeof navigator.vibrate === 'function';

function vib(pattern) {
  try {
    if (canVibrate) navigator.vibrate(pattern);
    else if (isIOS && hapticSettings.iosSwitch) iosPattern(pattern);
  } catch (e) { /* 無視 */ }
}

export const haptics = {
  get kind() { return plugin() ? 'native' : canVibrate ? 'vibrate' : isIOS ? 'ios-switch' : 'none'; },

  // HOLD成立：物を掴んだ感覚。軽く短く
  hold() {
    const H = plugin();
    if (H) H.impact({ style: 'LIGHT' }).catch(() => {});
    else vib(8);
  },

  // 投擲成立：手から離れた感覚。短く明確に（最優先）
  release(power = 0.7) {
    const H = plugin();
    if (H) {
      H.impact({ style: 'HEAVY' }).catch(() => {});
      if (power > 0.8) setTimeout(() => H.impact({ style: 'MEDIUM' }).catch(() => {}), 45);
    } else vib(power > 0.8 ? [26, 20, 14] : 24);
  },

  // 衝突（設定でON/OFF）
  hit(strength = 0.5) {
    if (!hapticSettings.hit) return;
    const H = plugin();
    if (H) H.impact({ style: strength > 0.6 ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
    else vib(Math.round(8 + 14 * strength));
  },

  // 破壊（設定でON/OFF）
  break() {
    if (!hapticSettings.break) return;
    const H = plugin();
    if (H) {
      H.impact({ style: 'HEAVY' }).catch(() => {});
      setTimeout(() => H.impact({ style: 'LIGHT' }).catch(() => {}), 70);
      setTimeout(() => H.impact({ style: 'LIGHT' }).catch(() => {}), 130);
    } else vib([30, 25, 12, 20, 8]);
  },

  // カルーセルで中央のアイテムが変わったとき
  tick() {
    const H = plugin();
    if (H) H.impact({ style: 'LIGHT' }).catch(() => {});
    else vib(4);
  }
};

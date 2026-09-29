// 振動の窓口。
// iPhoneアプリ（Capacitor）では @capacitor/haptics（Core Haptics）を使う。
// ブラウザでは navigator.vibrate（Androidのみ）。iPhoneのSafariでは何も起きない。

export const hapticSettings = { hit: true, break: true };

function plugin() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  if (cap.Plugins && cap.Plugins.Haptics) return cap.Plugins.Haptics;
  if (typeof cap.registerPlugin === 'function') { cap.Plugins = cap.Plugins || {}; return (cap.Plugins.Haptics = cap.registerPlugin('Haptics')); }
  return null;
}

function vib(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 無視 */ }
}

export const haptics = {
  get kind() { return plugin() ? 'native' : (navigator.vibrate ? 'vibrate' : 'none'); },

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

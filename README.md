# ぶん投げ部屋 Demo v0.1

スマホを握ったまま腕を振ると、ゲーム内の物が飛んでいって壊れる、体感型のストレス発散ゲーム。
コンセプトは「投げて、壊して、片付けない。」

- Demo：https://aprdesign.github.io/bunnage/ （`www/` が本体）
- 最初の試作（2D）：`prototype-v0/`

## 構成

| | |
|---|---|
| 3D | Three.js r170（`www/vendor/`、ビルド不要） |
| 物理 | cannon-es 0.20 |
| 振り検出 | DeviceMotion＋DeviceOrientation（`www/js/motion.js`） |
| 音 | Web Audioでその場で合成（`www/js/audio.js`） |
| 振動 | アプリ版は @capacitor/haptics（Core Haptics）、ブラウザは navigator.vibrate（`www/js/haptics.js`） |
| アプリ化 | Capacitor（`capacitor.config.json`、webDir は `www`） |

ファイル

- `www/js/main.js` 画面遷移、HOLD、カメラのスワイプ、ダイヤル、メニュー
- `www/js/motion.js` 振り検出。HOLD中だけ、加速度を世界座標にして速度を積分し「上昇→ピーク→低下」で自動リリース
- `www/js/world.js` キッチン、物理、グラス・卵・缶、食器の破壊、冷蔵庫と缶の凹み、卵の跡、きれいにする
- `www/js/textures.js` タイル・床・ラベルなどをキャンバスで描画

## 実機テスト（ブラウザ版）

1. iPhoneのSafariで https://aprdesign.github.io/bunnage/ を開く
2. 「キッチン」→ センサーの許可を「許可」→ 投げるものを選ぶ
3. 画面の真ん中あたりを押さえたまま、スマホを握って振る
4. メニュー →「調整用の数値を表示」で、振りの速さ・LIGHT/NORMAL/HARD・判定された方向が見られる

ブラウザ版では、iPhoneは振動しない（Safariが振動に非対応のため）。振動はアプリ版で確認する。

## アプリ化（iPhone／Macで作業）

必要なもの：Xcode（App Storeから）、Node.js、Apple ID（無料で可。実機への転送は7日ごとに入れ直し）

```sh
git clone https://github.com/aPRDESIGN/bunnage.git
cd bunnage
npm install
npx cap add ios        # 初回だけ。ios/ フォルダができる
npx cap sync ios
npx cap open ios       # Xcodeが開く
```

Xcodeで：

1. 左の「App」→「Signing & Capabilities」→ Team に自分のApple IDを選ぶ
2. iPhoneをケーブルでつなぎ、上部の実行先でiPhoneを選んで ▶
3. 初回はiPhone側で「設定 → 一般 → VPNとデバイス管理」から開発元を信頼する

コードを直したあとは `npx cap sync ios` してから Xcode で ▶。

## 調整しやすい数値

- `www/js/motion.js` の `SWING`：振り始めのしきい値、LIGHT/NORMAL/HARDの境目
- `www/js/motion.js` の `describe()`：振りの速さ → 投げる強さ（NORMALで十分強く、上限あり）
- `www/js/world.js` の `throwHeld()`：投げる速さ（7〜15 m/s）、左右・上下のあそび（10°／12°）

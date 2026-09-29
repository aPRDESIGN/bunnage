#!/bin/sh
# ブラウザの古いキャッシュを避けるため、JSの読み込みに版番号を付ける
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(from '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(from '\.\./vendor/RoomEnvironment\.js)(\?v=[0-9]+)?'#\1'#g" www/js/*.js
sed -i -E "s#src=\"\./js/main\.js(\?v=[0-9]+)?\"#src=\"./js/main.js?v=$V\"#" www/index.html
echo $V

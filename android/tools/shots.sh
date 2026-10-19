#!/bin/bash
# 在模擬手機上跑一遍：用真的哨兵當主機，截圖＋錄影，放到 shots/
set -x
cd "$(dirname "$0")"
OUT=../../shots
mkdir -p "$OUT" /tmp/vs
printf 'PORT=8080\nTOKEN=demo\nNAME=示範主機\nDATA_DIR=/tmp/vs\n' > /tmp/vs/test.conf
SENTINEL_CONF=/tmp/vs/test.conf python3 ../../sentinel.py > /tmp/vs/log.txt 2>&1 &
SRV=$!
sleep 3
adb install -r ../app/build/outputs/apk/debug/app-debug.apk
tap(){ read -r X Y < <(python3 tap.py "$1") && adb shell input tap "$X" "$Y"; }
shot(){ sleep "${2:-1.5}"; adb exec-out screencap -p > "$OUT/$1.png"; }
start(){ adb shell am force-stop app.vpssentinel; adb shell am start -n app.vpssentinel/.MainActivity --es url "$1"; }

adb shell cmd uimode night no
adb shell am start -n app.vpssentinel/.MainActivity
shot 1-first 5
start "http://10.0.2.2:8080/#t=demo"
shot 2-home 10
adb shell screenrecord --bit-rate 8000000 --time-limit 20 /sdcard/flow.mp4 &
REC=$!
sleep 1
tap "工具" || adb shell input tap 400 2300
shot 3-tools 2.5
tap "設定" || adb shell input tap 900 2300
shot 4-settings 2.5
adb shell input keyevent 4
shot 5-back 2
wait $REC
adb pull /sdcard/flow.mp4 "$OUT/flow.mp4"
adb shell cmd uimode night yes
sleep 2
start "http://10.0.2.2:8080/"
shot 6-home-dark 10
start "http://10.0.2.2:9999/"
shot 7-failed 8
ls -la "$OUT"
kill $SRV

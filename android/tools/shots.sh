#!/bin/bash
# 在模擬手機上跑一遍：截圖＋錄影，放到 shots/
set -x
cd "$(dirname "$0")"
mkdir -p ../../shots
OUT=../../shots
python3 fake_server.py > /dev/null 2>&1 &
SRV=$!
sleep 1
adb install -r ../app/build/outputs/apk/debug/app-debug.apk
adb shell settings put global window_animation_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global animator_duration_scale 1
tap(){ read -r X Y < <(python3 tap.py "$1") && adb shell input tap "$X" "$Y"; }
shot(){ sleep "${2:-1.5}"; adb exec-out screencap -p > "$OUT/$1.png"; }
start(){ adb shell am force-stop app.vpssentinel; adb shell am start -n app.vpssentinel/.MainActivity --es url http://10.0.2.2:8080 --es token demo; }

adb shell cmd uimode night no
start
shot 1-首頁 8
adb shell screenrecord --bit-rate 8000000 --time-limit 40 /sdcard/flow.mp4 &
REC=$!
sleep 2
tap "Microsoft Azure"
shot 2-主機頁 2
adb shell input swipe 540 1800 540 700 400
shot 3-主機頁-往下 1.5
tap "24 時"
shot 4-24小時 2.5
adb shell input keyevent 4
shot 5-返回首頁 2
tap "紀錄"
shot 6-紀錄 1.5
tap "設定"
shot 7-設定 1.5
tap "首頁"
sleep 1.5
adb shell input swipe 540 500 540 1400 600
shot 8-下拉更新 1
sleep 3
tap "Oracle Cloud"
sleep 2
adb shell input keyevent 4
sleep 3
wait $REC
adb pull /sdcard/flow.mp4 "$OUT/flow.mp4"

adb shell cmd uimode night yes
sleep 2
start
shot 9-首頁-深色 8
tap "Oracle Cloud"
shot 10-主機頁-深色 2.5
adb shell input keyevent 4
sleep 1.5
tap "設定"
sleep 1.5
tap "登出"
shot 11-登入 2
tap "密碼或 PIN 碼"
adb shell input text 9999
adb shell input keyevent 66
shot 12-密碼錯 2.5
adb shell input keyevent 67 67 67 67
adb shell input text 1234
adb shell input keyevent 66
shot 13-登入後 5
ls -la "$OUT"
kill $SRV

#!/bin/bash
# Framework-local Appium: `APPIUM_PORT=4725|4726|4727 scripts/appium-dev.sh start|stop|status`.
# One server per port, each with its own pid/log file (~/.liskov-appium/appium-<port>.{pid,log,stdout}), so the
# OnePlus (4725), the iPhone (4726) and the emulator (4727) can run side by side. Stops ONLY the PID it recorded.
# --log-filters masks every typed value (element/value, keys, mobile: type) in the Appium log (t791u: credentials never logged).
set -u
L="$HOME/.liskov-appium"; export APPIUM_HOME="$L/appium-home"; PORT="${APPIUM_PORT:-4725}"
case "$PORT" in 4000|4003|4005|9090) echo "INFRA:CONFIG port $PORT reserved"; exit 2;; esac
PID="$L/appium-$PORT.pid"; LOG="$L/appium-$PORT.log"
cd "$(dirname "$0")/.."
alive() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }
case "${1:-status}" in
  start)
    if alive; then echo "already running pid $(cat "$PID") port $PORT"; exit 0; fi
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "INFRA:CONFIG port $PORT busy (not ours)"; exit 2; fi
    nohup npx --no-install appium server --address 127.0.0.1 --port "$PORT" --log-level info --log-no-colors --log "$LOG" --log-filters config/appium-log-filters.json > "$L/appium-$PORT.stdout" 2>&1 &
    echo $! > "$PID"
    perl -e 'for(1..60){exit 0 if system("curl -sf http://127.0.0.1:'"$PORT"'/status >/dev/null")==0; sleep 1} exit 1' && echo "appium up pid $(cat "$PID") port $PORT log $LOG" || { echo "appium did not come up (see $L/appium-$PORT.stdout)"; exit 1; } ;;
  stop)
    [ -f "$PID" ] || { echo "no pid file for port $PORT"; exit 0; }
    P=$(cat "$PID"); pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null; rm -f "$PID"; echo "stopped $P (port $PORT)" ;;
  status) if alive; then echo "running $(cat "$PID") port $PORT"; else echo "not running (port $PORT)"; exit 1; fi ;;
  *) echo "usage: APPIUM_PORT=<port> $0 start|stop|status"; exit 64 ;;
esac

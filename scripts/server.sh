#!/usr/bin/env bash
# Start (or restart) the production render service on $PORT (default 3001).
# Usage: scripts/server.sh [start|stop|restart|status]
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3001}"
LOG="${MOTION_LAB_LOG:-/tmp/motion-lab-server.log}"
pid_on_port() { lsof -ti ":$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true; }
stop() { local pid; pid=$(pid_on_port); if [ -n "${pid:-}" ]; then kill "$pid" && echo "stopped $pid"; sleep 1; else echo "nothing on :$PORT"; fi; }
start() { PORT=$PORT setsid node apps/render/dist/server.js >"$LOG" 2>&1 </dev/null & sleep 3; curl -sS "http://localhost:$PORT/api/health" && echo; }
case "${1:-restart}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) curl -sS "http://localhost:$PORT/api/health"; echo ;;
esac

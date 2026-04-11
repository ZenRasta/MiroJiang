#!/bin/bash
# MiroJiang — Start Script
# Launches backend (port 8100) and frontend dev server (port 3100)

cd /var/www/Jiang

echo "=== MiroJiang — Predictive History Simulation ==="
echo ""

# Start backend
echo "[1/2] Starting backend on port 8100..."
cd backend
if [ -d "../.venv" ]; then
    source ../.venv/bin/activate
fi
python -m uvicorn main:app --host 0.0.0.0 --port 8100 --reload &
BACKEND_PID=$!
cd ..

# Start frontend
echo "[2/2] Starting frontend on port 3100..."
cd frontend
npm run dev -- --host 0.0.0.0 --port 3100 &
FRONTEND_PID=$!
cd ..

echo ""
echo "Backend:  http://localhost:8100"
echo "Frontend: http://localhost:3100"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

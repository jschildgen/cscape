#!/bin/bash
set -e

cd "$(dirname "$0")"

source .venv/bin/activate

python cscape.py &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
until curl -s http://localhost:5000/ > /dev/null 2>&1; do
    sleep 0.5
done

xdg-open "$(pwd)/index.html"

wait $BACKEND_PID

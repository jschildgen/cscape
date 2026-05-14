#!/bin/bash
set -e

cd "$(dirname "$0")"

source .venv/bin/activate

# Start the backend in the background and capture its PID
python game.py "$@" &
BACKEND_PID=$!

echo "Waiting for backend..."
until curl -s http://localhost:5000/ > /dev/null 2>&1; do
    sleep 0.5
done

# Create a temporary Firefox profile and start Firefox
PROFILE_DIR=$(mktemp -d)
cat > "$PROFILE_DIR/user.js" <<EOF
user_pref("media.autoplay.default", 0);
EOF
firefox -no-remote -new-instance -profile "$PROFILE_DIR" http://localhost:5000 &
FIREFOX_PID=$!

# Function to kill both processes
cleanup() {
    kill -TERM "$BACKEND_PID" 2>/dev/null
    kill -TERM "$FIREFOX_PID" 2>/dev/null
    rm -rf "$PROFILE_DIR"
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

# Wait only for Firefox to exit, then kill backend
wait "$FIREFOX_PID"
kill -TERM "$BACKEND_PID" 2>/dev/null
wait "$BACKEND_PID" 2>/dev/null

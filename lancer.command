#!/bin/bash
# Double-cliquez sur ce fichier pour ouvrir Preview Match Studio dans le navigateur.
cd "$(dirname "$0")" || exit 1
# Premier port libre à partir de 8779 (un autre projet peut déjà occuper un port)
PORT=8779
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "Preview Match Studio : http://localhost:$PORT"
echo "Laissez cette fenêtre ouverte pendant l'utilisation (Ctrl+C pour arrêter)."
(sleep 1 && open "http://localhost:$PORT") &
python3 -m http.server "$PORT" --bind 127.0.0.1

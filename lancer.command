#!/bin/bash
# Double-cliquez sur ce fichier pour ouvrir Preview Match Studio dans le navigateur.
cd "$(dirname "$0")" || exit 1
PORT=8765
echo "Preview Match Studio : http://localhost:$PORT"
echo "Laissez cette fenêtre ouverte pendant l'utilisation (Ctrl+C pour arrêter)."
(sleep 1 && open "http://localhost:$PORT") &
python3 -m http.server "$PORT" --bind 127.0.0.1

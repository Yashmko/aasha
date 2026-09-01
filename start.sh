#!/usr/bin/env bash
# AASHA launcher — zero-dependency. `npm start` also works.
# Loads .env (if present) into the environment, then runs the server.
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

exec node server/index.js

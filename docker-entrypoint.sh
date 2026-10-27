#!/bin/sh
# Hosts such as Railway mount volumes owned by root. When the container starts as root,
# give the database (and backup) folders to the unprivileged "node" user, then drop root
# for good. `exec` keeps Node as PID 1 so it receives SIGTERM and shuts down cleanly.
set -e

if [ "$(id -u)" = "0" ]; then
  for dir in "$(dirname "${DB_PATH:-/data/crm.db}")" ${BACKUP_DIR:+"$BACKUP_DIR"}; do
    mkdir -p "$dir"
    chown -R node:node "$dir"
  done
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi

exec "$@"

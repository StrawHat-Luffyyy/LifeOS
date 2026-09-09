#!/bin/sh
set -e

mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql

# Update postgresql.conf
grep -q "listen_addresses = '*'" /mnt/host/wsl/pgdata/postgresql.conf || echo "listen_addresses = '*'" >> /mnt/host/wsl/pgdata/postgresql.conf

# Update pg_hba.conf
grep -q "0.0.0.0/0" /mnt/host/wsl/pgdata/pg_hba.conf || echo "host all all 0.0.0.0/0 trust" >> /mnt/host/wsl/pgdata/pg_hba.conf
grep -q "::0/0" /mnt/host/wsl/pgdata/pg_hba.conf || echo "host all all ::0/0 trust" >> /mnt/host/wsl/pgdata/pg_hba.conf

# Start Postgres if not running
if ! su - postgres -c "pg_ctl -D /mnt/host/wsl/pgdata status" > /dev/null 2>&1; then
    su - postgres -c "pg_ctl -D /mnt/host/wsl/pgdata -l /mnt/host/wsl/pg.log start"
    sleep 2
fi

# Ensure user/db exist
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='lifeos'\" | grep -q 1 || psql -c \"CREATE USER lifeos WITH SUPERUSER PASSWORD 'lifeos_dev';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='lifeos'\" | grep -q 1 || psql -c \"CREATE DATABASE lifeos OWNER lifeos;\""
su - postgres -c "psql -d lifeos -c \"CREATE EXTENSION IF NOT EXISTS vector;\""

# Start Redis if not running
if ! pidof redis-server > /dev/null 2>&1; then
    redis-server --daemonize yes --protected-mode no --bind 0.0.0.0
fi

echo "Postgres and Redis are UP and running. Keeping WSL process alive..."

# Keep container/distro alive forever
while true; do
    sleep 60
done

#!/bin/bash

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
timeout=30
until docker compose exec -T postgres pg_isready -U postgres || [ $timeout -eq 0 ]; do
  echo "Waiting for PostgreSQL... ($timeout seconds remaining)"
  sleep 1
  ((timeout--))
done

if [ $timeout -eq 0 ]; then
  echo "Timeout waiting for PostgreSQL"
  exit 1
fi

# Run schema.sql
echo "Running schema.sql..."
docker compose exec -T postgres psql -U postgres -d scheduler -f /scripts/schema.sql

echo "Database setup complete!"
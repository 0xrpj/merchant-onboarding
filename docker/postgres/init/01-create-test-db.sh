#!/bin/sh
# Runs once, on the first start with an empty data volume.
# Creates a second database for e2e tests, so tests never touch your dev data.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE DATABASE "${POSTGRES_DB}_test";
EOSQL

#!/bin/sh

set -eu

CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-rebirth-db}"
DATABASE_NAME="${POSTGRES_DB:-rebirth}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:17-alpine}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5455}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
READINESS_RETRIES="${POSTGRES_READINESS_RETRIES:-30}"

if ! command -v docker >/dev/null 2>&1; then
	echo "Docker is required to start PostgreSQL." >&2
	exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
	echo "PostgreSQL container '$CONTAINER_NAME' is already running."
else
	if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
		echo "Starting existing PostgreSQL container '$CONTAINER_NAME'."
		docker start "$CONTAINER_NAME" >/dev/null
	else
		echo "Creating PostgreSQL container '$CONTAINER_NAME' ..."
		docker run \
			--detach \
			--name "$CONTAINER_NAME" \
			--env POSTGRES_DB="$DATABASE_NAME" \
			--env POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
			--env POSTGRES_USER="$POSTGRES_USER" \
			--publish "$POSTGRES_PORT:5432" \
			--volume "$CONTAINER_NAME-data:/var/lib/postgresql/data" \
			"$POSTGRES_IMAGE" >/dev/null
	fi
fi

echo "Waiting for PostgreSQL to accept connections ..."
retry=1
while ! docker exec "$CONTAINER_NAME" pg_isready --dbname "$DATABASE_NAME" --username "$POSTGRES_USER" >/dev/null 2>&1; do
	if [ "$retry" -ge "$READINESS_RETRIES" ]; then
		echo "PostgreSQL did not become ready after $READINESS_RETRIES attempts." >&2
		exit 1
	fi

	retry=$((retry + 1))
	sleep 1
done

docker exec \
	--env PGPASSWORD="$POSTGRES_PASSWORD" \
	"$CONTAINER_NAME" \
	psql \
		--dbname "$DATABASE_NAME" \
		--username "$POSTGRES_USER" \
		--tuples-only \
		--no-align \
		--command "select 1;" >/dev/null

echo "PostgreSQL container is ready to accept connections."
echo "DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$DATABASE_NAME"

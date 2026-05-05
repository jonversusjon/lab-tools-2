.PHONY: index check-index backup restore list-backups alembic-revision alembic-upgrade

# Regenerate CODEBASE_INDEX.md (and the .backend.md / .frontend.md partials).
# Run after any change to models.py, schemas.py, routers/*.py, or frontend/src/**/*.ts(x).
# The pre-commit hook runs this automatically — manual invocation is for development.
index:
	@bash tools/generate_index.sh

# Verify CODEBASE_INDEX.md is up-to-date relative to source.
# Exits non-zero (and CI fails) if regeneration would change the file.
# Use this in pre-commit and CI.
check-index:
	@bash tools/generate_index.sh --check

# Create a timestamped, gzip-compressed snapshot of panels.db in backend/backups/.
# Idempotent per day — skips if today's snapshot already exists.
# Use ARGS=--force to overwrite today's snapshot.
backup:
	@python backend/tools/backup.py snapshot $(ARGS)

# Restore from a snapshot. Pass the snapshot path:
#   make restore PATH=backend/backups/panels-2026-05-04.db.gz
# Refuses to overwrite backend/panels.db without ARGS=--force.
restore:
	@python backend/tools/backup.py restore --src="$(abspath $(PATH))" --dst=backend/panels.db $(ARGS)

# List all snapshots in backend/backups/ with size, date, and retention classification.
list-backups:
	@python backend/tools/backup.py list

# Generate a new Alembic migration via autogenerate. MSG is required.
#   make alembic-revision MSG="add foo column to bar"
alembic-revision:
	@test -n "$(MSG)" || (echo "MSG is required: make alembic-revision MSG=\"description\"" && exit 1)
	cd backend && alembic revision --autogenerate -m "$(MSG)"

# Apply all pending Alembic migrations to the configured DATABASE_URL.
alembic-upgrade:
	cd backend && alembic upgrade head

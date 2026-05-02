# Add to your existing Makefile, or create one if you don't have it.
# Targets: index, check-index

.PHONY: index check-index

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

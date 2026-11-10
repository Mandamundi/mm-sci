## Frontend

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Data pipeline

**Prerequisites:** [uv](https://docs.astral.sh/uv/). It installs Python 3.12 (pinned in `.python-version`) and the locked dependencies from `uv.lock`.

1. Install dependencies:
   `uv sync`
2. Pull new rating actions into `agencies/`:
   `uv run scripts/ratings_scraper.py` (add `--dry-run` to preview)
3. Recompute the index JSON in `public/data/` (after new ratings or CDS data in `cds/`):
   `uv run scripts/compute_index.py`
4. Rebuild the correlation chart data (`cds_snapshot.json`, `debt.json`):
   `uv run scripts/build_correlation_data.py`

Steps 2–3 run every Monday through `.github/workflows/update-data.yml`.

### Backend series IDs

`reference/sci_backend_ids.csv` maps each country to its SCI series ID in the MacroMicro backend (85908–86023), along with the backend's English and Chinese names and slug, its key in `public/data/sci.json`, and its CSV in `agencies/`. Use it when uploading values manually (id / date / value, where date is the first of the month and value is that month's month-end entry in `sci.json`).

To add a Python dependency: `uv add <package>` (updates `pyproject.toml` and `uv.lock`).

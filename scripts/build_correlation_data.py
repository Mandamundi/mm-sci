"""
Generates two JSON data files for the correlation scatter plots:

  public/data/cds_snapshot.json  —  { country: { cds, iso2 } }
  public/data/debt.json          —  { country: debt_gdp_2024 }

"""

import json
import os
import openpyxl
import xlrd

CDS_COUNTRY_MAP = {
    "australia":   ("Australia",      "AU"),
    "austria":     ("Austria",        "AT"),
    "belgium":     ("Belgium",        "BE"),
    "brazil":      ("Brazil",         "BR"),
    "canada":      ("Canada",         "CA"),
    "china":       ("China",          "CN"),
    "denmark":     ("Denmark",        "DK"),
    "egypt":       ("Egypt",          "EG"),
    "finland":     ("Finland",        "FI"),
    "france":      ("France",         "FR"),
    "germany":     ("Germany",        "DE"),
    "indonesia":   ("Indonesia",      "ID"),
    "ireland":     ("Ireland",        "IE"),
    "italy":       ("Italy",          "IT"),
    "japan":       ("Japan",          "JP"),
    "mexico":      ("Mexico",         "MX"),
    "netherlands": ("Netherlands",    "NL"),
    "portugal":    ("Portugal",       "PT"),
    "spain":       ("Spain",          "ES"),
    "sweden":      ("Sweden",         "SE"),
    "turkey":      ("Turkey",         "TR"),
    "uk":          ("United Kingdom", "GB"),
    "us":          ("United States",  "US"),
}

# IMF spreadsheet name → SCI country name (only overrides needed)
IMF_NAME_MAP = {
    "China, People's Republic of":          "China",
    "Türkiye, Republic of":                 "Turkey",
    "Korea, Republic of":                   "South Korea",
    "Taiwan Province of China":             "Taiwan",
    "Congo, Republic of":                   "Republic of Congo",
    "Congo, Democratic Republic of the":    "Democratic Republic of Congo",
    "Bahamas, The":                         "Bahamas",
    "Gambia, The":                          "Gambia",
    "Lao P.D.R.":                           "Laos",
    "Micronesia, Fed. States of":           "Micronesia",
    "Slovak Republic":                      "Slovakia",
    "Czech Republic":                       "Czech Republic",
    "São Tomé and Príncipe":                "Sao Tome and Principe",
    "Cabo Verde":                           "Cape Verde",
    "Kyrgyz Republic":                      "Kyrgyzstan",
    "North Macedonia":                      "North Macedonia",
}

CDS_DIR  = "cds"
DEBT_FILE = "debt/debt.xls"
OUT_DIR  = "public/data"

# ── 1. Build cds_snapshot.json ──────────────────────────────────────────────

cds_snapshot = {}

for filename in sorted(os.listdir(CDS_DIR)):
    if not filename.endswith(".xlsx"):
        continue
    key = filename.replace("mm_", "").replace("-5year-cds.xlsx", "")
    if key not in CDS_COUNTRY_MAP:
        print(f"  [skip] unknown CDS key: {key}")
        continue

    country_name, iso2 = CDS_COUNTRY_MAP[key]
    path = os.path.join(CDS_DIR, filename)

    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    latest_cds = None
    for row in ws.iter_rows(values_only=True):
        if row[0] == "Date":
            continue
        if row[1] is not None:
            latest_cds = float(row[1])

    wb.close()

    if latest_cds is not None:
        cds_snapshot[country_name] = {"cds": round(latest_cds, 4), "iso2": iso2}
        print(f"  CDS  {country_name:20s} {latest_cds:.2f} bps")

out_path = os.path.join(OUT_DIR, "cds_snapshot.json")
os.makedirs(OUT_DIR, exist_ok=True)
with open(out_path, "w") as f:
    json.dump(cds_snapshot, f, indent=2)
print(f"\n→ wrote {out_path}  ({len(cds_snapshot)} countries)\n")

# ── 2. Build debt.json (2024 actual, Debt/GDP %) ────────────────────────────

wb = xlrd.open_workbook(DEBT_FILE)
sh = wb.sheet_by_index(0)

header = [sh.cell_value(0, j) for j in range(sh.ncols)]
# Find 2024 column (last confirmed actual; IMF marks 2025+ as estimates)
if 2024.0 not in header:
    raise ValueError("2024 column not found in debt spreadsheet")
col_2024 = header.index(2024.0)

debt = {}
for i in range(1, sh.nrows):
    imf_name = sh.cell_value(i, 0)
    sci_name  = IMF_NAME_MAP.get(imf_name, imf_name)
    raw = sh.cell_value(i, col_2024)
    if isinstance(raw, float):
        debt[sci_name] = round(raw, 2)

out_path = os.path.join(OUT_DIR, "debt.json")
with open(out_path, "w") as f:
    json.dump(debt, f, indent=2)
print(f"→ wrote {out_path}  ({len(debt)} countries)\n")

# ── Verify coverage for CDS countries ──────────────────────────────────────
print("Debt/GDP coverage for CDS countries:")
for country in sorted(cds_snapshot):
    v = debt.get(country)
    print(f"  {'✓' if v else '✗'}  {country:22s}  {v}")

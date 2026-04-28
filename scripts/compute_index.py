# ══════════════════════════════════════════════════════════════════════════════
# MM SOVEREIGN CREDIT INDEX
# ══════════════════════════════════════════════════════════════════════════════
#
# Reads:
#   agencies/   one CSV per country from scraper.py
#               columns: Country | Agency | Rating | Outlook | Date
#
#   cds/        one Excel per country, e.g. mm_austria-5year-cds.xlsx
#               columns: Date | Value  (bps, weekly)
#
# Writes to data/:
#   sci.json        — monthly SCI time series per country
#   market.json     — weekly market-implied SCI + divergence per country
#                     (only for countries with CDS data)
#   snapshot.json   — latest SCI, market-implied, spread per country (for map)
#   ratings.json    — raw agency rating history per country (for hierarchy table)
#
# ══════════════════════════════════════════════════════════════════════════════

import os
import re
import glob
import json
import traceback

import numpy as np
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — CONFIG
# ══════════════════════════════════════════════════════════════════════════════

AGENCIES_DIR = "agencies"
CDS_DIR      = "cds"
DATA_DIR     = "public/data"

# CDS series that are discontinued and should be excluded from the regression
# but their SCI is still computed normally
DISCONTINUED_CDS = {"greece", "russia"}

AGENCIES = ["S&P", "Moody's", "Fitch"]

RATING_SCORE = {
    "AAA": 100, "Aaa": 100,
    "AA+": 95,  "Aa1": 95,  "AA (high)": 95,
    "AA":  90,  "Aa":  90,  "Aa2": 90,
    "AA-": 85,  "Aa3": 85,  "AA (low)": 85,
    "A+":  80,  "A1":  80,  "A (high)": 80,
    "A":   75,  "A2":  75,
    "A-":  70,  "A3":  70,  "A (low)": 70,
    "BBB+":65,  "Baa1":65,  "Baa": 65,  "BBB (high)": 65,
    "BBB": 60,  "Baa2":60,
    "BBB-":55,  "Baa3":55,  "BBB (low)": 55,
    "BB+": 50,  "Ba1": 50,  "BB (high)": 50,
    "BB":  45,  "Ba2": 45,
    "BB-": 40,  "Ba3": 40,  "BB (low)": 40,
    "B+":  35,  "B1":  35,  "B (high)": 35,
    "B":   30,  "B2":  30,
    "B-":  25,  "B3":  25,  "B4": 25,  "B (low)": 25,
    "CCC+":20,  "Caa1":20,  "CCC (high)": 20,
    "CCC": 15,  "Caa2":15,
    "CCC-":10,  "Caa3":10,  "CCC (low)": 10,
    "CC":  5,   "Ca":  5,   "Ca-": 5,
    "C":   2,
    "D":   0,   "SD":  0,   "RD": 0,  "WR": 0,  "WD": 0,
}

# Each entry: (grade_group, description, sp, moodys, fitch)
RATING_HIERARCHY = [
    ("Investment Grade", "Prime",              "AAA",  "Aaa",  "AAA"),
    ("Investment Grade", "High Medium Grade",  "AA+",  "Aa1",  "AA+"),
    ("Investment Grade", "High Medium Grade",  "AA",   "Aa2",  "AA"),
    ("Investment Grade", "High Medium Grade",  "AA-",  "Aa3",  "AA-"),
    ("Investment Grade", "Upper Medium Grade", "A+",   "A1",   "A+"),
    ("Investment Grade", "Upper Medium Grade", "A",    "A2",   "A"),
    ("Investment Grade", "Upper Medium Grade", "A-",   "A3",   "A-"),
    ("Investment Grade", "Lower Medium Grade", "BBB+", "Baa1", "BBB+"),
    ("Investment Grade", "Lower Medium Grade", "BBB",  "Baa2", "BBB"),
    ("Investment Grade", "Lower Medium Grade", "BBB-", "Baa3", "BBB-"),
    ("Speculative Grade","Speculative",         "BB+",  "Ba1",  "BB+"),
    ("Speculative Grade","Speculative",         "BB",   "Ba2",  "BB"),
    ("Speculative Grade","Speculative",         "BB-",  "Ba3",  "BB-"),
    ("Speculative Grade","Highly Speculative",  "B+",   "B1",   "B+"),
    ("Speculative Grade","Highly Speculative",  "B",    "B2",   "B"),
    ("Speculative Grade","Highly Speculative",  "B-",   "B3",   "B-"),
    ("Speculative Grade","Substantial Risk",    "CCC+", "Caa1", "CCC+"),
    ("Speculative Grade","Substantial Risk",    "CCC",  "Caa2", "CCC"),
    ("Speculative Grade","Substantial Risk",    "CCC-", "Caa3", "CCC-"),
    ("Speculative Grade","Extremely Speculative","CC",  "Ca",   "CC"),
    ("Speculative Grade","Extremely Speculative","C",   "C",    "C"),
    ("Speculative Grade","In Default",           "RD",  "/",    "RD"),
    ("Speculative Grade","In Default",           "SD",  "/",    "SD"),
    ("Speculative Grade","In Default",           "D•NR","D•NR", "D•NR"),
]

CDS_NAME_OVERRIDES: dict = {
    "us":            "United States",
    "uk":            "United Kingdom",
    "south-korea":   "South Korea",
    "south_korea":   "South Korea",
    "saudi-arabia":  "Saudi Arabia",
    "saudi_arabia":  "Saudi Arabia",
    "czech-republic":"Czechia",
    "ivory-coast":   "Ivory Coast",
    "ivory_coast":   "Ivory Coast",
    "new-zealand":   "New Zealand",
    "new_zealand":   "New Zealand",
    "hong-kong":     "Hong Kong",
    "hong_kong":     "Hong Kong",
    "south-africa":  "South Africa",
    "south_africa":  "South Africa",
    "costa-rica":    "Costa Rica",
    "costa_rica":    "Costa Rica",
    "el-salvador":   "El Salvador",
    "el_salvador":   "El Salvador",
    "sri-lanka":     "Sri Lanka",
    "sri_lanka":     "Sri Lanka",
    "dominican-republic": "Dominican Republic",
    "dominican_republic": "Dominican Republic",
    "papua-new-guinea":   "Papua New Guinea",
    "papua_new_guinea":   "Papua New Guinea",
}

AGENCY_NAME_OVERRIDES: dict = {
    "Usa": "United States",
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def get_outlook_adj(outlook: str) -> float:
    """
    Outlook/watch adjustments applied on top of the base rating score.
    Ref: Alsakka & ap Gwilym 2012, BIS WP 704.
      Positive watch  : +2.50 pts  (strong, time-bound signal)
      Negative watch  : -2.50 pts
      Positive outlook: +1.25 pts  (half of negative — lower follow-through)
      Negative outlook: -2.50 pts
      Stable/other    :  0.00 pts
    """
    if pd.isna(outlook):
        return 0.0
    o = str(outlook).strip().lower()
    if any(x in o for x in [
        "watch positive", "positive watch", "review positive",
        "review for upgrade", "creditwatch positive",
    ]):
        return +2.5
    if any(x in o for x in [
        "watch negative", "negative watch", "review negative",
        "review for downgrade", "creditwatch negative",
        "negative watch, possible downgrade",
    ]):
        return -2.5
    if any(x in o for x in [
        "watch developing", "review developing", "creditwatch developing",
    ]):
        return 0.0
    if "positive" in o:
        return +1.25
    if "negative" in o:
        return -2.5
    return 0.0


def country_from_agency_path(path: str) -> str:
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r"[_\-]ratings?$", "", stem, flags=re.IGNORECASE)
    name = stem.replace("_", " ").title()
    return AGENCY_NAME_OVERRIDES.get(name, name)
 
 
def country_from_cds_path(path: str) -> str:
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r"^mm[_\-]", "", stem, flags=re.IGNORECASE)
    stem = re.sub(r"[_\-]5\s*year[_\-]cds.*$", "", stem, flags=re.IGNORECASE)
    raw = stem.strip().lower()

    if raw in CDS_NAME_OVERRIDES:
        return CDS_NAME_OVERRIDES[raw]

    return stem.replace("_", " ").replace("-", " ").strip().title()


def safe(v):
    """Convert numpy/nan values to JSON-safe Python types."""
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.floating, np.integer)):
        return round(float(v), 4)
    return v


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — AGENCY DATA LOADING & SCI PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def load_agency_file(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    df = df[["Agency", "Rating", "Outlook", "Date"]].copy()
    for col in ["Agency", "Rating", "Outlook"]:
        df[col] = df[col].astype(str).str.strip()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])
    df["BaseScore"]  = df["Rating"].map(RATING_SCORE)
    df["OutlookAdj"] = df["Outlook"].apply(get_outlook_adj)
    df["AdjScore"]   = (df["BaseScore"] + df["OutlookAdj"]).clip(0, 100)
    unrecognised = df[df["BaseScore"].isna()]["Rating"].unique()
    if len(unrecognised):
        print(f"    [WARN] unrecognised ratings {unrecognised} — rows dropped")
    return df.dropna(subset=["BaseScore"])


def build_monthly_series(df: pd.DataFrame) -> tuple:
    """
    Forward-fill daily → resample to month-end.
    Returns (df_base_m, df_adj_m) — one column per agency.
    """
    df_clean = (
        df.sort_values("Date")
          .drop_duplicates(subset=["Agency", "Date"], keep="last")
    )
    df_base_pivot = df_clean.pivot(index="Date", columns="Agency", values="BaseScore")
    df_adj_pivot  = df_clean.pivot(index="Date", columns="Agency", values="AdjScore")

    full = pd.date_range(df_base_pivot.index.min(), pd.Timestamp.today(), freq="D")
    df_base_m = (
        df_base_pivot.reindex(full).ffill()
                     .reindex(columns=AGENCIES)
                     .resample("ME").last()
    )
    df_adj_m = (
        df_adj_pivot.reindex(full).ffill()
                    .reindex(columns=AGENCIES)
                    .resample("ME").last()
    )
    return df_base_m, df_adj_m


def compute_inverse_mad_weights(df_monthly: pd.DataFrame) -> dict:
    """
    Inverse-MAD weights: agencies that persistently diverge from the
    leave-one-out median are down-weighted. Fully data-driven.
    """
    subset = df_monthly[AGENCIES].copy()
    subset = subset[subset.notna().sum(axis=1) >= 2]
    mad_scores = {}
    for agency in AGENCIES:
        col = subset[agency].dropna()
        if col.empty:
            mad_scores[agency] = np.nan
            continue
        others = subset.loc[col.index, [a for a in AGENCIES if a != agency]]
        mad_scores[agency] = (col - others.median(axis=1)).abs().mean()
    inv = {
        a: (1.0 / v if not (np.isnan(v) or v == 0) else 1.0)
        for a, v in mad_scores.items()
    }
    total = sum(inv.values())
    return {a: w / total for a, w in inv.items()}


def weighted_mean_row(row: pd.Series, weights: dict) -> float:
    avail = {a: row[a] for a in AGENCIES if a in row.index and not np.isnan(row[a])}
    if not avail:
        return np.nan
    total_w = sum(weights[a] for a in avail)
    return sum(weights[a] * v for a, v in avail.items()) / total_w


def build_sci_index(df_base_m: pd.DataFrame, df_adj_m: pd.DataFrame,
                    weights: dict) -> pd.DataFrame:
    base_cols = df_base_m[AGENCIES]
    return pd.DataFrame(
        {
            **{a: df_base_m[a] for a in AGENCIES},
            "Simple Mean":        base_cols.mean(axis=1),
            "Weighted Mean":      base_cols.apply(weighted_mean_row, axis=1, weights=weights),
            "Weighted + Outlook": df_adj_m[AGENCIES].apply(weighted_mean_row, axis=1, weights=weights),
            "N_Agencies":         base_cols.notna().sum(axis=1),
        },
        index=df_base_m.index,
    )


def build_sci_weekly_series(df_index: pd.DataFrame) -> pd.Series:
    """Upsample monthly SCI composite to weekly via forward-fill (step function)."""
    composite = df_index["Weighted + Outlook"].dropna()
    daily = composite.reindex(
        pd.date_range(composite.index.min(), pd.Timestamp.today(), freq="D")
    ).ffill()
    return daily.resample("W-SUN").last()


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — CDS LOADING & PANEL FE REGRESSION
# ══════════════════════════════════════════════════════════════════════════════

def load_cds_weekly(path: str) -> pd.Series:
    df = pd.read_excel(path)
    df.columns = df.columns.str.strip()
    date_col = next(c for c in df.columns if c.lower() == "date")
    val_col  = next(c for c in df.columns if c.lower() in ("value", "cds"))
    df["_d"] = pd.to_datetime(df[date_col], format="mixed", errors="coerce")
    df = df.dropna(subset=["_d"]).set_index("_d")[[val_col]]
    df.columns = ["CDS"]
    return df[df["CDS"] > 0]["CDS"].resample("W-SUN").last().ffill(limit=2)


def fit_panel_fe(df: pd.DataFrame) -> dict:
    """
    Within-group (demeaned) OLS — equivalent to LSDV fixed effects.

    Observations are weighted by each country's within-sample SCI standard
    deviation, so β is identified primarily from countries that experienced
    genuine rating cycles (Portugal, Spain, Italy, Ireland, Turkey, Brazil,
    Egypt) rather than stable AAA names where SCI barely moves (Germany,
    Netherlands) and which would otherwise dilute the slope estimate toward zero.

    Model:  SCI_it = α_i + β × log(CDS_it-1) + ε_it
              SCI      — Weighted + Outlook composite (from sci_panel)
              log_CDS  — already one-week lagged before this function is called
              α_i      — country fixed effect (structural credit level)
              β        — shared slope, how much a CDS doubling moves implied SCI

    Returns
    -------
    dict with keys:
        slope        float  — β estimate
        intercepts   dict   — {country: α_i}
        r2_within    float  — R² on demeaned data
        r2_overall   float  — R² on raw data
        df_result    DataFrame — input df + MarketImplied + Divergence columns
    """
    df = df.copy().dropna(subset=["SCI", "log_CDS", "Country"])

    # ── Within-group demeaning ─────────────────────────────────────────────────
    means      = df.groupby("Country")[["SCI", "log_CDS"]].transform("mean")
    df["ydm"]  = df["SCI"]     - means["SCI"]
    df["xdm"]  = df["log_CDS"] - means["log_CDS"]

    # ── Observation weights: within-country SCI standard deviation ─────────────
    # Countries with near-flat SCI (Germany: 0.8 pt range, Netherlands: 3.1 pt)
    # contribute thousands of observations but near-zero variation in the
    # dependent variable — they cannot inform β but do bias it toward zero.
    # Weighting by SCI std dev gives proportionally more influence to countries
    # that actually went through rating cycles, which is where the CDS-to-rating
    # relationship is empirically identified.
    # Weights are normalised to mean = 1 so fit statistics remain interpretable.
    sci_std      = df.groupby("Country")["SCI"].std().rename("sci_std")
    df           = df.join(sci_std, on="Country")
    df["weight"] = df["sci_std"] / df["sci_std"].mean()

    # ── Weighted OLS on demeaned data ──────────────────────────────────────────
    w     = df["weight"].values
    ydm   = df["ydm"].values
    xdm   = df["xdm"].values
    slope = np.sum(w * xdm * ydm) / np.sum(w * xdm ** 2)

    # ── Country intercepts: alpha_i = y_bar_i - beta * x_bar_i ────────────────
    cmeans     = df.groupby("Country")[["SCI", "log_CDS"]].mean()
    intercepts = (cmeans["SCI"] - slope * cmeans["log_CDS"]).to_dict()

    # ── Fitted values & divergence ─────────────────────────────────────────────
    df["MarketImplied"] = (
        slope * df["log_CDS"] + df["Country"].map(intercepts)
    ).clip(0, 100)
    df["Divergence"] = df["SCI"] - df["MarketImplied"]

    # ── Fit statistics ─────────────────────────────────────────────────────────
    resid_dm   = ydm - slope * xdm
    r2_within  = 1 - np.sum(w * resid_dm ** 2) / np.sum(w * ydm ** 2)

    resid_all  = df["SCI"].values - df["MarketImplied"].values
    r2_overall = 1 - (resid_all ** 2).sum() / (
        (df["SCI"].values - df["SCI"].mean()) ** 2
    ).sum()

    return dict(
        slope      = slope,
        intercepts = intercepts,
        r2_within  = r2_within,
        r2_overall = r2_overall,
        df_result  = df.drop(columns=["ydm", "xdm", "sci_std", "weight"]),
    )


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — UTILITIES & MAIN
# ══════════════════════════════════════════════════════════════════════════════

def _write_json(filename: str, obj) -> None:
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, allow_nan=False, separators=(",", ":"))


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # ── 5a. Build SCI for every country ───────────────────────────────────────
    print("=" * 60)
    print("SECTION 2 — Building SCI for all countries")
    print("=" * 60)

    sci_data:  dict = {}   # country → monthly df_index
    sci_panel: dict = {}   # country → weekly composite pd.Series
    raw_data:  dict = {}   # country → raw df from load_agency_file (for ratings.json)

    agency_files = sorted(glob.glob(os.path.join(AGENCIES_DIR, "*.csv")))
    if not agency_files:
        raise FileNotFoundError(f"No CSV files found in '{os.path.abspath(AGENCIES_DIR)}'")

    for fpath in agency_files:
        country = country_from_agency_path(fpath)
        print(f"\n  {country}")
        try:
            df_raw               = load_agency_file(fpath)
            raw_data[country]    = df_raw
            df_base_m, df_adj_m  = build_monthly_series(df_raw)
            weights              = compute_inverse_mad_weights(df_base_m)
            df_index             = build_sci_index(df_base_m, df_adj_m, weights)
            sci_data[country]    = df_index
            sci_panel[country]   = build_sci_weekly_series(df_index)
            print(
                f"    OK — SCI range "
                f"{sci_panel[country].min():.1f}–{sci_panel[country].max():.1f}"
            )
        except Exception:
            print(f"    FAILED")
            traceback.print_exc()

    print(f"\n✓  SCI built for {len(sci_panel)} countries")

    # ── 5b. Load CDS, build panel, fit FE regression ──────────────────────────
    print("\n" + "=" * 60)
    print("SECTION 3 — Loading CDS & fitting panel FE regression")
    print("=" * 60)

    cds_panel: dict = {}
    for fpath in sorted(glob.glob(os.path.join(CDS_DIR, "*.xlsx"))):
        stem = os.path.basename(fpath).lower()
        if any(d in stem for d in DISCONTINUED_CDS):
            print(f"  [discontinued] {os.path.basename(fpath)}")
            continue
        country = country_from_cds_path(fpath)
        try:
            s = load_cds_weekly(fpath)
            cds_panel[country] = s
            print(
                f"  ✓ {country:24s}  {len(s)} weeks  "
                f"{s.min():.1f}–{s.max():.1f} bps"
            )
        except Exception as e:
            print(f"  FAILED {country}: {e}")

    common   = sorted(set(sci_panel) & set(cds_panel))
    only_sci = sorted(set(sci_panel) - set(cds_panel))
    only_cds = sorted(set(cds_panel) - set(sci_panel))

    print(f"\n  Matched : {common}")
    if only_sci:
        print(f"  SCI only (no CDS, excluded from regression): {only_sci}")
    if only_cds:
        print(f"  CDS only (check agency filename): {only_cds}")

    PANEL_START = "2013-02-01"

    # Build merged panel with one-week lag on log(CDS)
    records = []
    for country in common:
        merged = pd.concat(
            [sci_panel[country].rename("SCI"), cds_panel[country].rename("CDS")],
            axis=1,
        ).dropna()
        if merged.empty:
            print(f"  [WARN] {country}: no overlapping dates — skipped")
            continue
        merged = merged[merged.index >= PANEL_START]   # ← the fix
        if merged.empty:
            print(f"  [WARN] {country}: no data after PANEL_START — skipped")
            continue
        merged["Country"] = country
        merged["log_CDS"] = np.log(merged["CDS"]).shift(1)
        merged = merged.dropna()
        records.append(merged)

    fe = None
    df_result = pd.DataFrame()

    if records:
        df_panel = pd.concat(records).reset_index().rename(columns={"index": "Date"})
        if "Date" not in df_panel.columns:
            df_panel = df_panel.rename_axis("Date").reset_index()

        print(
            f"\n  Panel: {len(df_panel):,} obs | "
            f"{df_panel['Country'].nunique()} countries | "
            f"{df_panel['Date'].min().date()} → {df_panel['Date'].max().date()}"
        )

        fe = fit_panel_fe(df_panel)
        df_result = fe["df_result"].copy()

        print(f"\n  β (slope)     : {fe['slope']:.4f}")
        print(f"  R² within     : {fe['r2_within']:.4f}")
        print(f"  R² overall    : {fe['r2_overall']:.4f}")
        print("\n  Country fixed effects (α):")
        for c, a in sorted(fe["intercepts"].items(), key=lambda x: -x[1]):
            print(f"    {c:26s}  α = {a:7.3f}")
    else:
        print("\n  [WARN] No CDS data matched — skipping regression entirely.")

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 6 — JSON EXPORT
    # ══════════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("SECTION 4 — Exporting JSON")
    print("=" * 60)

    # ── 6a. sci.json ──────────────────────────────────────────────────────────
    # Monthly SCI time series per country.
    # Shape: { "Germany": { "dates": [...], "sci": [...],
    #                       "sp": [...], "moodys": [...], "fitch": [...] }, ... }
    # Agency columns included so the country chart can overlay individual lines.
    sci_export = {}
    for country, df in sci_data.items():
        composite = df["Weighted + Outlook"].dropna()
        sci_export[country] = {
            "dates":  [d.strftime("%Y-%m-%d") for d in composite.index],
            "sci":    [safe(v) for v in composite.values],
            # Individual agency base scores (no outlook adj) — for the agency lines overlay
            "sp":     [safe(v) for v in df["S&P"].reindex(composite.index).values],
            "moodys": [safe(v) for v in df["Moody's"].reindex(composite.index).values],
            "fitch":  [safe(v) for v in df["Fitch"].reindex(composite.index).values],
        }

    _write_json("sci.json", sci_export)
    print(f"  ✓ sci.json          — {len(sci_export)} countries")

    # ── 6b. market.json ───────────────────────────────────────────────────────
    # Weekly market-implied SCI + divergence, only for matched countries.
    # Shape: { "Germany": { "dates": [...], "sci": [...],
    #                       "market_implied": [...], "divergence": [...],
    #                       "cds": [...] }, ... }
    market_export = {}
    if not df_result.empty:
        for country in common:
            df_c = (
                df_result[df_result["Country"] == country]
                .set_index("Date")
                [["SCI", "CDS", "MarketImplied", "Divergence"]]
                .sort_index()
            )
            if df_c.empty:
                continue
            market_export[country] = {
                "dates":          [d.strftime("%Y-%m-%d") for d in df_c.index],
                "sci":            [safe(v) for v in df_c["SCI"].values],
                "market_implied": [safe(v) for v in df_c["MarketImplied"].values],
                "divergence":     [safe(v) for v in df_c["Divergence"].values],
                "cds":            [safe(v) for v in df_c["CDS"].values],
            }

    _write_json("market.json", market_export)
    print(f"  ✓ market.json       — {len(market_export)} countries")

    # ── 6c. snapshot.json ─────────────────────────────────────────────────────
    # Latest single value per country for the map and the summary table.
    # Shape: [ { "country": "Germany", "sci": 92.1,
    #            "market_implied": 89.3, "spread": 2.8,
    #            "sci_date": "2025-03-31",
    #            "market_date": "2025-03-30" }, ... ]
    #
    # market_implied and spread are null for SCI-only countries.
    snapshot = []
    all_countries = sorted(sci_data.keys())

    # Build a lookup for latest market-implied values
    mi_latest = {}
    if not df_result.empty:
        last_rows = df_result.sort_values("Date").groupby("Country").last()
        for c, row in last_rows.iterrows():
            mi_latest[c] = {
                "market_implied": safe(row["MarketImplied"]),
                "spread":         safe(row["Divergence"]),
                "market_date":    row.name.strftime("%Y-%m-%d")
                    if hasattr(row.name, "strftime") else None,
            }

    for country in all_countries:
        composite = sci_data[country]["Weighted + Outlook"].dropna()
        if composite.empty:
            continue
        latest_date = composite.index[-1]
        latest_sci  = safe(composite.iloc[-1])

        mi = mi_latest.get(country, {})
        snapshot.append({
            "country":        country,
            "sci":            latest_sci,
            "sci_date":       latest_date.strftime("%Y-%m-%d"),
            "market_implied": mi.get("market_implied"),
            "spread":         mi.get("spread"),
            "market_date":    mi.get("market_date"),
        })

    snapshot.sort(key=lambda x: (x["sci"] is None, -(x["sci"] or 0)))

    _write_json("snapshot.json", snapshot)
    print(f"  ✓ snapshot.json     — {len(snapshot)} countries")

    # ── 6d. ratings.json ──────────────────────────────────────────────────────
    # Raw agency ratings per country for the hierarchy highlight table.
    # Shape: {
    #   "Germany": {
    #     "latest": { "S&P": {"rating": "AAA", "outlook": "Stable"},
    #                 "Moody's": {...}, "Fitch": {...} },
    #     "history": [ {"agency": "S&P", "rating": "AAA",
    #                   "outlook": "Stable", "date": "2024-01-01"}, ... ]
    #   }, ...
    # }
    ratings_export = {}
    for country, df_raw in raw_data.items():
        # Latest rating per agency
        latest_by_agency = {}
        for agency in AGENCIES:
            ag_df = df_raw[df_raw["Agency"] == agency].sort_values("Date")
            if ag_df.empty:
                latest_by_agency[agency] = None
            else:
                row = ag_df.iloc[-1]
                latest_by_agency[agency] = {
                    "rating":  row["Rating"],
                    "outlook": row["Outlook"],
                    "date":    row["Date"].strftime("%Y-%m-%d"),
                }

        history = (
            df_raw[["Agency", "Rating", "Outlook", "Date"]]
            .sort_values("Date", ascending=False)
            .assign(Date=lambda d: d["Date"].dt.strftime("%Y-%m-%d"))
            .to_dict(orient="records")
        )

        ratings_export[country] = {
            "latest":  latest_by_agency,
            "history": history,
        }

    _write_json("ratings.json", ratings_export)
    print(f"  ✓ ratings.json      — {len(ratings_export)} countries")

    # ── 6e. hierarchy.json ────────────────────────────────────────────────────
    # Static rating hierarchy table structure (same for every page load,
    # no country-specific data — the frontend merges this with ratings.json).
    # Shape: [ { "grade_group": "Investment Grade",
    #            "description": "Prime",
    #            "sp": "AAA", "moodys": "Aaa", "fitch": "AAA" }, ... ]
    hierarchy = [
        {
            "grade_group": row[0],
            "description": row[1],
            "sp":          row[2],
            "moodys":      row[3],
            "fitch":       row[4],
        }
        for row in RATING_HIERARCHY
    ]
    _write_json("hierarchy.json", hierarchy)
    print(f"  ✓ hierarchy.json    — {len(hierarchy)} rows")

    # ── 6f. meta.json ─────────────────────────────────────────────────────────
    meta = {
        "last_updated": pd.Timestamp.today().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "n_countries_sci":    len(sci_export),
        "n_countries_market": len(market_export),
        "regression": {
            "slope":      safe(fe["slope"])      if fe else None,
            "r2_within":  safe(fe["r2_within"])  if fe else None,
            "r2_overall": safe(fe["r2_overall"]) if fe else None,
            "intercepts": {
                c: safe(v) for c, v in fe["intercepts"].items()
            } if fe else {},
        },
    }
    _write_json("meta.json", meta)
    print(f"  ✓ meta.json")

    print(f"\n✓  All JSON files written to {DATA_DIR}/")
    print("   sci.json | market.json | snapshot.json |"
          " ratings.json | hierarchy.json | meta.json")


if __name__ == "__main__":
    main()

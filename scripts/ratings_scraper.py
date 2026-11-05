"""
Sovereign Credit Rating Updater
===============================

theglobaleconomy.com removed its credit-rating pages (HTTP 410), so this script
no longer rebuilds each country's history from one site. Instead it treats the
CSVs in agencies/ as the system of record and APPENDS new rating actions found
in two free, automatically fetchable sources:

  1. fxempire.com  — per-country page; the server-rendered __NEXT_DATA__ JSON
                     holds the current rating/outlook per agency with the date
                     of the last change, plus the 20 most recent changes.
  2. Wikipedia     — "List of countries by credit rating", via the MediaWiki
                     API. One table per agency with rating, outlook, date.
                     Its Fitch table is the most current free Fitch source.

Merge rule, per (country, agency):
  * collect every dated action from both sources
  * keep those strictly newer than the last row already in the CSV
  * append them in date order, skipping any that do not change
    (rating, outlook) relative to the row before
  * never edit or delete existing history

Safety checks: unknown rating codes and future dates are rejected; if the
sources disagree on an agency's latest rating, it is logged; if neither
source returns anything at all, the script exits non-zero so CI fails
loudly instead of silently freezing the index.

Usage:
  python scripts/ratings_scraper.py            # update agencies/*.csv
  python scripts/ratings_scraper.py --dry-run  # only report what would change
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

OUT_DIR = Path(__file__).resolve().parent.parent / "agencies"
AGENCIES = ("S&P", "Moody's", "Fitch")
REQUEST_DELAY = 1.5  # seconds between fxempire requests (plus jitter)

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
WIKI_UA = "mm-sci-dashboard/1.0 (sovereign credit index; python-requests)"

# Ratings compute_index.py knows how to score (kept in sync with RATING_SCORE).
VALID_RATINGS = {
    "AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-",
    "BB+", "BB", "BB-", "B+", "B", "B-", "CCC+", "CCC", "CCC-", "CC", "C",
    "D", "SD", "RD", "WD", "WR",
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3", "Baa1", "Baa2", "Baa3",
    "Ba1", "Ba2", "Ba3", "B1", "B2", "B3", "Caa1", "Caa2", "Caa3", "Ca",
}

COUNTRIES = [
    "Israel", "Chile", "Croatia", "Poland", "Cyprus", "Latvia", "Andorra",
    "Malta", "Malaysia", "China", "Japan", "Lithuania", "Portugal", "Spain",
    "Slovakia", "Iceland", "France", "Saudi Arabia", "Slovenia", "Belgium",
    "Qatar", "South Korea", "United Arab Emirates", "Estonia", "Taiwan",
    "Kuwait", "Czechia", "United Kingdom", "Austria", "Finland", "Ireland",
    "Hong Kong", "USA", "New Zealand", "Canada", "Australia", "Denmark",
    "Germany", "Luxembourg", "Netherlands", "Norway", "Singapore", "Sweden",
    "Switzerland", "Bahrain", "Egypt", "Kenya", "Mali", "Turkey", "Gabon",
    "Nicaragua", "Nigeria", "Uganda", "Cameroon", "Angola", "Ghana", "Iraq",
    "Pakistan", "Papua New Guinea", "Ecuador", "Kyrgyzstan", "Barbados",
    "Rwanda", "Brazil", "Georgia", "Ivory Coast", "Costa Rica", "Uzbekistan",
    "Colombia", "Dominican Republic", "South Africa", "Jamaica", "Vietnam",
    "Honduras", "Benin", "Mongolia", "Bangladesh", "Bahamas", "Armenia",
    "Jordan", "Guatemala", "Azerbaijan", "Oman", "Indonesia", "Greece",
    "Mexico", "India", "Bulgaria", "Morocco", "Paraguay", "Serbia",
    "Kazakhstan", "Peru", "Hungary", "Romania", "Uruguay", "Philippines",
    "Thailand", "Italy", "Russia", "Belarus", "Ethiopia", "Venezuela",
    "Zambia", "Suriname", "Ukraine", "Mozambique", "Bolivia", "Argentina",
    "Sri Lanka", "Laos", "Republic of the Congo", "El Salvador", "Tunisia",
    "Panama", "Lebanon",
]

# fxempire URL slugs that differ from "lowercase, spaces → hyphens"
FX_SLUG_OVERRIDES = {
    "USA":                   "united-states",
    "Czechia":               "czech-republic",
    "Republic of the Congo": "congo",            # ISO3 COG, not the DRC
    "Ivory Coast":           "cote-d-ivoire",
    "Russia":                "russian-federation",
}

# Which agencies to trust from Wikipedia. Its Moody's table is years stale and
# has had errors (e.g. Budapest's Dec-2025 Moody's downgrade listed as Hungary's
# sovereign), so Moody's comes from fxempire only.
WIKI_AGENCIES = ("S&P", "Fitch")

# Withdrawn ratings are not appended: compute_index scores WD/WR as 0 (default),
# which would wrongly crater e.g. Iceland after it dropped Fitch in 2026.
WITHDRAWN = {"WD", "WR"}

# Wikipedia row names that differ from our country names
WIKI_NAME_ALIASES = {
    "USA":                   ["United States"],
    "Czechia":               ["Czech Republic"],
    "Ivory Coast":           ["Côte d'Ivoire", "Cote d'Ivoire"],
    "Republic of the Congo": ["Congo", "Republic of Congo"],
    "Turkey":                ["Türkiye"],
}

WIKI_SECTION_AGENCY = {
    "standard & poor's": "S&P",
    "s&p global ratings": "S&P",
    "fitch": "Fitch",
    "fitch ratings": "Fitch",
    "moody's": "Moody's",
    "moody's ratings": "Moody's",
}


# ── Normalisation ──────────────────────────────────────────────────────────────

def csv_path(country: str) -> Path:
    return OUT_DIR / f"{country.lower().replace(' ', '_')}_ratings.csv"


def norm_rating(raw: str) -> str | None:
    if raw is None:
        return None
    r = re.sub(r"\[.*?\]", "", str(raw))          # wiki footnotes
    r = r.replace("−", "-").replace("–", "-").strip()
    r = re.sub(r"\s*\(.*?\)\s*$", "", r)           # e.g. "(sf)", "(P)"
    r = r.replace(" ", "")
    return r if r in VALID_RATINGS else None


def norm_outlook(raw: str | None) -> str:
    """Map source wording onto the vocabulary already used in agencies/*.csv."""
    o = re.sub(r"\[.*?\]", "", str(raw or "")).strip().lower()
    if o in ("", "—", "-", "–", "n/a", "na", "nr", "none", "nm") or "withdrawn" in o:
        return "NR"
    if "watch" in o or "review" in o:
        if "pos" in o or "upgrade" in o:
            return "Positive watch"
        if "neg" in o or "downgrade" in o:
            return "Negative watch"
        if "dev" in o:
            return "Developing watch"
        return "Under Review"
    for word in ("stable", "positive", "negative", "developing"):
        if word in o:
            return word.capitalize()
    return "NR"


def parse_day(raw: str) -> pd.Timestamp | None:
    raw = re.sub(r"\[.*?\]", "", str(raw or "")).strip()
    for fmt in ("%b %d, %Y", "%d %B %Y", "%B %d, %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return pd.Timestamp(datetime.strptime(raw, fmt))
        except ValueError:
            continue
    return None


def make_action(country, agency, rating, outlook, date, source):
    r = norm_rating(rating)
    d = parse_day(date) if not isinstance(date, pd.Timestamp) else date
    if r is None or d is None:
        return None
    if d > pd.Timestamp(datetime.now(timezone.utc).date()):
        log.warning("  future date rejected: %s %s %s %s", country, agency, r, d.date())
        return None
    return {
        "Country": country, "Agency": agency, "Rating": r,
        "Outlook": norm_outlook(outlook), "Date": d.normalize(), "Source": source,
    }


# ── Source 1: fxempire ─────────────────────────────────────────────────────────

def fx_slug(country: str) -> str:
    return FX_SLUG_OVERRIDES.get(country, country.lower().replace(" ", "-"))


def fetch_fxempire(country: str, session: requests.Session) -> list[dict]:
    url = f"https://www.fxempire.com/credit-ratings/{fx_slug(country)}"
    try:
        resp = session.get(url, headers={"User-Agent": BROWSER_UA}, timeout=30)
    except requests.RequestException as exc:
        log.warning("  fxempire request failed for %s: %s", country, exc)
        return []
    if resp.status_code != 200:
        log.warning("  fxempire HTTP %s for %s (%s)", resp.status_code, country, url)
        return []

    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.S)
    if not m:
        log.warning("  fxempire: no __NEXT_DATA__ for %s", country)
        return []
    props = json.loads(m.group(1)).get("props", {}).get("pageProps", {})

    actions = []
    # Current rating per agency, dated with the last change
    current = (props.get("countryCreditRating") or {}).get("ratings") or {}
    for agency in AGENCIES:
        cur = current.get(agency) or {}
        a = make_action(country, agency, cur.get("rating"), cur.get("outlook"),
                        cur.get("timestamp"), "fxempire")
        if a:
            actions.append(a)
    # Recent change history (up to 20 rows across all agencies)
    for q in (props.get("dehydratedState") or {}).get("queries", []):
        key = q.get("queryKey") or []
        if not key or key[0] != "creditRatingHistory":
            continue
        for row in q.get("state", {}).get("data") or []:
            if row.get("agency") not in AGENCIES:
                continue
            a = make_action(country, row["agency"], row.get("rating"),
                            row.get("outlook"), row.get("timestamp"), "fxempire")
            if a:
                actions.append(a)
    return actions


# ── Source 2: Wikipedia ────────────────────────────────────────────────────────

def fetch_wikipedia(session: requests.Session) -> dict[tuple[str, str], dict]:
    """Return {(wiki_country_name, agency): raw row} for S&P, Moody's, Fitch."""
    try:
        resp = session.get(
            "https://en.wikipedia.org/w/api.php",
            params={"action": "parse", "page": "List_of_countries_by_credit_rating",
                    "prop": "text|revid", "format": "json", "formatversion": "2"},
            headers={"User-Agent": WIKI_UA}, timeout=60,
        )
        resp.raise_for_status()
        parsed = resp.json()["parse"]
    except Exception as exc:  # noqa: BLE001
        log.warning("Wikipedia fetch failed: %s", exc)
        return {}

    soup = BeautifulSoup(parsed["text"], "html.parser")
    out = {}
    for table in soup.find_all("table", class_="wikitable"):
        heading = table.find_previous(["h2", "h3"])
        agency = WIKI_SECTION_AGENCY.get(
            heading.get_text(strip=True).lower() if heading else "")
        if agency is None:
            continue
        headers = [c.get_text(" ", strip=True).lower()
                   for c in table.find("tr").find_all(["th", "td"])]
        try:
            i_rating = headers.index("rating")
            i_outlook = headers.index("outlook")
            i_date = headers.index("date")
        except ValueError:
            log.warning("Wikipedia %s table has unexpected columns: %s", agency, headers)
            continue
        for tr in table.find_all("tr")[1:]:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) <= max(i_rating, i_outlook, i_date):
                continue
            name = re.sub(r"\[.*?\]", "", cells[0]).strip()
            out[(name, agency)] = {"rating": cells[i_rating],
                                   "outlook": cells[i_outlook],
                                   "date": cells[i_date]}
    log.info("Wikipedia revision %s: %d agency rows", parsed.get("revid"), len(out))
    return out


def wiki_actions(country: str, wiki: dict) -> list[dict]:
    names = [country] + WIKI_NAME_ALIASES.get(country, [])
    actions = []
    for agency in WIKI_AGENCIES:
        row = next((wiki[(n, agency)] for n in names if (n, agency) in wiki), None)
        if row:
            a = make_action(country, agency, row["rating"], row["outlook"],
                            row["date"], "wikipedia")
            if a:
                actions.append(a)
    return actions


# ── Merge ──────────────────────────────────────────────────────────────────────

# Last successful theglobaleconomy scrape. Legacy rows are dated to the month
# (YYYY-MM-01), and that scrape saw everything up to this day.
LEGACY_SCRAPED_THROUGH = pd.Timestamp("2026-10-12")


def is_new(a: dict, last_date: pd.Timestamp, last_rating: str | None) -> bool:
    """
    Is source action `a` newer than the last row in the CSV?

    A legacy month-precision row (day == 1) stands for "some day in that
    month", so an exact-dated action inside the same month is ambiguous:
      * on or before LEGACY_SCRAPED_THROUGH the old scraper already saw it
        (often with a different outlook label) → not new
      * after it, it is new only if the *rating* differs (e.g. Laos S&P,
        legacy CCC+ in Oct-2026, upgraded to B- on 29 Oct 2026)
    """
    if a["Date"] <= last_date:
        return False
    if last_date.day == 1:
        month_end = last_date + pd.offsets.MonthEnd(0)
        if a["Date"] <= month_end:
            return a["Date"] > LEGACY_SCRAPED_THROUGH and a["Rating"] != last_rating
    return True


def merge_country(country: str, existing: pd.DataFrame, actions: list[dict]):
    """Return (rows_to_append, conflict_messages, skipped_withdrawals)."""
    to_append, conflicts, withdrawn = [], [], []
    for agency in AGENCIES:
        hist = existing[existing["Agency"] == agency].sort_values("Date")
        last_date = hist["Date"].iloc[-1] if len(hist) else pd.Timestamp.min
        prev = ((hist["Rating"].iloc[-1], hist["Outlook"].iloc[-1])
                if len(hist) else (None, None))

        cands = [a for a in actions if a["Agency"] == agency]
        for a in [a for a in cands if a["Rating"] in WITHDRAWN]:
            if is_new(a, last_date, prev[0]):
                withdrawn.append(f"{country} {agency} {a['Rating']} {a['Date']:%Y-%m-%d} ({a['Source']})")
        cands = [a for a in cands if a["Rating"] not in WITHDRAWN]
        if not cands:
            continue

        # Flag disagreement between sources, only where it affects what we append
        latest_by_src = {}
        for a in sorted(cands, key=lambda a: a["Date"]):
            latest_by_src[a["Source"]] = a
        if len(latest_by_src) > 1 and max(a["Date"] for a in latest_by_src.values()) > last_date:
            states = {(a["Rating"], a["Outlook"]) for a in latest_by_src.values()}
            if len(states) > 1:
                conflicts.append(
                    f"{country} {agency}: " + "; ".join(
                        f"{s}={a['Rating']}/{a['Outlook']} ({a['Date']:%Y-%m-%d})"
                        for s, a in latest_by_src.items()))

        # Unique new actions, oldest first; same day from two sources → one row
        new = {}
        for a in sorted(cands, key=lambda a: (a["Date"], a["Source"] != "fxempire")):
            if is_new(a, last_date, prev[0]):
                new.setdefault(a["Date"], a)
        for a in sorted(new.values(), key=lambda a: a["Date"]):
            state = (a["Rating"], a["Outlook"])
            if state == prev:
                continue
            to_append.append(a)
            prev = state
    return to_append, conflicts, withdrawn


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("--dry-run", action="store_true",
                        help="report changes without writing CSVs")
    args = parser.parse_args()

    session = requests.Session()
    wiki = fetch_wikipedia(session)

    total_new, all_conflicts, all_withdrawn, fx_failed, source_rows = 0, [], [], [], 0
    for i, country in enumerate(COUNTRIES, 1):
        path = csv_path(country)
        if path.exists():
            existing = pd.read_csv(path)
            existing["Date"] = pd.to_datetime(existing["Date"], errors="coerce")
            existing = existing.dropna(subset=["Date"])
        else:
            existing = pd.DataFrame(columns=["Country", "Agency", "Rating", "Outlook", "Date"])

        fx = fetch_fxempire(country, session)
        if not fx:
            fx_failed.append(country)
        actions = fx + wiki_actions(country, wiki)
        source_rows += len(actions)

        new_rows, conflicts, withdrawn = merge_country(country, existing, actions)
        all_conflicts += conflicts
        all_withdrawn += withdrawn

        if new_rows:
            total_new += len(new_rows)
            for a in new_rows:
                log.info("[%3d/%d] %-22s + %-7s %-5s %-16s %s  (%s)", i, len(COUNTRIES),
                         country, a["Agency"], a["Rating"], a["Outlook"],
                         a["Date"].date(), a["Source"])
            if not args.dry_run:
                add = pd.DataFrame(new_rows)[["Country", "Agency", "Rating", "Outlook", "Date"]]
                out = pd.concat([existing, add], ignore_index=True)
                out = out.sort_values(["Agency", "Date"], kind="stable")
                out["Date"] = out["Date"].dt.strftime("%Y-%m-%d")
                out.to_csv(path, index=False)

        if i < len(COUNTRIES):
            time.sleep(REQUEST_DELAY + random.uniform(0, 1.0))

    log.info("─" * 70)
    log.info("%s %d new rating action(s) across %d countries",
             "Would append" if args.dry_run else "Appended", total_new, len(COUNTRIES))
    if all_conflicts:
        log.warning("Sources disagree on the latest rating for %d agency/country pairs "
                    "(newest dated action wins):", len(all_conflicts))
        for c in all_conflicts:
            log.warning("  %s", c)
    if all_withdrawn:
        log.info("Withdrawals seen but not appended (last rating is kept): %s", all_withdrawn)
    if fx_failed:
        log.warning("fxempire returned nothing for %d countries: %s", len(fx_failed), fx_failed)

    if source_rows == 0:
        log.error("No data from any source — failing so the pipeline alerts.")
        return 1
    if not wiki and len(fx_failed) == len(COUNTRIES):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

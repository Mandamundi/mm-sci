"""
MM Sovereign Credit Rating Scraper
====================================
"""

import time
import re
import logging
import random
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
import pandas as pd

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Output directory ───────────────────────────────────────────────────────────
OUT_DIR = Path("agencies")
OUT_DIR.mkdir(exist_ok=True)

# ── Agency name normalisation ──────────────────────────────────────────────────
AGENCY_MAP = {
    "standard & poor's": "S&P",
    "s&p":               "S&P",
    "moody's":           "Moody's",
    "moodys":            "Moody's",
    "fitch":             "Fitch",
}
KEEP_AGENCIES = {"S&P", "Moody's", "Fitch"}

# ── Country → URL slug map ─────────────────────────────────────────────────────
SLUG_OVERRIDES = {
    "Czechia":               "Czech-Republic",
    "Ivory Coast":           "Ivory-Coast",
    "South Korea":           "South-Korea",
    "United Arab Emirates":  "United-Arab-Emirates",
    "United Kingdom":        "United-Kingdom",
    "Saudi Arabia":          "Saudi-Arabia",
    "Hong Kong":             "Hong-Kong",
    "New Zealand":           "New-Zealand",
    "Papua New Guinea":      "Papua-New-Guinea",
    "Dominican Republic":    "Dominican-Republic",
    "South Africa":          "South-Africa",
    "Republic of the Congo": "Republic-of-the-Congo",
    "El Salvador":           "El-Salvador",
    "Costa Rica":            "Costa-Rica",
    "Sri Lanka":             "Sri-Lanka",
    "USA":                   "USA",
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

BASE_URL = "https://www.theglobaleconomy.com/{slug}/credit_rating/"

# in-between request delay (in seconds)
REQUEST_DELAY = 1.5


# ── Helpers ────────────────────────────────────────────────────────────────────

def country_to_slug(country: str) -> str:
    if country in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[country]
    return country.replace(" ", "-")


def parse_date(raw: str) -> str | None:
    raw = raw.strip()
    try:
        dt = datetime.strptime(raw, "%m/%Y")
        return dt.strftime("%Y-%m-01")
    except ValueError:
        log.warning("  Unparseable date: %r", raw)
        return None


def normalise_agency(raw: str) -> str | None:
    key = raw.strip().lower()
    return AGENCY_MAP.get(key)


def scrape_country(country: str, page) -> pd.DataFrame | None:
    slug = country_to_slug(country)
    url  = BASE_URL.format(slug=slug)

    try:
        page.goto(url)
        
        page.wait_for_selector("table#creditTable", timeout=15000)
    except PlaywrightTimeoutError:
        log.error("  Timeout waiting for table (bot protection blocked us) for %s", country)
        return None
    except Exception as exc:
        log.error("  Browser error for %s: %s", country, exc)
        return None

    soup = BeautifulSoup(page.content(), "html.parser")

    target_table = soup.find("table", id="creditTable")

    if target_table is None:
        log.warning("  No ratings table found for %s", country)
        return None

    rows =[]
    for tr in target_table.find_all("tr")[1:]:   
        cells =[td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < 4:
            continue
        raw_agency, raw_rating, raw_outlook, raw_date = cells[:4]

        agency = normalise_agency(raw_agency)
        if agency not in KEEP_AGENCIES:
            continue

        date = parse_date(raw_date)
        if date is None:
            continue

        rows.append({
            "Country": country,
            "Agency":  agency,
            "Rating":  raw_rating.strip(),
            "Outlook": raw_outlook.strip(),
            "Date":    date,
        })

    if not rows:
        log.warning("  Zero usable rows for %s", country)
        return None

    df = pd.DataFrame(rows)
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values(["Agency", "Date"]).reset_index(drop=True)
    return df


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    all_frames = []
    failed     =[]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        for i, country in enumerate(COUNTRIES, 1):
            log.info("[%3d/%d]  %s", i, len(COUNTRIES), country)
            
            df = scrape_country(country, page)

            if df is None or df.empty:
                failed.append(country)
            else:
                slug     = country.lower().replace(" ", "_")
                out_path = OUT_DIR / f"{slug}_ratings.csv"
                df.to_csv(out_path, index=False)
                log.info("         → %d rows  (%s)",
                         len(df), ", ".join(df["Agency"].unique()))
                all_frames.append(df)

            if i < len(COUNTRIES):
                time.sleep(REQUEST_DELAY + random.uniform(0, 1.0))
                
        browser.close()

    if all_frames:
        combined = pd.concat(all_frames, ignore_index=True)
        combined.to_csv(OUT_DIR / "all_ratings.csv", index=False)
        log.info("\n✓  Saved %d rows across %d countries → %s/",
                 len(combined), len(all_frames), OUT_DIR)

    if failed:
        log.warning("\n⚠  Failed / empty (%d): %s", len(failed), failed)
    else:
        log.info("✓  All countries scraped successfully.")


if __name__ == "__main__":
    main()
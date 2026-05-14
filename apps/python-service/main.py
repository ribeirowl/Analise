"""
Football data microservice — provides team stats, fixtures, and odds
scraped from FBRef/Understat via ScraperFC.  Called by the Node.js backend.
"""
import os
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("pyservice")

app = FastAPI(title="Football Data Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Cache (simple TTL dict) ────────────────────────────────────────────────────
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 6 * 3600  # 6h — FBRef is slow, cache aggressively

def cache_get(key: str):
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _cache[key]
    return None

def cache_set(key: str, val):
    _cache[key] = (time.time(), val)

# ── FBRef league map ───────────────────────────────────────────────────────────
FBREF_LEAGUES = {
    "epl":           "England Premier League",
    "laliga":        "Spain La Liga",
    "seriea":        "Italy Serie A",
    "bundesliga":    "Germany Bundesliga",
    "ligue1":        "France Ligue 1",
    "championship":  "England EFL Championship",
    "brasileirao":   "Brazil Serie A",
    "ucl":           "UEFA Champions League",
    "uel":           "UEFA Europa League",
}

FBREF_YEAR = "2025-2026"  # current season — ScraperFC uses "YYYY-YYYY" format

# ── Background scrape state ───────────────────────────────────────────────────
_scraping: set[str] = set()

# ── Team stats endpoint ────────────────────────────────────────────────────────
@app.get("/team-stats/{league}")
def get_team_stats(league: str, background_tasks: BackgroundTasks):
    """
    Returns season team stats (home/away goals, xG) from FBRef.
    First call returns empty immediately and triggers a background scrape.
    Subsequent calls return cached data (6h TTL).
    """
    league = league.lower()
    if league not in FBREF_LEAGUES:
        raise HTTPException(404, f"Unknown league '{league}'. Valid: {list(FBREF_LEAGUES)}")

    cache_key = f"team_stats:{league}:{FBREF_YEAR}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"source": "cache", "league": league, "teams": cached}

    # Not cached — kick off background scrape if not already running
    if league not in _scraping:
        background_tasks.add_task(_scrape_fbref_bg, league, cache_key)

    # Return immediately so Node.js backend is not blocked
    return {"source": "pending", "league": league, "teams": []}


def _scrape_fbref_bg(league: str, cache_key: str):
    """Background task: scrape FBRef and populate cache."""
    _scraping.add(league)
    try:
        from ScraperFC import FBref
        fb = FBref()
        league_name = FBREF_LEAGUES[league]
        log.info(f"FBRef background scrape starting: {league_name}")
        shooting = fb.scrape_stats(FBREF_YEAR, league_name, "shooting")
        standard = fb.scrape_stats(FBREF_YEAR, league_name, "standard")
        teams = _merge_team_stats(standard, shooting, league)
        if teams:
            cache_set(cache_key, teams)
            log.info(f"FBRef: cached {len(teams)} teams for {league}")
        else:
            log.warning(f"FBRef: no teams parsed for {league}")
    except Exception as e:
        log.error(f"FBRef background scrape failed for {league}: {e}")
    finally:
        _scraping.discard(league)


def _merge_team_stats(standard: pd.DataFrame, shooting: pd.DataFrame, league: str) -> list[dict]:
    """Normalise FBRef DataFrames into a simple list the Node.js backend understands."""
    try:
        # FBRef returns multi-level columns — flatten
        if isinstance(standard.columns, pd.MultiIndex):
            standard.columns = [" ".join(c).strip() for c in standard.columns]
        if isinstance(shooting.columns, pd.MultiIndex):
            shooting.columns = [" ".join(c).strip() for c in shooting.columns]

        # Find team name column (varies by FBRef version)
        team_col = next((c for c in standard.columns if "Squad" in c or "Team" in c), None)
        if team_col is None:
            return []

        results = []
        for _, row in standard.iterrows():
            name = str(row.get(team_col, "")).strip()
            if not name or name.lower() in ("squad", ""):
                continue

            def _n(col_fragment: str, df=standard, row=row) -> Optional[float]:
                col = next((c for c in df.columns if col_fragment.lower() in c.lower()), None)
                if col and col in row:
                    try:
                        return float(row[col])
                    except (ValueError, TypeError):
                        pass
                return None

            def _ns(col_fragment: str) -> Optional[float]:
                return _n(col_fragment, shooting)

            games_total = _n("MP") or _n("Matches Played") or _n("games")
            goals_for   = _n("Gls") or _n("Goals For") or _n("GF")
            goals_ag    = _n("GA") or _n("Goals Against")
            home_gf     = _n("Home GF") or _n("Home Gls")
            away_gf     = _n("Away GF") or _n("Away Gls")
            home_ga     = _n("Home GA")
            away_ga     = _n("Away GA")
            wins        = _n("W") or _n("Wins")
            draws       = _n("D") or _n("Draws")
            losses      = _n("L") or _n("Losses")
            xg_for      = _ns("xG") or _ns("Expected Goals")
            xg_against  = _ns("xGA") or _ns("Expected Goals Against")

            gp = games_total or 1
            results.append({
                "teamName":         name,
                "league":           league,
                "gamesPlayed":      games_total,
                "wins":             wins,
                "draws":            draws,
                "losses":           losses,
                "goalsScored":      goals_for,
                "goalsConceded":    goals_ag,
                "homeGoalsScored":  home_gf,
                "homeGoalsConceded":home_ga,
                "awayGoalsScored":  away_gf,
                "awayGoalsConceded":away_ga,
                "avgGoalsFor":      round(goals_for / gp, 2) if goals_for else None,
                "avgGoalsAgainst":  round(goals_ag  / gp, 2) if goals_ag  else None,
                "homeAvgGoalsFor":  round(home_gf   / (gp/2), 2) if home_gf else None,
                "awayAvgGoalsFor":  round(away_gf   / (gp/2), 2) if away_gf else None,
                "xgFor":            xg_for,
                "xgAgainst":        xg_against,
                "avgXgFor":         round(xg_for / gp, 2) if xg_for else None,
            })
        return results
    except Exception as e:
        log.error(f"_merge_team_stats error: {e}")
        return []


# ── Fixtures endpoint ──────────────────────────────────────────────────────────
@app.get("/fixtures")
def get_fixtures(date: str = "", days: int = 3):
    """Returns upcoming fixtures from FBRef for all main leagues."""
    target = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_key = f"fixtures:{target}:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"source": "cache", "fixtures": cached}

    all_fixtures = []
    try:
        from ScraperFC import FBref
        fb = FBref()
        for slug, name in FBREF_LEAGUES.items():
            try:
                df = fb.scrape_matches(FBREF_YEAR, name)
                if df is None or df.empty:
                    continue
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = [" ".join(c).strip() for c in df.columns]
                matches = _parse_fixtures(df, slug, target, days)
                all_fixtures.extend(matches)
            except Exception as e:
                log.warning(f"Fixtures scrape failed for {name}: {e}")

        cache_set(cache_key, all_fixtures)
        log.info(f"Fixtures: {len(all_fixtures)} upcoming matches")
    except Exception as e:
        log.error(f"Fixtures error: {e}")

    return {"source": "fbref", "date": target, "fixtures": all_fixtures}


def _parse_fixtures(df: pd.DataFrame, league: str, from_date: str, days: int) -> list[dict]:
    results = []
    try:
        date_col  = next((c for c in df.columns if "Date" in c), None)
        home_col  = next((c for c in df.columns if "Home" in c), None)
        away_col  = next((c for c in df.columns if "Away" in c), None)
        score_col = next((c for c in df.columns if "Score" in c or "xG" in c.lower()), None)
        if not (date_col and home_col and away_col):
            return []

        start = datetime.strptime(from_date, "%Y-%m-%d")
        end   = start + timedelta(days=days)

        for _, row in df.iterrows():
            raw_date = str(row.get(date_col, "")).strip()
            try:
                match_date = datetime.strptime(raw_date, "%Y-%m-%d")
            except ValueError:
                continue
            if not (start <= match_date < end):
                continue
            home = str(row.get(home_col, "")).strip()
            away = str(row.get(away_col, "")).strip()
            if not home or not away:
                continue
            results.append({
                "date": raw_date,
                "league": league,
                "homeTeam": home,
                "awayTeam": away,
            })
    except Exception as e:
        log.warning(f"_parse_fixtures error: {e}")
    return results


# ── xG / Understat endpoint ───────────────────────────────────────────────────
@app.get("/understat/league/{league}")
def get_understat_league(league: str):
    """Returns current xG data per team from Understat."""
    UNDERSTAT_MAP = {
        "epl": "EPL", "laliga": "La_liga", "bundesliga": "Bundesliga",
        "seriea": "Serie_A", "ligue1": "Ligue_1",
    }
    us_key = UNDERSTAT_MAP.get(league.lower())
    if not us_key:
        raise HTTPException(404, f"Understat not available for '{league}'")

    cache_key = f"understat:{league}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"source": "cache", "league": league, "teams": cached}

    try:
        from ScraperFC import Understat
        us = Understat()
        data = us.scrape_league_table(FBREF_YEAR, us_key)
        if data is None or data.empty:
            return {"source": "understat", "league": league, "teams": []}
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [" ".join(c).strip() for c in data.columns]
        teams = data.to_dict(orient="records")
        cache_set(cache_key, teams)
        return {"source": "understat", "league": league, "teams": teams}
    except Exception as e:
        log.error(f"Understat scrape failed for {league}: {e}")
        return {"source": "error", "league": league, "teams": [], "error": str(e)}


# ── StatsBomb open data ───────────────────────────────────────────────────────
@app.get("/statsbomb/competitions")
def get_statsbomb_competitions():
    """Returns StatsBomb open-data competitions (free historical matches)."""
    from statsbombpy import sb
    comps = sb.competitions()
    return comps.to_dict(orient="records") if not comps.empty else []


@app.get("/statsbomb/matches")
def get_statsbomb_matches(competition_id: int, season_id: int):
    from statsbombpy import sb
    matches = sb.matches(competition_id=competition_id, season_id=season_id)
    return matches.to_dict(orient="records") if not matches.empty else []


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "cache_keys": len(_cache),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_SERVICE_PORT", "3002"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

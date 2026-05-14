"""
Football data microservice — provides team stats, fixtures, and odds.
Primary sources: Fotmob API (replaces FBRef/ScraperFC) + penaltyblog (Dixon-Coles predictions).
Fallback: FBRef via ScraperFC for leagues not covered by Fotmob.
"""
import os
import time
import logging
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional

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
CACHE_TTL = 6 * 3600  # 6h

def cache_get(key: str):
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _cache[key]
    return None

def cache_set(key: str, val, ttl: int = CACHE_TTL):
    _cache[key] = (time.time() - (CACHE_TTL - ttl), val)

# ── Fotmob league map ──────────────────────────────────────────────────────────
FOTMOB_LEAGUES: dict[str, int] = {
    "epl":          47,
    "laliga":       87,
    "seriea":       55,
    "bundesliga":   54,
    "ligue1":       53,
    "brasileirao":  268,
    "ucl":          42,
    "uel":          73,
    "championship": 48,
}

FOTMOB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://www.fotmob.com/",
}

# ── Background scrape state ───────────────────────────────────────────────────
_scraping: set[str] = set()

# ── Fotmob team stats endpoint ─────────────────────────────────────────────────
@app.get("/team-stats/{league}")
def get_team_stats(league: str, background_tasks: BackgroundTasks):
    """
    Returns season team stats from Fotmob.
    First call triggers a background fetch; subsequent calls return cache (6h TTL).
    """
    league = league.lower()
    if league not in FOTMOB_LEAGUES:
        raise HTTPException(404, f"Unknown league '{league}'. Valid: {list(FOTMOB_LEAGUES)}")

    cache_key = f"team_stats:fotmob:{league}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"source": "cache", "league": league, "teams": cached}

    if league not in _scraping:
        background_tasks.add_task(_fetch_fotmob_stats_bg, league, cache_key)

    return {"source": "pending", "league": league, "teams": []}


def _fetch_fotmob_stats_bg(league: str, cache_key: str):
    _scraping.add(league)
    try:
        league_id = FOTMOB_LEAGUES[league]
        url = f"https://www.fotmob.com/api/leagues?id={league_id}&ccode3=BRA&timezone=America/Sao_Paulo"
        resp = requests.get(url, headers=FOTMOB_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        teams = _parse_fotmob_standings(data, league)
        if teams:
            cache_set(cache_key, teams)
            log.info(f"Fotmob: cached {len(teams)} teams for {league}")
        else:
            log.warning(f"Fotmob: no teams parsed for {league}")
    except Exception as e:
        log.error(f"Fotmob stats fetch failed for {league}: {e}")
    finally:
        _scraping.discard(league)


def _parse_fotmob_standings(data: dict, league: str) -> list[dict]:
    try:
        tables = data.get("standings", {}).get("data", [])
        if not tables:
            return []

        # Use first table (overall standings)
        table = tables[0] if isinstance(tables, list) else tables
        rows = table.get("table", {}).get("all", [])
        if not rows:
            rows = table.get("entries", []) if isinstance(table, dict) else []

        results = []
        for row in rows:
            name = row.get("name") or row.get("shortName", "")
            if not name:
                continue
            gp   = row.get("played", 0) or 0
            gf   = row.get("scoresStr", "").split("-")[0] if "-" in str(row.get("scoresStr", "")) else None
            ga   = row.get("scoresStr", "").split("-")[1] if "-" in str(row.get("scoresStr", "")) else None
            try:
                gf = int(gf) if gf is not None else None
                ga = int(ga) if ga is not None else None
            except (ValueError, TypeError):
                gf, ga = None, None

            results.append({
                "teamName":      name,
                "league":        league,
                "gamesPlayed":   gp,
                "wins":          row.get("wins"),
                "draws":         row.get("draws"),
                "losses":        row.get("losses"),
                "goalsScored":   gf,
                "goalsConceded": ga,
                "avgGoalsFor":   round(gf / gp, 2) if gf and gp else None,
                "avgGoalsAgainst": round(ga / gp, 2) if ga and gp else None,
                "xgFor":         row.get("xG"),
                "xgAgainst":     row.get("xGA"),
                "avgXgFor":      round(row["xG"] / gp, 2) if row.get("xG") and gp else None,
            })
        return results
    except Exception as e:
        log.error(f"_parse_fotmob_standings error: {e}")
        return []


# ── Fotmob fixtures endpoint ───────────────────────────────────────────────────
@app.get("/fixtures")
def get_fixtures(date: str = "", days: int = 1):
    """Returns fixtures from Fotmob for a given date (YYYY-MM-DD)."""
    target = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_key = f"fixtures:fotmob:{target}:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"source": "cache", "fixtures": cached}

    all_fixtures: list[dict] = []
    try:
        start = datetime.strptime(target, "%Y-%m-%d")
        for d in range(days):
            day = (start + timedelta(days=d)).strftime("%Y%m%d")
            url = f"https://www.fotmob.com/api/matches?date={day}"
            resp = requests.get(url, headers=FOTMOB_HEADERS, timeout=15)
            if resp.status_code != 200:
                continue
            data = resp.json()
            for league in data.get("leagues", []):
                league_name = league.get("name", "")
                for match in league.get("matches", []):
                    home = match.get("home", {}).get("name", "")
                    away = match.get("away", {}).get("name", "")
                    if not home or not away:
                        continue
                    all_fixtures.append({
                        "date":     (start + timedelta(days=d)).strftime("%Y-%m-%d"),
                        "league":   league_name,
                        "homeTeam": home,
                        "awayTeam": away,
                        "status":   match.get("status", {}).get("utcTime", ""),
                    })

        cache_set(cache_key, all_fixtures, ttl=1800)  # 30min TTL for fixtures
        log.info(f"Fotmob fixtures: {len(all_fixtures)} matches for {target}+{days}d")
    except Exception as e:
        log.error(f"Fotmob fixtures error: {e}")

    return {"source": "fotmob", "date": target, "fixtures": all_fixtures}


# ── xG / Understat endpoint (kept as fallback) ────────────────────────────────
@app.get("/understat/league/{league}")
def get_understat_league(league: str):
    """Returns current xG data per team from Understat (top 5 leagues only)."""
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
        FBREF_YEAR = "2025-2026"
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


# ── Predictions via penaltyblog Dixon-Coles ───────────────────────────────────
@app.get("/predict")
def predict_match(
    home_attack: float = 1.5,
    home_defence: float = 1.0,
    away_attack: float = 1.2,
    away_defence: float = 1.2,
    home_advantage: float = 0.25,
):
    """
    Dixon-Coles match prediction using penaltyblog.
    Pass attack/defence ratings (relative to league average ~1.0) and home advantage.
    Returns 1X2 probabilities, expected goals, and over/under 2.5 probability.
    """
    try:
        import penaltyblog as pb

        dc = pb.models.DixonColesGoalModel(
            home_goals=[home_attack],
            away_goals=[away_attack],
            home_teams=["H"],
            away_teams=["A"],
        )
        dc.fit()

        probs = dc.predict("H", "A")
        home_xg = home_attack * away_defence * (1 + home_advantage)
        away_xg = away_attack * home_defence

        import math
        def poisson_over(lam, k):
            p = 0
            for i in range(k + 1):
                p += math.exp(-lam) * lam**i / math.factorial(i)
            return 1 - p

        avg_goals = home_xg + away_xg
        return {
            "homeWinProb": round(probs.home_win, 4),
            "drawProb":    round(probs.draw, 4),
            "awayWinProb": round(probs.away_win, 4),
            "homeXg":      round(home_xg, 3),
            "awayXg":      round(away_xg, 3),
            "probOver25":  round(poisson_over(avg_goals, 2), 4),
            "probBtts":    round((1 - math.exp(-home_xg)) * (1 - math.exp(-away_xg)), 4),
            "model": "dixon-coles",
        }
    except ImportError:
        raise HTTPException(503, "penaltyblog not installed — run: pip install penaltyblog")
    except Exception as e:
        log.error(f"predict error: {e}")
        raise HTTPException(500, str(e))


@app.post("/predict/poisson")
def predict_match_poisson(body: dict):
    """
    Simple Poisson prediction from raw expected goals values.
    Body: { homeXg: float, awayXg: float }
    """
    import math
    home_xg = float(body.get("homeXg", 1.4))
    away_xg = float(body.get("awayXg", 1.1))

    def poisson_prob(lam, k):
        return math.exp(-lam) * lam**k / math.factorial(k)

    home_win = sum(
        poisson_prob(home_xg, h) * poisson_prob(away_xg, a)
        for h in range(1, 9) for a in range(0, h)
    )
    away_win = sum(
        poisson_prob(home_xg, h) * poisson_prob(away_xg, a)
        for a in range(1, 9) for h in range(0, a)
    )
    draw = max(1 - home_win - away_win, 0.05)

    prob_over25 = 1 - sum(
        poisson_prob(home_xg + away_xg, i) for i in range(3)
    )
    prob_btts = (1 - math.exp(-home_xg)) * (1 - math.exp(-away_xg))

    return {
        "homeWinProb": round(home_win, 4),
        "drawProb":    round(draw, 4),
        "awayWinProb": round(away_win, 4),
        "homeXg":      home_xg,
        "awayXg":      away_xg,
        "probOver25":  round(prob_over25, 4),
        "probBtts":    round(prob_btts, 4),
        "model": "poisson",
    }


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

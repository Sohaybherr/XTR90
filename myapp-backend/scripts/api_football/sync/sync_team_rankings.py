from __future__ import annotations

import argparse
import csv
import html
import json
import re
import unicodedata
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from scripts.api_football.storage import db_connection


FIFA_SOURCE_URL = "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/spain-top-ranking-norway-big-gains"
UEFA_SOURCE_URL = "https://www.uefa.com/nationalassociations/uefarankings/club/?year=2026"
FIFA_FULL_SOURCE_URL = "https://football-ranking.com/fifa-world-rankings?period=20+July+2026"
UEFA_FULL_SOURCE_URL = "https://kassiesa.net/uefa/data/method5/trank2026.html"

SEEDED_FIFA_MEN = [
    {"rank": 1, "team": "Spain", "country_code": "ESP", "points": 1995.88, "movement": 1},
    {"rank": 2, "team": "Argentina", "country_code": "ARG", "points": 1970.37, "movement": -1},
    {"rank": 3, "team": "France", "country_code": "FRA", "points": 1948.97, "movement": 0},
    {"rank": 4, "team": "England", "country_code": "ENG", "points": 1922.83, "movement": 0},
    {"rank": 5, "team": "Brazil", "country_code": "BRA", "points": 1804.93, "movement": 1},
    {"rank": 6, "team": "Morocco", "country_code": "MAR", "points": 1803.99, "movement": 1},
    {"rank": 7, "team": "Portugal", "country_code": "POR", "points": 1787.86, "movement": -2},
    {"rank": 8, "team": "Belgium", "country_code": "BEL", "points": 1778.36, "movement": 1},
    {"rank": 9, "team": "Netherlands", "country_code": "NED", "points": 1775.54, "movement": -1},
    {"rank": 10, "team": "Mexico", "country_code": "MEX", "points": 1754.30, "movement": 4},
]

SEEDED_UEFA_CLUB = [
    {"rank": 1, "team": "Bayern Munchen", "country_code": "GER", "points": 147.500},
    {"rank": 2, "team": "Real Madrid", "country_code": "ESP", "points": 144.500},
    {"rank": 3, "team": "Paris Saint Germain", "country_code": "FRA", "points": 132.000},
    {"rank": 4, "team": "Liverpool", "country_code": "ENG", "points": 130.000},
    {"rank": 5, "team": "Inter", "country_code": "ITA", "points": 127.000},
]

TEAM_ALIASES = {
    "bayern munchen": "Bayern Munchen",
    "bayern münchen": "Bayern Munchen",
    "bayern munich": "Bayern Munchen",
    "paris": "Paris Saint Germain",
    "paris saint-germain": "Paris Saint Germain",
    "paris sg": "Paris Saint Germain",
    "psg": "Paris Saint Germain",
    "inter milan": "Inter",
    "internazionale": "Inter",
    "usa": "United States",
    "united states": "USA",
    "south korea": "Korea Republic",
    "ivory coast": "Cote d'Ivoire",
    "côte d'ivoire": "Cote d'Ivoire",
}


CODE_TEAM_ALIASES = {
    "COD": "Congo DR",
    "CGO": "Congo",
}

EXTRA_TEAM_ALIASES = {
    "aa gent": "Gent",
    "ac milan": "AC Milan",
    "athletic bilbao": "Athletic Club",
    "atletico madrid": "Atletico Madrid",
    "atlético madrid": "Atletico Madrid",
    "besiktas": "Besiktas",
    "bodo glimt": "Bodo/Glimt",
    "bodø/glimt": "Bodo/Glimt",
    "brighton and hove albion": "Brighton",
    "borussia m'gladbach": "Borussia Monchengladbach",
    "borussia mönchengladbach": "Borussia Monchengladbach",
    "celtic glasgow": "Celtic",
    "celta de vigo": "Celta Vigo",
    "club brugge": "Club Brugge KV",
    "fc barcelona": "Barcelona",
    "fc basel": "FC Basel 1893",
    "fc copenhagen": "FC Copenhagen",
    "fc københavn": "FC Copenhagen",
    "fc porto": "FC Porto",
    "fc salzburg": "Red Bull Salzburg",
    "ferencvaros": "Ferencvarosi TC",
    "ferencváros": "Ferencvarosi TC",
    "glasgow rangers": "Rangers",
    "inter": "Inter",
    "inter milan": "Inter",
    "internazionale": "Inter",
    "jagiellonia bialystok": "Jagiellonia",
    "lask": "Lask Linz",
    "leicester city": "Leicester",
    "legia warsaw": "Legia Warszawa",
    "ludogorets razgrad": "Ludogorets",
    "lille osc": "Lille",
    "maccabi tel-aviv": "Maccabi Tel Aviv",
    "newcastle united": "Newcastle",
    "ogc nice": "Nice",
    "olympique lyon": "Lyon",
    "olympique marseille": "Marseille",
    "paok thessaloniki": "PAOK",
    "paços de ferreira": "Pacos Ferreira",
    "partizan belgrade": "FK Partizan",
    "racing genk": "Genk",
    "rapid wien": "Rapid Vienna",
    "red star belgrade": "FK Crvena Zvezda",
    "slavia prague": "Slavia Praha",
    "sporting braga": "SC Braga",
    "sporting cp lisbon": "Sporting CP",
    "sporting lisbon": "Sporting CP",
    "stade rennais": "Rennes",
    "tottenham hotspur": "Tottenham",
    "viktoria plzen": "Plzen",
    "vitoria guimaraes": "Guimaraes",
    "vitória guimarães": "Guimaraes",
    "west ham united": "West Ham",
    "young boys": "BSC Young Boys",
    "zalgiris vilnius": "FK Zalgiris Vilnius",
}

COUNTRY_CODE_NAMES = {
    "AUT": "Austria",
    "AZB": "Azerbaijan",
    "AZE": "Azerbaijan",
    "BEL": "Belgium",
    "BIH": "Bosnia and Herzegovina",
    "BOS": "Bosnia and Herzegovina",
    "BUL": "Bulgaria",
    "CRO": "Croatia",
    "CYP": "Cyprus",
    "CZE": "Czech Republic",
    "DEN": "Denmark",
    "ENG": "England",
    "ESP": "Spain",
    "FIN": "Finland",
    "FRA": "France",
    "GER": "Germany",
    "GRE": "Greece",
    "HUN": "Hungary",
    "ISR": "Israel",
    "ITA": "Italy",
    "KAZ": "Kazakhstan",
    "KOS": "Kosovo",
    "LAT": "Latvia",
    "LIT": "Lithuania",
    "MAC": "North Macedonia",
    "MKD": "North Macedonia",
    "NED": "Netherlands",
    "NOR": "Norway",
    "POL": "Poland",
    "POR": "Portugal",
    "ROM": "Romania",
    "SCO": "Scotland",
    "SRB": "Serbia",
    "SUI": "Switzerland",
    "SWE": "Sweden",
    "TUR": "Turkey",
    "UKR": "Ukraine",
}


@dataclass(frozen=True)
class RankingRow:
    source: str
    ranking_type: str
    ranking_date: date
    rank: int
    team_name: str
    country_code: str
    points: float
    movement: int
    source_url: str
    raw: dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import FIFA national team rankings and UEFA club coefficients.")
    parser.add_argument("--seed-latest", action="store_true", help="Import the bundled latest seed rows.")
    parser.add_argument("--fetch-latest", action="store_true", help="Fetch FIFA top 150 and UEFA top 200 from public ranking pages.")
    parser.add_argument("--fifa-limit", type=int, default=150, help="Maximum FIFA national team rows to import when fetching. Default: 150.")
    parser.add_argument("--uefa-limit", type=int, default=200, help="Maximum UEFA club rows to import when fetching. Default: 200.")
    parser.add_argument("--fifa-csv", type=Path, help="CSV with rank, team, points, country_code, movement columns.")
    parser.add_argument("--uefa-csv", type=Path, help="CSV with rank, team, points, country_code columns.")
    parser.add_argument("--fifa-json", type=Path, help="JSON list with rank, team/name, points, country_code, movement.")
    parser.add_argument("--uefa-json", type=Path, help="JSON list with rank, team/name, points, country_code.")
    parser.add_argument("--ranking-date", default=date.today().isoformat(), help="Ranking publication date. Default: today.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and map rows without writing.")
    args = parser.parse_args()
    input_paths = [args.fifa_csv, args.uefa_csv, args.fifa_json, args.uefa_json]
    if not args.seed_latest and not args.fetch_latest and not any(input_paths):
        parser.error("choose --fetch-latest, --seed-latest, or pass a real --fifa-csv/--uefa-csv/--fifa-json/--uefa-json file")
    for input_path in [path for path in input_paths if path]:
        normalized = str(input_path).replace("\\", "/").lower()
        if normalized in {"path/to/fifa.csv", "path/to/uefa.csv", "path/to/fifa.json", "path/to/uefa.json"}:
            parser.error(f"{input_path} is an example placeholder. Replace it with the real file path, or use --seed-latest.")
        if not input_path.exists():
            parser.error(f"file not found: {input_path}. Use a real local file path, or use --seed-latest.")
        if not input_path.is_file():
            parser.error(f"not a file: {input_path}")
    return args


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def ascii_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", clean_text(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\b(fc|cf|sc|ac|as|rc|sk|fk|nk|cd|if|bk|sv|vfl|vfb|ss|ssc|afc|the)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalized_name(value: Any) -> str:
    text = clean_text(value).lower()
    return EXTRA_TEAM_ALIASES.get(text) or EXTRA_TEAM_ALIASES.get(ascii_key(text)) or TEAM_ALIASES.get(text, clean_text(value))


def normalized_team_name(value: Any, country_code: str = "") -> str:
    code = clean_text(country_code).upper()
    if code in CODE_TEAM_ALIASES:
        return CODE_TEAM_ALIASES[code]
    return normalized_name(value)


def parse_int(value: Any, default: int = 0) -> int:
    match = re.search(r"-?\d+", str(value or "").replace("+", ""))
    if match:
        return int(match.group(0))
    try:
        return int(str(value).replace("+", "").strip())
    except (TypeError, ValueError):
        return default


def parse_float(value: Any, default: float = 0) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 XTRA90 rankings sync"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def cell_text(value: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    return clean_text(text)


def html_rows(markup: str) -> list[list[str]]:
    rows = []
    for row_html in re.findall(r"<tr[\s\S]*?</tr>", markup, flags=re.IGNORECASE):
        cells = [cell_text(cell) for cell in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row_html, flags=re.IGNORECASE)]
        cells = [cell for cell in cells if cell]
        if cells:
            rows.append(cells)
    return rows


def parse_movement(value: str) -> int:
    text = value.lower()
    match = re.search(r"[↑▲]\s*(\d+)|up\s*(\d+)", text)
    if match:
        return parse_int(match.group(1) or match.group(2))
    match = re.search(r"[↓▼]\s*(\d+)|down\s*(\d+)", text)
    if match:
        return -parse_int(match.group(1) or match.group(2))
    return 0


def tier_for_rank(rank: int, ranking_type: str) -> str:
    if rank <= 0:
        return "unclassified"
    if ranking_type == "fifa_men":
        if rank <= 10:
            return "world_elite"
        if rank <= 25:
            return "world_strong"
        if rank <= 50:
            return "world_competitive"
        return "world_developing"
    if rank <= 10:
        return "europe_elite"
    if rank <= 25:
        return "europe_strong"
    if rank <= 50:
        return "europe_competitive"
    return "europe_developing"


def rows_from_seed(ranking_date: date) -> list[RankingRow]:
    rows: list[RankingRow] = []
    for item in SEEDED_FIFA_MEN:
        rows.append(make_row(item, source="fifa", ranking_type="fifa_men", ranking_date=ranking_date, source_url=FIFA_SOURCE_URL))
    for item in SEEDED_UEFA_CLUB:
        rows.append(make_row(item, source="uefa", ranking_type="uefa_club", ranking_date=ranking_date, source_url=UEFA_SOURCE_URL))
    return rows


def make_row(item: dict[str, Any], *, source: str, ranking_type: str, ranking_date: date, source_url: str) -> RankingRow:
    country_code = clean_text(item.get("country_code") or item.get("countryCode") or item.get("code")).upper()
    return RankingRow(
        source=source,
        ranking_type=ranking_type,
        ranking_date=ranking_date,
        rank=parse_int(item.get("rank")),
        team_name=normalized_team_name(item.get("team") or item.get("name"), country_code),
        country_code=country_code,
        points=parse_float(item.get("points") or item.get("score")),
        movement=parse_int(item.get("movement") or item.get("rankChange")),
        source_url=source_url,
        raw=item,
    )


def rows_from_csv(path: Path, *, source: str, ranking_type: str, ranking_date: date, source_url: str) -> list[RankingRow]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [make_row(row, source=source, ranking_type=ranking_type, ranking_date=ranking_date, source_url=source_url) for row in csv.DictReader(handle)]


def rows_from_json(path: Path, *, source: str, ranking_type: str, ranking_date: date, source_url: str) -> list[RankingRow]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("rankings") or payload.get("data") or []
    return [make_row(row, source=source, ranking_type=ranking_type, ranking_date=ranking_date, source_url=source_url) for row in rows]


def fetch_fifa_rows(ranking_date: date, limit: int) -> list[RankingRow]:
    parsed: dict[int, RankingRow] = {}
    urls = [f"{FIFA_FULL_SOURCE_URL}&page={page}" for page in range(1, 8)]

    for url in urls:
        if len(parsed) >= limit:
            break
        try:
            markup = fetch_text(url)
        except Exception as error:  # noqa: BLE001 - batch importer should keep alternate pages moving.
            print(f"Warning: FIFA ranking fetch failed for {url}: {error}")
            continue

        for cells in html_rows(markup):
            if len(cells) < 3 or "(" not in cells[1]:
                continue
            rank = parse_int(cells[0])
            if rank <= 0 or rank in parsed:
                continue
            points_cell = cells[2]
            points_match = re.search(r"\d[\d,]*\.\d+", points_cell)
            if not points_match:
                continue
            team_cell = cells[1]
            team_name = re.sub(r"^image\s+", "", team_cell, flags=re.IGNORECASE)
            code = ""
            code_match = re.match(r"^(.*?)\s*\(([A-Z]{2,3})\)\s*$", team_name)
            if code_match:
                team_name = code_match.group(1).strip()
                code = code_match.group(2).strip()
            team_name = re.sub(r"\s+[A-Z]{2,3}$", "", team_name).strip()
            if not team_name:
                continue
            parsed[rank] = make_row(
                {
                    "rank": rank,
                    "team": team_name,
                    "country_code": code,
                    "points": points_match.group(0),
                    "movement": parse_movement(cells[0]),
                },
                source="fifa",
                ranking_type="fifa_men",
                ranking_date=ranking_date,
                source_url=FIFA_FULL_SOURCE_URL,
            )

    return [parsed[rank] for rank in sorted(parsed)[:limit]]


def fetch_uefa_rows(ranking_date: date, limit: int) -> list[RankingRow]:
    markup = fetch_text(UEFA_FULL_SOURCE_URL)
    parsed: list[RankingRow] = []
    last_rank = 0

    for cells in html_rows(markup):
        first_cell_is_rank = bool(re.fullmatch(r"\d+", cells[0]))
        rank = parse_int(cells[0]) if first_cell_is_rank else last_rank
        team_index = 1 if first_cell_is_rank else 0
        if rank <= 0 or len(cells) <= team_index:
            continue
        last_rank = rank
        numeric_cells = [parse_float(cell) for cell in cells if re.fullmatch(r"\d+(?:[,.]\d+)?", cell.replace(",", "."))]
        if len(numeric_cells) < 2:
            continue
        points = numeric_cells[-2]
        team_name = cells[team_index]
        if not re.search(r"[A-Za-z]", team_name) or len(team_name) > 80:
            continue
        country_code = next((cell[:3].upper() for cell in cells if re.fullmatch(r"[A-Za-z]{3}", cell)), "")
        parsed.append(
            make_row(
                {
                    "rank": rank,
                    "team": team_name,
                    "country_code": country_code,
                    "points": points,
                },
                source="uefa",
                ranking_type="uefa_club",
                ranking_date=ranking_date,
                source_url=UEFA_FULL_SOURCE_URL,
            )
        )
        if len(parsed) >= limit:
            break

    return parsed[:limit]


def load_rows(args: argparse.Namespace) -> list[RankingRow]:
    ranking_date = date.fromisoformat(args.ranking_date)
    rows: list[RankingRow] = []
    if args.seed_latest:
        rows.extend(rows_from_seed(ranking_date))
    if args.fetch_latest:
        rows.extend(fetch_fifa_rows(ranking_date, args.fifa_limit))
        rows.extend(fetch_uefa_rows(ranking_date, args.uefa_limit))
    if args.fifa_csv:
        rows.extend(rows_from_csv(args.fifa_csv, source="fifa", ranking_type="fifa_men", ranking_date=ranking_date, source_url=FIFA_SOURCE_URL))
    if args.uefa_csv:
        rows.extend(rows_from_csv(args.uefa_csv, source="uefa", ranking_type="uefa_club", ranking_date=ranking_date, source_url=UEFA_SOURCE_URL))
    if args.fifa_json:
        rows.extend(rows_from_json(args.fifa_json, source="fifa", ranking_type="fifa_men", ranking_date=ranking_date, source_url=FIFA_SOURCE_URL))
    if args.uefa_json:
        rows.extend(rows_from_json(args.uefa_json, source="uefa", ranking_type="uefa_club", ranking_date=ranking_date, source_url=UEFA_SOURCE_URL))
    return [row for row in rows if row.rank > 0 and row.team_name]


def find_country_id(conn, country_code: str) -> int | None:
    if not country_code:
        return None
    country_name = COUNTRY_CODE_NAMES.get(country_code.upper())
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM countries
            WHERE upper(code) = upper(%s)
               OR upper(code) = upper(%s)
               OR lower(name) = lower(%s)
            LIMIT 1
            """,
            (country_code[:2], country_code, country_name or ""),
        )
        row = cur.fetchone()
        return int(row[0]) if row else None


def team_country_matches(team_country: str | None, row: RankingRow) -> bool:
    if not row.country_code:
        return True
    expected = COUNTRY_CODE_NAMES.get(row.country_code.upper())
    if not expected:
        return True
    return ascii_key(team_country or "") == ascii_key(expected)


def name_candidates(row: RankingRow) -> set[str]:
    raw_name = row.raw.get("team") or row.raw.get("name") if isinstance(row.raw, dict) else ""
    names = {row.team_name, normalized_name(row.team_name), clean_text(raw_name), normalized_name(raw_name)}
    expanded = set(names)
    for name in names:
        key = ascii_key(name)
        expanded.add(key)
        if key.startswith("fc "):
            expanded.add(key[3:])
        if key.endswith(" fc"):
            expanded.add(key[:-3])
    return {name for name in expanded if clean_text(name)}


def find_team(conn, row: RankingRow) -> int | None:
    names = {row.team_name, TEAM_ALIASES.get(row.team_name.lower(), row.team_name)}
    with conn.cursor() as cur:
        for name in names:
            cur.execute(
                """
                SELECT id
                FROM teams
                WHERE lower(name) = lower(%s)
                   OR lower(short_name) = lower(%s)
                   OR lower(regexp_replace(name, '\\s+(FC|CF|SC|AC)$', '', 'i')) = lower(%s)
                   OR lower(replace(replace(replace(replace(name, 'ü', 'u'), 'ö', 'o'), 'ä', 'a'), 'é', 'e')) = lower(%s)
                ORDER BY
                    CASE WHEN COALESCE(is_national, FALSE) = %s THEN 0 ELSE 1 END,
                    id
                LIMIT 1
                """,
                (name, name, name, name, row.ranking_type == "fifa_men"),
            )
            found = cur.fetchone()
            if found:
                return int(found[0])
    return None


def find_team(conn, row: RankingRow) -> int | None:
    candidates = name_candidates(row)
    candidate_keys = {ascii_key(candidate) for candidate in candidates}
    target_is_national = row.ranking_type == "fifa_men"
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, api_id, name, short_name, country_name_snapshot, COALESCE(is_national, FALSE)
            FROM teams
            WHERE COALESCE(is_national, FALSE) = %s
            """,
            (target_is_national,),
        )
        teams = cur.fetchall()

    best: tuple[int, int] | None = None
    for team_id, api_id, name, short_name, country_name, is_national in teams:
        db_names = {clean_text(name), clean_text(short_name)}
        db_keys = {ascii_key(item) for item in db_names if item}
        direct_match = any(
            clean_text(candidate).lower() == clean_text(db_name).lower()
            for candidate in candidates
            for db_name in db_names
            if db_name
        )
        key_match = bool(db_keys.intersection(candidate_keys))
        if not direct_match and not key_match:
            continue

        score = 100 if direct_match else 80
        if team_country_matches(country_name, row):
            score += 40
        elif row.country_code:
            score -= 60
        if api_id is not None:
            score += 20
        if bool(is_national) == target_is_national:
            score += 10

        candidate = (score, int(team_id))
        if best is None or candidate[0] > best[0] or (candidate[0] == best[0] and candidate[1] < best[1]):
            best = candidate

    if best:
        return best[1]
    return None


def ensure_ranked_team(conn, row: RankingRow) -> int:
    team_id = find_team(conn, row)
    if team_id:
        return team_id

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO teams (
                name,
                short_name,
                code,
                country_id,
                country_name_snapshot,
                is_national,
                national,
                api_synced_at,
                api_updated_at,
                updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
            """,
            (
                row.team_name,
                row.team_name[:20],
                row.country_code[:3] or None,
                find_country_id(conn, row.country_code),
                row.country_code or "Unknown",
                row.ranking_type == "fifa_men",
                row.ranking_type == "fifa_men",
            ),
        )
        return int(cur.fetchone()[0])


def upsert_ranking(conn, row: RankingRow, team_id: int) -> str:
    tier = tier_for_rank(row.rank, row.ranking_type)
    snapshot_candidates = [clean_text(name).lower() for name in name_candidates(row)]
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM team_rankings
            WHERE source = %s
              AND ranking_type = %s
              AND ranking_date = %s
              AND rank = %s
              AND lower(team_name_snapshot) = ANY(%s)
              AND team_id <> %s
            """,
            (row.source, row.ranking_type, row.ranking_date, row.rank, snapshot_candidates, team_id),
        )
        cur.execute(
            """
            INSERT INTO team_rankings (
                team_id,
                source,
                ranking_type,
                ranking_date,
                rank,
                points,
                country_code,
                movement,
                team_name_snapshot,
                source_url,
                raw,
                api_synced_at,
                updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (source, ranking_type, ranking_date, team_id) DO UPDATE
            SET rank = EXCLUDED.rank,
                points = EXCLUDED.points,
                country_code = EXCLUDED.country_code,
                movement = EXCLUDED.movement,
                team_name_snapshot = EXCLUDED.team_name_snapshot,
                source_url = EXCLUDED.source_url,
                raw = EXCLUDED.raw,
                api_synced_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS inserted
            """,
            (
                team_id,
                row.source,
                row.ranking_type,
                row.ranking_date,
                row.rank,
                row.points,
                row.country_code,
                row.movement,
                row.team_name,
                row.source_url,
                json.dumps(row.raw, ensure_ascii=True),
            ),
        )
        inserted = bool(cur.fetchone()[0])

        if row.ranking_type == "fifa_men":
            cur.execute(
                """
                UPDATE teams
                SET fifa_rank = %s,
                    fifa_points = %s,
                    classification_tier = %s,
                    classification_score = %s,
                    classification_source = 'fifa',
                    classification_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (row.rank, row.points, tier, row.points, team_id),
            )
        else:
            cur.execute(
                """
                UPDATE teams
                SET uefa_rank = %s,
                    uefa_points = %s,
                    classification_tier = %s,
                    classification_score = %s,
                    classification_source = 'uefa',
                    classification_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (row.rank, row.points, tier, row.points, team_id),
            )
    return "inserted" if inserted else "updated"


def reset_unranked_classifications(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE teams t
            SET fifa_rank = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM team_rankings tr WHERE tr.team_id = t.id AND tr.ranking_type = 'fifa_men'
                ) THEN 0 ELSE fifa_rank END,
                fifa_points = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM team_rankings tr WHERE tr.team_id = t.id AND tr.ranking_type = 'fifa_men'
                ) THEN 0 ELSE fifa_points END,
                uefa_rank = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM team_rankings tr WHERE tr.team_id = t.id AND tr.ranking_type = 'uefa_club'
                ) THEN 0 ELSE uefa_rank END,
                uefa_points = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM team_rankings tr WHERE tr.team_id = t.id AND tr.ranking_type = 'uefa_club'
                ) THEN 0 ELSE uefa_points END,
                classification_tier = 'unclassified',
                classification_score = 0,
                classification_source = 'none',
                classification_updated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE classification_source IN ('fifa', 'uefa')
              AND NOT EXISTS (
                  SELECT 1
                  FROM team_rankings tr
                  WHERE tr.team_id = t.id
                    AND tr.ranking_type = CASE WHEN t.classification_source = 'fifa' THEN 'fifa_men' ELSE 'uefa_club' END
              )
            """
        )
        return cur.rowcount


def sync_rankings(args: argparse.Namespace) -> dict[str, Any]:
    rows = load_rows(args)
    stats = {
        "rows": len(rows),
        "fifaMenRows": len([row for row in rows if row.ranking_type == "fifa_men"]),
        "uefaClubRows": len([row for row in rows if row.ranking_type == "uefa_club"]),
        "inserted": 0,
        "updated": 0,
        "dryRun": 0,
        "mappedTeams": 0,
        "resetUnrankedTeams": 0,
    }
    if args.dry_run:
        stats["dryRun"] = len(rows)
        stats["sample"] = [
            {
                "type": row.ranking_type,
                "rank": row.rank,
                "team": row.team_name,
                "points": row.points,
            }
            for row in rows[:10]
        ]
        return stats

    with db_connection() as conn:
        for row in rows:
            team_id = ensure_ranked_team(conn, row)
            stats["mappedTeams"] += 1
            action = upsert_ranking(conn, row, team_id)
            stats[action] += 1
        stats["resetUnrankedTeams"] = reset_unranked_classifications(conn)
    return stats


def main() -> None:
    args = parse_args()
    stats = sync_rankings(args)
    print("Team rankings sync complete.")
    print(json.dumps(stats, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()

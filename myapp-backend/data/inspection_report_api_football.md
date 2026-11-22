# API-Football Preparation Inspection Report

Generated: 2026-07-10

## Project Layout

- Backend: `myapp-backend`
- Frontend: `frontend`
- PostgreSQL config discovered in:
  - `myapp-backend/.env`
  - `myapp-backend/src/config/db.js`
- Main fake seed script: `myapp-backend/seed_database.py`
- Empty/placeholder seed script files found:
  - `myapp-backend/scripts/seed_countries.py`
  - `myapp-backend/scripts/seed_competitions.py`
  - `myapp-backend/scripts/seed_teams.py`
  - `myapp-backend/scripts/seed_players.py`
  - `myapp-backend/scripts/update_matches.py`

## Discovered Tables And Row Counts

| Table | Rows |
| --- | ---: |
| countries | 250 |
| competitions | 5 |
| seasons | 1 |
| team_competitions | 100 |
| teams | 100 |
| players | 2500 |
| player_transfers | 0 |
| matches | 1500 |
| news | 300 |
| users | 50 |

Tables not found: `competition_seasons`, `user_favorites`.

## Discovered Columns

### countries

- `id` bigint primary key
- `name` text not null unique
- `code` character not null unique
- `flag` text nullable
- `continent` text not null
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### competitions

- `id` bigint primary key
- `api_id` integer unique nullable
- `country_id` bigint nullable FK to `countries.id`
- `name` text not null
- `type` varchar not null
- `logo` text nullable
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### seasons

- `id` bigint primary key
- `name` varchar not null unique
- `start_date` date not null
- `end_date` date not null
- `is_current` boolean default `false`
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### team_competitions

- `id` bigint primary key
- `team_id` bigint not null FK to `teams.id`
- `competition_id` bigint not null FK to `competitions.id`
- `season_id` bigint not null FK to `seasons.id`

### teams

- `id` bigint primary key
- `api_id` integer unique nullable
- `country_id` bigint nullable FK to `countries.id`
- `name` text not null
- `short_name` varchar nullable
- `code` varchar nullable
- `founded` integer nullable
- `stadium` text nullable
- `logo` text nullable
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### players

- `id` bigint primary key
- `api_id` integer unique nullable
- `country_id` bigint nullable FK to `countries.id`
- `current_team_id` bigint nullable FK to `teams.id`
- `first_name` text nullable
- `last_name` text nullable
- `full_name` text not null
- `birth_date` date nullable
- `height` integer nullable
- `weight` integer nullable
- `position` varchar nullable
- `photo` text nullable
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### player_transfers

- `id` bigint primary key
- `player_id` bigint not null FK to `players.id`
- `from_team_id` bigint nullable FK to `teams.id`
- `to_team_id` bigint nullable FK to `teams.id`
- `transfer_type` varchar nullable
- `transfer_fee` bigint nullable
- `transfer_date` date nullable

### matches

- `id` bigint primary key
- `api_id` integer unique nullable
- `competition_id` bigint not null FK to `competitions.id`
- `season_id` bigint not null FK to `seasons.id`
- `home_team_id` bigint not null FK to `teams.id`
- `away_team_id` bigint not null FK to `teams.id`
- `stadium` text nullable
- `round` varchar nullable
- `match_date` timestamp not null
- `status` varchar nullable
- `home_score` integer default `0`
- `away_score` integer default `0`
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

### news

- `id` bigint primary key
- `title` text not null
- `content` text nullable
- `image` text nullable
- `source` text nullable
- `url` text nullable
- `published_at` timestamp nullable
- `created_at` timestamp default `CURRENT_TIMESTAMP`

### users

- `id` bigint primary key
- `username` varchar not null unique
- `email` text not null unique
- `password` text not null
- `profile_picture` text nullable
- `created_at` timestamp default `CURRENT_TIMESTAMP`
- `updated_at` timestamp default `CURRENT_TIMESTAMP`

## Foreign Keys

- `competitions.country_id` -> `countries.id`
- `teams.country_id` -> `countries.id`
- `players.country_id` -> `countries.id`
- `players.current_team_id` -> `teams.id`
- `player_transfers.player_id` -> `players.id`
- `player_transfers.from_team_id` -> `teams.id`
- `player_transfers.to_team_id` -> `teams.id`
- `team_competitions.team_id` -> `teams.id`
- `team_competitions.competition_id` -> `competitions.id`
- `team_competitions.season_id` -> `seasons.id`
- `matches.competition_id` -> `competitions.id`
- `matches.season_id` -> `seasons.id`
- `matches.home_team_id` -> `teams.id`
- `matches.away_team_id` -> `teams.id`

## Unique Constraints And Indexes

- Primary keys exist on every discovered table.
- Unique constraints:
  - `countries.name`
  - `countries.code`
  - `competitions.api_id`
  - `teams.api_id`
  - `players.api_id`
  - `matches.api_id`
  - `seasons.name`
  - `team_competitions(team_id, competition_id, season_id)`
  - `users.username`
  - `users.email`
- Existing non-primary indexes are only the unique indexes listed above.

## Asset Directories Found

- `frontend/public/assets` exists, no generated subfolder files were found.
- `myapp-backend/src/public/assets/competitions`: 5 files.
- `myapp-backend/src/public/assets/flags`: 250 files.
- `myapp-backend/src/public/assets/teams`: 75 files.
- `myapp-backend/src/public/assets/news`: exists, no files found.
- `myapp-backend/src/public/assets/players`: exists, no files found.
- `myapp-backend/public/assets`: not found.

The cleanup script preserves folders, flags by default, placeholder/default files, `.gitkeep`, and README files.

## Proposed Cleanup Order

The cleanup script derives the order from actual foreign keys at runtime. With the current schema and default country/user preservation, dry-run reported:

1. `matches`
2. `news`
3. `player_transfers`
4. `team_competitions`
5. `players`
6. `competitions`
7. `seasons`
8. `teams`

`countries` are preserved by default because the table contains complete country data. `users` are preserved by default, even though the current 50 records look like development users from `seed_database.py`.

## Proposed Schema Changes

Migration file: `database/migrations/001_prepare_api_football.sql`

- Keep local bigint primary keys.
- Convert API-backed `api_id` columns from integer to bigint for:
  - `competitions`
  - `teams`
  - `players`
  - `matches`
- Add API sync metadata only to API-backed tables:
  - `api_updated_at TIMESTAMPTZ`
  - `synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- Convert `matches.match_date` from `TIMESTAMP` to `TIMESTAMPTZ` using UTC interpretation.
- Add `api_sync_runs` request tracking table.
- Add missing useful indexes for FK/filter columns.
- Additional bootstrap migration file: `database/migrations/002_api_football_bootstrap_support.sql`
  - Adds `countries.api_id`.
  - Adds `competition_seasons`.
  - Adds `standings`.
  - Adds non-breaking API-Football fixture/team/player fields used by bootstrap sync.
- No automatic column renames. The live schema already uses `home_team_id` and `away_team_id`.
- Safe backend-only compatibility fixes were applied for model/controller code that still referenced missing `matches.home_team`, `matches.away_team`, or `competitions.country` columns.

## Generated Preparation Files

- `scripts/backup_database.ps1`
- `scripts/apply_migration.ps1`
- `scripts/prepare_for_api_football.py`
- `scripts/validate_api_football_readiness.py`
- `database/migrations/001_prepare_api_football.sql`
- `scripts/api_football/`
- `data/api_football_request_budget.json`
- `data/asset_cleanup_manifest.json`
- `.env.example`
- `requirements.txt`

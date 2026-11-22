# Matches Schema Validation Report

Generated: 2026-07-11T04:24:18.680132+00:00

## Required Tables
- matches: present
- match_events: present
- match_team_statistics: present
- match_lineups: present
- match_lineup_players: present
- match_player_statistics: present
- venues: present
- coaches: present

## Checks

| Check | Count | Status |
| --- | ---: | --- |
| duplicate match api_ids | 0 | PASS |
| orphan home_team_id | 0 | PASS |
| orphan away_team_id | 0 | PASS |
| orphan competition_season_id | 0 | PASS |
| orphan event match_ids | 0 | PASS |
| orphan player ids | 0 | PASS |
| duplicate team stats | 0 | PASS |
| duplicate lineups | 0 | PASS |
| duplicate player stats | 0 | PASS |
| invalid percentages | 0 | PASS |
| negative goals | 0 | PASS |
| home_team_id = away_team_id | 0 | PASS |
| missing kickoff_at | 0 | PASS |

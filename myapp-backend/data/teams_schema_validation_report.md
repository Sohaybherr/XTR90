# Teams Schema Validation Report

## Row Counts

- teams: 98
- venues: 153
- team_venues: 157
- team_competition_seasons: 161
- team_squad_players: 2874
- team_season_statistics: 0
- team_goal_statistics: 0
- team_lineup_statistics: 0
- team_coaches: 0
- team_trophies: 0
- team_form_snapshots: 0
- team_standing_snapshots: 58

## Checks

- OK: duplicate team api_ids: 0
- OK: duplicate normalized team names: 0
- OK: teams without country: 0
- OK: teams with external logo paths: 0
- OK: duplicate venues: 0
- OK: orphan teams.country_id: 0
- OK: orphan team_venues.venue_id: 0
- OK: orphan team_squad_players.player_id: 0
- OK: orphan team_coaches.coach_id: 0
- OK: orphan team_competition_seasons.competition_season_id: 0
- OK: duplicate current squad records: 0
- OK: duplicate season statistics: 0
- OK: invalid percentages: 0
- OK: negative statistics: 0
- OK: team linked to same default venue multiple times: 0
- OK: matches with missing team references: 0
- OK: player transfers with missing teams: 0

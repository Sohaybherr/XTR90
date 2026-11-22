from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from api_football.mappers.common import parse_percentage, split_grid
from api_football.mappers.event_mapper import map_events
from api_football.mappers.fixture_mapper import map_fixture
from api_football.mappers.lineup_mapper import map_lineups
from api_football.mappers.player_mapper import map_player
from api_football.mappers.player_match_statistics_mapper import map_player_match_statistics
from api_football.mappers.team_mapper import map_team
from api_football.mappers.team_statistics_mapper import map_team_season_statistics, map_team_statistics
from api_football.mappers.team_trophy_mapper import map_team_trophies
from api_football.mappers.venue_mapper import map_venue


class ApiFootballMapperTests(unittest.TestCase):
    def test_percentage_parsing(self) -> None:
        self.assertEqual(parse_percentage("56%"), Decimal("56"))
        self.assertEqual(parse_percentage("84.5%"), Decimal("84.5"))
        self.assertIsNone(parse_percentage(None))

    def test_grid_parsing(self) -> None:
        self.assertEqual(split_grid("2:1"), (2, 1))
        self.assertEqual(split_grid("bad"), (None, None))

    def test_fixture_mapper_handles_extra_time_and_penalties(self) -> None:
        mapped = map_fixture(
            {
                "fixture": {
                    "id": 100,
                    "date": "2026-07-11T20:00:00+00:00",
                    "timestamp": 1783800000,
                    "timezone": "UTC",
                    "referee": "A Referee",
                    "status": {"long": "Match Finished", "short": "AET", "elapsed": 120, "extra": 3},
                    "venue": {"name": "Main Stadium"},
                },
                "league": {"round": "Final"},
                "teams": {"home": {"winner": True}, "away": {"winner": False}},
                "goals": {"home": 2, "away": 2},
                "score": {
                    "halftime": {"home": 1, "away": 0},
                    "fulltime": {"home": 2, "away": 2},
                    "extratime": {"home": 0, "away": 0},
                    "penalty": {"home": 5, "away": 4},
                },
            },
            1,
            2,
            3,
            4,
        )
        self.assertEqual(mapped["status_short"], "AET")
        self.assertEqual(mapped["penalty_home"], 5)
        self.assertEqual(mapped["home_winner"], True)

    def test_event_mapper_var_event_with_missing_player(self) -> None:
        mapped = map_events(
            {
                "events": [
                    {
                        "time": {"elapsed": 77, "extra": None},
                        "team": {"id": 50},
                        "player": {"id": None},
                        "type": "Var",
                        "detail": "Goal Disallowed",
                    }
                ]
            }
        )
        self.assertEqual(mapped[0]["event_type"], "Var")
        self.assertIsNone(mapped[0]["player_api_id"])
        self.assertTrue(mapped[0]["event_key"])

    def test_team_statistics_mapper_keeps_unknown_statistics(self) -> None:
        mapped = map_team_statistics(
            [
                {
                    "team": {"id": 10},
                    "statistics": [
                        {"type": "Ball Possession", "value": "56%"},
                        {"type": "Free Kicks", "value": 12},
                    ],
                }
            ]
        )
        self.assertEqual(mapped[0]["ball_possession"], Decimal("56"))
        self.assertEqual(mapped[0]["extra_statistics"], {"Free Kicks": 12})

    def test_team_statistics_mapper_keeps_half_statistics(self) -> None:
        mapped = map_team_statistics(
            [
                {
                    "team": {"id": 10},
                    "statistics": [
                        {"type": "Total Shots", "value": 8},
                        {"type": "goals_prevented", "value": "-0.30"},
                    ],
                    "statistics_1h": [
                        {"type": "Total Shots", "value": 5},
                        {"type": "Ball Possession", "value": "60%"},
                    ],
                    "statistics_2h": [
                        {"type": "Total Shots", "value": 3},
                        {"type": "goals_prevented", "value": None},
                    ],
                }
            ]
        )
        self.assertEqual(mapped[0]["total_shots"], 8)
        self.assertEqual(mapped[0]["extra_statistics"]["goals_prevented"], "-0.30")
        self.assertEqual(mapped[0]["extra_statistics"]["first_half"]["total_shots"], 5)
        self.assertEqual(mapped[0]["extra_statistics"]["first_half"]["ball_possession"], Decimal("60"))
        self.assertEqual(mapped[0]["extra_statistics"]["second_half"]["total_shots"], 3)
        self.assertEqual(mapped[0]["extra_statistics"]["second_half"]["extra_statistics"], {"goals_prevented": None})

    def test_team_mapper_uses_local_logo_path(self) -> None:
        mapped = map_team({"team": {"id": 33, "name": "Manchester United", "code": "MUN", "logo": "https://cdn/team.png", "national": False}})
        self.assertEqual(mapped["logo_path"], "/assets/teams/team_33.png")
        self.assertEqual(mapped["logo_url"], "https://cdn/team.png")
        self.assertNotIn("stadium", mapped)

    def test_venue_mapper_uses_local_image_path(self) -> None:
        mapped = map_venue({"venue": {"id": 556, "name": "Old Trafford", "image": "https://cdn/venue.png", "capacity": "76000"}})
        self.assertEqual(mapped["image_path"], "/assets/venues/venue_556.png")
        self.assertEqual(mapped["image_url"], "https://cdn/venue.png")
        self.assertEqual(mapped["capacity"], 76000)

    def test_player_mapper_fallback_name_for_sparse_squad_rows(self) -> None:
        mapped = map_player({"player": {"id": 586837, "position": "Midfielder", "photo": "https://cdn/player.png"}})
        self.assertEqual(mapped["name"], "Player 586837")
        self.assertEqual(mapped["firstname"], "Player")
        self.assertEqual(mapped["lastname"], "586837")
        self.assertEqual(mapped["photo_path"], "/assets/players/player_586837.png")

    def test_team_season_statistics_mapper_goal_timings_and_lineups(self) -> None:
        mapped = map_team_season_statistics(
            {
                "response": {
                    "form": "WWD",
                    "fixtures": {"played": {"home": 1, "away": 2, "total": 3}, "wins": {"home": 1, "away": 1, "total": 2}},
                    "goals": {
                        "for": {"total": {"home": 2, "away": 3, "total": 5}, "average": {"home": "2.0", "away": "1.5", "total": "1.67"}, "minute": {"0-15": {"total": 2, "percentage": "40%"}}},
                        "against": {"minute": {"16-30": {"total": 1, "percentage": "20%"}}},
                    },
                    "penalty": {"scored": {"total": 1, "percentage": "50%"}, "missed": {"total": 1}, "total": 2},
                    "lineups": [{"formation": "4-3-3", "played": 4}],
                    "custom": {"kept": True},
                }
            }
        )
        self.assertEqual(mapped["fixtures_played_total"], 3)
        self.assertEqual(mapped["goals_for_total"], 5)
        self.assertEqual(mapped["penalties_percentage"], Decimal("50"))
        self.assertEqual(mapped["goal_timings"][0]["minute_from"], 0)
        self.assertEqual(mapped["lineups"], [{"formation": "4-3-3", "played": 4}])
        self.assertEqual(mapped["extra_statistics"], {"custom": {"kept": True}})

    def test_team_trophy_mapper_normalizes_rows(self) -> None:
        mapped = map_team_trophies({"response": [{"league": "Premier League", "country": "England", "season": "2025", "place": "Winner"}]})
        self.assertEqual(mapped[0]["competition_name"], "Premier League")
        self.assertEqual(mapped[0]["place"], "Winner")

    def test_lineup_mapper_missing_coach_and_player_without_local_id(self) -> None:
        mapped = map_lineups(
            [
                {
                    "team": {"id": 1},
                    "formation": "4-3-3",
                    "coach": {},
                    "startXI": [{"player": {"id": None, "name": "Unknown", "number": 9, "pos": "F", "grid": "2:1"}}],
                    "substitutes": [],
                }
            ]
        )
        self.assertIsNone(mapped[0]["coach_api_id"])
        self.assertEqual(mapped[0]["players"][0]["grid_row"], 2)
        self.assertEqual(mapped[0]["players"][0]["lineup_type"], "STARTING_XI")

    def test_player_match_statistics_mapper_numeric_strings(self) -> None:
        mapped = map_player_match_statistics(
            [
                {
                    "team": {"id": 20},
                    "players": [
                        {
                            "player": {"id": 30},
                            "statistics": [
                                {
                                    "games": {"number": "7", "position": "M", "rating": "7.2", "captain": False, "substitute": False, "minutes": 90},
                                    "passes": {"total": 50, "accuracy": "84%"},
                                    "cards": {"yellow": 1, "red": 0},
                                    "custom": {"kept": True},
                                }
                            ],
                        }
                    ],
                }
            ]
        )
        self.assertEqual(mapped[0]["rating"], Decimal("7.2"))
        self.assertEqual(mapped[0]["passes_accuracy"], Decimal("84"))
        self.assertEqual(mapped[0]["extra_statistics"], {"custom": {"kept": True}})


if __name__ == "__main__":
    unittest.main()

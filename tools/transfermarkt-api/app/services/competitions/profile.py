from dataclasses import dataclass

from app.services.base import TransfermarktBase
from app.utils.utils import extract_from_url
from app.utils.xpath import Competitions


@dataclass
class TransfermarktCompetitionProfile(TransfermarktBase):
    competition_id: str = None
    season_id: str = None
    URL: str = "https://www.transfermarkt.com/world-cup/startseite/pokalwettbewerb/{competition_id}"

    def __post_init__(self) -> None:
        self.URL = self.URL.format(competition_id=self.competition_id)
        if self.season_id:
            self.URL = f"{self.URL}/saison_id/{self.season_id}"
        self.page = self.request_url_page()
        if not self.get_text_by_xpath(Competitions.Profile.NAME) and not self.get_text_by_xpath(Competitions.Profile.IMAGE):
            self.raise_exception_if_not_found(xpath=Competitions.Profile.NAME)

    def get_competition_profile(self) -> dict:
        self.response["id"] = self.competition_id
        self.response["name"] = (
            self.get_text_by_xpath(Competitions.Profile.NAME)
            or self.get_text_by_xpath(Competitions.Profile.IMAGE_ALT)
            or self.competition_id
        )
        self.response["seasonId"] = extract_from_url(
            self.get_text_by_xpath(Competitions.Profile.URL),
            "season_id",
        ) or self.season_id
        self.response["imageUrl"] = self.get_text_by_xpath(Competitions.Profile.IMAGE)
        return self.response

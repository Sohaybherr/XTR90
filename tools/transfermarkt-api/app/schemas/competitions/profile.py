from typing import Optional

from pydantic import HttpUrl

from app.schemas.base import AuditMixin, TransfermarktBaseModel


class CompetitionProfile(TransfermarktBaseModel, AuditMixin):
    id: str
    name: str
    season_id: Optional[str] = None
    image_url: Optional[HttpUrl] = None

from datetime import date
from typing import Optional

from app.schemas.base import AuditMixin, TransfermarktBaseModel


class PlayerTransferClub(TransfermarktBaseModel):
    id: Optional[str]
    name: Optional[str]


class PlayerTransfer(TransfermarktBaseModel):
    id: Optional[str]
    club_from: PlayerTransferClub
    club_to: PlayerTransferClub
    date: Optional[date]
    upcoming: bool
    season: Optional[str]
    market_value: Optional[int]
    fee: Optional[int]


class PlayerTransfers(TransfermarktBaseModel, AuditMixin):
    id: str
    transfers: list[PlayerTransfer]
    youth_clubs: Optional[list[str]]

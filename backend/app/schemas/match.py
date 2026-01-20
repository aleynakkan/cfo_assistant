from pydantic import BaseModel, Field

class MatchCreate(BaseModel):
    planned_item_id: str
    transaction_id: str
    matched_amount: float = Field(gt=0)
    match_type: str = "MANUAL"  # MANUAL/AUTO

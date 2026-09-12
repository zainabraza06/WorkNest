from fastapi import APIRouter, Depends

from app.deps import verify_service_key
from app.schemas import PriceRequest, PriceResponse
from app.services import pricing

router = APIRouter(prefix="/price", tags=["pricing"], dependencies=[Depends(verify_service_key)])


@router.post("/suggest", response_model=PriceResponse)
def suggest(request: PriceRequest) -> PriceResponse:
    """Fair-price range for a job, so clients don't overpay and workers aren't underpaid."""
    return PriceResponse(**pricing.suggest_price(request))

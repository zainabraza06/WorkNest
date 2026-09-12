from fastapi import APIRouter, Depends

from app.deps import verify_service_key
from app.schemas import TrustFeatures, TrustResponse
from app.services import trust

router = APIRouter(prefix="/trust", tags=["trust"], dependencies=[Depends(verify_service_key)])


@router.post("/score", response_model=TrustResponse)
def score(features: TrustFeatures) -> TrustResponse:
    return TrustResponse(**trust.score_worker(features))


@router.post("/score/batch", response_model=list[TrustResponse])
def score_batch(batch: list[TrustFeatures]) -> list[TrustResponse]:
    return [TrustResponse(**trust.score_worker(f)) for f in batch]

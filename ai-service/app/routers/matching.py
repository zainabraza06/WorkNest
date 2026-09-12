from fastapi import APIRouter, Depends

from app.deps import verify_service_key
from app.schemas import MatchRequest, MatchResponse
from app.services import matching

router = APIRouter(prefix="/match", tags=["matching"], dependencies=[Depends(verify_service_key)])


@router.post("/workers", response_model=MatchResponse)
def match_workers(request: MatchRequest) -> MatchResponse:
    """Ranks the candidate workers the backend shortlisted against a natural-language query."""
    return MatchResponse(results=matching.rank(request), model=matching.MODEL_NAME)

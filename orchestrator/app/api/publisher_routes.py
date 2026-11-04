# The Jira Publisher chat: GET /publisher is the page, POST /publisher/message talks
# to the agent.
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from orchestrator.app.core.config import get_settings
from orchestrator.app.core.exceptions import OrchestratorError
from orchestrator.app.publisher.service import PublisherChat

router = APIRouter(prefix="/publisher", tags=["publisher"])

PAGE = Path(__file__).resolve().parent.parent / "publisher" / "index.html"


class MessageRequest(BaseModel):
    message: str = Field(max_length=20000)
    session_id: str | None = None


class MessageResponse(BaseModel):
    session_id: str
    reply: str
    can_confirm: bool = False


@lru_cache(maxsize=1)
def get_publisher_chat() -> PublisherChat:
    """One chat service per server, so sessions survive between requests."""
    return PublisherChat(get_settings())


@router.get("", response_class=HTMLResponse, include_in_schema=False)
def publisher_page() -> HTMLResponse:
    """The Jira Publisher chat page."""
    return HTMLResponse(PAGE.read_text(encoding="utf-8"))


@router.post("/message", response_model=MessageResponse)
def publisher_message(
    request: MessageRequest, chat: PublisherChat = Depends(get_publisher_chat)
) -> MessageResponse:
    """Give the agent the user's message and return its reply."""
    try:
        reply = chat.send(request.session_id, request.message)
    except OrchestratorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return MessageResponse(
        session_id=reply.session_id,
        reply=reply.text,
        can_confirm=reply.can_confirm,
    )

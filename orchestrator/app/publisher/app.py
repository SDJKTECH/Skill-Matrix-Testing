# The Jira Publisher as its own small server, separate from the orchestrator:
#   python -m uvicorn orchestrator.app.publisher.app:app --port 8001
# It has no poller, no database and no task pipeline. It only serves the chat page
# and talks to the jira-publisher agent.
from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from orchestrator.app.api.publisher_routes import router as publisher_router

app = FastAPI(
    title="Jira Publisher",
    description="Turns a requirement into Stories and Subtasks in the SMT project.",
)
app.include_router(publisher_router)


@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    """Send the root address to the chat page."""
    return RedirectResponse("/publisher")

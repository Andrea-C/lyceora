"""AG-UI server endpoint + learning-signal inbox (FastAPI).

Two responsibilities:
  1. POST /agent            — standard AG-UI run endpoint (RunAgentInput -> event stream)
  2. POST /learning/signals — frontend posts LearningSignal JSON (user half of the signal)

The server also mirrors its own trace (tool results, errors, overrides) into the
same inbox (agent half). The distiller reads learning/inbox/*.jsonl later — the
interface is the only place that sees both what the agent did and what the human
did about it, so both halves land in one stream.
"""
import datetime
import json
import pathlib
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from ag_ui.core import (
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageChunkEvent,
    ToolCallChunkEvent,
)
from ag_ui.encoder import EventEncoder

app = FastAPI()
INBOX = pathlib.Path("learning/inbox")


def log_signal(record: dict) -> None:
    """Append one LearningSignal (see learning-signal.schema.json) to today's inbox file."""
    INBOX.mkdir(parents=True, exist_ok=True)
    record.setdefault("ts", datetime.datetime.now(datetime.timezone.utc).isoformat())
    path = INBOX / f"signals-{datetime.date.today()}.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


@app.post("/learning/signals")
async def learning_signals(record: dict):
    # Validate against learning-signal.schema.json in production use.
    log_signal(record)
    return {"ok": True}


@app.post("/agent")
async def agent_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def gen():
        try:
            yield encoder.encode(RunStartedEvent(
                type=EventType.RUN_STARTED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))

            # Resolve the model via models.yaml (agents.orchestrator -> tier chain).
            # Any OpenAI-compatible client works when api_mode == chat_completions:
            #   client = OpenAI(base_url=provider.base_url,
            #                   api_key=os.environ[provider.api_key_env])
            message_id = str(uuid.uuid4())

            # ... stream provider deltas, translating to AG-UI events:
            #   text delta      -> TextMessageChunkEvent(message_id=..., delta=...)
            #   tool call delta -> ToolCallChunkEvent(tool_call_id=...,
            #                        tool_call_name=..., delta=...)
            # Mirror agent-half signals into the inbox as they happen:
            #   log_signal({"thread_id": input_data.thread_id,
            #               "run_id": input_data.run_id, "actor": "agent",
            #               "signal": "tool_result", "context": tool_name,
            #               "event_refs": ["TOOL_CALL_RESULT"]})

            yield encoder.encode(RunFinishedEvent(
                type=EventType.RUN_FINISHED,
                thread_id=input_data.thread_id, run_id=input_data.run_id))
        except Exception as e:
            log_signal({"thread_id": input_data.thread_id, "run_id": input_data.run_id,
                        "actor": "system", "signal": "run_error", "context": str(e)})
            yield encoder.encode(RunErrorEvent(type=EventType.RUN_ERROR, message=str(e)))

    return StreamingResponse(gen(), media_type=encoder.get_content_type())

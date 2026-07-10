// Minimal AG-UI client. HttpAgent covers the standard endpoint contract;
// subclass AbstractAgent only when wrapping a non-AG-UI framework.
import { HttpAgent, AbstractAgent, RunAgentInput, BaseEvent, EventType } from "@ag-ui/client";
import { Observable } from "rxjs";

export const agent = new HttpAgent({ url: "http://localhost:8000/agent" });

// Adapter pattern: run a native framework inside run(), translate its events.
export class WrappedAgent extends AbstractAgent {
  run(input: RunAgentInput) {
    const { threadId, runId } = input;
    return () => new Observable<BaseEvent>((observer) => {
      observer.next({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
      // ... invoke the native framework; forward TEXT_MESSAGE_*/TOOL_CALL_* events ...
      observer.next({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
      observer.complete();
    });
  }
}

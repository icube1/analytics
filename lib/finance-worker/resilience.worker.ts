import type {
  ResilienceWorkerRequest,
  ResilienceWorkerResponse,
} from "./resilience-contract";
import { handleResilienceWorkerRequest } from "./resilience-worker-handler";

interface ResilienceWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ResilienceWorkerRequest>) => void,
  ): void;
  postMessage(message: ResilienceWorkerResponse): void;
}

const workerScope = self as unknown as ResilienceWorkerScope;

workerScope.addEventListener("message", (event) => {
  void handleResilienceWorkerRequest(event.data).then((response) => {
    workerScope.postMessage(response);
  });
});

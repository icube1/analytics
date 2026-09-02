import type { FinanceWorkerRequest, FinanceWorkerResponse } from "./contract";
import { handleFinanceWorkerRequest } from "./handler";

interface FinanceWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<FinanceWorkerRequest>) => void,
  ): void;
  postMessage(message: FinanceWorkerResponse): void;
}

const workerScope = self as unknown as FinanceWorkerScope;

workerScope.addEventListener("message", (event) => {
  workerScope.postMessage(handleFinanceWorkerRequest(event.data));
});

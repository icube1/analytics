import type { BrokerWorkerRequest, BrokerWorkerResponse } from "./worker-contract";
import { handleBrokerWorkerRequest } from "./worker-handler";

interface BrokerWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<BrokerWorkerRequest>) => void,
  ): void;
  postMessage(message: BrokerWorkerResponse): void;
}

const workerScope = self as unknown as BrokerWorkerScope;

workerScope.addEventListener("message", (event) => {
  workerScope.postMessage(handleBrokerWorkerRequest(event.data));
});

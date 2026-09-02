import { renderCards, type ObservabilitySnapshot } from "./dashboard";

const DATA_URL = "./data/latest.json";

async function main(): Promise<void> {
  const collectedAt = document.querySelector<HTMLElement>("#collected-at");
  const cards = document.querySelector<HTMLElement>("#cards");
  try {
    const snapshot = (await fetch(DATA_URL, { cache: "no-store" }).then((r) => r.json())) as ObservabilitySnapshot;
    if (collectedAt) collectedAt.textContent = `Snapshot ${snapshot.collectedAt}`;
    if (cards) cards.innerHTML = renderCards(snapshot);
  } catch (error) {
    if (collectedAt) collectedAt.textContent = error instanceof Error ? error.message : "Load failed";
  }
}

void main();

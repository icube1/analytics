export type ObservabilitySnapshot = {
  collectedAt: string;
  host: { cpuPercent: number; memoryRssMb: number; disk: { usedPercent: number; freeMb: number } };
  nginx?: { requests: number; latencyMs: { p95: number } };
  services: {
    nodeApp?: { memoryRssMb?: number; heapUsedMb?: number; imports?: { brokerSuccess: number; brokerFailed: number }; cache?: { marketBenchmark?: { fresh: boolean } } };
    financeApi?: { uptimeSecs: number; http: { requests: number }; jobs?: { pending: number; running: number } };
  };
};

export function formatUptime(seconds: number): string {
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function renderCards(snapshot: ObservabilitySnapshot): string {
  const cards = [
    ["Host CPU", `${snapshot.host.cpuPercent.toFixed(1)}%`],
    ["Host memory", `${snapshot.host.memoryRssMb.toFixed(1)} MB`],
    ["Disk used", `${snapshot.host.disk.usedPercent.toFixed(1)}%`],
  ];
  if (snapshot.nginx) cards.push(["Nginx p95", `${snapshot.nginx.latencyMs.p95.toFixed(0)} ms`]);
  const node = snapshot.services.nodeApp;
  if (node) {
    cards.push(["Node RSS", `${(node.memoryRssMb ?? 0).toFixed(1)} MB`]);
    cards.push(["Imports", `${node.imports?.brokerSuccess ?? 0}/${node.imports?.brokerFailed ?? 0}`]);
    cards.push(["Cache", node.cache?.marketBenchmark?.fresh ? "fresh" : "stale"]);
  }
  const api = snapshot.services.financeApi;
  if (api) {
    cards.push(["API uptime", formatUptime(api.uptimeSecs)]);
    cards.push(["Jobs", `${api.jobs?.pending ?? 0} pending`]);
  }
  return cards.map(([label, value]) => `<article class="card"><h3>${label}</h3><p>${value}</p></article>`).join("");
}

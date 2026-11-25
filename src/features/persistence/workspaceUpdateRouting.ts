export type WorkspaceUpdate = { revision: number; keys: readonly string[] };

const pagePrefixes: Record<string, readonly string[]> = {
  todos: ["todo:"],
  diary: ["diary:"],
  ledger: ["ledger:"],
  english: ["english:", "reading:", "listening:", "writing:"],
  learn: ["english:", "reading:", "listening:", "writing:"],
  expressions: ["expressions:"],
  inspirations: ["inspiration:"],
  fitness: ["fitness:"],
  mywork: ["mywork:"],
  knowledge: ["knowledge:"],
};

export function workspaceUpdateAffectsPage(page: string, keys: readonly string[]): boolean {
  if (page === "overview") return keys.some((key) => !key.startsWith("workspace:"));
  const prefixes = pagePrefixes[page] ?? [];
  return keys.some((key) => prefixes.some((prefix) => key.startsWith(prefix)));
}

export function englishRefreshTargets(keys: readonly string[]): Array<"content" | "wrongbook" | "reports"> {
  const targets: Array<"content" | "wrongbook" | "reports"> = [];
  if (keys.some((key) => key.startsWith("english:") && (key.includes("library") || key.includes("learning-stats")))) targets.push("content");
  if (keys.some((key) => key.includes("wrongbook"))) targets.push("wrongbook");
  if (keys.some((key) => key.startsWith("english:") && key.includes("reports"))) targets.push("reports");
  return targets;
}

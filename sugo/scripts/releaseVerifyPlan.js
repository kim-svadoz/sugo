export function releaseVerificationScripts(version, scope) {
  const patch = Number(version.split(".")[2] ?? 0);
  if (patch % 10 === 0 || scope === "full") {
    return ["cold-smoke-core.mjs", "dashboard-e2e.mjs", "cold-smoke.mjs"];
  }
  if (scope === "plugin") return ["cold-smoke-core.mjs"];
  return ["cold-smoke-core.mjs", "dashboard-e2e.mjs"];
}

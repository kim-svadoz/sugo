import { createRequire as __sugoCreateRequire } from "node:module";
import { fileURLToPath as __sugoFileURLToPath } from "node:url";
import { dirname as __sugoDirname } from "node:path";
const require = __sugoCreateRequire(import.meta.url);
const __filename = __sugoFileURLToPath(import.meta.url);
const __dirname = __sugoDirname(__filename);

// src/lifecycle/dashboardStartHook.ts
import { dirname as dirname4, join as join9 } from "node:path";
import { fileURLToPath } from "node:url";

// src/version.ts
function currentSugoVersion() {
  return true ? "0.42.13" : "0.0.0-dev";
}

// src/dashboard/syncAll.ts
import { readFile as readFile10 } from "node:fs/promises";

// src/dashboard/config.ts
import { userInfo } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// src/homeDir.ts
import { homedir } from "node:os";
function sugoHomeDir() {
  return process.env.SUGO_HOME_OVERRIDE ?? homedir();
}

// src/dashboard/config.ts
function settingsFilePath() {
  return join(sugoHomeDir(), ".claude", "sugo", "settings.json");
}
function currentUsername() {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}
async function resolveDashboardConfig() {
  const envUrl = process.env.SUGO_DASHBOARD_API_URL;
  if (envUrl) {
    return {
      enabled: true,
      apiUrl: envUrl,
      userId: process.env.SUGO_DASHBOARD_USER_ID ?? currentUsername(),
      // 공개 SaaS 대시보드는 API 토큰이 필요하다(웹UI에서 발급→여기 붙여넣기). self-host/로컬은 생략 가능.
      apiToken: process.env.SUGO_DASHBOARD_API_TOKEN
    };
  }
  try {
    const raw = await readFile(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    const d = parsed.dashboard;
    if (d?.enabled && d.apiUrl) {
      return { enabled: true, apiUrl: d.apiUrl, userId: d.userId ?? currentUsername(), apiToken: d.apiToken };
    }
  } catch {
  }
  return { enabled: false };
}

// src/dashboard/retryQueue.ts
import { mkdir as mkdir2, readFile as readFile2 } from "node:fs/promises";

// src/fsUtil.ts
import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var seq = 0;
async function atomicWriteFile(path, content) {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}.${seq++}`;
  await writeFile(tmpPath, content, "utf-8");
  const delays = [0, 25, 50, 100, 200];
  let lastErr;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      await rename(tmpPath, path);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  await unlink(tmpPath).catch(() => {
  });
  throw lastErr;
}
var STALE_LOCK_MS = 3e4;
async function withFileLock(lockPath, fn) {
  await mkdir(dirname(lockPath), { recursive: true });
  const maxAttempts = 40;
  const baseDelayMs = 10;
  const maxDelayMs = 250;
  let acquired = false;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.5;
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      acquired = true;
      break;
    } catch (err) {
      lastErr = err;
      const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) await unlink(lockPath).catch(() => {
      });
    }
  }
  if (!acquired) {
    throw new Error(`\uB77D \uD30C\uC77C\uC744 \uD68D\uB4DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${lockPath} (${String(lastErr)})`);
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {
    });
  }
}

// src/work/storage.ts
import { join as join2 } from "node:path";
function workRootDir() {
  return join2(sugoHomeDir(), ".claude", "sugo", "work");
}
function workspaceDir(workspace) {
  return join2(workRootDir(), workspace);
}
function workspaceFilePath(workspace) {
  return join2(workspaceDir(workspace), "workspace.json");
}
function tasksFilePath(workspace) {
  return join2(workspaceDir(workspace), "tasks.json");
}
function checkpointsDir(workspace) {
  return join2(workspaceDir(workspace), "checkpoints");
}
function specsDir(workspace) {
  return join2(workspaceDir(workspace), "specs");
}
function historyDir(workspace) {
  return join2(workspaceDir(workspace), "history");
}
function roadmapFilePath(workspace) {
  return join2(workspaceDir(workspace), "roadmap.json");
}
function roadmapLockPath(workspace) {
  return `${roadmapFilePath(workspace)}.lock`;
}
function syncRetryQueuePath() {
  return join2(workRootDir(), "sync-retry-queue.json");
}
function syncRetryQueueLockPath() {
  return `${syncRetryQueuePath()}.lock`;
}

// src/dashboard/retryQueue.ts
import { dirname as dirname2 } from "node:path";
var MAX_RETRY_QUEUE_ITEMS = 100;
var MAX_RETRY_ATTEMPTS = 5;
function discard(file, item, cause) {
  const reason = `${cause}: ${item.lastFailureReason ?? "unknown failure"}`;
  file.discardedCount = (file.discardedCount ?? 0) + 1;
  file.discardedReasons ??= {};
  file.discardedReasons[reason] = (file.discardedReasons[reason] ?? 0) + 1;
  console.warn(`[sugo] sync item discarded (${item.endpoint}): ${reason}`);
}
function failureFields(result2) {
  return {
    status: result2.permanent ? "permanent_failure" : "pending",
    lastHttpStatus: result2.httpStatus,
    lastFailureReason: result2.reason ?? "delivery failed",
    lastFailureAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function readQueueFile() {
  try {
    const raw = await readFile2(syncRetryQueuePath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}
async function writeQueueFile(file) {
  await mkdir2(dirname2(syncRetryQueuePath()), { recursive: true });
  await atomicWriteFile(syncRetryQueuePath(), JSON.stringify(file, null, 2));
}
async function enqueueRetry(endpoint, method, data, failure) {
  await withFileLock(syncRetryQueueLockPath(), async () => {
    const file = await readQueueFile();
    file.items.push({ endpoint, method, data, timestamp: (/* @__PURE__ */ new Date()).toISOString(), retryCount: 0, ...failure ? failureFields(failure) : {} });
    if (file.items.length > MAX_RETRY_QUEUE_ITEMS) {
      const removed = file.items.splice(0, file.items.length - MAX_RETRY_QUEUE_ITEMS);
      for (const item of removed) discard(file, item, "queue capacity exceeded");
    }
    await writeQueueFile(file);
  });
}
async function processRetryQueue(attempt) {
  await withFileLock(syncRetryQueueLockPath(), async () => {
    const file = await readQueueFile();
    const remaining = [];
    for (const item of file.items) {
      if (item.status === "permanent_failure") {
        remaining.push(item);
        continue;
      }
      const outcome = await attempt(item);
      const result2 = typeof outcome === "boolean" ? { ok: outcome } : outcome;
      if (result2.ok) continue;
      const retried = { ...item, ...failureFields(result2), retryCount: item.retryCount + (result2.permanent ? 0 : 1) };
      if (result2.permanent) {
        remaining.push(retried);
        continue;
      }
      if (retried.retryCount < MAX_RETRY_ATTEMPTS) remaining.push(retried);
      else discard(file, retried, "retry attempts exhausted");
    }
    await writeQueueFile({ ...file, items: remaining });
  });
}

// src/dashboard/serialize.ts
function serializeTaskStatus(status) {
  if (status === "idea") return "pending";
  if (status === "dropped") return "archived";
  return status;
}
function serializeTask(userId, workspaceName, task) {
  return {
    userId,
    workspaceName,
    id: task.id,
    title: task.title,
    project: task.project,
    status: serializeTaskStatus(task.status),
    priority: task.priority,
    description: task.description,
    summary: task.summary,
    startedAt: task.started_at,
    completedAt: task.completed_at
  };
}
function serializeHistory(userId, workspaceName, workLog) {
  return {
    userId,
    workspaceName,
    id: workLog.id,
    taskId: workLog.task_id,
    taskTitle: workLog.task_title,
    summary: workLog.summary,
    keyDecisions: workLog.key_decisions,
    filesChanged: workLog.files_changed,
    completedAt: workLog.completed_at,
    estimatedHumanHours: workLog.metrics?.estimatedHumanHours,
    userReportedHumanHours: workLog.metrics?.userReportedHumanHours,
    aiExecutionMinutes: workLog.metrics?.aiExecutionMinutes,
    estimationBasis: workLog.metrics?.estimationBasis
  };
}
function serializeCheckpoint(userId, workspaceName, cp) {
  return {
    userId,
    workspaceName,
    id: cp.id,
    title: cp.title,
    category: cp.category,
    appliesTo: cp.applies_to,
    checklist: cp.checklist,
    checkpointDate: cp.created_at,
    expiresAt: cp.expires_at
  };
}
function serializeSpec(userId, workspaceName, spec) {
  return { userId, workspaceName, id: spec.name, title: spec.name, status: "active", content: spec.content, decisionDate: spec.created_at };
}
function compactWorkResult(result2, summaryOnly = false) {
  if (!result2) return void 0;
  if (summaryOnly) {
    const { path, startedAt, endedAt, model, summary, parentTaskId, patchVersion, seed, runtimeVerified, wiringVerified, prRefs, sourceRevision } = result2;
    const report = result2.report ? {
      schemaVersion: result2.report.schemaVersion,
      kind: result2.report.kind,
      patchVersion: result2.report.patchVersion,
      completionGrade: result2.report.completionGrade,
      completedAt: result2.report.completedAt,
      bypassLabels: result2.report.bypassLabels,
      summary: result2.report.summary,
      verification: result2.report.verification,
      changedFiles: [],
      designDecisions: [],
      knownLimitations: []
    } : void 0;
    return { path, startedAt, endedAt, model, summary: summary ?? result2.report?.summary, parentTaskId, patchVersion, seed, runtimeVerified, wiringVerified, prRefs, sourceRevision, report };
  }
  return {
    ...result2,
    report: result2.report ? { ...result2.report, humanApprovals: void 0 } : void 0,
    files: result2.files?.map((file) => {
      const { path, change, diff } = file;
      const lines = diff?.split("\n");
      return {
        path,
        change,
        ...lines ? {
          additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
          deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length
        } : {
          ..."additions" in file && typeof file.additions === "number" ? { additions: file.additions } : {},
          ..."deletions" in file && typeof file.deletions === "number" ? { deletions: file.deletions } : {}
        }
      };
    })
  };
}
function compactRoadmapPayload(payload) {
  if (!payload || typeof payload !== "object" || !("nodes" in payload) || !Array.isArray(payload.nodes)) return payload;
  return { ...payload, nodes: payload.nodes.map((node) => ({
    ...node,
    workResult: compactWorkResult(node.workResult, node.level !== "task"),
    lineage: Array.isArray(node.lineage) ? node.lineage.map((entry) => ({
      ...entry,
      workResult: compactWorkResult(entry.workResult, true)
    })) : node.lineage
  })) };
}
function serializeRoadmapNode(node) {
  return {
    id: node.id,
    title: node.title,
    level: node.level,
    status: node.status,
    dependsOn: node.dependsOn,
    parent: node.parent,
    ref: node.ref,
    note: node.note,
    specPath: node.specPath,
    workResult: node.workResult,
    lineage: node.lineage,
    humanBlocker: node.humanBlocker,
    runtimeAssessment: node.runtimeAssessment
  };
}
function serializeRoadmapSnapshot(userId, workspaceName, nodes) {
  return compactRoadmapPayload({ userId, workspaceName, nodes: nodes.map(serializeRoadmapNode) });
}

// src/dashboard/schemaVersion.ts
var DASHBOARD_SYNC_SCHEMA_VERSION = 1;
var SYNC_SCHEMA_VERSION_HEADER = "x-sugo-sync-schema-version";

// src/dashboard/client.ts
var DEFAULT_TIMEOUT_MS = 5e3;
var MAX_ROADMAP_PAYLOAD_BYTES = 1024 * 1024;
function classifyHttpFailure(status) {
  return { ok: false, httpStatus: status, reason: `HTTP ${status}`, permanent: [400, 404, 405, 410, 413, 415, 422].includes(status) };
}
function withSchemaVersion(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return data;
  const obj = data;
  if (obj.schemaVersion !== void 0) return obj;
  return { ...obj, schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION };
}
var warnedNewerServer = false;
function noteServerSchemaVersion(res) {
  const raw = res.headers.get(SYNC_SCHEMA_VERSION_HEADER);
  if (!raw) return;
  const server = Number(raw);
  if (!Number.isInteger(server) || server <= DASHBOARD_SYNC_SCHEMA_VERSION || warnedNewerServer) return;
  warnedNewerServer = true;
  console.warn(
    `[sugo] \uB300\uC2DC\uBCF4\uB4DC sync \uACC4\uC57D\uC774 \uB354 \uCD5C\uC2E0\uC785\uB2C8\uB2E4(server=${server}, plugin=${DASHBOARD_SYNC_SCHEMA_VERSION}). \uD50C\uB7EC\uADF8\uC778 \uC5C5\uB370\uC774\uD2B8\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4 \u2014 \uB3D9\uAE30\uD654\uB294 \uACC4\uC18D \uC9C4\uD589\uD569\uB2C8\uB2E4.`
  );
}
async function sendOnce(apiUrl, endpoint, method, data, timeoutMs, apiToken) {
  const isRoadmap = endpoint === "/api/sync/roadmap" && method === "POST";
  const body = JSON.stringify(withSchemaVersion(isRoadmap ? compactRoadmapPayload(data) : data));
  if (isRoadmap && Buffer.byteLength(body, "utf8") > MAX_ROADMAP_PAYLOAD_BYTES) {
    return { ok: false, reason: "ROADMAP_PAYLOAD_TOO_LARGE (limit 1MiB)", permanent: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    noteServerSchemaVersion(res);
    return res.ok ? { ok: true } : classifyHttpFailure(res.status);
  } catch {
    return { ok: false, reason: "network error or timeout" };
  } finally {
    clearTimeout(timer);
  }
}
async function pushEvent(endpoint, method, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const payload = withSchemaVersion(data);
  const ok2 = await sendOnce(config.apiUrl, endpoint, method, payload, timeoutMs, config.apiToken);
  if (!ok2.ok) await enqueueRetry(endpoint, method, payload, ok2);
}
async function drainRetryQueue() {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const apiUrl = config.apiUrl;
  const apiToken = config.apiToken;
  await processRetryQueue((item) => sendOnce(apiUrl, item.endpoint, item.method, item.data, DEFAULT_TIMEOUT_MS, apiToken));
}

// src/dashboard/workResultFiles.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var SENSITIVE_PATH = /(^|\/)(\.env(?:\.|$)|\.git\/|\.aws\/|\.ssh\/|credentials?(?:\.|$)|secrets?(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx))|(^|\/)node_modules\//i;
function sanitizeReviewArtifacts(files) {
  return files.map((file) => {
    const { path, change, content, diff, unavailableReason } = file;
    if (SENSITIVE_PATH.test(path)) return { path, change, unavailableReason: "\uBBFC\uAC10 \uD30C\uC77C\uC740 Dashboard\uB85C \uC804\uC1A1\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
    return { path, change, ...content ? { content } : {}, ...diff ? { diff } : {}, ...unavailableReason ? { unavailableReason } : {} };
  });
}

// src/dashboard/sync.ts
async function syncWorkspace(ws) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace", "POST", {
    userId: config.userId,
    name: ws.name,
    projects: ws.projects,
    gitSyncedProjects: [],
    createdAt: ws.created_at,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function syncTask(workspaceName, task) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/task", "POST", serializeTask(config.userId, workspaceName, task));
}
async function syncRoadmapSnapshot(workspaceName, nodes) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/roadmap", "POST", serializeRoadmapSnapshot(config.userId, workspaceName, nodes));
  const completed = completedReviewArtifacts(nodes);
  await Promise.all(completed.flatMap((artifact) => artifact.files.map(
    (file) => pushEvent("/api/sync/review-artifact", "POST", {
      userId: config.userId,
      workspaceName,
      taskId: artifact.taskId,
      sessionId: artifact.sessionId,
      patchVersion: artifact.patchVersion,
      ...file
    }, 15e3)
  )));
}
function completedReviewArtifacts(nodes) {
  return nodes.flatMap((node) => {
    const files = sanitizeReviewArtifacts(node.workResult?.files ?? []).filter((file) => file.content || file.diff || file.unavailableReason);
    if (node.level !== "task" || files.length === 0) return [];
    const patchVersion = node.workResult?.patchVersion ?? 0;
    return [{ taskId: node.id, sessionId: `completed:${node.id}:v${patchVersion}`, patchVersion, files }];
  });
}
async function syncCheckpoint(workspaceName, checkpoint) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/checkpoint", "POST", serializeCheckpoint(config.userId, workspaceName, checkpoint));
}
async function syncHistory(workspaceName, workLog, _prRefs) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/history", "POST", serializeHistory(config.userId, workspaceName, workLog));
}
async function syncSpec(workspaceName, spec) {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/spec", "POST", serializeSpec(config.userId, workspaceName, spec));
}

// src/work/checkpoint.ts
import { mkdir as mkdir3, readdir, readFile as readFile3, rm } from "node:fs/promises";
import { join as join3 } from "node:path";

// node_modules/js-yaml/dist/js-yaml.mjs
var NOT_RESOLVED = Symbol("NOT_RESOLVED");
var MERGE_KEY = Symbol("MERGE_KEY");
function defineScalarTag(tagName, options) {
  return {
    tagName,
    nodeKind: "scalar",
    implicit: options.implicit ?? false,
    matchByTagPrefix: options.matchByTagPrefix ?? false,
    implicitFirstChars: options.implicitFirstChars ?? null,
    resolve: options.resolve,
    identify: options.identify ?? null,
    represent: options.represent ?? ((data) => String(data)),
    representTagName: options.representTagName ?? null
  };
}
function defineSequenceTag(tagName, options) {
  const carrierIsResult = options.finalize === void 0;
  return {
    tagName,
    nodeKind: "sequence",
    implicit: false,
    matchByTagPrefix: options.matchByTagPrefix ?? false,
    create: options.create,
    addItem: options.addItem,
    finalize: options.finalize ?? ((carrier) => carrier),
    carrierIsResult,
    identify: options.identify ?? null,
    represent: options.represent ?? ((data) => data),
    representTagName: options.representTagName ?? null
  };
}
function defineMappingTag(tagName, options) {
  const carrierIsResult = options.finalize === void 0;
  return {
    tagName,
    nodeKind: "mapping",
    implicit: false,
    matchByTagPrefix: options.matchByTagPrefix ?? false,
    create: options.create,
    addPair: options.addPair,
    has: options.has,
    keys: options.keys,
    get: options.get,
    finalize: options.finalize ?? ((carrier) => carrier),
    carrierIsResult,
    identify: options.identify ?? null,
    represent: options.represent ?? ((data) => data),
    representTagName: options.representTagName ?? null
  };
}
var strTag = defineScalarTag("tag:yaml.org,2002:str", {
  resolve: (source) => source,
  identify: (data) => typeof data === "string"
});
var NULL_VALUES$1 = [
  "",
  "~",
  "null",
  "Null",
  "NULL"
];
var nullCoreTag = defineScalarTag("tag:yaml.org,2002:null", {
  implicit: true,
  implicitFirstChars: [
    "",
    "~",
    "n",
    "N"
  ],
  resolve: (source) => {
    if (NULL_VALUES$1.indexOf(source) !== -1) return null;
    return NOT_RESOLVED;
  },
  identify: (object) => object === null,
  represent: () => "null"
});
var nullJsonTag = defineScalarTag("tag:yaml.org,2002:null", {
  implicit: true,
  implicitFirstChars: ["n"],
  resolve: (source, isExplicit) => {
    if (source === "null" || isExplicit && source === "") return null;
    return NOT_RESOLVED;
  },
  identify: (object) => object === null,
  represent: () => "null"
});
var NULL_VALUES = [
  "",
  "~",
  "null",
  "Null",
  "NULL"
];
var nullYaml11Tag = defineScalarTag("tag:yaml.org,2002:null", {
  implicit: true,
  implicitFirstChars: [
    "",
    "~",
    "n",
    "N"
  ],
  resolve: (source) => {
    if (NULL_VALUES.indexOf(source) !== -1) return null;
    return NOT_RESOLVED;
  },
  identify: (object) => object === null,
  represent: () => "null"
});
var TRUE_VALUES$2 = [
  "true",
  "True",
  "TRUE"
];
var FALSE_VALUES$2 = [
  "false",
  "False",
  "FALSE"
];
var boolCoreTag = defineScalarTag("tag:yaml.org,2002:bool", {
  implicit: true,
  implicitFirstChars: [
    "t",
    "T",
    "f",
    "F"
  ],
  resolve: (source) => {
    if (TRUE_VALUES$2.indexOf(source) !== -1) return true;
    if (FALSE_VALUES$2.indexOf(source) !== -1) return false;
    return NOT_RESOLVED;
  },
  identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
  represent: (object) => object ? "true" : "false"
});
var TRUE_VALUES$1 = ["true"];
var FALSE_VALUES$1 = ["false"];
var boolJsonTag = defineScalarTag("tag:yaml.org,2002:bool", {
  implicit: true,
  implicitFirstChars: ["t", "f"],
  resolve: (source) => {
    if (TRUE_VALUES$1.indexOf(source) !== -1) return true;
    if (FALSE_VALUES$1.indexOf(source) !== -1) return false;
    return NOT_RESOLVED;
  },
  identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
  represent: (object) => object ? "true" : "false"
});
var TRUE_VALUES = [
  "true",
  "True",
  "TRUE",
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON"
];
var FALSE_VALUES = [
  "false",
  "False",
  "FALSE",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var boolYaml11Tag = defineScalarTag("tag:yaml.org,2002:bool", {
  implicit: true,
  implicitFirstChars: [
    "y",
    "Y",
    "n",
    "N",
    "t",
    "T",
    "f",
    "F",
    "o",
    "O"
  ],
  resolve: (source) => {
    if (TRUE_VALUES.indexOf(source) !== -1) return true;
    if (FALSE_VALUES.indexOf(source) !== -1) return false;
    return NOT_RESOLVED;
  },
  identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
  represent: (object) => object ? "true" : "false"
});
var YAML_INTEGER_IMPLICIT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:0o[0-7]+|0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
var YAML_INTEGER_EXPLICIT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function parseYamlInteger$2(source) {
  let value = source;
  let sign = 1;
  if (value[0] === "-" || value[0] === "+") {
    if (value[0] === "-") sign = -1;
    value = value.slice(1);
  }
  if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
  if (value.startsWith("0o")) return sign * parseInt(value.slice(2), 8);
  if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
  return sign * parseInt(value, 10);
}
function resolveYamlInteger$2(source, isExplicit) {
  if (isExplicit) {
    if (!YAML_INTEGER_EXPLICIT_PATTERN$1.test(source)) return NOT_RESOLVED;
  } else if (!YAML_INTEGER_IMPLICIT_PATTERN$1.test(source)) return NOT_RESOLVED;
  const result2 = parseYamlInteger$2(source);
  return Number.isFinite(result2) ? result2 : NOT_RESOLVED;
}
var intCoreTag = defineScalarTag("tag:yaml.org,2002:int", {
  implicit: true,
  implicitFirstChars: [
    "-",
    "+",
    ..."0123456789"
  ],
  resolve: resolveYamlInteger$2,
  identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
  represent: (object) => object.toString(10)
});
var YAML_INTEGER_IMPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^-?(?:0|[1-9][0-9]*)$");
var YAML_INTEGER_EXPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function parseYamlInteger$1(source) {
  let value = source;
  let sign = 1;
  if (value[0] === "-" || value[0] === "+") {
    if (value[0] === "-") sign = -1;
    value = value.slice(1);
  }
  if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
  if (value.startsWith("0o")) return sign * parseInt(value.slice(2), 8);
  if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
  return sign * parseInt(value, 10);
}
function resolveYamlInteger$1(source, isExplicit) {
  if (isExplicit) {
    if (!YAML_INTEGER_EXPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
  } else if (!YAML_INTEGER_IMPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
  const result2 = parseYamlInteger$1(source);
  return Number.isFinite(result2) ? result2 : NOT_RESOLVED;
}
var intJsonTag = defineScalarTag("tag:yaml.org,2002:int", {
  implicit: true,
  implicitFirstChars: ["-", ..."0123456789"],
  resolve: resolveYamlInteger$1,
  identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
  represent: (object) => object.toString(10)
});
var YAML_INTEGER_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+|[-+]?(?:0|[1-9][0-9_]*))$");
function parseYamlInteger(source) {
  let value = source.replace(/_/g, "");
  let sign = 1;
  if (value[0] === "-" || value[0] === "+") {
    if (value[0] === "-") sign = -1;
    value = value.slice(1);
  }
  if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
  if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
  if (value.includes(":")) {
    let result2 = 0;
    for (const part of value.split(":")) result2 = result2 * 60 + Number(part);
    return sign * result2;
  }
  if (value !== "0" && value[0] === "0") return sign * parseInt(value, 8);
  return sign * parseInt(value, 10);
}
function resolveYamlInteger(source) {
  if (!YAML_INTEGER_PATTERN.test(source)) return NOT_RESOLVED;
  const result2 = parseYamlInteger(source);
  return Number.isFinite(result2) ? result2 : NOT_RESOLVED;
}
var intYaml11Tag = defineScalarTag("tag:yaml.org,2002:int", {
  implicit: true,
  implicitFirstChars: [
    "-",
    "+",
    ..."0123456789"
  ],
  resolve: resolveYamlInteger,
  identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
  represent: (object) => object.toString(10)
});
var YAML_FLOAT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
var YAML_FLOAT_SPECIAL_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function resolveYamlFloat$2(source) {
  if (!YAML_FLOAT_PATTERN$1.test(source)) return NOT_RESOLVED;
  let value = source.toLowerCase();
  const sign = value[0] === "-" ? -1 : 1;
  if ("+-".includes(value[0])) value = value.slice(1);
  if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  if (value === ".nan") return NaN;
  const result2 = sign * parseFloat(value);
  if (Number.isFinite(result2) || YAML_FLOAT_SPECIAL_PATTERN$1.test(source)) return result2;
  return NOT_RESOLVED;
}
function representYamlFloat$2(object) {
  if (isNaN(object)) return ".nan";
  if (object === Number.POSITIVE_INFINITY) return ".inf";
  if (object === Number.NEGATIVE_INFINITY) return "-.inf";
  if (Object.is(object, -0)) return "-0.0";
  const result2 = object.toString(10);
  return /^[-+]?[0-9]+e/.test(result2) ? result2.replace("e", ".e") : result2;
}
var floatCoreTag = defineScalarTag("tag:yaml.org,2002:float", {
  implicit: true,
  implicitFirstChars: [
    "-",
    "+",
    ".",
    ..."0123456789"
  ],
  resolve: resolveYamlFloat$2,
  identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
  represent: representYamlFloat$2
});
var YAML_FLOAT_IMPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$");
var YAML_FLOAT_EXPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function resolveYamlFloat$1(source, isExplicit) {
  if (isExplicit) {
    if (!YAML_FLOAT_EXPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
    let value = source.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".includes(value[0])) value = value.slice(1);
    if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    if (value === ".nan") return NaN;
    const result3 = sign * parseFloat(value);
    return Number.isFinite(result3) ? result3 : NOT_RESOLVED;
  }
  if (!YAML_FLOAT_IMPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
  const result2 = Number(source);
  if (Number.isFinite(result2)) return result2;
  return NOT_RESOLVED;
}
function representYamlFloat$1(object) {
  if (isNaN(object)) return ".nan";
  if (object === Number.POSITIVE_INFINITY) return ".inf";
  if (object === Number.NEGATIVE_INFINITY) return "-.inf";
  if (Object.is(object, -0)) return "-0.0";
  const result2 = object.toString(10);
  return /^[-+]?[0-9]+e/.test(result2) ? result2.replace("e", ".e") : result2;
}
var floatJsonTag = defineScalarTag("tag:yaml.org,2002:float", {
  implicit: true,
  implicitFirstChars: ["-", ..."0123456789"],
  resolve: resolveYamlFloat$1,
  identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
  represent: representYamlFloat$1
});
var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:(?:[0-9][0-9_]*)?\\.[0-9_]*)(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function resolveYamlFloat(source) {
  if (!YAML_FLOAT_PATTERN.test(source)) return NOT_RESOLVED;
  let value = source.toLowerCase().replace(/_/g, "");
  const sign = value[0] === "-" ? -1 : 1;
  if ("+-".includes(value[0])) value = value.slice(1);
  if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  if (value === ".nan") return NaN;
  let result2 = 0;
  if (value.includes(":")) {
    for (const part of value.split(":")) result2 = result2 * 60 + Number(part);
    result2 *= sign;
  } else result2 = sign * parseFloat(value);
  if (Number.isFinite(result2) || YAML_FLOAT_SPECIAL_PATTERN.test(source)) return result2;
  return NOT_RESOLVED;
}
function representYamlFloat(object) {
  if (isNaN(object)) return ".nan";
  if (object === Number.POSITIVE_INFINITY) return ".inf";
  if (object === Number.NEGATIVE_INFINITY) return "-.inf";
  if (Object.is(object, -0)) return "-0.0";
  const result2 = object.toString(10);
  return /^[-+]?[0-9]+e/.test(result2) ? result2.replace("e", ".e") : result2;
}
var floatYaml11Tag = defineScalarTag("tag:yaml.org,2002:float", {
  implicit: true,
  implicitFirstChars: [
    "-",
    "+",
    ".",
    ..."0123456789"
  ],
  resolve: resolveYamlFloat,
  identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
  represent: representYamlFloat
});
var mergeTag = defineScalarTag("tag:yaml.org,2002:merge", {
  implicit: true,
  implicitFirstChars: ["<"],
  resolve: (source, isExplicit) => {
    if (source === "<<" || isExplicit && source === "") return MERGE_KEY;
    return NOT_RESOLVED;
  }
});
var BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
function resolveYamlBinary(source) {
  const input = source.replace(/\s/g, "");
  if (input.length % 4 !== 0 || !BASE64_PATTERN.test(input)) return NOT_RESOLVED;
  const binary = atob(input);
  const result2 = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) result2[index] = binary.charCodeAt(index);
  return result2;
}
function representYamlBinary(object) {
  let binary = "";
  for (let index = 0; index < object.length; index++) binary += String.fromCharCode(object[index]);
  return btoa(binary);
}
var binaryTag = defineScalarTag("tag:yaml.org,2002:binary", {
  resolve: resolveYamlBinary,
  identify: (object) => Object.prototype.toString.call(object) === "[object Uint8Array]",
  represent: representYamlBinary
});
var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
function resolveYamlTimestamp(source) {
  let match = YAML_DATE_REGEXP.exec(source);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(source);
  if (match === null) return NOT_RESOLVED;
  const year = +match[1];
  const month = +match[2] - 1;
  const day = +match[3];
  if (!match[4]) {
    const date2 = new Date(Date.UTC(year, month, day));
    if (date2.getUTCFullYear() !== year || date2.getUTCMonth() !== month || date2.getUTCDate() !== day) return NOT_RESOLVED;
    return date2;
  }
  const hour = +match[4];
  const minute = +match[5];
  const second = +match[6];
  let fraction = 0;
  if (hour > 23 || minute > 59 || second > 59) return NOT_RESOLVED;
  if (match[7]) {
    let value = match[7].slice(0, 3);
    while (value.length < 3) value += "0";
    fraction = +value;
  }
  const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return NOT_RESOLVED;
  if (match[9]) {
    const offsetHour = +match[10];
    const offsetMinute = +(match[11] || 0);
    if (offsetHour > 23 || offsetMinute > 59) return NOT_RESOLVED;
    const offset = (offsetHour * 60 + offsetMinute) * 6e4;
    date.setTime(date.getTime() - (match[9] === "-" ? -offset : offset));
  }
  return date;
}
var timestampTag = defineScalarTag("tag:yaml.org,2002:timestamp", {
  implicit: true,
  implicitFirstChars: [..."0123456789"],
  resolve: resolveYamlTimestamp,
  identify: (object) => object instanceof Date,
  represent: (object) => object.toISOString()
});
var seqTag = defineSequenceTag("tag:yaml.org,2002:seq", {
  create: () => [],
  addItem: (container, item) => {
    container.push(item);
  },
  identify: Array.isArray
});
function isPlainObject(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  return prototype === null || prototype === Object.prototype;
}
function pick(object, keys) {
  const result2 = {};
  for (const key of keys) if (object[key] !== void 0) result2[key] = object[key];
  return result2;
}
var omapTag = defineSequenceTag("tag:yaml.org,2002:omap", {
  create: () => ({
    list: [],
    seen: /* @__PURE__ */ new Set()
  }),
  addItem: (carrier, item) => {
    let key;
    if (item instanceof Map) {
      if (item.size !== 1) return "cannot resolve an ordered map item";
      key = item.keys().next().value;
    } else if (isPlainObject(item)) {
      const itemKeys = Object.keys(item);
      if (itemKeys.length !== 1) return "cannot resolve an ordered map item";
      key = itemKeys[0];
    } else return "cannot resolve an ordered map item";
    if (carrier.seen.has(key)) return "duplicate key in ordered map";
    carrier.seen.add(key);
    carrier.list.push(item);
    return "";
  },
  finalize: (carrier) => carrier.list
});
var pairsTag = defineSequenceTag("tag:yaml.org,2002:pairs", {
  create: () => [],
  addItem: (container, item) => {
    if (item instanceof Map) {
      if (item.size !== 1) return "cannot resolve a pairs item";
      container.push(item.entries().next().value);
      return "";
    }
    if (Object.prototype.toString.call(item) !== "[object Object]") return "cannot resolve a pairs item";
    const object = item;
    const keys = Object.keys(object);
    if (keys.length !== 1) return "cannot resolve a pairs item";
    container.push([keys[0], object[keys[0]]]);
    return "";
  }
});
var mapTag = defineMappingTag("tag:yaml.org,2002:map", {
  create: () => ({}),
  identify: isPlainObject,
  represent: (o) => {
    const map = /* @__PURE__ */ new Map();
    for (const key of Object.keys(o)) map.set(key, o[key]);
    return map;
  },
  addPair: (container, key, value) => {
    if (key !== null && typeof key === "object") return "object-based map does not support complex keys";
    const normalizedKey = String(key);
    if (normalizedKey === "__proto__") Object.defineProperty(container, normalizedKey, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    else container[normalizedKey] = value;
    return "";
  },
  has: (container, key) => {
    if (key !== null && typeof key === "object") return false;
    return Object.prototype.hasOwnProperty.call(container, String(key));
  },
  keys: (container) => Object.keys(container),
  get: (container, key) => container[String(key)]
});
var setTag = defineMappingTag("tag:yaml.org,2002:set", {
  create: () => /* @__PURE__ */ new Set(),
  identify: (data) => data instanceof Set,
  represent: (data) => {
    const map = /* @__PURE__ */ new Map();
    for (const key of data) map.set(key, null);
    return map;
  },
  addPair: (container, key, value) => {
    if (value !== null) return "cannot resolve a set item";
    container.add(key);
    return "";
  },
  has: (container, key) => container.has(key),
  keys: (container) => container.keys(),
  get: () => null
});
function createTagDefinitionMap() {
  return {
    scalar: {},
    sequence: {},
    mapping: {}
  };
}
function createTagDefinitionListMap() {
  return {
    scalar: [],
    sequence: [],
    mapping: []
  };
}
function compileTags(tags) {
  const result2 = [];
  for (const tag of tags) {
    let index = result2.length;
    for (let previousIndex = 0; previousIndex < result2.length; previousIndex++) {
      const previous = result2[previousIndex];
      if (previous.nodeKind === tag.nodeKind && previous.tagName === tag.tagName && previous.matchByTagPrefix === tag.matchByTagPrefix) {
        index = previousIndex;
        break;
      }
    }
    result2[index] = tag;
  }
  return result2;
}
var Schema = class Schema2 {
  tags;
  implicitScalarTags;
  implicitScalarByFirstChar;
  implicitScalarAnyFirstChar;
  defaultScalarTag;
  defaultSequenceTag;
  defaultMappingTag;
  exact;
  prefix;
  constructor(tags) {
    const compiledTags = compileTags(tags);
    const implicitScalarTags = [];
    const exact = createTagDefinitionMap();
    const prefix = createTagDefinitionListMap();
    for (const tag of compiledTags) {
      if (tag.nodeKind === "scalar" && tag.implicit) {
        if (tag.matchByTagPrefix) throw new Error("Implicit scalar tags cannot match by tag prefix");
        implicitScalarTags.push(tag);
      }
      switch (tag.nodeKind) {
        case "scalar":
          if (tag.matchByTagPrefix) prefix.scalar.push(tag);
          else exact.scalar[tag.tagName] = tag;
          break;
        case "sequence":
          if (tag.matchByTagPrefix) prefix.sequence.push(tag);
          else exact.sequence[tag.tagName] = tag;
          break;
        case "mapping":
          if (tag.matchByTagPrefix) prefix.mapping.push(tag);
          else exact.mapping[tag.tagName] = tag;
          break;
      }
    }
    const implicitScalarAnyFirstChar = implicitScalarTags.filter((tag) => tag.implicitFirstChars === null);
    const keys = /* @__PURE__ */ new Set();
    for (const tag of implicitScalarTags) if (tag.implicitFirstChars !== null) for (const key of tag.implicitFirstChars) keys.add(key);
    const implicitScalarByFirstChar = /* @__PURE__ */ new Map();
    for (const key of keys) implicitScalarByFirstChar.set(key, implicitScalarTags.filter((tag) => tag.implicitFirstChars === null || tag.implicitFirstChars.indexOf(key) !== -1));
    const defaultScalarTag = exact.scalar["tag:yaml.org,2002:str"];
    if (!defaultScalarTag) throw new Error("schema does not define the default scalar tag (tag:yaml.org,2002:str)");
    this.tags = compiledTags;
    this.implicitScalarTags = implicitScalarTags;
    this.implicitScalarByFirstChar = implicitScalarByFirstChar;
    this.implicitScalarAnyFirstChar = implicitScalarAnyFirstChar;
    this.defaultScalarTag = defaultScalarTag;
    this.defaultSequenceTag = exact.sequence["tag:yaml.org,2002:seq"];
    this.defaultMappingTag = exact.mapping["tag:yaml.org,2002:map"];
    this.exact = exact;
    this.prefix = prefix;
  }
  withTags(...tags) {
    let flatTags = [];
    for (const tag of tags) flatTags = flatTags.concat(tag);
    return new Schema2([...this.tags, ...flatTags]);
  }
};
var FAILSAFE_SCHEMA = new Schema([
  strTag,
  seqTag,
  mapTag
]);
var JSON_SCHEMA = new Schema([
  ...FAILSAFE_SCHEMA.tags,
  nullJsonTag,
  boolJsonTag,
  intJsonTag,
  floatJsonTag
]);
var CORE_SCHEMA = new Schema([
  ...FAILSAFE_SCHEMA.tags,
  nullCoreTag,
  boolCoreTag,
  intCoreTag,
  floatCoreTag
]);
var YAML11_SCHEMA = new Schema([
  ...FAILSAFE_SCHEMA.tags,
  nullYaml11Tag,
  boolYaml11Tag,
  intYaml11Tag,
  floatYaml11Tag,
  timestampTag,
  mergeTag,
  binaryTag,
  omapTag,
  pairsTag,
  setTag
]);
var realMapTag = defineMappingTag("tag:yaml.org,2002:map", {
  create: () => /* @__PURE__ */ new Map(),
  addPair: (container, key, value) => {
    container.set(key, value);
    return "";
  },
  has: (container, key) => container.has(key),
  keys: (container) => container.keys(),
  get: (container, key) => container.get(key),
  identify: (data) => data instanceof Map || isPlainObject(data),
  represent: (data) => {
    if (data instanceof Map) return data;
    const map = /* @__PURE__ */ new Map();
    const obj = data;
    for (const key of Object.keys(obj)) map.set(key, obj[key]);
    return map;
  }
});
function normalizeKey(key) {
  if (Array.isArray(key)) {
    const array = Array.prototype.slice.call(key);
    for (let index = 0; index < array.length; index++) {
      if (Array.isArray(array[index])) return null;
      if (typeof array[index] === "object" && Object.prototype.toString.call(array[index]) === "[object Object]") array[index] = "[object Object]";
    }
    return String(array);
  }
  if (typeof key === "object" && Object.prototype.toString.call(key) === "[object Object]") return "[object Object]";
  return String(key);
}
var legacyMapTag = defineMappingTag("tag:yaml.org,2002:map", {
  create: () => ({}),
  identify: isPlainObject,
  represent: (o) => {
    const map = /* @__PURE__ */ new Map();
    for (const key of Object.keys(o)) map.set(key, o[key]);
    return map;
  },
  addPair: (container, key, value) => {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === null) return "nested arrays are not supported inside keys";
    if (normalizedKey === "__proto__") Object.defineProperty(container, normalizedKey, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    else container[normalizedKey] = value;
    return "";
  },
  has: (container, key) => {
    const normalizedKey = normalizeKey(key);
    return normalizedKey !== null && Object.prototype.hasOwnProperty.call(container, normalizedKey);
  },
  keys: (container) => Object.keys(container),
  get: (container, key) => container[String(key)]
});
var DEFAULT_SNIPPET_OPTIONS = {
  maxLength: 79,
  indent: 1,
  linesBefore: 3,
  linesAfter: 2
};
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  let head = "";
  let tail = "";
  const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
  };
}
function padStart(string, max) {
  return " ".repeat(Math.max(max - string.length, 0)) + string;
}
function makeSnippet(mark, options) {
  if (!mark.buffer) return null;
  const opts = {
    ...DEFAULT_SNIPPET_OPTIONS,
    ...options
  };
  const re = /\r?\n|\r|\0/g;
  const lineStarts = [0];
  const lineEnds = [];
  let match;
  let foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  let result2 = "";
  const lineNoLength = Math.min(mark.line + opts.linesAfter, lineEnds.length).toString().length;
  const maxLineLength = opts.maxLength - (opts.indent + lineNoLength + 3);
  for (let i = 1; i <= opts.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
    result2 = `${" ".repeat(opts.indent)}${padStart((mark.line - i + 1).toString(), lineNoLength)} | ${line2.str}
${result2}`;
  }
  const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result2 += `${" ".repeat(opts.indent)}${padStart((mark.line + 1).toString(), lineNoLength)} | ${line.str}
`;
  result2 += `${"-".repeat(opts.indent + lineNoLength + 3 + line.pos)}^
`;
  for (let i = 1; i <= opts.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
    result2 += `${" ".repeat(opts.indent)}${padStart((mark.line + i + 1).toString(), lineNoLength)} | ${line2.str}
`;
  }
  return result2.replace(/\n$/, "");
}
function formatError(exception, compact) {
  let where = "";
  if (!exception.mark) return exception.reason;
  if (exception.mark.name) where += `in "${exception.mark.name}" `;
  where += `(${exception.mark.line + 1}:${exception.mark.column + 1})`;
  if (!compact && exception.mark.snippet) where += `

${exception.mark.snippet}`;
  return `${exception.reason} ${where}`;
}
var YAMLException = class extends Error {
  reason;
  mark;
  constructor(reason, mark) {
    super();
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
  toString(compact) {
    return `${this.name}: ${formatError(this, compact)}`;
  }
};
function throwErrorAt(source, position, message, filename = "") {
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < position; index++) {
    const ch = source.charCodeAt(index);
    if (ch === 10) {
      line++;
      lineStart = index + 1;
    } else if (ch === 13) {
      line++;
      if (source.charCodeAt(index + 1) === 10) index++;
      lineStart = index + 1;
    }
  }
  const mark = {
    name: filename,
    buffer: source,
    position,
    line,
    column: position - lineStart
  };
  mark.snippet = makeSnippet(mark);
  throw new YAMLException(message, mark);
}
var NO_RANGE$3 = -1;
function simpleEscapeSequence(c) {
  switch (c) {
    case 48:
      return "\0";
    case 97:
      return "\x07";
    case 98:
      return "\b";
    case 116:
      return "	";
    case 9:
      return "	";
    case 110:
      return "\n";
    case 118:
      return "\v";
    case 102:
      return "\f";
    case 114:
      return "\r";
    case 101:
      return "\x1B";
    case 32:
      return " ";
    case 34:
      return '"';
    case 47:
      return "/";
    case 92:
      return "\\";
    case 78:
      return "\x85";
    case 95:
      return "\xA0";
    case 76:
      return "\u2028";
    case 80:
      return "\u2029";
    default:
      return "";
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (let i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function charFromCodepoint(c) {
  if (c <= 65535) return String.fromCharCode(c);
  return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
}
function fromHexCode$1(c) {
  if (c >= 48 && c <= 57) return c - 48;
  return (c | 32) - 97 + 10;
}
function escapedHexLen$1(c) {
  if (c === 120) return 2;
  if (c === 117) return 4;
  return 8;
}
function skipFoldedBreaks(input, position, end) {
  let breaks = 0;
  while (position < end) {
    const ch = input.charCodeAt(position);
    if (ch === 10) {
      breaks++;
      position++;
    } else if (ch === 13) {
      breaks++;
      position++;
      if (input.charCodeAt(position) === 10) position++;
    } else if (ch === 32 || ch === 9) position++;
    else break;
  }
  return {
    position,
    breaks
  };
}
function foldedBreaks(count) {
  if (count === 1) return " ";
  return "\n".repeat(count - 1);
}
function getPlainValue(input, start, end) {
  let result2 = "";
  let position = start;
  let captureStart = start;
  let captureEnd = start;
  while (position < end) {
    const ch = input.charCodeAt(position);
    if (ch === 10 || ch === 13) {
      result2 += input.slice(captureStart, captureEnd);
      const fold = skipFoldedBreaks(input, position, end);
      result2 += foldedBreaks(fold.breaks);
      position = captureStart = captureEnd = fold.position;
    } else {
      position++;
      if (ch !== 32 && ch !== 9) captureEnd = position;
    }
  }
  return result2 + input.slice(captureStart, captureEnd);
}
function getSingleQuotedValue(input, start, end) {
  let result2 = "";
  let position = start;
  let captureStart = start;
  let captureEnd = start;
  while (position < end) {
    const ch = input.charCodeAt(position);
    if (ch === 39) {
      result2 += input.slice(captureStart, position) + "'";
      position += 2;
      captureStart = captureEnd = position;
    } else if (ch === 10 || ch === 13) {
      result2 += input.slice(captureStart, captureEnd);
      const fold = skipFoldedBreaks(input, position, end);
      result2 += foldedBreaks(fold.breaks);
      position = captureStart = captureEnd = fold.position;
    } else {
      position++;
      if (ch !== 32 && ch !== 9) captureEnd = position;
    }
  }
  return result2 + input.slice(captureStart, end);
}
function getDoubleQuotedValue(input, start, end) {
  let result2 = "";
  let position = start;
  let captureStart = start;
  let captureEnd = start;
  while (position < end) {
    const ch = input.charCodeAt(position);
    if (ch === 92) {
      result2 += input.slice(captureStart, position);
      position++;
      const escaped = input.charCodeAt(position);
      if (escaped === 10 || escaped === 13) position = skipFoldedBreaks(input, position, end).position;
      else if (escaped < 256 && simpleEscapeCheck[escaped]) {
        result2 += simpleEscapeMap[escaped];
        position++;
      } else {
        let hexLength = escapedHexLen$1(escaped);
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          position++;
          const digit = fromHexCode$1(input.charCodeAt(position));
          hexResult = (hexResult << 4) + digit;
        }
        result2 += charFromCodepoint(hexResult);
        position++;
      }
      captureStart = captureEnd = position;
    } else if (ch === 10 || ch === 13) {
      result2 += input.slice(captureStart, captureEnd);
      const fold = skipFoldedBreaks(input, position, end);
      result2 += foldedBreaks(fold.breaks);
      position = captureStart = captureEnd = fold.position;
    } else {
      position++;
      if (ch !== 32 && ch !== 9) captureEnd = position;
    }
  }
  return result2 + input.slice(captureStart, end);
}
function getBlockValue(input, start, end, indent, chomping, folded) {
  const textIndent = indent < 0 ? 0 : indent;
  const region = input.slice(start, end).replace(/\r\n?/g, "\n");
  const lines = region === "" ? [] : (region.endsWith("\n") ? region.slice(0, -1) : region).split("\n");
  let result2 = "";
  let didReadContent = false;
  let emptyLines = 0;
  let atMoreIndented = false;
  for (const line of lines) {
    let column = 0;
    while (column < textIndent && line.charCodeAt(column) === 32) column++;
    if (indent < 0 || column >= line.length) {
      emptyLines++;
      continue;
    }
    const content = line.slice(textIndent);
    const first = content.charCodeAt(0);
    if (folded) if (first === 32 || first === 9) {
      atMoreIndented = true;
      result2 += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
    } else if (atMoreIndented) {
      atMoreIndented = false;
      result2 += "\n".repeat(emptyLines + 1);
    } else if (emptyLines === 0) {
      if (didReadContent) result2 += " ";
    } else result2 += "\n".repeat(emptyLines);
    else result2 += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
    result2 += content;
    didReadContent = true;
    emptyLines = 0;
  }
  if (chomping === 3) result2 += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
  else if (chomping !== 2) {
    if (didReadContent) result2 += "\n";
  }
  return result2;
}
function getScalarValue(input, scalar) {
  if (scalar.valueStart === NO_RANGE$3) return "";
  const { valueStart, valueEnd } = scalar;
  if (scalar.fast) return input.slice(valueStart, valueEnd);
  switch (scalar.style) {
    case 2:
      return getSingleQuotedValue(input, valueStart, valueEnd);
    case 3:
      return getDoubleQuotedValue(input, valueStart, valueEnd);
    case 4:
      return getBlockValue(input, valueStart, valueEnd, scalar.indent, scalar.chomping, false);
    case 5:
      return getBlockValue(input, valueStart, valueEnd, scalar.indent, scalar.chomping, true);
    default:
      return getPlainValue(input, valueStart, valueEnd);
  }
}
var DEFAULT_TAG_HANDLERS = {
  "!": "!",
  "!!": "tag:yaml.org,2002:"
};
function tagNameFull(rawTag, tagHandlers) {
  if (rawTag.startsWith("!<") && rawTag.endsWith(">")) return decodeURIComponent(rawTag.slice(2, -1));
  const handleEnd = rawTag.indexOf("!", 1);
  const handle = handleEnd === -1 ? "!" : rawTag.slice(0, handleEnd + 1);
  const prefix = tagHandlers?.[handle] ?? DEFAULT_TAG_HANDLERS[handle] ?? handle;
  return decodeURIComponent(prefix) + decodeURIComponent(rawTag.slice(handle.length));
}
var NO_RANGE$2 = -1;
var DEFAULT_CONSTRUCTOR_OPTIONS = {
  filename: "",
  schema: CORE_SCHEMA,
  json: false,
  maxTotalMergeKeys: 1e4,
  maxAliases: -1
};
function eventPosition$1(event) {
  if ("tagStart" in event && event.tagStart !== NO_RANGE$2) return event.tagStart;
  if ("anchorStart" in event && event.anchorStart !== NO_RANGE$2) return event.anchorStart;
  if ("valueStart" in event && event.valueStart !== NO_RANGE$2) return event.valueStart;
  if ("start" in event) return event.start;
  return 0;
}
function throwError$1(state, message) {
  throwErrorAt(state.source, state.position, message, state.filename);
}
function finalizeCollection(state, position, tag, carrier) {
  try {
    return tag.finalize(carrier);
  } catch (error) {
    if (error instanceof YAMLException) throw error;
    throwErrorAt(state.source, position, error instanceof Error ? error.message : String(error), state.filename);
  }
}
function lookupTag(exact, prefix, tagName) {
  const exactTag = exact[tagName];
  if (exactTag) return exactTag;
  for (const tag of prefix) if (tagName.startsWith(tag.tagName)) return tag;
}
function findExplicitTag(state, exact, prefix, tagName, nodeKind) {
  const tag = lookupTag(exact, prefix, tagName);
  if (tag) return tag;
  throwError$1(state, `unknown ${nodeKind} tag !<${tagName}>`);
}
function constructScalar(state, event) {
  const source = getScalarValue(state.source, event);
  const rawTag = event.tagStart === NO_RANGE$2 ? "" : state.source.slice(event.tagStart, event.tagEnd);
  const strTag2 = state.schema.defaultScalarTag;
  if (rawTag !== "") {
    if (rawTag === "!") return {
      value: source,
      tag: strTag2
    };
    const tagName = tagNameFull(rawTag, state.tagHandlers);
    const scalarTag = lookupTag(state.schema.exact.scalar, state.schema.prefix.scalar, tagName);
    if (scalarTag) {
      const result2 = scalarTag.resolve(source, true, tagName);
      if (result2 === NOT_RESOLVED) throwError$1(state, `cannot resolve a node with !<${tagName}> explicit tag`);
      return {
        value: result2,
        tag: scalarTag
      };
    }
    const collectionTagDef = lookupTag(state.schema.exact.mapping, state.schema.prefix.mapping, tagName) ?? lookupTag(state.schema.exact.sequence, state.schema.prefix.sequence, tagName);
    if (collectionTagDef) {
      if (source !== "") throwError$1(state, `cannot resolve a node with !<${tagName}> explicit tag`);
      const carrier = collectionTagDef.create(tagName);
      return {
        value: collectionTagDef.carrierIsResult ? carrier : finalizeCollection(state, state.position, collectionTagDef, carrier),
        tag: collectionTagDef
      };
    }
    throwError$1(state, `unknown scalar tag !<${tagName}>`);
  }
  if (event.style === 1) {
    const candidates = state.schema.implicitScalarByFirstChar.get(source.charAt(0)) ?? state.schema.implicitScalarAnyFirstChar;
    for (const tag of candidates) {
      const result2 = tag.resolve(source, false, tag.tagName);
      if (result2 !== NOT_RESOLVED) return {
        value: result2,
        tag
      };
    }
  }
  return {
    value: strTag2.resolve(source, false, strTag2.tagName),
    tag: strTag2
  };
}
function collectionTag(state, event, exact, prefix, defaultTagName, nodeKind) {
  const rawTag = event.tagStart === NO_RANGE$2 ? "" : state.source.slice(event.tagStart, event.tagEnd);
  const tagName = rawTag === "" || rawTag === "!" ? defaultTagName : tagNameFull(rawTag, state.tagHandlers);
  return {
    tagName,
    tag: findExplicitTag(state, exact, prefix, tagName, nodeKind)
  };
}
function isMappingTag(tag) {
  return tag.nodeKind === "mapping";
}
function mergeKeys(state, frame, source, sourceTag) {
  for (const sourceKey of sourceTag.keys(source)) {
    if (state.maxTotalMergeKeys !== -1 && ++state.totalMergeKeys > state.maxTotalMergeKeys) throwError$1(state, `merge keys exceeded maxTotalMergeKeys (${state.maxTotalMergeKeys})`);
    if (frame.tag.has(frame.value, sourceKey)) continue;
    const err = frame.tag.addPair(frame.value, sourceKey, sourceTag.get(source, sourceKey));
    if (err) throwError$1(state, err);
    (frame.overridable ??= /* @__PURE__ */ new Set()).add(sourceKey);
  }
}
function mergeSource(state, frame, source, sourceTag) {
  state.position = frame.keyPosition;
  if (isMappingTag(sourceTag)) mergeKeys(state, frame, source, sourceTag);
  else if (sourceTag.nodeKind === "sequence" && Array.isArray(source)) for (const element of source) mergeKeys(state, frame, element, frame.tag);
  else throwError$1(state, "cannot merge mappings; the provided source object is unacceptable");
}
function addMappingValue(state, frame, key, value, tag) {
  state.position = frame.keyPosition;
  if (key === MERGE_KEY) {
    mergeSource(state, frame, value, tag);
    return;
  }
  if (!state.json && frame.tag.has(frame.value, key) && !frame.overridable?.has(key)) throwError$1(state, "duplicated mapping key");
  const err = frame.tag.addPair(frame.value, key, value);
  if (err) throwError$1(state, err);
  frame.overridable?.delete(key);
}
function addValue(state, value, tag) {
  const frame = state.frames[state.frames.length - 1];
  if (frame.kind === "document") {
    frame.value = value;
    frame.hasValue = true;
  } else if (frame.kind === "sequence") {
    if (frame.merge) {
      if (!isMappingTag(tag)) throwError$1(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    const err = frame.tag.addItem(frame.value, value, frame.index++);
    if (err) throwError$1(state, err);
  } else if (frame.hasKey) {
    const key = frame.key;
    frame.key = void 0;
    frame.hasKey = false;
    addMappingValue(state, frame, key, value, tag);
  } else {
    frame.key = value;
    frame.keyPosition = state.position;
    frame.hasKey = true;
  }
}
function storeAnchor(state, event, value, tag, isValueFinal) {
  if (event.anchorStart !== NO_RANGE$2) {
    const anchor = {
      value,
      tag,
      isValueFinal
    };
    state.anchors.set(state.source.slice(event.anchorStart, event.anchorEnd), anchor);
    return anchor;
  }
  return null;
}
function constructFromEvents(events, options) {
  const state = {
    ...DEFAULT_CONSTRUCTOR_OPTIONS,
    ...options,
    events,
    documents: [],
    eventIndex: 0,
    position: 0,
    frames: [],
    anchors: /* @__PURE__ */ new Map(),
    tagHandlers: /* @__PURE__ */ Object.create(null),
    totalMergeKeys: 0,
    aliasCount: 0
  };
  while (state.eventIndex < state.events.length) {
    const event = state.events[state.eventIndex++];
    state.position = eventPosition$1(event);
    switch (event.type) {
      case 1:
        state.anchors = /* @__PURE__ */ new Map();
        state.aliasCount = 0;
        state.tagHandlers = /* @__PURE__ */ Object.create(null);
        for (const directive of event.directives) if (directive.kind === "tag") state.tagHandlers[directive.handle] = directive.prefix;
        state.frames.push({
          kind: "document",
          position: state.position,
          value: void 0,
          hasValue: false
        });
        break;
      case 4: {
        const { value, tag } = constructScalar(state, event);
        storeAnchor(state, event, value, tag, true);
        addValue(state, value, tag);
        break;
      }
      case 2: {
        const definition = collectionTag(state, event, state.schema.exact.sequence, state.schema.prefix.sequence, "tag:yaml.org,2002:seq", "sequence");
        const value = definition.tag.create(definition.tagName);
        const anchor = storeAnchor(state, event, value, definition.tag, definition.tag.carrierIsResult);
        const parent = state.frames[state.frames.length - 1];
        const merge = parent !== void 0 && parent.kind === "mapping" && parent.hasKey && parent.key === MERGE_KEY;
        state.frames.push({
          kind: "sequence",
          position: state.position,
          value,
          tag: definition.tag,
          anchor,
          index: 0,
          merge
        });
        break;
      }
      case 3: {
        const definition = collectionTag(state, event, state.schema.exact.mapping, state.schema.prefix.mapping, "tag:yaml.org,2002:map", "mapping");
        const value = definition.tag.create(definition.tagName);
        const anchor = storeAnchor(state, event, value, definition.tag, definition.tag.carrierIsResult);
        state.frames.push({
          kind: "mapping",
          position: state.position,
          value,
          tag: definition.tag,
          anchor,
          key: void 0,
          keyPosition: state.position,
          hasKey: false,
          overridable: null
        });
        break;
      }
      case 5: {
        if (state.maxAliases !== -1 && ++state.aliasCount > state.maxAliases) throwError$1(state, `aliases exceeded maxAliases (${state.maxAliases})`);
        const name = state.source.slice(event.anchorStart, event.anchorEnd);
        const anchor = state.anchors.get(name);
        if (!anchor) throwError$1(state, `unidentified alias "${name}"`);
        if (!anchor.isValueFinal) throwError$1(state, `recursive alias "${name}" is not supported for tag ${anchor.tag.tagName} because it uses finalize()`);
        addValue(state, anchor.value, anchor.tag);
        break;
      }
      case 6: {
        const frame = state.frames.pop();
        if (frame.kind === "document") state.documents.push(frame.value);
        else {
          const value = frame.tag.carrierIsResult ? frame.value : finalizeCollection(state, frame.position, frame.tag, frame.value);
          if (frame.anchor) {
            frame.anchor.value = value;
            frame.anchor.isValueFinal = true;
          }
          addValue(state, value, frame.tag);
        }
        break;
      }
    }
  }
  return state.documents;
}
var NO_RANGE$1 = -1;
var HAS_OWN = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
var NS_URI_CHAR = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$,_.!~*'()\[\]])`;
var NS_TAG_CHAR = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$.~*'()_])`;
var PATTERN_TAG_URI = new RegExp(`^(?:${NS_URI_CHAR})*$`);
var PATTERN_TAG_SUFFIX = new RegExp(`^(?:${NS_TAG_CHAR})+$`);
var PATTERN_TAG_PREFIX = new RegExp(`^(?:!(?:${NS_URI_CHAR})*|${NS_TAG_CHAR}(?:${NS_URI_CHAR})*)$`);
var DEFAULT_PARSER_OPTIONS = {
  filename: "",
  maxDepth: 100
};
function addDocumentEvent(state, explicitStart, explicitEnd) {
  state.events.push({
    type: 1,
    explicitStart,
    explicitEnd,
    directives: state.directives
  });
}
function addSequenceEvent(state, start, anchorStart, anchorEnd, tagStart, tagEnd, style) {
  state.events.push({
    type: 2,
    start,
    anchorStart,
    anchorEnd,
    tagStart,
    tagEnd,
    style
  });
}
function addMappingEvent(state, start, anchorStart, anchorEnd, tagStart, tagEnd, style) {
  state.events.push({
    type: 3,
    start,
    anchorStart,
    anchorEnd,
    tagStart,
    tagEnd,
    style
  });
}
function addScalarEvent(state, valueStart, valueEnd, anchorStart, anchorEnd, tagStart, tagEnd, style, chomping = 1, indent = -1, fast = false) {
  state.events.push({
    type: 4,
    valueStart,
    valueEnd,
    anchorStart,
    anchorEnd,
    tagStart,
    tagEnd,
    style,
    chomping,
    indent,
    fast
  });
}
function addAliasEvent(state, anchorStart, anchorEnd) {
  state.events.push({
    type: 5,
    anchorStart,
    anchorEnd
  });
}
function addPopEvent(state) {
  state.events.push({ type: 6 });
}
function addEmptyScalarEvent(state) {
  addScalarEvent(state, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, 1);
}
function emptyProperties() {
  return {
    anchorStart: NO_RANGE$1,
    anchorEnd: NO_RANGE$1,
    tagStart: NO_RANGE$1,
    tagEnd: NO_RANGE$1
  };
}
function snapshotState(state) {
  return {
    position: state.position,
    line: state.line,
    lineStart: state.lineStart,
    lineIndent: state.lineIndent,
    firstTabInLine: state.firstTabInLine,
    eventsLength: state.events.length
  };
}
function restoreState(state, snapshot) {
  state.position = snapshot.position;
  state.line = snapshot.line;
  state.lineStart = snapshot.lineStart;
  state.lineIndent = snapshot.lineIndent;
  state.firstTabInLine = snapshot.firstTabInLine;
  state.events.length = snapshot.eventsLength;
}
function throwError(state, message) {
  throwErrorAt(state.input.slice(0, state.length), state.position, message, state.filename);
}
function isEol(c) {
  return c === 10 || c === 13;
}
function isWhiteSpace(c) {
  return c === 9 || c === 32;
}
function isWsOrEol(c) {
  return isWhiteSpace(c) || isEol(c);
}
function isWsOrEolOrEnd(c) {
  return c === 0 || isWsOrEol(c);
}
function isFlowIndicator(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromDecimalCode(c) {
  return c >= 48 && c <= 57 ? c - 48 : -1;
}
function fromHexCode(c) {
  if (c >= 48 && c <= 57) return c - 48;
  const lc = c | 32;
  if (lc >= 97 && lc <= 102) return lc - 97 + 10;
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) return 2;
  if (c === 117) return 4;
  if (c === 85) return 8;
  return 0;
}
function isSimpleEscape(c) {
  return c === 48 || c === 97 || c === 98 || c === 116 || c === 9 || c === 110 || c === 118 || c === 102 || c === 114 || c === 101 || c === 32 || c === 34 || c === 47 || c === 92 || c === 78 || c === 95 || c === 76 || c === 80;
}
function consumeLineBreak(state) {
  if (state.input.charCodeAt(state.position) === 10) state.position++;
  else {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) state.position++;
  }
  state.line++;
  state.lineStart = state.position;
  state.lineIndent = 0;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments) {
  let lineBreaks = 0;
  let ch = state.input.charCodeAt(state.position);
  let hasSeparation = state.position === state.lineStart || isWsOrEol(state.input.charCodeAt(state.position - 1));
  while (ch !== 0) {
    while (isWhiteSpace(ch)) {
      hasSeparation = true;
      if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && hasSeparation && ch === 35) do
      ch = state.input.charCodeAt(++state.position);
    while (!isEol(ch) && ch !== 0);
    if (!isEol(ch)) break;
    consumeLineBreak(state);
    lineBreaks++;
    hasSeparation = true;
    ch = state.input.charCodeAt(state.position);
    while (ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
  }
  return lineBreaks;
}
function testDocumentSeparator(state, position = state.position) {
  const ch = state.input.charCodeAt(position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(position + 1) && ch === state.input.charCodeAt(position + 2)) {
    const following = state.input.charCodeAt(position + 3);
    return following === 0 || isWsOrEol(following);
  }
  return false;
}
function skipUntilLineEnd(state) {
  let ch = state.input.charCodeAt(state.position);
  while (ch !== 0 && !isEol(ch)) ch = state.input.charCodeAt(++state.position);
}
function checkPrintable(state, start, end) {
  if (PATTERN_NON_PRINTABLE.test(state.input.slice(start, end))) throwError(state, "the stream contains non-printable characters");
}
function readTagProperty(state, props, inFlow) {
  if (state.input.charCodeAt(state.position) !== 33) return false;
  if (props.tagStart !== NO_RANGE$1) throwError(state, "duplication of a tag property");
  const start = state.position;
  let isVerbatim = false;
  let isNamed = false;
  let tagHandle = "!";
  let ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  }
  let suffixStart = state.position;
  let tagName;
  if (isVerbatim) {
    while (ch !== 0 && ch !== 62) ch = state.input.charCodeAt(++state.position);
    if (ch !== 62) throwError(state, "unexpected end of the stream within a verbatim tag");
    tagName = state.input.slice(suffixStart, state.position);
    state.position++;
  } else {
    while (ch !== 0 && !isWsOrEol(ch) && !(inFlow && isFlowIndicator(ch))) {
      if (ch === 33) if (!isNamed) {
        tagHandle = state.input.slice(suffixStart - 1, state.position + 1);
        if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
        isNamed = true;
        suffixStart = state.position + 1;
      } else throwError(state, "tag suffix cannot contain exclamation marks");
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(suffixStart, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
  }
  if (tagName && !(isVerbatim ? PATTERN_TAG_URI.test(tagName) : PATTERN_TAG_SUFFIX.test(tagName))) throwError(state, `tag name cannot contain such characters: ${tagName}`);
  if (!isVerbatim && tagHandle !== "!" && tagHandle !== "!!" && !HAS_OWN.call(state.tagHandlers, tagHandle)) throwError(state, `undeclared tag handle "${tagHandle}"`);
  props.tagStart = start;
  props.tagEnd = state.position;
  return true;
}
function readAnchorProperty(state, props) {
  if (state.input.charCodeAt(state.position) !== 38) return false;
  if (props.anchorStart !== NO_RANGE$1) throwError(state, "duplication of an anchor property");
  state.position++;
  const start = state.position;
  while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position)) && !isFlowIndicator(state.input.charCodeAt(state.position))) state.position++;
  if (state.position === start) throwError(state, "name of an anchor node must contain at least one character");
  props.anchorStart = start;
  props.anchorEnd = state.position;
  return true;
}
function readAlias(state, props) {
  if (state.input.charCodeAt(state.position) !== 42) return false;
  if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) throwError(state, "alias node should not have any properties");
  state.position++;
  const start = state.position;
  while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position)) && !isFlowIndicator(state.input.charCodeAt(state.position))) state.position++;
  if (state.position === start) throwError(state, "name of an alias node must contain at least one character");
  addAliasEvent(state, start, state.position);
  return true;
}
function readFlowScalarBreak(state, nodeIndent) {
  skipSeparationSpace(state, false);
  if (state.lineIndent < nodeIndent) throwError(state, "deficient indentation");
}
function readSingleQuotedScalar(state, nodeIndent, props) {
  if (state.input.charCodeAt(state.position) !== 39) return false;
  state.position++;
  const start = state.position;
  let simple = true;
  while (state.input.charCodeAt(state.position) !== 0) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 39) {
      if (state.input.charCodeAt(state.position + 1) === 39) {
        simple = false;
        state.position += 2;
        continue;
      }
      const end = state.position;
      state.position++;
      addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 2, 1, -1, simple);
      return true;
    }
    if (isEol(ch)) {
      simple = false;
      readFlowScalarBreak(state, nodeIndent);
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
    else if (ch !== 9 && ch < 32) throwError(state, "expected valid JSON character");
    else state.position++;
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent, props) {
  if (state.input.charCodeAt(state.position) !== 34) return false;
  state.position++;
  const start = state.position;
  let simple = true;
  while (state.input.charCodeAt(state.position) !== 0) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 34) {
      const end = state.position;
      state.position++;
      addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 3, 1, -1, simple);
      return true;
    }
    if (ch === 92) {
      simple = false;
      const escaped = state.input.charCodeAt(++state.position);
      if (isEol(escaped)) readFlowScalarBreak(state, nodeIndent);
      else if (isSimpleEscape(escaped)) state.position++;
      else {
        let hexLength = escapedHexLen(escaped);
        if (hexLength === 0) throwError(state, "unknown escape sequence");
        while (hexLength-- > 0) {
          state.position++;
          if (fromHexCode(state.input.charCodeAt(state.position)) < 0) throwError(state, "expected hexadecimal character");
        }
        state.position++;
      }
    } else if (isEol(ch)) {
      simple = false;
      readFlowScalarBreak(state, nodeIndent);
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
    else if (ch !== 9 && ch < 32) throwError(state, "expected valid JSON character");
    else state.position++;
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readBlockScalar(state, parentIndent, props) {
  const ch = state.input.charCodeAt(state.position);
  let chomping = 1;
  let indent = -1;
  let detectedIndent = false;
  if (ch !== 124 && ch !== 62) return false;
  const style = ch === 124 ? 4 : 5;
  state.position++;
  while (state.input.charCodeAt(state.position) !== 0) {
    const current = state.input.charCodeAt(state.position);
    const digit = fromDecimalCode(current);
    if (current === 43 || current === 45) {
      if (chomping !== 1) throwError(state, "repeat of a chomping mode identifier");
      chomping = current === 43 ? 3 : 2;
      state.position++;
    } else if (digit >= 0) {
      if (digit === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      if (detectedIndent) throwError(state, "repeat of an indentation width identifier");
      indent = parentIndent + digit - 1;
      detectedIndent = true;
      state.position++;
    } else break;
  }
  let hadWhitespace = false;
  while (isWhiteSpace(state.input.charCodeAt(state.position))) {
    hadWhitespace = true;
    state.position++;
  }
  if (hadWhitespace && state.input.charCodeAt(state.position) === 35) skipUntilLineEnd(state);
  if (isEol(state.input.charCodeAt(state.position))) consumeLineBreak(state);
  else if (state.input.charCodeAt(state.position) !== 0) throwError(state, "a line break is expected");
  let contentIndent = detectedIndent ? indent : -1;
  let maxLeadingIndent = 0;
  const valueStart = state.position;
  let valueEnd = state.position;
  while (state.input.charCodeAt(state.position) !== 0) {
    const linePosition = state.position;
    let column = 0;
    while (state.input.charCodeAt(linePosition + column) === 32) column++;
    const first = state.input.charCodeAt(linePosition + column);
    if (first === 0) {
      if (contentIndent >= 0) {
        if (column > contentIndent) valueEnd = linePosition + column;
      } else if (column > 0) valueEnd = linePosition + column;
      break;
    }
    if (linePosition === state.lineStart && testDocumentSeparator(state, linePosition)) break;
    if (!detectedIndent && contentIndent === -1 && isEol(first)) maxLeadingIndent = Math.max(maxLeadingIndent, column);
    if (!detectedIndent && contentIndent === -1 && !isEol(first)) {
      if (first === 9 && column < parentIndent) {
        state.position = linePosition + column;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (column < maxLeadingIndent) {
        state.position = linePosition + column;
        throwError(state, "bad indentation of a mapping entry");
      }
    }
    if (contentIndent === -1 && first !== 0 && !isEol(first) && column < parentIndent) {
      state.lineIndent = column;
      state.position = linePosition + column;
      break;
    }
    if (!detectedIndent && first !== 0 && !isEol(first) && contentIndent === -1) contentIndent = column;
    const requiredIndent = contentIndent === -1 ? parentIndent + 1 : contentIndent;
    if (first !== 0 && !isEol(first) && column < requiredIndent) {
      state.lineIndent = column;
      state.position = linePosition + column;
      break;
    }
    skipUntilLineEnd(state);
    valueEnd = state.position;
    if (isEol(state.input.charCodeAt(state.position))) {
      consumeLineBreak(state);
      valueEnd = state.position;
    }
  }
  checkPrintable(state, valueStart, valueEnd);
  addScalarEvent(state, valueStart, valueEnd, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, style, chomping, contentIndent);
  return true;
}
function canStartPlainScalar(state, nodeContext) {
  const ch = state.input.charCodeAt(state.position);
  const inFlow = nodeContext === CONTEXT_FLOW_IN;
  if (ch === 0 || isWsOrEol(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96 || inFlow && isFlowIndicator(ch)) return false;
  if (ch === 63 || ch === 45) {
    const following = state.input.charCodeAt(state.position + 1);
    if (isWsOrEolOrEnd(following) || inFlow && isFlowIndicator(following)) return false;
  }
  return true;
}
function readPlainScalar(state, nodeIndent, nodeContext, props) {
  if (!canStartPlainScalar(state, nodeContext)) return false;
  const start = state.position;
  let end = state.position;
  let ch = state.input.charCodeAt(state.position);
  const inFlow = nodeContext === CONTEXT_FLOW_IN;
  let multiline = false;
  while (ch !== 0) {
    if (state.position === state.lineStart && testDocumentSeparator(state)) break;
    if (ch === 58) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEolOrEnd(following) || inFlow && isFlowIndicator(following)) break;
    } else if (ch === 35) {
      if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
    } else if (inFlow && isFlowIndicator(ch)) break;
    else if (isEol(ch)) {
      const savedPosition = state.position;
      const savedLine = state.line;
      const savedLineStart = state.lineStart;
      const savedLineIndent = state.lineIndent;
      skipSeparationSpace(state, false);
      if (state.lineIndent >= nodeIndent) {
        multiline = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      }
      state.position = savedPosition;
      state.line = savedLine;
      state.lineStart = savedLineStart;
      state.lineIndent = savedLineIndent;
      break;
    }
    if (!isWhiteSpace(ch)) end = state.position + 1;
    ch = state.input.charCodeAt(++state.position);
  }
  if (end === start) return false;
  checkPrintable(state, start, end);
  addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 1, 1, -1, !multiline);
  return true;
}
function skipFlowSeparationSpace(state, nodeIndent) {
  const startLine = state.line;
  skipSeparationSpace(state, true);
  if (state.line > startLine && state.lineIndent < nodeIndent || state.firstTabInLine !== -1 && state.lineIndent < nodeIndent) throwError(state, "deficient indentation");
}
function readFlowCollection(state, nodeIndent, props) {
  const ch = state.input.charCodeAt(state.position);
  const isMapping = ch === 123;
  const start = state.position;
  let readNext = true;
  if (ch !== 91 && ch !== 123) return false;
  const terminator = isMapping ? 125 : 93;
  if (isMapping) addMappingEvent(state, start, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 2);
  else addSequenceEvent(state, start, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 2);
  state.position++;
  while (state.input.charCodeAt(state.position) !== 0) {
    skipFlowSeparationSpace(state, nodeIndent);
    let ch2 = state.input.charCodeAt(state.position);
    if (ch2 === terminator) {
      state.position++;
      addPopEvent(state);
      return true;
    } else if (!readNext) throwError(state, "missed comma between flow collection entries");
    else if (ch2 === 44) throwError(state, "expected the node content, but found ','");
    let isPair = false;
    let isExplicitPair = false;
    if (ch2 === 63 && isWsOrEol(state.input.charCodeAt(state.position + 1))) {
      isPair = isExplicitPair = true;
      state.position += 1;
      skipFlowSeparationSpace(state, nodeIndent);
    }
    const entryLine = state.line;
    const entryStart = snapshotState(state);
    const keyWasRead = parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    skipFlowSeparationSpace(state, nodeIndent);
    ch2 = state.input.charCodeAt(state.position);
    if ((isMapping || isExplicitPair || state.line === entryLine) && ch2 === 58) {
      isPair = true;
      state.position++;
      skipFlowSeparationSpace(state, nodeIndent);
      if (!isMapping) {
        restoreState(state, entryStart);
        addMappingEvent(state, entryStart.position, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, 2);
        if (!parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true)) addEmptyScalarEvent(state);
        skipFlowSeparationSpace(state, nodeIndent);
        state.position++;
        skipFlowSeparationSpace(state, nodeIndent);
      } else if (!keyWasRead) addEmptyScalarEvent(state);
      if (!parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true)) addEmptyScalarEvent(state);
      skipFlowSeparationSpace(state, nodeIndent);
      if (!isMapping) addPopEvent(state);
    } else if (isMapping && isPair) {
      if (!keyWasRead) addEmptyScalarEvent(state);
      addEmptyScalarEvent(state);
    } else if (isMapping) addEmptyScalarEvent(state);
    else if (isPair) {
      restoreState(state, entryStart);
      addMappingEvent(state, entryStart.position, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, 2);
      parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      addEmptyScalarEvent(state);
      addPopEvent(state);
    }
    ch2 = state.input.charCodeAt(state.position);
    if (ch2 === 44) {
      readNext = true;
      state.position++;
    } else readNext = false;
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockSequence(state, nodeIndent, props) {
  if (state.firstTabInLine !== -1 || state.input.charCodeAt(state.position) !== 45 || !isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) return false;
  addSequenceEvent(state, state.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 1);
  while (state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    const entryLine = state.line;
    state.position++;
    const hadBreak = skipSeparationSpace(state, true) > 0;
    if (state.firstTabInLine !== -1 && state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) throwError(state, "bad indentation of a sequence entry");
    if (hadBreak && state.lineIndent <= nodeIndent) addEmptyScalarEvent(state);
    else parseNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    skipSeparationSpace(state, true);
    if (state.lineIndent < nodeIndent || state.position >= state.length) break;
    if (state.lineIndent > nodeIndent) throwError(state, "bad indentation of a sequence entry");
    if (state.line === entryLine && state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) throwError(state, "bad indentation of a sequence entry");
  }
  addPopEvent(state);
  return true;
}
function readBlockMapping(state, nodeIndent, flowIndent, props) {
  let atExplicitKey = false;
  let detected = false;
  let mappingOpened = false;
  let pendingExplicitKey = false;
  if (state.firstTabInLine !== -1) return false;
  let ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    const following = state.input.charCodeAt(state.position + 1);
    const entryLine = state.line;
    if ((ch === 63 || ch === 58) && isWsOrEolOrEnd(following)) {
      if (!mappingOpened) {
        addMappingEvent(state, state.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 1);
        mappingOpened = true;
      }
      if (ch === 63) {
        if (atExplicitKey) addEmptyScalarEvent(state);
        detected = true;
        atExplicitKey = true;
      } else if (atExplicitKey) atExplicitKey = false;
      else {
        addEmptyScalarEvent(state);
        detected = true;
        atExplicitKey = false;
      }
      state.position += 1;
      pendingExplicitKey = true;
    } else {
      if (atExplicitKey) {
        addEmptyScalarEvent(state);
        atExplicitKey = false;
      }
      const beforeKey = snapshotState(state);
      if (!parseNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
      if (state.line === entryLine) {
        ch = state.input.charCodeAt(state.position);
        while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!isWsOrEolOrEnd(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          if (!mappingOpened) {
            restoreState(state, beforeKey);
            addMappingEvent(state, beforeKey.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 1);
            mappingOpened = true;
            parseNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true);
            ch = state.input.charCodeAt(state.position);
            while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
            state.position++;
          }
          detected = true;
          atExplicitKey = false;
          pendingExplicitKey = false;
        } else if (detected) throwError(state, "expected ':' after a mapping key");
        else {
          if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) {
            restoreState(state, beforeKey);
            return false;
          }
          return true;
        }
      } else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      else {
        if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) {
          restoreState(state, beforeKey);
          return false;
        }
        return true;
      }
    }
    if (parseNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, pendingExplicitKey)) pendingExplicitKey = false;
    if (!atExplicitKey) {
      if (pendingExplicitKey) {
        addEmptyScalarEvent(state);
        pendingExplicitKey = false;
      }
    }
    skipSeparationSpace(state, true);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === entryLine || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
    else if (state.lineIndent < nodeIndent) break;
  }
  if (!detected) return false;
  if (atExplicitKey) addEmptyScalarEvent(state);
  if (mappingOpened) addPopEvent(state);
  return true;
}
function parseNode(state, parentIndent, nodeContext, allowToSeek, allowCompact, allowPropertyMapping = true) {
  if (state.depth >= state.maxDepth) throwError(state, `nesting exceeded maxDepth (${state.maxDepth})`);
  state.depth++;
  let indentStatus = 1;
  let atNewLine = false;
  let hasContent = false;
  let propertyStart = null;
  const props = emptyProperties();
  let allowBlockScalars = nodeContext === CONTEXT_BLOCK_OUT || nodeContext === CONTEXT_BLOCK_IN;
  let allowBlockCollections = allowBlockScalars;
  const allowBlockStyles = allowBlockScalars;
  if (allowToSeek && skipSeparationSpace(state, true)) {
    atNewLine = true;
    if (state.lineIndent > parentIndent) indentStatus = 1;
    else if (state.lineIndent === parentIndent) indentStatus = 0;
    else indentStatus = -1;
  }
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    state.depth--;
    return false;
  }
  if (indentStatus === 1) while (true) {
    const ch = state.input.charCodeAt(state.position);
    const propertyState = snapshotState(state);
    if (atNewLine && indentStatus !== 1 && (ch === 33 || ch === 38)) break;
    if (atNewLine && allowBlockStyles && (props.tagStart !== NO_RANGE$1 || props.anchorStart !== NO_RANGE$1) && (ch === 33 || ch === 38)) {
      const fallbackState = snapshotState(state);
      const flowIndent = parentIndent + 1;
      if (readBlockMapping(state, state.position - state.lineStart, flowIndent, props) && state.events[fallbackState.eventsLength]?.type === 3) {
        state.depth--;
        return true;
      }
      restoreState(state, fallbackState);
    }
    if (atNewLine && (ch === 33 && props.tagStart !== NO_RANGE$1 || ch === 38 && props.anchorStart !== NO_RANGE$1)) break;
    if (!readTagProperty(state, props, nodeContext === CONTEXT_FLOW_IN) && !readAnchorProperty(state, props)) break;
    if (propertyStart === null) propertyStart = propertyState;
    if (skipSeparationSpace(state, true)) {
      atNewLine = true;
      allowBlockCollections = allowBlockStyles;
      if (state.lineIndent > parentIndent) indentStatus = 1;
      else if (state.lineIndent === parentIndent) indentStatus = 0;
      else indentStatus = -1;
    } else allowBlockCollections = false;
  }
  if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
  if (indentStatus === 1 || nodeContext === CONTEXT_BLOCK_OUT) {
    const flowIndent = nodeContext === CONTEXT_FLOW_IN || nodeContext === CONTEXT_FLOW_OUT ? parentIndent : parentIndent + 1;
    const blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent, props) || readBlockMapping(state, blockIndent, flowIndent, props)) || readFlowCollection(state, flowIndent, props)) hasContent = true;
    else {
      const ch = state.input.charCodeAt(state.position);
      if (propertyStart !== null && allowPropertyMapping && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62) {
        const fallbackState = snapshotState(state);
        const propertyIndent = propertyStart.position - propertyStart.lineStart;
        restoreState(state, propertyStart);
        if (readBlockMapping(state, propertyIndent, flowIndent, emptyProperties()) && state.events[fallbackState.eventsLength]?.type === 3) hasContent = true;
        else restoreState(state, fallbackState);
      }
      if (!hasContent && (allowBlockScalars && readBlockScalar(state, flowIndent, props) || readSingleQuotedScalar(state, flowIndent, props) || readDoubleQuotedScalar(state, flowIndent, props) || readAlias(state, props) || readPlainScalar(state, flowIndent, nodeContext, props))) hasContent = true;
    }
    else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent, props);
  }
  allowBlockScalars = allowBlockScalars && !hasContent;
  if (!hasContent && (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1 || allowBlockScalars)) {
    addScalarEvent(state, NO_RANGE$1, NO_RANGE$1, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, 1);
    hasContent = true;
  }
  state.depth--;
  return hasContent || props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1;
}
function readDirective(state) {
  if (state.lineIndent > 0 || state.input.charCodeAt(state.position) !== 37) return false;
  state.position++;
  const nameStart = state.position;
  while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position))) state.position++;
  const name = state.input.slice(nameStart, state.position);
  const args = [];
  if (name.length === 0) throwError(state, "directive name must not be less than one character in length");
  while (state.input.charCodeAt(state.position) !== 0 && !isEol(state.input.charCodeAt(state.position))) {
    while (isWhiteSpace(state.input.charCodeAt(state.position))) state.position++;
    if (state.input.charCodeAt(state.position) === 35 || isEol(state.input.charCodeAt(state.position)) || state.input.charCodeAt(state.position) === 0) break;
    const start = state.position;
    while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position))) state.position++;
    args.push(state.input.slice(start, state.position));
  }
  if (isEol(state.input.charCodeAt(state.position))) consumeLineBreak(state);
  if (name === "YAML") {
    if (state.directives.some((directive) => directive.kind === "yaml")) throwError(state, "duplication of %YAML directive");
    if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
    const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) throwError(state, "ill-formed argument of the YAML directive");
    if (parseInt(match[1], 10) !== 1) throwError(state, "unacceptable YAML version of the document");
    state.directives.push({
      kind: "yaml",
      version: args[0]
    });
  } else if (name === "TAG") {
    if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
    const [handle, prefix] = args;
    if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    if (HAS_OWN.call(state.tagHandlers, handle)) throwError(state, `there is a previously declared suffix for "${handle}" tag handle`);
    if (!PATTERN_TAG_PREFIX.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    state.tagHandlers[handle] = prefix;
    state.directives.push({
      kind: "tag",
      handle,
      prefix
    });
  }
  return true;
}
function readDocument(state) {
  state.directives = [];
  state.tagHandlers = /* @__PURE__ */ Object.create(null);
  let hasDirectives = false;
  skipSeparationSpace(state, true);
  while (readDirective(state)) {
    hasDirectives = true;
    skipSeparationSpace(state, true);
  }
  let explicitStart = false;
  let explicitEnd = false;
  let allowCompact = true;
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 3))) {
    explicitStart = true;
    const markerLine = state.line;
    state.position += 3;
    skipSeparationSpace(state, true);
    allowCompact = state.line > markerLine;
  } else if (hasDirectives) throwError(state, "directives end mark is expected");
  const documentEventIndex = state.events.length;
  if (!explicitStart && state.position === state.lineStart && state.input.charCodeAt(state.position) === 46 && testDocumentSeparator(state)) {
    state.position += 3;
    skipSeparationSpace(state, true);
    return;
  }
  addDocumentEvent(state, explicitStart, false);
  if (!parseNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, allowCompact, allowCompact)) addEmptyScalarEvent(state);
  skipSeparationSpace(state, true);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    explicitEnd = state.input.charCodeAt(state.position) === 46;
    if (explicitEnd) {
      const markerLine = state.line;
      state.position += 3;
      skipSeparationSpace(state, true);
      if (state.line === markerLine && state.position < state.length) throwError(state, "end of the stream or a document separator is expected");
    }
  }
  const documentEvent = state.events[documentEventIndex];
  if (documentEvent?.type === 1) documentEvent.explicitEnd = explicitEnd;
  addPopEvent(state);
  if (!explicitEnd && state.position < state.length && !(state.position === state.lineStart && testDocumentSeparator(state))) throwError(state, "end of the stream or a document separator is expected");
}
function parseEvents(input, options) {
  const length = input.length;
  const state = {
    ...DEFAULT_PARSER_OPTIONS,
    ...options,
    input: `${input}\0`,
    length,
    position: 0,
    line: 0,
    lineStart: 0,
    lineIndent: 0,
    firstTabInLine: -1,
    depth: 0,
    directives: [],
    tagHandlers: /* @__PURE__ */ Object.create(null),
    events: []
  };
  const nullpos = input.indexOf("\0");
  if (nullpos !== -1) throwErrorAt(input, nullpos, "null byte is not allowed in input", state.filename);
  if (state.input.charCodeAt(state.position) === 65279) state.position++;
  while (state.position < state.length) {
    skipSeparationSpace(state, true);
    if (state.position >= state.length) break;
    const documentStart = state.position;
    readDocument(state);
    if (state.position === documentStart)
      throwError(state, "can not read a document");
  }
  return state.events;
}
var DEFAULT_LOAD_OPTIONS = {
  ...DEFAULT_PARSER_OPTIONS,
  ...DEFAULT_CONSTRUCTOR_OPTIONS
};
function loadDocuments(input, options = {}) {
  const opts = {
    ...DEFAULT_LOAD_OPTIONS,
    ...options
  };
  const source = String(input);
  const PARSER_OPT_KEYS = Object.keys(DEFAULT_PARSER_OPTIONS);
  const CONSTRUCTOR_OPT_KEYS = Object.keys(DEFAULT_CONSTRUCTOR_OPTIONS);
  return constructFromEvents(parseEvents(source, pick(opts, PARSER_OPT_KEYS)), {
    ...pick(opts, CONSTRUCTOR_OPT_KEYS),
    source
  });
}
function load(input, options) {
  const documents = loadDocuments(input, options);
  if (documents.length === 0) throw new YAMLException("expected a document, but the input is empty");
  if (documents.length === 1) return documents[0];
  throw new YAMLException("expected a single document in the stream, but found more");
}
var INVALID = Symbol("INVALID");
var VISIT_BREAK = Symbol("visit:break");
var VISIT_SKIP = Symbol("visit:skip");
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEFAULT_PRESENTER_OPTIONS = {
  indent: 2,
  seqNoIndent: false,
  seqInlineFirst: true,
  sortKeys: false,
  lineWidth: 80,
  flowBracketPadding: false,
  flowSkipCommaSpace: false,
  flowSkipColonSpace: false,
  quoteFlowKeys: false,
  quoteStyle: "single",
  forceQuotes: false,
  tagBeforeAnchor: false
};
var DEFAULT_DUMP_SCHEMA = YAML11_SCHEMA.withTags({
  ...intYaml11Tag,
  resolve: (source, isExplicit, tagName) => {
    const result2 = intYaml11Tag.resolve(source, isExplicit, tagName);
    return result2 === NOT_RESOLVED ? intCoreTag.resolve(source, isExplicit, tagName) : result2;
  }
}, {
  ...floatYaml11Tag,
  resolve: (source, isExplicit, tagName) => {
    const result2 = floatYaml11Tag.resolve(source, isExplicit, tagName);
    return result2 === NOT_RESOLVED ? floatCoreTag.resolve(source, isExplicit, tagName) : result2;
  }
});
var DEFAULT_DUMP_OPTIONS = {
  ...DEFAULT_PRESENTER_OPTIONS,
  schema: DEFAULT_DUMP_SCHEMA,
  skipInvalid: false,
  noRefs: false,
  flowLevel: -1,
  transform: () => {
  }
};

// src/work/frontmatter.ts
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = load(match[1]) ?? {};
  return { meta, body: match[2].replace(/^\r?\n/, "") };
}

// src/work/checkpoint.ts
async function listCheckpoints(workspace) {
  const entries = await listCheckpointFiles(workspace);
  return entries.map((e) => e.checkpoint);
}
async function listCheckpointFiles(workspace) {
  const dir = checkpointsDir(workspace);
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const result2 = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await readFile3(join3(dir, name), "utf-8");
      const { meta } = parseFrontmatter(raw);
      result2.push({ filename: name, checkpoint: meta });
    } catch {
      continue;
    }
  }
  return result2;
}

// src/work/history.ts
import { mkdir as mkdir4, readdir as readdir2, readFile as readFile4 } from "node:fs/promises";
import { join as join4 } from "node:path";
async function listWorkLogs(workspace) {
  const dir = historyDir(workspace);
  let entries;
  try {
    entries = await readdir2(dir);
  } catch {
    return [];
  }
  const logs = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile4(join4(dir, name), "utf-8");
      logs.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return logs.sort((a, b) => a.completed_at.localeCompare(b.completed_at));
}

// src/labelGuard.ts
function labelId(label) {
  return JSON.stringify([label.kind, label.reason, label.patchVersion, label.recordedAt, label.implementationCycle ?? 0]);
}
function isLabelStillInScope(labelPatchVersion, currentPatchVersion) {
  return labelPatchVersion === currentPatchVersion;
}
function collectBypassLabels(labels, currentPatchVersion) {
  return labels.filter((l) => isLabelStillInScope(l.patchVersion, currentPatchVersion));
}
function computeCompletionGrade(labels, currentPatchVersion, approvals = []) {
  const inScope = collectBypassLabels(labels, currentPatchVersion).filter((l) => !(l.kind === "evidenceResnapshot" && l.supersededAt && (l.supersededByCycle ?? 0) > (l.implementationCycle ?? 0)));
  const approved = /* @__PURE__ */ new Map();
  for (const event of approvals) approved.set(event.labelId, event);
  const allApproved = inScope.every((l) => {
    const event = approved.get(labelId(l));
    return event?.action === "approve" && event.reason.trim() && event.userId && event.kind === l.kind && event.originalReason === l.reason;
  });
  return { grade: inScope.length === 0 ? "verified" : allApproved ? "verified_by_human" : "unverified", bypassLabels: inScope };
}

// src/session.ts
import { mkdir as mkdir5, readdir as readdir3, readFile as readFile5 } from "node:fs/promises";
import { join as join5 } from "node:path";
function sessionsDir() {
  return join5(sugoHomeDir(), ".claude", "sugo", "sessions");
}
async function loadAllSessions() {
  let entries;
  try {
    entries = await readdir3(sessionsDir());
  } catch {
    return [];
  }
  const sessions = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile5(join5(sessionsDir(), name), "utf-8");
      sessions.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return sessions;
}

// src/work/roadmap.ts
import { mkdir as mkdir6, readFile as readFile6 } from "node:fs/promises";
import { dirname as dirname3, join as join6 } from "node:path";

// src/work/roadmapReq.ts
function requirementNodeId(taskId, requirementId) {
  return `${taskId}::${requirementId}`;
}

// src/taskTitle.ts
function prdHeadingTitle(prdContent) {
  const heading = prdContent?.match(/^#\s+PRD(?:[\s-]+patch[\s-]*v\d+)?\s*(?::|[—–-])\s*(.+)$/im)?.[1]?.trim();
  if (!heading) return null;
  const [, patchSubject] = heading.split(/\s+[—–]\s+/, 2);
  if (patchSubject?.trim()) return patchSubject.trim();
  return heading.replace(/\s+\([^)]*\)\s*$/, "").trim() || null;
}
function taskCycleTitle(seed, fallback, prdContent) {
  const fromPrd = prdHeadingTitle(prdContent);
  if (fromPrd) return fromPrd;
  const firstLine = seed?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return fallback;
  const normalized = firstLine.replace(/^#{1,6}\s*/, "").replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "").replace(/^(?:v?\d+\s*(?:차\s*)?patch)\s*[:·-]?\s*/i, "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? normalized;
}

// src/work/roadmap.ts
async function restoredPatchTitle(task) {
  if (!task.patchInfo) return task.title;
  const patchPrdPath = task.patchInfo.prdPath ?? (task.prd_ref ? join6(dirname3(task.prd_ref), `PRD-patch-v${task.patchInfo.patchVersion}.md`) : void 0);
  const prdContent = patchPrdPath ? await readFile6(patchPrdPath, "utf8").catch(() => void 0) : void 0;
  return task.patchInfo.title ?? taskCycleTitle(task.patchInfo.seed, task.title, prdContent);
}
function withStartedPatch(node, patchVersion, title, startedAt, baseWorkResultPath, baseTitle) {
  const previousLineage = node.lineage ?? [];
  if (previousLineage.some((entry) => entry.version === patchVersion)) {
    return {
      ...node,
      lineage: previousLineage.map((entry) => {
        if (entry.version === patchVersion) return { ...entry, title };
        if (entry.version === 0 && baseTitle) return { ...entry, title: baseTitle };
        return entry;
      })
    };
  }
  const baseWorkResult = node.workResult?.path ? node.workResult : baseWorkResultPath ? { path: baseWorkResultPath, parentTaskId: node.id, patchVersion: 0 } : void 0;
  const featEntry = patchVersion > 0 && !previousLineage.some((entry) => entry.version === 0) && baseWorkResult?.path ? [{
    version: 0,
    completedAt: baseWorkResult.endedAt ?? baseWorkResult.startedAt ?? startedAt,
    title: baseTitle ?? node.title,
    summary: baseWorkResult.summary,
    workResult: { ...baseWorkResult, patchVersion: 0 }
  }] : [];
  const patchEntry = { version: patchVersion, completedAt: startedAt, title };
  return {
    ...node,
    lineage: [...featEntry, ...previousLineage, patchEntry].sort((a, b) => a.version - b.version)
  };
}
async function readRoadmapFile(workspace) {
  let file;
  try {
    const raw = await readFile6(roadmapFilePath(workspace), "utf-8");
    file = JSON.parse(raw);
  } catch {
    return { nodes: [], schemaVersion: 1 };
  }
  if (file.nodes.some((n) => n.workResult?.path && !n.workResult.report?.bypassLabels)) {
    const sessions = (await loadAllSessions()).filter((s) => s.state === "DONE" && s.data.linkedWorkspace === workspace);
    for (const node of file.nodes) {
      const result2 = node.workResult;
      if (!result2?.path || result2.report?.bypassLabels) continue;
      const chain = sessions.find((s) => s.data.chainInfo.workResultPath === result2.path)?.data.chainInfo;
      if (!chain?.workResultReport || !Array.isArray(chain.bypassLabels) || result2.report && result2.report.completedAt !== chain.workResultReport.completedAt) continue;
      result2.report = {
        ...chain.workResultReport,
        bypassLabels: [...chain.bypassLabels],
        completionGrade: computeCompletionGrade(chain.bypassLabels, chain.workResultReport.patchVersion).grade
      };
    }
  }
  return file;
}
async function writeRoadmapFile(workspace, file) {
  await mkdir6(workspaceDir(workspace), { recursive: true });
  await atomicWriteFile(roadmapFilePath(workspace), JSON.stringify(file, null, 2));
  void syncRoadmapSnapshot(workspace, file.nodes).catch(() => {
  });
}
async function withRoadmap(workspace, fn) {
  return withFileLock(roadmapLockPath(workspace), async () => {
    const file = await readRoadmapFile(workspace);
    return fn(file);
  });
}
async function listRoadmapNodes(workspace, filter) {
  const file = await readRoadmapFile(workspace);
  return file.nodes.filter(
    (n) => (!filter?.level || n.level === filter.level) && (!filter?.parent || n.parent === filter.parent)
  );
}
async function reconcileRoadmapWithTasks(workspace, tasks) {
  await withRoadmap(workspace, async (file) => {
    const oldToNewByParent = /* @__PURE__ */ new Map();
    for (const n of file.nodes) {
      if (n.level !== "subtask" || !n.parent || n.id.includes("::")) continue;
      const map = oldToNewByParent.get(n.parent) ?? /* @__PURE__ */ new Map();
      map.set(n.id, requirementNodeId(n.parent, n.id));
      oldToNewByParent.set(n.parent, map);
    }
    const migrated = file.nodes.map((node) => {
      if (node.level !== "subtask" && node.level !== "step" || !node.parent) return { ...node };
      const localMap = oldToNewByParent.get(node.parent) ?? /* @__PURE__ */ new Map();
      const id = node.level === "subtask" ? localMap.get(node.id) ?? node.id : node.id;
      const dependsOn = node.dependsOn.flatMap((dep) => {
        if (dep.includes("::")) return [dep];
        const local = localMap.get(dep);
        return local ? [local] : [];
      });
      return { ...node, id, dependsOn };
    });
    const byId = new Map(migrated.map((n) => [n.id, n]));
    for (const task of tasks) {
      const existing = byId.get(task.id);
      const runId = existing?.parent?.startsWith("run-") ? existing.parent : `run-${task.id}`;
      const existingRun = byId.get(runId);
      const specId = existingRun?.parent?.startsWith("spec-") ? existingRun.parent : `spec-${task.id}`;
      const status = task.status === "done" ? "done" : task.status === "in_progress" ? "in_progress" : "pending";
      const existingSpec = byId.get(specId);
      byId.set(specId, {
        ...existingSpec ?? { id: specId, title: task.title, level: "spec", dependsOn: [] },
        status,
        specPath: task.prd_ref
      });
      byId.set(runId, {
        ...existingRun ?? { id: runId, title: task.title, level: "workstream", dependsOn: [], parent: specId },
        status,
        parent: specId,
        specPath: task.prd_ref
      });
      const nextTask = {
        ...existing ?? { id: task.id, title: task.title, level: "task", dependsOn: [], ref: task.id },
        title: task.title,
        level: "task",
        // Task 파일은 사람의 답변을 알지 못한다. 명시적인 humanBlocker가 남아 있는 동안
        // 주기적 reconcile이 blocked를 in_progress로 되돌리면 Dashboard 결정 저장도 막힌다.
        status: existing?.humanBlocker ? "blocked" : status,
        parent: existing?.parent?.startsWith("run-") ? existing.parent : runId,
        specPath: task.prd_ref
      };
      byId.set(task.id, task.patchInfo?.patchVersion ? withStartedPatch(
        nextTask,
        task.patchInfo.patchVersion,
        await restoredPatchTitle(task),
        task.started_at ?? task.created_at,
        task.patchInfo.baseWorkResultPath,
        task.title
      ) : nextTask);
      if (status === "done") {
        for (const [id, child] of byId) {
          if (child.parent === task.id) byId.set(id, { ...child, status: "done" });
        }
      }
    }
    await writeRoadmapFile(workspace, { ...file, nodes: [...byId.values()] });
  });
}
async function getRoadmapNode(workspace, id) {
  const file = await readRoadmapFile(workspace);
  return file.nodes.find((n) => n.id === id) ?? null;
}
async function recordRoadmapWorkResult(workspace, taskId, workResult, lineageEntry) {
  await withRoadmap(workspace, async (file) => {
    const task = file.nodes.find((node) => node.id === taskId && node.level === "task");
    if (!task) return;
    const requirements = file.nodes.filter((node) => node.parent === task.id && (node.level === "subtask" || node.level === "step")).map((node) => ({ id: node.id, title: node.title, status: node.status }));
    const completedEntry = { ...lineageEntry, requirements, workResult };
    const targetIds = /* @__PURE__ */ new Set([task.id, ...task.parent ? [task.parent] : []]);
    const nodes = file.nodes.map((node) => {
      if (!targetIds.has(node.id)) return node;
      if (node.id !== task.id) return { ...node, workResult };
      const previousLineage = node.lineage ?? [];
      const legacyFeatEntry = completedEntry.version > 0 && !previousLineage.some((entry) => entry.version === 0) && node.workResult?.path ? [{
        version: 0,
        completedAt: node.workResult.endedAt ?? node.workResult.startedAt ?? completedEntry.completedAt,
        title: node.title,
        summary: node.workResult.summary,
        workResult: { ...node.workResult, patchVersion: 0 }
      }] : [];
      const lineage = [...legacyFeatEntry, ...previousLineage.filter((entry) => entry.version !== completedEntry.version), completedEntry].sort((a, b) => a.version - b.version);
      return { ...node, workResult, lineage };
    });
    await writeRoadmapFile(workspace, { ...file, nodes });
  });
}
async function backfillLegacyRoadmapWorkResults(workspace, tasks) {
  let count = 0;
  for (const task of tasks) {
    if (task.status !== "done" || !task.prd_ref) continue;
    const node = await getRoadmapNode(workspace, task.id);
    if (!node || node.workResult?.path) continue;
    const prdExists = await readFile6(task.prd_ref, "utf8").then(() => true).catch(() => false);
    if (!prdExists) continue;
    const featureDir = dirname3(task.prd_ref);
    const workResultPath = join6(featureDir, "work-result.md");
    const summary = task.summary?.trim() || task.title;
    const existing = await readFile6(workResultPath, "utf8").catch(() => null);
    if (existing === null) {
      await atomicWriteFile(
        workResultPath,
        `${summary}

> \uAE30\uC874 \uC644\uB8CC \uC774\uB825\uC5D0\uC11C \uBCF5\uC6D0\uD55C work-result\uC785\uB2C8\uB2E4. \uC815\uC2DD Sugo commit \uAC8C\uC774\uD2B8 \uC99D\uAC70\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
`
      );
    }
    await recordRoadmapWorkResult(
      workspace,
      task.id,
      {
        path: workResultPath,
        startedAt: task.started_at,
        endedAt: task.completed_at,
        summary,
        parentTaskId: task.id,
        patchVersion: 0
      },
      {
        version: 0,
        completedAt: task.completed_at ?? task.created_at,
        title: task.title,
        summary
      }
    );
    count += 1;
  }
  return count;
}

// src/work/spec.ts
import { mkdir as mkdir7, readdir as readdir4, readFile as readFile7 } from "node:fs/promises";
import { join as join7 } from "node:path";
function parseSpecFile(raw) {
  const { meta, body } = parseFrontmatter(raw);
  return {
    name: meta.name ?? "",
    type: meta.type ?? "other",
    tags: meta.tags ?? [],
    created_at: meta.created_at ?? "",
    content: body
  };
}
async function listSpecs(workspace) {
  const dir = specsDir(workspace);
  let entries;
  try {
    entries = await readdir4(dir);
  } catch {
    return [];
  }
  const specs = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await readFile7(join7(dir, name), "utf-8");
      specs.push(parseSpecFile(raw));
    } catch {
      continue;
    }
  }
  return specs;
}

// src/work/task.ts
import { mkdir as mkdir8, readFile as readFile8 } from "node:fs/promises";
async function readTasksFile(workspace) {
  try {
    const raw = await readFile8(tasksFilePath(workspace), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { tasks: [], last_updated: (/* @__PURE__ */ new Date()).toISOString(), schemaVersion: 1 };
  }
}
async function listTasks(workspace, filter) {
  const file = await readTasksFile(workspace);
  return file.tasks.filter(
    (t) => (!filter?.project || t.project === filter.project) && (!filter?.status || t.status === filter.status)
  );
}

// src/work/workspace.ts
import { mkdir as mkdir9, readdir as readdir5, readFile as readFile9, rm as rm2 } from "node:fs/promises";
async function loadWorkspace(name) {
  try {
    const raw = await readFile9(workspaceFilePath(name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function listWorkspaces(includeDeleted = false) {
  let entries;
  try {
    entries = await readdir5(workRootDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const workspaces = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const ws = await loadWorkspace(entry.name);
    if (!ws) continue;
    if (!includeDeleted && ws.deleted_at) continue;
    workspaces.push(ws);
  }
  return workspaces;
}

// src/dashboard/syncAll.ts
async function syncAllWorkspaceData() {
  const result2 = {
    workspaceCount: 0,
    taskCount: 0,
    roadmapNodeCount: 0,
    checkpointCount: 0,
    historyCount: 0,
    specCount: 0
  };
  const workspaces = await listWorkspaces();
  result2.workspaceCount = workspaces.length;
  for (const workspace of workspaces) {
    await syncWorkspace(workspace);
    const tasks = await listTasks(workspace.name);
    await reconcileRoadmapWithTasks(workspace.name, tasks);
    await backfillLegacyRoadmapWorkResults(workspace.name, tasks);
    for (const task of tasks) await syncTask(workspace.name, task);
    result2.taskCount += tasks.length;
    const roadmap = await listRoadmapNodes(workspace.name);
    await syncRoadmapSnapshot(workspace.name, roadmap);
    result2.roadmapNodeCount += roadmap.length;
    const checkpoints = await listCheckpoints(workspace.name);
    for (const checkpoint of checkpoints) await syncCheckpoint(workspace.name, checkpoint);
    result2.checkpointCount += checkpoints.length;
    const history = await listWorkLogs(workspace.name);
    for (const log of history) await syncHistory(workspace.name, log);
    result2.historyCount += history.length;
    const specs = await listSpecs(workspace.name);
    for (const spec of specs) await syncSpec(workspace.name, spec);
    result2.specCount += specs.length;
    const specNames = new Set(specs.map((spec) => spec.name));
    for (const task of tasks) {
      if (!task.prd_ref || specNames.has(task.title)) continue;
      const content = await readFile10(task.prd_ref, "utf8").catch(() => null);
      if (!content) continue;
      await syncSpec(workspace.name, {
        name: task.title,
        type: "other",
        tags: ["prd-fallback"],
        content,
        created_at: task.created_at
      });
      specNames.add(task.title);
      result2.specCount += 1;
    }
  }
  await drainRetryQueue();
  return result2;
}

// src/lifecycle/dashboardRuntime.ts
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir as mkdir10, readFile as readFile11, rm as rm3, stat as stat2 } from "node:fs/promises";
import { join as join8 } from "node:path";
var DEFAULT_DASHBOARD_PORT = 3001;
function configuredDashboardPort() {
  return process.env.SUGO_DASHBOARD_PORT ? Number(process.env.SUGO_DASHBOARD_PORT) : DEFAULT_DASHBOARD_PORT;
}
var HEALTH_TIMEOUT_MS = 1500;
var START_WAIT_MS = 6e3;
var STOP_WAIT_MS = 5e3;
var POLL_MS = 150;
var LOCK_STALE_MS = 3e4;
function dashboardPaths(home = sugoHomeDir()) {
  const sugoDir = join8(home, ".claude", "sugo");
  const dataDir = join8(sugoDir, "dashboard");
  return {
    sugoDir,
    dataDir,
    stateFile: join8(dataDir, "server.json"),
    logFile: join8(dataDir, "dashboard.log"),
    lockDir: join8(dataDir, "start.lock"),
    settingsFile: join8(sugoDir, "settings.json")
  };
}
function isSupportedNode(version = process.versions.node) {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || major === 22 && minor >= 5;
}
async function readServerState(paths) {
  try {
    return JSON.parse(await readFile11(paths.stateFile, "utf8"));
  } catch {
    return null;
  }
}
async function fetchHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = await res.json();
    return body.status === "ok" ? body : null;
  } catch {
    return null;
  }
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(done, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await sleep(POLL_MS);
  }
  return done();
}
async function stopDashboard(paths) {
  const state = await readServerState(paths);
  if (!state) return { stopped: true, unverified: false };
  if (!isAlive(state.pid)) {
    await rm3(paths.stateFile, { force: true });
    return { stopped: true, unverified: false };
  }
  if (!await fetchHealth(state.port)) return { stopped: false, unverified: true };
  process.kill(state.pid, "SIGTERM");
  if (!await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS)) process.kill(state.pid, "SIGKILL");
  await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS);
  await rm3(paths.stateFile, { force: true });
  return { stopped: !isAlive(state.pid), unverified: false };
}
async function readEnabled(settingsFile) {
  try {
    const settings = JSON.parse(await readFile11(settingsFile, "utf8"));
    const enabled = settings.dashboard?.enabled;
    return typeof enabled === "boolean" ? enabled : void 0;
  } catch {
    return void 0;
  }
}
async function acquireLock(paths) {
  await mkdir10(paths.dataDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir10(paths.lockDir);
      return true;
    } catch {
      const age = await stat2(paths.lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age < LOCK_STALE_MS) return false;
      await rm3(paths.lockDir, { recursive: true, force: true });
    }
  }
  return false;
}
async function startServer(runtimeEntry, options, paths, port) {
  const log = openSync(paths.logFile, "a");
  let exited = false;
  const child = spawn(process.execPath, [runtimeEntry], {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      SUGO_DASHBOARD_PORT: String(port),
      BUILD_ID: options.buildId,
      HARNESS_PATH: join8(options.pluginRoot, "harness-library"),
      HARNESS_OVERRIDE_PATH: join8(sugoHomeDir(), ".claude", "sugo", "harness-overrides"),
      SKILLS_PATH: options.pluginRoot
    }
  });
  child.on("exit", () => {
    exited = true;
  });
  child.unref();
  closeSync(log);
  const healthy = await waitUntil(async () => exited || (await fetchHealth(port))?.build === options.buildId, START_WAIT_MS);
  if (healthy && !exited) return { kind: "started" };
  return { kind: "failed", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uB2E4. \uB85C\uADF8: ${paths.logFile}. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.` };
}
async function ensureDashboard(options) {
  const port = options.port ?? configuredDashboardPort();
  const paths = options.paths ?? dashboardPaths();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const runtimeEntry = join8(options.pluginRoot, "dashboard-runtime", "server.mjs");
  try {
    if (!isSupportedNode(nodeVersion)) {
      return {
        kind: "skipped",
        reason: "node-too-old",
        message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB294 Node 22.5 \uC774\uC0C1\uC774 \uD544\uC694\uD558\uB2E4(\uD604\uC7AC ${nodeVersion}). Node\uB97C \uC124\uCE58\uD55C \uB4A4 \uC0C8 \uC138\uC158\uC744 \uC5F0\uB2E4. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.`
      };
    }
    if (await readEnabled(paths.settingsFile) === false) return { kind: "skipped", reason: "opt-out" };
    if (!existsSync(runtimeEntry)) return { kind: "skipped", reason: "no-runtime" };
    const health = await fetchHealth(port);
    const state = await readServerState(paths);
    const owned = state !== null && state.port === port && isAlive(state.pid);
    if (health && !owned) return { kind: "running" };
    if (health && health.build === options.buildId) return { kind: "running" };
    if (health) await stopDashboard(paths);
    else if (state) await rm3(paths.stateFile, { force: true });
    if (!await acquireLock(paths)) return { kind: "busy" };
    try {
      if ((await fetchHealth(port))?.build === options.buildId) return { kind: "running" };
      const firstTime = await readEnabled(paths.settingsFile) !== true;
      const started = await startServer(runtimeEntry, options, paths, port);
      if (started.kind === "started" && firstTime) return { kind: "started", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD588\uB2E4: http://localhost:${port}` };
      return started;
    } finally {
      await rm3(paths.lockDir, { recursive: true, force: true });
    }
  } catch (error) {
    return { kind: "failed", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uB2E4: ${error.message}. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.` };
  }
}

// src/lifecycle/dashboardStartHook.ts
var pluginRoot = join9(dirname4(fileURLToPath(import.meta.url)), "..");
var result = await ensureDashboard({ pluginRoot, buildId: currentSugoVersion() });
if ("message" in result && result.message) console.log(JSON.stringify({ systemMessage: result.message }));
if (result.kind === "started" || result.kind === "running") {
  await syncAllWorkspaceData().catch((error) => {
    console.error("[sugo] dashboard startup sync failed:", error);
  });
}
process.exit(0);
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 5.2.1 https://github.com/nodeca/js-yaml @license MIT *)
*/

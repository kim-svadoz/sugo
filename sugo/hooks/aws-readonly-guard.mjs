// Sugo PreToolUse security boundary for direct AWS reads.
// Unknown, mutating, secret-bearing, and high-cost calls fail closed.

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_AWS_GUARD_POLICY = Object.freeze({
  schemaVersion: 1,
  directReadEnabled: true,
  sessionLimit: 30,
  dailyLimit: 200,
  minuteLimit: 10,
});

const ALLOWED_SERVICES = new Set([
  "ecs", "ec2", "elbv2", "cloudwatch", "logs", "sagemaker",
  "lambda", "kinesis", "dynamodb", "application-autoscaling",
]);
const SECRET_SERVICES = new Set(["secretsmanager", "ssm", "kms", "sts", "iam"]);
const GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "--profile", "--region", "--endpoint-url", "--output", "--query",
  "--cli-connect-timeout", "--cli-read-timeout", "--ca-bundle",
]);
const SECRET_FLAGS = /(?:^|\s)(?:--secret-access-key|--session-token|--password|--token)\s+(?:"[^"]*"|'[^']*'|\S+)/gi;

export function awsGuardPaths(env = process.env) {
  const root = env.SUGO_HOME_OVERRIDE || join(homedir(), ".claude", "sugo");
  return {
    policy: env.SUGO_AWS_GUARD_POLICY_PATH || join(root, "aws-readonly-policy.json"),
    usage: env.SUGO_AWS_GUARD_USAGE_PATH || join(root, "aws-readonly-usage.json"),
    audit: env.SUGO_AWS_GUARD_AUDIT_PATH || join(root, "aws-readonly-audit.jsonl"),
    settings: join(root, "settings.json"),
  };
}

const MAX_WALK_UP = 64;

/** cwd에서 위로 올라가며 sugo/config.json(Sugo 등록 프로젝트 표시)을 찾는다. */
export function isSugoProject(cwd, exists = existsSync) {
  if (!cwd) return false;
  let dir = resolve(cwd);
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (exists(join(dir, "sugo", "config.json"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return false;
}

/**
 * 가드는 Sugo 등록 프로젝트 안에서만 동작한다. 모든 세션에 걸려면 settings.json에 "aws": {"guard": "all"}을 둔다.
 * 설정을 읽지 못하면 기본 범위(Sugo 프로젝트)를 쓴다.
 */
export function guardApplies(input, settingsPath, exists = existsSync) {
  try {
    if (JSON.parse(readFileSync(settingsPath, "utf8"))?.aws?.guard === "all") return true;
  } catch {
    // 설정이 없으면 기본 범위다.
  }
  return isSugoProject(input?.cwd || process.cwd(), exists);
}

function boundedInt(value, fallback, min = 1, max = 100000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function normalizeAwsGuardPolicy(value = {}) {
  return {
    schemaVersion: 1,
    directReadEnabled: value.directReadEnabled !== false,
    sessionLimit: boundedInt(value.sessionLimit, DEFAULT_AWS_GUARD_POLICY.sessionLimit),
    dailyLimit: boundedInt(value.dailyLimit, DEFAULT_AWS_GUARD_POLICY.dailyLimit),
    minuteLimit: boundedInt(value.minuteLimit, DEFAULT_AWS_GUARD_POLICY.minuteLimit),
  };
}

export function loadAwsGuardPolicy(path = awsGuardPaths().policy) {
  try {
    return normalizeAwsGuardPolicy(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { ...DEFAULT_AWS_GUARD_POLICY };
  }
}

function shellTokens(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const push = () => { if (current) tokens.push(current); current = ""; };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (/\s/.test(char)) { push(); continue; }
    if (";&|()".includes(char)) {
      push();
      const pair = command.slice(index, index + 2);
      if (["&&", "||", ";;", "$("].includes(pair)) { tokens.push(pair); index += 1; }
      else tokens.push(char);
      continue;
    }
    current += char;
  }
  push();
  return tokens;
}

function isBoundary(token) {
  return [";", "&&", "||", "|", "(", ")", "$(", ";;"].includes(token);
}

// 인자로 받은 문자열을 실행할 방법이 없는 명령. 파이프라인 전체가 이 명령들로만 이뤄질 때에만
// "aws"는 검색어·메시지 같은 데이터다. sort(--compress-program)·awk·sed·find·xargs처럼 실행 경로가
// 있는 명령, 그리고 PAGER 같은 환경변수 접두사는 실행 경로가 되므로 제외한다.
const DATA_ONLY_COMMANDS = new Set(["grep", "egrep", "fgrep", "rg", "echo", "printf", "cat", "head", "tail", "wc", "uniq", "cut", "tr", "ls", "cd", "pwd", "diff", "jq", "true", "git"]);
const DATA_ONLY_GIT_SUBCOMMANDS = new Set(["commit", "log", "show", "diff", "status", "blame", "add", "branch", "tag"]);

function isDataOnlySegment([head, ...args]) {
  if (!DATA_ONLY_COMMANDS.has(head)) return false;
  if (head === "rg") return !args.some((arg) => arg.startsWith("--pre"));
  if (head === "git") return DATA_ONLY_GIT_SUBCOMMANDS.has(args[0]);
  return true;
}

export function isDataOnlyCommand(command) {
  const value = String(command || "");
  if (/[\r\n`]|\$\(|[<>]\(/.test(value)) return false;
  const segments = [[]];
  for (const token of shellTokens(value)) {
    if (isBoundary(token) || token === "&") segments.push([]);
    else segments[segments.length - 1].push(token);
  }
  return segments.every((segment) => segment.length === 0 || isDataOnlySegment(segment));
}

export function extractAwsCalls(command) {
  const tokens = shellTokens(String(command || ""));
  const calls = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (!/^aws(?:\.exe)?$/i.test(tokens[index])) continue;
    const args = [];
    for (let cursor = index + 1; cursor < tokens.length && !isBoundary(tokens[cursor]); cursor += 1) {
      args.push(tokens[cursor]);
    }
    calls.push(parseAwsCall(args));
  }
  return calls;
}

function parseAwsCall(args) {
  let index = 0;
  while (index < args.length && args[index].startsWith("--")) {
    const option = args[index];
    index += GLOBAL_OPTIONS_WITH_VALUE.has(option) ? 2 : 1;
  }
  const service = (args[index] || "").toLowerCase();
  const operation = (args[index + 1] || "").toLowerCase();
  return { service, operation, args: args.slice(index + 2), allArgs: args };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

function parseInstant(value) {
  if (value == null) return undefined;
  if (/^\d+$/.test(String(value))) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ask(code, reason) { return { decision: "ask", code, reason }; }
function deny(code, reason) { return { decision: "deny", code, reason }; }
function allow(code = "allowlisted_read", reason = "허용 목록의 범위 제한 읽기 호출입니다.") {
  return { decision: "allow", code, reason };
}

function evaluateScope(call) {
  const { service, operation, allArgs } = call;
  if (service === "cloudwatch" && ["get-metric-statistics", "get-metric-data"].includes(operation)) {
    const start = parseInstant(optionValue(allArgs, "--start-time"));
    const end = parseInstant(optionValue(allArgs, "--end-time"));
    const period = Number(optionValue(allArgs, "--period"));
    if (!start || !end || end <= start || end - start > 24 * 60 * 60 * 1000) {
      return ask("metric_scope", "CloudWatch 지표 조회 기간은 최대 24시간이어야 합니다.");
    }
    if (operation === "get-metric-statistics" && (!Number.isFinite(period) || period < 60)) {
      return ask("metric_period", "CloudWatch period는 60초 이상이어야 합니다.");
    }
    if (operation === "get-metric-data") {
      const rawQueries = optionValue(allArgs, "--metric-data-queries");
      try {
        const queries = JSON.parse(String(rawQueries));
        const periods = Array.isArray(queries) ? queries.map((query) => Number(query?.MetricStat?.Period)).filter(Number.isFinite) : [];
        if (periods.length === 0 || periods.some((value) => value < 60)) return ask("metric_period", "CloudWatch metric-data의 모든 Period는 60초 이상이어야 합니다.");
      } catch {
        return ask("metric_period", "CloudWatch metric-data의 Period를 정적으로 확인할 수 없습니다.");
      }
    }
  }
  if (service === "logs" && ["filter-log-events", "get-log-events"].includes(operation)) {
    const start = parseInstant(optionValue(allArgs, "--start-time"));
    const end = parseInstant(optionValue(allArgs, "--end-time"));
    if (!start || !end || end <= start) return deny("logs_time_required", "로그 조회에는 유효한 --start-time과 --end-time이 모두 필요합니다.");
    const limit = Number(optionValue(allArgs, "--limit"));
    if (end - start > 60 * 60 * 1000) return ask("logs_scope", "로그 조회 기간이 1시간을 초과합니다.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return ask("logs_limit", "로그 조회에는 1~1000의 --limit이 필요합니다.");
    if (!allArgs.includes("--no-paginate")) return ask("logs_pagination", "로그 전체 페이지 자동 순회를 막기 위해 --no-paginate가 필요합니다.");
  }
  return allow();
}

function evaluateCall(call, policy) {
  if (!policy.directReadEnabled) return deny("direct_read_disabled", "Settings에서 에이전트 직접 AWS 읽기가 꺼져 있습니다.");
  if (!call.service || !call.operation) return deny("invalid_shape", "aws <service> <operation> 형태가 아닙니다.");
  if (SECRET_SERVICES.has(call.service)) return deny("secret_exposure", `${call.service} 호출은 자격증명·복호화·비밀값 노출 위험 때문에 허용하지 않습니다.`);
  if (call.service === "ecs" && call.operation === "describe-task-definition") return deny("secret_exposure", "ECS task definition은 환경변수와 secrets 참조를 노출할 수 있어 직접 조회를 허용하지 않습니다.");
  if (call.service === "athena" && call.operation === "start-query-execution") return deny("costly_read", "Athena 쿼리 실행은 비용이 발생하는 작업입니다.");
  if (call.service === "logs" && call.operation === "start-query") return deny("costly_read", "Logs Insights 쿼리 실행은 비용이 발생하는 작업입니다.");
  if (call.service === "s3" && ["cp", "sync", "get-object"].includes(call.operation)) return deny("costly_read", "S3 객체 전송/가져오기는 비용·대량 반출 위험이 있습니다.");
  if (call.service === "dynamodb" && ["scan", "query", "get-item"].includes(call.operation)) return deny("costly_read", "DynamoDB 데이터 조회는 비용·데이터 노출 위험이 있습니다.");
  if (!ALLOWED_SERVICES.has(call.service)) return deny("service_not_allowed", `${call.service} 서비스는 읽기 허용 목록에 없습니다.`);
  if (call.service === "dynamodb" && !/^(?:describe|list)-/.test(call.operation)) return deny("operation_not_allowed", "DynamoDB는 describe-*와 list-*만 허용합니다.");
  const explicitRead = call.service === "logs" && call.operation === "filter-log-events";
  if (!explicitRead && !/^(?:describe|list|get)-/.test(call.operation)) return deny("write_or_unknown", `${call.operation}은 허용된 읽기 operation이 아닙니다.`);
  return evaluateScope(call);
}

export function evaluateAwsCommand(command, policy = DEFAULT_AWS_GUARD_POLICY) {
  const value = String(command || "");
  if (isDataOnlyCommand(value)) return { decision: "ignore", code: "not_aws", reason: "AWS 호출이 아닙니다.", calls: [] };
  if (/\b(?:boto3|botocore)\b|@aws-sdk\/|\baws-sdk\b/i.test(value)) return deny("sdk_uninspectable", "AWS SDK 스크립트는 읽기 전용 여부를 정적으로 보장할 수 없습니다.");
  if (/https?:\/\/[^\s'\"]*amazonaws\.com/i.test(value)) return deny("endpoint_bypass", "AWS endpoint 직접 호출은 허용 목록 검사를 우회할 수 있습니다.");
  const calls = extractAwsCalls(value);
  if (calls.length === 0 && /(^|[;&|()\s'"`!])(?:[^\s'\"]*\/)?aws(?:\.exe)?\s/i.test(value)) return deny("shell_uninspectable", "중첩 셸 문자열의 AWS 호출은 안전하게 분해할 수 없습니다.");
  if (calls.length === 0) return { decision: "ignore", code: "not_aws", reason: "AWS 호출이 아닙니다.", calls };
  const results = calls.map((call) => ({ call, ...evaluateCall(call, normalizeAwsGuardPolicy(policy)) }));
  const denied = results.find((result) => result.decision === "deny");
  if (denied) return { ...denied, calls, results };
  const scopedAsk = results.find((result) => result.decision === "ask");
  if (scopedAsk) return { ...scopedAsk, calls, results };
  if (/\b(?:for|while)\b[\s\S]*\bdo\b|\bxargs\b/i.test(value)) {
    return { ...ask("unbounded_loop", "셸 반복 호출의 실제 횟수를 정적으로 알 수 없습니다."), calls, results };
  }
  return { ...allow(), calls, results };
}

function readUsageJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

function localDay(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function applyUsageBudget({ callCount, callSummaries = [], policy, usagePath, sessionId, now = Date.now() }) {
  const lockPath = `${usagePath}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  let lock;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { lock = openSync(lockPath, "wx", 0o600); break; }
    catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      try { if (now - statSync(lockPath).mtimeMs > 30_000) unlinkSync(lockPath); }
      catch (statError) { if (!statError || typeof statError !== "object" || statError.code !== "ENOENT") throw statError; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (lock == null) throw new Error("AWS usage counter lock timeout");
  try {
  const normalized = normalizeAwsGuardPolicy(policy);
  const initial = { schemaVersion: 1, events: [], sessionTiers: {} };
  const state = readUsageJson(usagePath, initial);
  state.events = Array.isArray(state.events) ? state.events.filter((event) => Number(event.at) >= now - 48 * 60 * 60 * 1000) : [];
  state.sessionTiers = state.sessionTiers && typeof state.sessionTiers === "object" ? state.sessionTiers : {};
  const tier = boundedInt(state.sessionTiers[sessionId], 0, 0, 100);
  const multiplier = tier + 1;
  const sessionUsed = state.events.filter((event) => event.sessionId === sessionId).reduce((sum, event) => sum + event.count, 0);
  const dailyUsed = state.events.filter((event) => localDay(event.at) === localDay(now)).reduce((sum, event) => sum + event.count, 0);
  const minuteUsed = state.events.filter((event) => event.at > now - 60_000).reduce((sum, event) => sum + event.count, 0);
  const limits = {
    session: normalized.sessionLimit * multiplier,
    daily: normalized.dailyLimit * multiplier,
    minute: normalized.minuteLimit * multiplier,
  };
  const projected = { session: sessionUsed + callCount, daily: dailyUsed + callCount, minute: minuteUsed + callCount };
  const exceeded = Object.keys(limits).filter((key) => projected[key] > limits[key]);
  if (exceeded.length) state.sessionTiers[sessionId] = tier + 1;
  else state.events.push({ at: now, sessionId, count: callCount, calls: callSummaries.slice(0, 10) });
  atomicJson(usagePath, state);
  return { exceeded, used: { session: sessionUsed, daily: dailyUsed, minute: minuteUsed }, projected, limits, tier, state };
  } finally {
    closeSync(lock);
    try { unlinkSync(lockPath); } catch (error) { if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error; }
  }
}

export function sanitizeAuditCommand(command) {
  return String(command || "")
    .replace(SECRET_FLAGS, (match) => `${match.split(/\s+/)[0]} [REDACTED]`)
    .replace(/(?:AKIA|ASIA)[A-Z0-9]{16}/g, "[REDACTED_AWS_ACCESS_KEY]")
    .replace(/(Authorization\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]")
    .replace(/((?:secret|password|passwd|token|api[_-]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]")
    .replace(/(AWS_(?:SECRET_ACCESS_KEY|SESSION_TOKEN|ACCESS_KEY_ID)\s*=\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]")
    .slice(0, 4000);
}

function profileOf(calls) {
  for (const call of calls || []) {
    const profile = optionValue(call.allArgs, "--profile");
    if (profile) return profile;
  }
  return "default";
}

function appendAudit(path, entry) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

function decisionMessage(result, budget) {
  const kind = result.code === "secret_exposure" ? "비밀 노출" : result.code === "costly_read" ? "비용" : result.code === "write_or_unknown" ? "쓰기/변경" : result.code?.includes("limit") || result.code?.includes("scope") || result.code?.includes("period") || result.code === "unbounded_loop" || result.code === "usage_limit" ? "한도" : "정책";
  const usage = budget ? ` 현재 사용량/한도: 세션 ${budget.used.session}/${budget.limits.session}, 오늘 ${budget.used.daily}/${budget.limits.daily}, 1분 ${budget.used.minute}/${budget.limits.minute}.` : "";
  return `Sugo AWS ${kind} 경계: ${result.reason}${usage} 대안: 저장된 스냅샷은 sugo_aws_context로 조회하고, 꼭 필요한 예외는 사용자가 ! 명령으로 직접 실행하세요.`;
}

export function evaluateHookInput(input, options = {}) {
  const command = input?.tool_input?.command ?? input?.tool_input?.cmd ?? "";
  const paths = options.paths || awsGuardPaths(options.env);
  if (paths.settings && !guardApplies(input, paths.settings, options.exists)) return { decision: "ignore", calls: [] };
  const policy = options.policy || loadAwsGuardPolicy(paths.policy);
  let result = evaluateAwsCommand(command, policy);
  let budget;
  if (result.decision === "allow") {
    const sessionId = String(input?.session_id || input?.sessionId || input?.conversation_id || "unknown-session");
    const callSummaries = result.calls.map((call) => `${call.service} ${call.operation}`);
    budget = applyUsageBudget({ callCount: result.calls.length, callSummaries, policy, usagePath: paths.usage, sessionId, now: options.now ?? Date.now() });
    if (budget.exceeded.length) {
      const recent = budget.state.events.slice(-5).flatMap((event) => event.calls?.length ? event.calls : [`${new Date(event.at).toISOString()}(${event.count})`]).slice(-5).join(", ") || "없음";
      result = ask("usage_limit", `${budget.exceeded.join(", ")} 호출 한도를 초과합니다. 직전 호출: ${recent}. 승인하면 이 세션 한도를 한 단계 확장합니다.`);
      result.calls = extractAwsCalls(command);
    }
  }
  if (result.decision !== "ignore") {
    appendAudit(paths.audit, {
      at: new Date(options.now ?? Date.now()).toISOString(),
      command: sanitizeAuditCommand(command),
      profile: profileOf(result.calls),
      decision: result.decision,
      reason: result.code,
    });
  }
  return { ...result, budget, message: decisionMessage(result, budget) };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve(data);
  });
}

async function main() {
  let input;
  try { input = JSON.parse((await readStdin()) || "{}"); } catch { process.exit(0); }
  let result;
  try { result = evaluateHookInput(input); }
  catch (error) {
    result = deny("guard_failure", `보안 훅이 안전하게 판정하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    result.message = decisionMessage(result);
  }
  if (result.decision === "ignore") process.exit(0);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: result.decision,
    permissionDecisionReason: result.message,
  } }));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/aws-readonly-guard.mjs")) main();

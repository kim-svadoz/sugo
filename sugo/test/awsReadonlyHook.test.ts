import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AWS_GUARD_POLICY,
  applyUsageBudget,
  evaluateAwsCommand,
  evaluateHookInput,
} from '../hooks/aws-readonly-guard.mjs';

const metric = 'aws cloudwatch get-metric-statistics --start-time 2026-10-01T00:00:00Z --end-time 2026-10-01T01:00:00Z --period 60';
const logs = 'aws logs filter-log-events --start-time 1790812800000 --end-time 1790816400000 --limit 100 --no-paginate';

describe('AWS readonly guard decision table', () => {
  it.each([
    ['aws ecs describe-services --cluster orders', 'allow'],
    [metric, 'allow'],
    [logs, 'allow'],
    ['aws secretsmanager get-secret-value --secret-id prod', 'deny'],
    ['aws athena start-query-execution --query-string select', 'deny'],
    ['aws ecs update-service --cluster orders', 'deny'],
    ['aws ecs describe-services --cluster orders && aws ecs update-service --cluster orders', 'deny'],
    ['python -c "import boto3"', 'deny'],
    ['bash -c "aws ecs describe-services --cluster orders"', 'deny'],
    ['aws logs filter-log-events --log-group-name orders --limit 100', 'deny'],
    ['aws cloudwatch get-metric-statistics --start-time 2026-09-29T00:00:00Z --end-time 2026-10-01T00:00:00Z --period 60', 'ask'],
    ['aws cloudwatch get-metric-data --start-time 2026-10-01T00:00:00Z --end-time 2026-10-01T01:00:00Z --metric-data-queries file://queries.json', 'ask'],
    ['for i in a b; do aws ecs describe-services --cluster "$i"; done', 'ask'],
    ['aws ecs describe-services --cluster orders | jq .services | head', 'allow'],
    ['aws ecs describe-task-definition --task-definition orders', 'deny'],
    ['npm test', 'ignore'],
    ['grep -rn "AWS Context" dashboard/frontend/src', 'ignore'],
    ['ls sugo/test | grep -i aws', 'ignore'],
    ['git commit -m "Fix aws guard false positive"', 'ignore'],
    ['git log --oneline | grep -i "aws "', 'ignore'],
    ['echo "aws s3 rm s3://bucket --recursive" | sh', 'deny'],
    ['echo aws s3 rm s3://bucket | xargs -I{} sh -c {}', 'deny'],
    ['grep "$(aws s3 rm s3://bucket)" file', 'deny'],
    ['grep "`aws s3 rm s3://bucket`" file', 'deny'],
    ['find . -exec aws s3 rm s3://bucket \\;', 'deny'],
    ['awk \'BEGIN { system("aws s3 rm s3://bucket") }\'', 'deny'],
    ['git -c alias.x="!aws s3 rm s3://bucket" x', 'deny'],
    ['git rebase --exec "aws s3 rm s3://bucket" HEAD~1', 'deny'],
    ['rg --pre "aws s3 cp" pattern', 'deny'],
    ['sudo aws ecs update-service --cluster orders', 'deny'],
    ['grep -rn boto3 src', 'ignore'],
    ['PAGER="aws s3 rm s3://bucket" git log', 'deny'],
    ['grep x file & aws ecs update-service --cluster orders', 'deny'],
    ['grep x file\naws ecs update-service --cluster orders', 'deny'],
    ['cat <(aws s3 rm s3://bucket)', 'deny'],
  ])('%s => %s', (command, expected) => {
    expect(evaluateAwsCommand(command).decision).toBe(expected);
  });

  it('asks on the 31st session call and the 11th minute call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sugo-aws-budget-'));
    const paths = { policy: join(dir, 'policy.json'), usage: join(dir, 'usage.json'), audit: join(dir, 'audit.jsonl') };
    const at = Date.parse('2026-10-01T00:00:00Z');
    for (let index = 0; index < 10; index += 1) {
      expect(evaluateHookInput({ session_id: 'minute', tool_input: { command: 'aws ecs describe-services' } }, { paths, now: at + index }).decision).toBe('allow');
    }
    expect(evaluateHookInput({ session_id: 'minute', tool_input: { command: 'aws ecs describe-services' } }, { paths, now: at + 10 }).decision).toBe('ask');

    const sessionPaths = { ...paths, usage: join(dir, 'session.json'), audit: join(dir, 'session-audit.jsonl') };
    for (let index = 0; index < 30; index += 1) {
      expect(evaluateHookInput({ session_id: 'session', tool_input: { command: 'aws ecs describe-services' } }, { paths: sessionPaths, now: at + index * 61_000 }).decision).toBe('allow');
    }
    expect(evaluateHookInput({ session_id: 'session', tool_input: { command: 'aws ecs describe-services' } }, { paths: sessionPaths, now: at + 31 * 61_000 }).decision).toBe('ask');
  });

  it('resets minute, user-local day, and session independently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sugo-aws-reset-'));
    const usagePath = join(dir, 'usage.json');
    const policy = { ...DEFAULT_AWS_GUARD_POLICY, sessionLimit: 1, dailyLimit: 1, minuteLimit: 1 };
    const beforeMidnight = new Date(2026, 8, 30, 23, 59, 59).getTime();
    expect(applyUsageBudget({ callCount: 1, policy, usagePath, sessionId: 'a', now: beforeMidnight }).exceeded).toEqual([]);
    expect(applyUsageBudget({ callCount: 1, policy, usagePath, sessionId: 'b', now: beforeMidnight + 61_000 }).exceeded).toEqual([]);
    const next = applyUsageBudget({ callCount: 1, policy, usagePath, sessionId: 'a', now: beforeMidnight + 61_001 });
    expect(next.exceeded).toContain('session');
    expect(next.used.daily).toBe(1);
  });

  it('audits all decisions without secret values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sugo-aws-audit-'));
    const paths = { policy: join(dir, 'policy.json'), usage: join(dir, 'usage.json'), audit: join(dir, 'audit.jsonl') };
    evaluateHookInput({ session_id: 'x', tool_input: { command: 'AWS_SECRET_ACCESS_KEY=super-secret aws ecs describe-services --profile prod' } }, { paths, now: 1 });
    const audit = readFileSync(paths.audit, 'utf8');
    expect(audit).toContain('[REDACTED]');
    expect(audit).not.toContain('super-secret');
    expect(audit).toContain('"profile":"prod"');
  });
});

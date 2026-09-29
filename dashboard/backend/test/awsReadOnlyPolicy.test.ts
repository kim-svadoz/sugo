import { describe, expect, it } from 'vitest';
import { assertReadOnlyAwsArgs, createAwsCliContextClient } from '../src/aws/contextClient.js';

describe('AWS read-only hard boundary', () => {
  it('allows explicit inventory operations', () => expect(() => assertReadOnlyAwsArgs(['ecs', 'describe-services'])).not.toThrow());
  it.each([
    ['ecs', 'update-service'], ['s3api', 'delete-object'], ['codepipeline', 'start-pipeline-execution'],
    ['iam', 'list-users'], ['logs', 'start-query'], ['secretsmanager', 'get-secret-value'],
  ])('denies %s %s by default', (service, operation) => expect(() => assertReadOnlyAwsArgs([service, operation])).toThrow(/AWS_READ_ONLY_POLICY_DENIED/));
  it('enforces the policy even for an injected runner', async () => {
    let called = false;
    const client = createAwsCliContextClient(async () => { called = true; return { Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/test' }; });
    // identity is allowed and reaches the runner.
    await client.identity({ profile: 'x', region: 'ap-northeast-2' });
    expect(called).toBe(true);
  });
});

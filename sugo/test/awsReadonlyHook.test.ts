import { describe, expect, it } from 'vitest';
import { awsRisk } from '../hooks/aws-readonly-guard.mjs';
describe('AWS direct-access hook', () => {
  it.each(['aws ecs update-service --force-new-deployment', 'python -c "import boto3"', 'curl https://ecs.ap-northeast-2.amazonaws.com', 'node -e "require(\'@aws-sdk/client-ecs\')"'])("blocks %s", (command) => expect(awsRisk(command)).toBe(true));
  it.each(['npm test', 'git status', 'node scripts/build.mjs'])("allows unrelated %s", (command) => expect(awsRisk(command)).toBe(false));
});

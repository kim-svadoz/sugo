import { apiJson } from './client.js';

export interface AwsGuardPolicy {
  schemaVersion: number;
  directReadEnabled: boolean;
  sessionLimit: number;
  dailyLimit: number;
  minuteLimit: number;
}

export const getAwsGuardPolicy = () => apiJson<AwsGuardPolicy>('/api/aws-guard-policy');
export const saveAwsGuardPolicy = (policy: Omit<AwsGuardPolicy, 'schemaVersion'>) => apiJson<AwsGuardPolicy>('/api/aws-guard-policy', { method: 'PUT', body: JSON.stringify(policy) });

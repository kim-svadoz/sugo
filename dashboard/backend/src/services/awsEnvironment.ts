const ENVIRONMENT_TOKENS: Record<string, string> = {
  dev: "dev", develop: "dev", development: "dev",
  stg: "stg", stage: "stg", staging: "stg",
  prd: "prd", prod: "prd", production: "prd",
};

/**
 * AWS 계정 표시 이름에서 배포 환경을 읽는다. `-`·`_`·`.`·공백으로 나눈 조각 중 표준 환경 이름이 하나
 * 있으면 dev/stg/prd로 맞추고, 없거나 여럿이면 표시 이름을 그대로 환경 이름으로 쓴다.
 */
export function environmentOfAccount(accountName: string): string {
  const found = new Set(accountName.toLowerCase().split(/[-_.\s]+/).map((part) => ENVIRONMENT_TOKENS[part]).filter(Boolean));
  return found.size === 1 ? [...found][0] : accountName;
}

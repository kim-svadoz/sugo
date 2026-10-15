# AWS 직접 조회 정책

Claude와 Codex는 AWS를 직접 조회할 때 동일한 최소권한 정책을 따른다. Claude Code의 Bash는
`hooks/aws-readonly-guard.mjs`가 실행 전에 강제하며, Codex는 이 계약과 자체 승인·샌드박스를 함께 적용한다.

- `ecs`, `ec2`, `elbv2`, `cloudwatch`, `logs`, `sagemaker`, `lambda`, `kinesis`, `dynamodb`,
  `application-autoscaling`의 `describe-*`, `list-*`, `get-*`만 허용한다.
- `logs filter-log-events`는 시간 범위·limit·`--no-paginate`가 있을 때만 예외 허용한다.
- ECS task definition, SSM/KMS/STS/IAM/Secrets Manager, SDK 스크립트, 쓰기·변경, Athena/Logs Insights
  실행, S3 객체 읽기, DynamoDB 데이터 읽기는 직접 실행하지 않는다.
- 기본 한도는 세션 30회, 사용자 로컬 날짜 하루 200회, 1분 10회다. 초과, 반복문, 넓은 조회 범위는 사람 승인을 받는다.
- 가능한 경우 먼저 `sugo_aws_context` 스냅샷을 쓴다. 예외는 사용자가 `!`로 직접 실행한다.
- 감사 로그는 `~/.claude/sugo/aws-readonly-audit.jsonl`이며 비밀값을 기록하지 않는다.

Settings의 `AWS 직접 조회 안전장치`에서 기능과 한도를 조정한다. 직접 조회를 꺼도 저장 스냅샷은
사용할 수 있다. 어떤 설정도 AWS 쓰기 작업을 허용하지 않는다.

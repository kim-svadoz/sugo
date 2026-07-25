# Poetry 하네스 (buildtool/poetry)

## 핵심 규칙

1. **`poetry.lock`을 커밋한다.** `pyproject.toml`만으로는 재현성이 보장되지 않는다.
2. **의존성 그룹을 분리.** dev 전용 패키지는 `[tool.poetry.group.dev.dependencies]`에.
3. **CI에서는 `poetry install --no-interaction --sync`로 lockfile 그대로 재현.**
4. **버전 제약은 의도를 담아서.** `^`(caret)의 의미(호환 범위)를 이해하고 사용.

## 체크리스트

- [ ] poetry.lock이 pyproject.toml 변경과 함께 커밋되었는지 확인
- [ ] dev 전용 패키지가 런타임 dependencies에 섞이지 않았는지 확인

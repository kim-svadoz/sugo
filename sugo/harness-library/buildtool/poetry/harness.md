# Poetry 하네스 (buildtool/poetry)

## 핵심 규칙

1. **`poetry.lock`을 `pyproject.toml` 변경과 함께 커밋한다.** `pyproject.toml`의 버전 범위만으로는 재현이 안 된다.
2. **CI는 `poetry install --sync`(또는 `--no-interaction`)로 lockfile 그대로 재현한다.** 그냥 install만 하면 lockfile과 다른 버전이 설치될 수 있다.

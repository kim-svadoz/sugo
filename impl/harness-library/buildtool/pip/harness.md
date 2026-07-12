# pip 하네스 (buildtool/pip)

## 핵심 규칙

1. **`requirements.txt`는 버전을 고정한다.** 최소 `==` 또는 `~=`로, 범위를 열어두지 않는다(재현성).
2. **개발 의존성과 런타임 의존성을 분리.** `requirements-dev.txt` 또는 extras로.
3. **가상환경을 항상 사용.** 시스템 파이썬에 직접 설치하지 않는다.
4. **간접 의존성까지 고정하고 싶다면 `pip freeze` 또는 `pip-compile`을 사용.**

## 체크리스트

- [ ] requirements.txt의 새 의존성이 버전 고정되어 있는지 확인
- [ ] 개발 전용 패키지가 런타임 requirements에 섞이지 않았는지 확인

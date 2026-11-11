# Sugo Console 디자인 시스템

## 한눈에 보기

- 현재 Console 외형이 기준이다. 정규화 작업은 색, 비율, 밀도, 배치를 재설계하지 않는다.
- 값의 정본은 `dashboard/frontend/src/styles/tokens.css`다.
- 공통 UI는 `dashboard/frontend/src/shared/ui`에 둔다.
- 토큰과 컴포넌트 상태는 개발 서버의 `/foundations.html`에서 확인한다.
- 화면 변경 전후에는 route 스냅샷과 overlay 스냅샷을 모두 비교한다.

## 계층

| 층 | 위치 | 책임 |
|---|---|---|
| 원시값 | `styles/tokens.css`의 `--ds-*` | spacing, radius, type scale처럼 재사용하는 실제 값 |
| 역할 | `--color-*`, `--surface-*`, `--text-*`, `--control-*` | 값에 제품 의미를 부여한다 |
| 컴포넌트 | `shared/ui`, `styles/ui.css` | 역할 토큰만 조합한다 |
| 화면 | `pages`, `components` | 제품 흐름과 배치만 담당한다 |

기존 화면에서 아직 직접 쓰는 Tailwind 값은 호환 대상이다. 화면을 수정할 때 한 번에 재설계하지 말고, 같은 계산값을 가진 역할 토큰 또는 공통 컴포넌트로 옮긴다.

## 타입 역할

| 역할 | 클래스 | 쓰임 |
|---|---|---|
| Display | `.text-display-role` | 화면 제목, 가장 중요한 결과 |
| Title | `.text-title-role` | 패널, 카드, 대화상자 제목 |
| Body | `.text-body-role` | 설명과 읽는 내용 |
| Label | `.text-label-role` | 버튼, 탭, 입력 라벨 |
| Caption | `.text-caption-role` | 메타데이터, 시각, 도움말 |

강조는 `.text-role--bright`, `.text-role--muted`, `.text-role--brand`, `.text-role--danger`, `.text-role--mono`를 조합한다.

## 공통 컴포넌트

| 컴포넌트 | 주요 규격 |
|---|---|
| `Button` | role(brand, neutral, danger, warning) × emphasis(solid, soft, ghost) × size(medium, small, xsmall) |
| `Badge` | neutral, brand, success, progress, warning, danger |
| `TextField` | label, hint, error, disabled |
| `SelectField` | native select 동작과 공통 field 표면 |
| `TextAreaField` | 공통 field 표면과 세로 resize |
| `Surface` | panel, raised, inset |
| `Modal` | 기존 Console의 default, wide, xwide 치수와 ESC/overlay 닫기 계약 |
| `LoadingSpinner`, `EmptyState` | 기존 화면 호환 상태 뷰 |

기존 import를 깨지 않기 위해 `components/Modal.tsx`와 `components/StatusViews.tsx`는 호환 엔트리로 남겨 둔다. 새 코드는 `shared/ui`에서 가져온다.

## 시각 회귀

주요 route 스냅샷은 `dashboard/e2e/shot.mjs`가 담당한다. Foundations의 component, dropdown, modal 상태는 `dashboard/e2e/shot-foundations.mjs`가 담당한다.

```bash
cd dashboard/frontend
npm run build
npm run preview -- --host 127.0.0.1 --port 4173

cd ../e2e
node shot.mjs
node shot-foundations.mjs
node compare-visual-snapshots.mjs <before-dir> <after-dir>
```

비교기는 크기 변경을 즉시 실패로 처리한다. 시간, 글꼴 안티앨리어싱, 반복 애니메이션의 작은 차이는 허용하지만, material pixel이 1.5%를 넘거나 평균 채널 변화가 1.5를 넘으면 실패한다. 자동 결과와 함께 이미지를 직접 확인한다.

## 변경 규칙

1. 기존 계산값이 있으면 새 값을 발명하지 않고 토큰으로 승격한다.
2. 새 색, 간격, radius, control 높이가 필요하면 화면 코드가 아니라 `tokens.css`에 먼저 역할을 정의한다.
3. 동일한 상호작용이 두 화면 이상에 있으면 `shared/ui`로 올린다.
4. Canvas 읽기 전용 계약과 제품 동작은 디자인 정리보다 우선한다.
5. route, modal, popup, dropdown 중 영향을 받는 상태를 전후로 촬영한다.

# 코드 주석·이름 공통 정책

이 문서는 Sugo의 프로덕션 코드, 테스트 코드, 스크립트, 예제 코드에 공통으로 적용한다.
목표는 코드를 사람처럼 보이게 꾸미는 것이 아니다. 저장소의 기존 언어로 정확하고 밀도 높은 코드를
남기는 것이 목표다. 작성자가 사람인지 AI인지 추측하거나 판정하지 않는다.

## 1. 기본값은 주석을 쓰지 않는 것이다

코드를 작성할 때 주석을 함께 만드는 습관을 버린다. 독자가 코드를 읽으면 알 수 있는 내용은 어떤
형태로도 다시 설명하지 않는다. 주석이 필요해 보이면 먼저 이름, 함수 경계, 타입, 제어 흐름으로
의도를 표현한다. 그래도 코드에 담을 수 없는 이유나 제약이 남을 때만 주석을 쓴다.

다음 위치에도 관성적으로 주석을 붙이지 않는다.

- 함수, 분기, 반복문, 예외 처리의 시작
- 변수 선언, 데이터 변환, 반환문 바로 위
- 파일·클래스·테스트의 각 논리 블록
- 짧은 내부 함수와 private 메서드의 doc comment
- 테스트의 arrange/act/assert 또는 given/when/then 경계

## 2. 다음 형태의 주석은 만들지 않는다

- 바로 아래 코드의 동작을 한국어나 영어로 다시 읽어 주는 주석
- `Step 1`, `Step 2`처럼 구현 순서를 중계하는 주석
- `Initialize`, `Get`, `Fetch`, `Validate`, `Process`, `Convert`, `Return`, `Handle`, `Ensure`,
  `Keep`, `Track`, `Build`로 시작해 다음 코드 한 줄을 요약하는 주석
- 함수명·타입·테스트명이 이미 말하는 내용을 반복하는 doc comment
- 작업 과정, 에이전트의 생각, 사용자 요청, 이번 수정 내역을 기록한 주석
- `====`, `----`, `####` 같은 장식용 구분선, 배너, 파일 목차
- “명확성을 위해”, “안전하게”, “필요한 경우”처럼 근거 없이 의도를 포장하는 주석

금지 예시:

```ts
// 사용자 데이터를 가져온다.
const users = await getUsers();

// Filter active users.
const activeUsers = users.filter(isActive);

// Step 1: Validate input
validate(input);

// Handle errors.
catch (error) {
  handleError(error);
}

// ==================== Helper Functions ====================
```

테스트도 같다.

```ts
// Arrange
const request = createRequest();
// Act
const result = execute(request);
// Assert
expect(result).toEqual(expected);
```

주석을 지우면 코드가 이해되지 않는다면 주석을 늘리지 말고 코드를 먼저 고친다.

## 3. 주석을 허용하는 좁은 범위

다음처럼 코드만으로 보존할 수 없는 정보는 주석으로 남긴다.

- 외부 시스템, 프로토콜, 보안, 성능, 호환성 때문에 생긴 제약
- 보기에는 이상하지만 의도한 동작인 이유
- 선택하지 않은 대안과 중요한 trade-off
- 복잡한 알고리즘, 정규식, 수학식의 불변조건
- 추적 가능한 이슈가 있는 TODO와 제거 조건

허용 예시:

```ts
// AWS returns this timestamp without a zone, but the field is always UTC.
```

```ts
// Do not retry this call. A repeated request can create a duplicate payment.
```

```css
/* Safari 17 ignores this rule unless the parent creates a stacking context. */
```

공개 API 문서는 사용 계약, 부작용, 오류 조건을 설명할 수 있다. 구현을 줄 단위로 중계하는 문서와
구분한다. 기존 저장소나 프레임워크가 문서 생성을 요구하더라도 내용을 반복하지 않고 계약만 쓴다.

## 4. 먼저 저장소의 언어를 찾는다

- 새 식별자를 만들기 전에 같은 책임과 도메인 개념을 표현한 기존 코드를 검색한다.
- 저장소의 기존 도메인 어휘, 약어, 대소문자, 접두·접미 규칙을 우선한다.
- 이름은 역할이나 값을 정확히 구분할 만큼 길게 쓴다. 자연어 문장처럼 길게 만들지는 않는다.
- 타입이나 주변 문맥이 이미 말하는 정보는 이름에 반복하지 않는다.
- `manager`, `helper`, `processor`, `handler`, `data`, `result`, `util`은 실제 책임을 더 정확한
  도메인 용어로 표현할 수 없을 때만 쓴다.

좋음: 기존 저장소가 쓰는 `deploymentSnapshot`, `expiryState`, `roadmapNode`.

피함: `processedAndValidatedDeploymentSnapshotResult`, `handleSuccessfulData`, `commonHelper`.

## 5. 실행되는 테스트에는 한글 표시 이름을 쓴다

JUnit에서 실제로 실행되는 테스트 메서드에는 항상 `@DisplayName`을 붙인다. `@Test`,
`@ParameterizedTest`, `@RepeatedTest`, `@TestFactory`처럼 테스트 러너가 실행하는 단위가 대상이다.
표시 이름은 테스트 결과를 보는 사용자가 알아보기 쉬운 한글로 작성하고, 테스트 대상의 상황·행위와
기대 결과를 함께 드러낸다. 메서드명을 그대로 번역하거나 클래스명·기술 식별자만 나열하지 않는다.

```java
@Test
@DisplayName("로그인하지 않은 사용자는 주문 내역을 조회할 수 없다")
void rejectsOrderHistoryRequestWithoutLogin() {
    assertThatThrownBy(() -> orderHistory.getFor(anonymousUser))
        .isInstanceOf(UnauthorizedException.class);
}
```

테스트 러너가 직접 실행하지 않는 helper 메서드, fixture factory, setup 메서드에는 `@DisplayName`을
붙이지 않는다. JUnit이 아닌 테스트 프레임워크에서는 그 프레임워크의 표시 이름 기능을 사용해 같은
원칙으로 사용자에게 보이는 한글 테스트명을 작성한다.

## 6. 변경 범위를 지킨다

- 이번 변경에서 추가하거나 수정한 코드와 직접 관련된 낡은 주석만 정리한다.
- 기능 변경에 저장소 전체 주석 삭제, 대규모 이름 변경, 전체 포맷을 섞지 않는다.
- 기존 이름이 불완전해도 공개 계약, 직렬화 필드, DB 컬럼, 외부 API라면 호환성을 먼저 확인한다.
- 주석 수나 이름 길이만으로 실패를 판정하지 않는다. 의미와 저장소 일관성을 본다.

## 7. 에이전트별 책임

- **code-agent**: 주석 없이 명확한 코드를 기본 출력으로 만든다. 구현 전에 기존 이름을 검색한다.
- **test-agent**: 테스트 이름과 fixture 이름도 도메인 행위와 기대 결과를 표현한다. 실제 실행되는
  JUnit 테스트에는 사용자가 알아보기 쉬운 한글 `@DisplayName`을 항상 붙인다. arrange/act/assert를
  비롯한 단계 중계 주석은 쓰지 않는다. 복잡한 테스트 데이터의 이유와 회귀 조건만 남긴다.
- **review-agent**: 새 diff의 주석과 식별자를 검토한다. 코드로 자명한 주석, 저장소 어휘와 어긋난
  이름, 모호한 범용 이름을 근거와 함께 지적한다. 취향만 다른 경우에는 실패로 판정하지 않는다.
- **docs-agent**: 문서의 코드 예제를 새로 만들거나 고칠 때 같은 기준을 따른다. 실제 코드에 없는
  이름을 문서 편의를 위해 발명하지 않는다.

리뷰에서 문제를 발견하면 “AI스럽다”라고 쓰지 않는다. 중복 정보, 모호한 책임, 저장소 어휘 불일치,
코드와 주석의 drift 위험처럼 사람이 확인할 수 있는 이유를 쓴다.

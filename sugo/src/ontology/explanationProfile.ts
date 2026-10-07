export const EXPLANATION_PROFILES = ["ste-inspired-ko", "asd-ste100-en"] as const;

export type ExplanationProfile = typeof EXPLANATION_PROFILES[number];

export interface ExplanationProfileContract {
  profile: ExplanationProfile;
  language: "ko" | "en";
  standard: "ASD-STE100 Issue 9";
  compliance: "principles-applied" | "unverified-until-qualified-review";
  sourceOfTruth: "result";
  rules: readonly string[];
}

/**
 * 표현 프로필은 운영 질의의 사실을 다시 계산하지 않는다. 호출자는 result를 유일한 사실 원본으로
 * 사용하고 이 계약으로 문장만 작성한다. 정식 STE 준수는 사전·규칙 검사와 전문 검토 없이는
 * 증명할 수 없으므로 영어 프로필도 명시적으로 unverified다.
 */
export function explanationProfileContract(profile: ExplanationProfile): ExplanationProfileContract {
  if (profile === "ste-inspired-ko") {
    return {
      profile,
      language: "ko",
      standard: "ASD-STE100 Issue 9",
      compliance: "principles-applied",
      sourceOfTruth: "result",
      rules: [
        "result의 사실, 식별자, 상태, 수치, 근거를 추가하거나 변경하지 않는다.",
        "한 문장에는 한 가지 주제 또는 한 가지 행동만 쓴다.",
        "짧은 능동문을 쓰고 행위 주체와 다음 행동을 명확히 쓴다.",
        "같은 개념에는 항상 같은 용어를 쓴다.",
        "현재 상태, 원인 또는 근거, 필요한 행동, 행동 뒤의 단계를 이 순서로 쓴다.",
        "한국어 출력은 ASD-STE100 준수라고 표시하지 않는다.",
      ],
    };
  }
  return {
    profile,
    language: "en",
    standard: "ASD-STE100 Issue 9",
    compliance: "unverified-until-qualified-review",
    sourceOfTruth: "result",
    rules: [
      "Do not add or change facts, identifiers, states, values, or evidence in result.",
      "Write one instruction or one topic in each sentence.",
      "Use short active sentences and identify the actor when it is necessary.",
      "Use the same term for the same item.",
      "Put conditions before the related instruction.",
      "Write the current state, the cause or evidence, the required action, and the next state in this order.",
      "Do not claim verified ASD-STE100 compliance without a dictionary and rule check plus qualified review.",
    ],
  };
}

import { createContext, useContext } from "react";

export interface OnboardingGuideContextValue {
  playbookGuideVisible: boolean;
  setPlaybookGuideVisible: (visible: boolean) => void;
}

export const OnboardingGuideContext = createContext<OnboardingGuideContextValue | null>(null);

export function useOnboardingGuide() {
  const value = useContext(OnboardingGuideContext);
  if (!value) throw new Error("useOnboardingGuide must be used inside Layout");
  return value;
}

import { useCallback, useEffect, useState } from "react";
import { getProfile, updateProfile, type UserProfile } from "../api/profileApi.js";

const PROFILE_CHANGED = "sugo:profile-changed";
let cachedProfile: UserProfile | null = null;

export function useProfile(fallbackUserId: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(cachedProfile);
  const refresh = useCallback(async () => {
    const next = await getProfile();
    cachedProfile = next;
    setProfile(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh().catch(() => undefined);
    const listener = () => void refresh().catch(() => undefined);
    window.addEventListener(PROFILE_CHANGED, listener);
    return () => window.removeEventListener(PROFILE_CHANGED, listener);
  }, [refresh]);
  const saveDisplayName = useCallback(async (displayName: string) => {
    const next = await updateProfile(displayName);
    cachedProfile = next;
    setProfile(next);
    window.dispatchEvent(new Event(PROFILE_CHANGED));
    return next;
  }, []);
  return { profile, displayName: profile?.displayName || fallbackUserId || "사용자", saveDisplayName };
}

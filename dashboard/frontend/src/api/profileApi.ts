import { apiJson } from "./client.js";

export interface UserProfile { userId: string; displayName: string }

export function getProfile(): Promise<UserProfile> {
  return apiJson<UserProfile>("/api/profile");
}

export function updateProfile(displayName: string): Promise<UserProfile> {
  return apiJson<UserProfile>("/api/profile", { method: "PUT", body: JSON.stringify({ displayName }) });
}

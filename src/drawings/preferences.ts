import type { DrawingProfile } from "./types";
import { parseDrawingProfile } from "./profiles";

export const DRAWING_PREFERENCES_KEY = "draftelm.drawing-preferences.v1";
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface PreferenceResult { profile: DrawingProfile | null; message: string }

/** Explicit save/load; no browser globals at import time and no geometry in storage. */
export function saveDrawingPreferences(storage: PreferenceStorage, profile: DrawingProfile, baseProfileId: string): PreferenceResult {
  const parsed = parseDrawingProfile(profile);
  if (!parsed.profile) return { profile: null, message: parsed.issues.join(" ") };
  if (!["furniture-workshop", "engineering"].includes(baseProfileId)) return { profile: null, message: "Unknown base drawing profile." };
  try {
    const custom = { ...parsed.profile, id: `custom-${baseProfileId}`, name: `Custom ${baseProfileId === "engineering" ? "Engineering" : "Furniture Workshop"}` };
    storage.setItem(DRAWING_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 3, baseProfileId, profile: custom }));
    return { profile: custom, message: "Drawing preferences saved in this browser." };
  } catch { return { profile: null, message: "Browser storage is unavailable or full. Current settings remain available." }; }
}
export function loadDrawingPreferences(storage: PreferenceStorage): PreferenceResult & { baseProfileId?: string } {
  try {
    const raw = storage.getItem(DRAWING_PREFERENCES_KEY);
    if (raw === null) return { profile: null, message: "No drawing preferences have been saved in this browser." };
    if (raw.length > 20000) return { profile: null, message: "Saved drawing preferences are too large." };
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error();
    const envelope = saved as Record<string, unknown>;
    if (![1, 2, 3].includes(Number(envelope.schemaVersion)) || typeof envelope.schemaVersion !== "number" || typeof envelope.baseProfileId !== "string" || !["furniture-workshop", "engineering"].includes(envelope.baseProfileId) || Object.keys(envelope).some(k => !["schemaVersion", "baseProfileId", "profile"].includes(k))) throw new Error();
    const parsed = parseDrawingProfile(envelope.profile);
    if (!parsed.profile) return { profile: null, message: `Saved preferences were not loaded. ${parsed.issues.join(" ")}` };
    const migrated = (envelope.profile as { schemaVersion?: unknown })?.schemaVersion !== 3;
    return { profile: parsed.profile, baseProfileId: envelope.baseProfileId, message: migrated ? "Saved older preferences migrated to v3; previous sheets and panel callouts retained. Reset enables assembly sheets." : "Saved drawing preferences loaded. Preview updated." };
  } catch { return { profile: null, message: "Saved drawing preferences could not be read. Current settings are unchanged." }; }
}

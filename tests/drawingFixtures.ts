import { getDrawingProfile } from "../src/drawings";

/** Retain the pre-5B.2 panel-level regression matrix alongside the new default
 * assembly-scope matrix. This is also the saved-v2 migration presentation. */
export function getPanelRegressionProfile(id?: string) {
  const profile = getDrawingProfile(id);
  profile.contents.assemblySheets = { exploded: false, drawers: false, carcass: false };
  profile.annotations.gaLevel = "panels";
  return profile;
}

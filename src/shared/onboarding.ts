/*
 * The first-run welcome (renderer/onboarding): whether a launch shows it. Pure, so it is tested
 * without Electron; main/onboarding.ts keeps the record in the profile.
 *
 * It shows on a profile's first launch, which is a profile with no settings file yet (v0.7.x kept
 * its settings in the page's storage, not in that file, so people coming from it see it too), and
 * again on the next launch if it was left unfinished. A profile that already had settings when
 * this arrived, someone who set up 0.8.0, never sees it unasked: Settings → About opens it.
 */

/** What the profile records: whether the welcome was seen through to its end. */
export type OnboardingRecord = { finished: boolean }

/** A record read from disk, or null when there is none or it is not one. */
export function readOnboardingRecord(raw: unknown): OnboardingRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const finished = (raw as Record<string, unknown>)['finished']
  return typeof finished === 'boolean' ? { finished } : null
}

/** Whether this launch opens with the welcome. `firstRun`: the profile had no settings yet. */
export function needsOnboarding(record: OnboardingRecord | null, firstRun: boolean): boolean {
  return record ? !record.finished : firstRun
}

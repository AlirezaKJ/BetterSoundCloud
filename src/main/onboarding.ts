import { app } from 'electron'
import { join } from 'node:path'
import { readJson, writeJson } from './json-file'
import { needsOnboarding, readOnboardingRecord } from '@shared/onboarding'

/*
 * The first-run welcome's record in the profile, `<userData>/onboarding.json`: whether it was seen
 * through to its end. When it shows is decided in shared/onboarding.ts.
 */

function recordFile(): string {
  return join(app.getPath('userData'), 'onboarding.json')
}

/**
 * Whether this launch opens with the welcome. On a first run it is recorded as unfinished at once,
 * so quitting half way brings it back next time rather than never.
 */
export function shouldOnboard(firstRun: boolean): boolean {
  const record = readOnboardingRecord(readJson(recordFile()))
  const show = needsOnboarding(record, firstRun)
  if (show && !record) writeJson(recordFile(), { finished: false })
  return show
}

/** Seen through to its end. Opening it again from Settings → About changes nothing here. */
export function recordOnboardingFinished(): void {
  writeJson(recordFile(), { finished: true })
}

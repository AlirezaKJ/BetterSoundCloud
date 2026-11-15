import type { Settings } from '@shared/settings-schema'
import type { UpdateReach } from '@shared/updates'
import type { OnboardingFigureName } from './onboarding-figure'

/*
 * The first-run welcome's questions, in order: the one place to add, remove, reorder or reword
 * them (asked for by the maintainer, 2026-11-15, "we will be modifying it a lot").
 *
 * Every answer is a real setting, written the moment it is chosen, so leaving half way keeps what
 * was chosen and the defaults stand for the rest. The tile shown as chosen is the one whose
 * settings match what is stored, so a question opens on the current value, defaults included.
 *
 * The words follow DESIGN.md's voice: plain, specific, honest about what each choice costs.
 */

/** What a tile shows above its name: one of our line drawings, a mode picture, or none. */
export type Picture =
  | { kind: 'figure'; name: OnboardingFigureName }
  | { kind: 'mode'; name: 'mode-light' | 'mode-dark' | 'mode-system' }

/** One answer. */
export type Choice = {
  id: string
  label: string
  detail: string
  picture?: Picture
  /** The settings this answer writes, together. */
  set: Partial<Settings>
}

/** One answer of the sign-in step: what pressing Continue does. */
export type SignInChoice = {
  id: 'soundcloud' | 'browser' | 'later'
  label: string
  detail: string
  /** Continue's own words while this answer is chosen. */
  action: string
}

export type Step =
  | { kind: 'welcome'; id: string; title: string; lead: string }
  | {
      kind: 'choice'
      id: string
      title: string
      lead: string
      /** Only on these systems (`window.bsc.platform`); every system when absent. */
      platforms?: string[]
      choices: Choice[]
    }
  /** The themes on disk, None first, each with its picture. */
  | { kind: 'theme'; id: string; title: string; lead: string }
  /** A built-in plugin on or off; once on, its own status line and buttons show under it. */
  | {
      kind: 'plugin'
      id: string
      plugin: string
      title: string
      lead: string
      on: { label: string; detail: string; picture: OnboardingFigureName }
      off: { label: string; detail: string; picture: OnboardingFigureName }
    }
  | { kind: 'sign-in'; id: string; title: string; lead: string; choices: SignInChoice[] }

export const STEPS: Step[] = [
  {
    kind: 'welcome',
    id: 'welcome',
    title: 'Welcome to BetterSoundCloud',
    lead:
      'SoundCloud on your desktop, with what a browser tab can’t do: protected tracks that play, ' +
      'ads kept out, your music on Discord. A few questions first; every answer can be changed ' +
      'later in Settings.'
  },
  {
    kind: 'choice',
    id: 'ads',
    title: 'Block ads?',
    lead:
      'SoundCloud plays short audio ads between tracks, and shows ads and tracking scripts on its ' +
      'page. Sign-in, its bot check and playback are never blocked.',
    choices: [
      {
        id: 'audio',
        label: 'The audio ads',
        detail: 'Tracks play one after another, with no ad between them.',
        picture: { kind: 'figure', name: 'ads-audio' },
        set: { 'advanced.blockAudioAds': true, 'advanced.adBlocker': false }
      },
      {
        id: 'all',
        label: 'Audio ads and the page’s ads',
        detail: 'Also hides display ads and trackers on SoundCloud’s page.',
        picture: { kind: 'figure', name: 'ads-all' },
        set: { 'advanced.blockAudioAds': true, 'advanced.adBlocker': true }
      },
      {
        id: 'none',
        label: 'Neither',
        detail: 'SoundCloud plays its ads, as it does in a browser.',
        picture: { kind: 'figure', name: 'ads-none' },
        set: { 'advanced.blockAudioAds': false, 'advanced.adBlocker': false }
      }
    ]
  },
  {
    kind: 'choice',
    id: 'mode',
    title: 'Light or dark?',
    lead:
      'For BetterSoundCloud’s own bar and panels, and this welcome. SoundCloud’s page keeps a ' +
      'light or dark setting of its own, in SoundCloud’s settings.',
    choices: [
      {
        id: 'system',
        label: 'System',
        detail: 'Follows your computer, light by day if it is.',
        picture: { kind: 'mode', name: 'mode-system' },
        set: { 'appearance.colorScheme': 'system' }
      },
      {
        id: 'light',
        label: 'Light',
        detail: 'Always light.',
        picture: { kind: 'mode', name: 'mode-light' },
        set: { 'appearance.colorScheme': 'light' }
      },
      {
        id: 'dark',
        label: 'Dark',
        detail: 'Always dark.',
        picture: { kind: 'mode', name: 'mode-dark' },
        set: { 'appearance.colorScheme': 'dark' }
      }
    ]
  },
  {
    kind: 'theme',
    id: 'theme',
    title: 'Pick a theme',
    lead:
      'A theme restyles SoundCloud’s page and our bar. None keeps SoundCloud’s own look. Your own ' +
      'themes go in the themes folder, from Settings → Themes.'
  },
  {
    kind: 'choice',
    id: 'glass',
    title: 'See your desktop through the window?',
    lead:
      'Glass puts the whole window on a dark, live blur of whatever is behind it. It needs ' +
      'Windows 11 and hardware acceleration, and takes the place of a background picture.',
    platforms: ['win32'],
    choices: [
      {
        id: 'solid',
        label: 'Solid',
        detail: 'The window stays opaque, in the theme’s colours.',
        picture: { kind: 'figure', name: 'glass-off' },
        set: { 'appearance.glass': false }
      },
      {
        id: 'glass',
        label: 'Glass',
        detail: 'Your desktop shows through, blurred and darkened.',
        picture: { kind: 'figure', name: 'glass-on' },
        set: { 'appearance.glass': true }
      }
    ]
  },
  {
    kind: 'choice',
    id: 'discord',
    title: 'Show what you’re playing on Discord?',
    lead:
      'Your Discord profile shows the track, its artwork and a button to listen. It needs the ' +
      'Discord app running on this computer, and nothing is sent anywhere else.',
    choices: [
      {
        id: 'show',
        label: 'Show it',
        detail: 'Friends see the track while it plays; pausing clears it.',
        picture: { kind: 'figure', name: 'discord-on' },
        set: { 'discord.enabled': true }
      },
      {
        id: 'hide',
        label: 'Keep it to myself',
        detail: 'Discord shows nothing about your listening.',
        picture: { kind: 'figure', name: 'discord-off' },
        set: { 'discord.enabled': false }
      }
    ]
  },
  {
    kind: 'plugin',
    id: 'lastfm',
    plugin: 'lastfm',
    title: 'Scrobble to Last.fm?',
    lead:
      'Last.fm keeps a record of everything you listen to, for your charts and recommendations ' +
      'there. Once it is on, you connect your account in your browser.',
    on: {
      label: 'Turn it on',
      detail: 'Then connect your Last.fm account with the button below.',
      picture: 'lastfm-on'
    },
    off: {
      label: 'Not now',
      detail: 'Turn it on any time in Settings → Plugins.',
      picture: 'lastfm-off'
    }
  },
  {
    kind: 'choice',
    id: 'startup',
    title: 'Where should SoundCloud open?',
    lead: 'The page you see each time BetterSoundCloud starts.',
    choices: [
      {
        id: 'discover',
        label: 'Home',
        detail: 'What SoundCloud suggests for you.',
        picture: { kind: 'figure', name: 'start-home' },
        set: { 'general.startupUrl': 'discover' }
      },
      {
        id: 'stream',
        label: 'Feed',
        detail: 'New uploads from people you follow.',
        picture: { kind: 'figure', name: 'start-feed' },
        set: { 'general.startupUrl': 'stream' }
      },
      {
        id: 'library',
        label: 'Library',
        detail: 'Your likes, playlists and history.',
        picture: { kind: 'figure', name: 'start-library' },
        set: { 'general.startupUrl': 'library' }
      },
      {
        id: 'lastVisited',
        label: 'Where you left off',
        detail: 'The page you last had open.',
        picture: { kind: 'figure', name: 'start-last' },
        set: { 'general.startupUrl': 'lastVisited' }
      }
    ]
  },
  {
    kind: 'choice',
    id: 'close',
    title: 'When you close the window…',
    lead:
      'Closing can quit, or keep the music playing with BetterSoundCloud in the tray. Quit from ' +
      'the tray menu ends it.',
    platforms: ['win32', 'linux'],
    choices: [
      {
        id: 'quit',
        label: 'Quit',
        detail: 'Closing the window stops the music.',
        picture: { kind: 'figure', name: 'close-quit' },
        set: { 'general.minimizeToTray': false }
      },
      {
        id: 'tray',
        label: 'Keep playing in the tray',
        detail: 'The tray icon brings the window back.',
        picture: { kind: 'figure', name: 'close-tray' },
        set: { 'general.minimizeToTray': true }
      }
    ]
  },
  {
    kind: 'choice',
    id: 'updates',
    title: 'Update automatically?',
    // Worded for a copy that installs its own updates; `stepsFor` rewords it for one that can
    // only say a new version is out, and leaves it out for one that can do neither (§20).
    lead:
      'SoundCloud changes often, and new versions keep up with it. This copy downloads them from ' +
      'GitHub in the background and installs them when you quit.',
    choices: [
      {
        id: 'auto',
        label: 'Keep me up to date',
        detail: 'Checked twice a day; one notification when one is ready.',
        set: { 'general.checkForUpdates': true }
      },
      {
        id: 'manual',
        label: 'I’ll check myself',
        detail: 'Nothing is checked until you ask, in Settings → About.',
        set: { 'general.checkForUpdates': false }
      }
    ]
  },
  {
    kind: 'sign-in',
    id: 'sign-in',
    title: 'Sign in to SoundCloud',
    lead:
      'Last step. Sign in on SoundCloud’s own page, as you would in a browser. If you sign in ' +
      'with Google, Apple or Facebook and it fails here, bring your browser’s sign-in instead.',
    choices: [
      {
        id: 'soundcloud',
        label: 'Sign in on SoundCloud',
        detail: 'Opens SoundCloud’s sign-in page.',
        action: 'Open SoundCloud’s sign-in'
      },
      {
        id: 'browser',
        label: 'Bring my browser’s sign-in',
        detail:
          'From a Cookie-Editor JSON export of soundcloud.com. Only the sign-in is taken; delete ' +
          'the file after.',
        action: 'Choose the export…'
      },
      {
        id: 'later',
        label: 'Later, or I’m signed in',
        detail: 'SoundCloud’s own Sign in button is at the top of its page.',
        action: 'Start listening'
      }
    ]
  }
]

/** The updates question for a copy that cannot replace itself (portable, .deb, .rpm). */
const UPDATES_TOLD_LEAD =
  'SoundCloud changes often, and new versions keep up with it. This copy can’t replace itself, ' +
  'so it checks GitHub and tells you when a new version is out, with a link to it.'

/**
 * The steps this copy gets: a question about a feature it lacks is left out (Glass off Windows,
 * the tray on macOS, updates in a copy that cannot even be told about them, such as one run from
 * source), and the updates question says what this copy will really do.
 */
export function stepsFor(platform: string, updates: UpdateReach): Step[] {
  return STEPS.flatMap((step): Step[] => {
    if (step.kind === 'choice' && step.platforms && !step.platforms.includes(platform))
      return []
    if (step.id === 'updates' && updates === 'none') return []
    if (step.id === 'updates' && updates === 'tell')
      return [{ ...step, lead: UPDATES_TOLD_LEAD }]
    return [step]
  })
}

/** Whether an answer is what is stored now: every setting it writes has that value. */
export function isChosen(choice: Choice, values: Settings): boolean {
  return Object.entries(choice.set).every(
    ([key, value]) => values[key as keyof Settings] === value
  )
}

/** The drawings beside Settings' rows and on its Light or dark tiles (SettingFigure.svelte). */
export type FigureName =
  | 'hide-bar'
  | 'auto-hide'
  | 'stretch-bars'
  | 'minimal-nav'
  | 'player-buttons'
  | 'mode-light'
  | 'mode-dark'
  | 'mode-system'

/** The window's layout settings as they are now: every drawing shows all of them. */
export type WindowLayout = {
  /** Our bar hidden ("Hide the BetterSoundCloud bar", or auto-hide, which implies it). */
  barHidden: boolean
  /** SoundCloud's header hidden until the pointer touches the top edge. */
  autoHide: boolean
  stretched: boolean
  minimalNavigation: boolean
  playerButtons: boolean
}

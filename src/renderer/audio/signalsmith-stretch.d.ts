/**
 * The pitch shifter's one file (npm `signalsmith-stretch`), as a URL Vite serves from our own
 * origin. main.ts imports the module from it and points the library's worklet at it too, so the
 * file loads from 'self', as this view's CSP requires.
 */
declare module 'signalsmith-stretch?url' {
  const url: string
  export default url
}

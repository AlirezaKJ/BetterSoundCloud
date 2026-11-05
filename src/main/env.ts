/**
 * One definition of "are we running from the dev server", so main-process modules agree.
 *
 * electron-vite sets ELECTRON_RENDERER_URL only for `npm run dev`, so its presence is the
 * signal. Kept in its own file because more than one module needs it and importing it from
 * window.ts would make every consumer depend on the window layer.
 */
export const isDev = !!process.env['ELECTRON_RENDERER_URL']

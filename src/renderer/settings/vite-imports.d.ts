// Vite turns these imports into a file's URL (an image the view shows) or its text (the
// changelog's "What's new" in Settings → About) when it builds the view.
declare module '*?url' {
  const url: string
  export default url
}

declare module '*?raw' {
  const text: string
  export default text
}

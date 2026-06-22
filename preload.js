const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true,
});

Object.defineProperty(navigator, 'userAgent', {
  get: () => CHROME_UA,
  configurable: true,
});

if (!window.chrome) {
  window.chrome = { runtime: {} };
}
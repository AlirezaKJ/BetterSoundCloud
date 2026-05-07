const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: "app/lib/assets/icon",
  },
  // files: [
  //   'dist/**/*',
  //   'node_modules/**/*',
  //   'package.json',
  // ],
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "BetterSoundCloud",
        icon: "app/lib/assets/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-wix",
      platforms: ["win32"],
      config: {
        language: 1033,
        icon: "app/lib/assets/icon.ico",
        manufacturer: 'AKJStudio'
      },
    },
    {
      name: "@electron-forge/maker-appx",
      platforms: ["win32"],
      config: {
        publisher: "CN=developmentca",
        icon: "app/lib/assets/icon.ico",
        // devCert: 'C:\\devcert.pfx',
        // certPass: 'abcd'
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32", "darwin"],
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

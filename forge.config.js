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
      name: "@electron-forge/maker-appx",
      config: {
        publisher: "CN=developmentca",
        icon: "app/lib/assets/icon.ico",
        // devCert: 'C:\\devcert.pfx',
        // certPass: 'abcd'
      },
    },
    {
      name: "@electron-forge/maker-wix",
      config: {
        language: 1033,
        icon: "app/lib/assets/icon.ico",
        // manufacturer: 'My Awesome Company'
      },
    },
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        icon: "app/lib/assets/icon.ico",
        // certificateFile: './cert.pfx',
        // certificatePassword: process.env.CERTIFICATE_PASSWORD
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
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

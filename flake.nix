{
  description = "A PC client of SoundCloud with improvement made using electronjs";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      pname = packageJson.name;
      inherit (packageJson) version;
    in
      with pkgs; {
        packages.default = buildNpmPackage {
          inherit pname version;
          src = ./.;

          npmDepsHash = "sha256-zEmUjwhEx734yjEYK8/2aMiCZRpaTaoKx/Mt+KEhlw0=";
          nativeBuildInputs = [electron];
          dontNpmBuild = true;

          ELECTRON_SKIP_BINARY_DOWNLOAD = 1;

          postInstall = ''
            makeWrapper ${lib.getExe electron} $out/bin/${pname} \
              --add-flags $out/lib/node_modules/${pname}/main.js
          '';

          meta = with lib; {
            description = "A PC client of SoundCloud with improvement made using electronjs";
            homepage = "https://github.com/AlirezaKJ/BetterSoundCloud";
            license = licenses.mit;
            inherit (electron.meta) platforms;
          };
        };

        apps.default = flake-utils.lib.mkApp {
          drv = self.packages.${system}.default;
        };
      });
}

{
  description = "Knowledge graph CLI for any project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      # Home manager module for installing skills
      homeManagerModule = { config, lib, pkgs, ... }:
        let
          cfg = config.programs.omnigraph;
        in
        {
          options.programs.omnigraph = {
            enable = lib.mkEnableOption "omnigraph skills and configuration";

            installSkills = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Install opencode skills for omnigraph";
            };
          };

          config = lib.mkIf cfg.enable {
            xdg.configFile = lib.mkIf cfg.installSkills {
              "opencode/skills/omnigraph/SKILL.md" = {
                source = "${self}/memory/skills/omnigraph/SKILL.md";
                force = true;
              };
            };
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        # Copy entire source tree to nix store
        source = pkgs.stdenv.mkDerivation {
          pname = "omnigraph-src";
          version = "0.2.0";
          src = self;
          
          installPhase = ''
            mkdir -p $out/share/omnigraph
            cp -r . $out/share/omnigraph
            rm -rf $out/share/omnigraph/.omnigraph $out/share/omnigraph/result
            # Remove the shebang from omnigraph.ts
            tail -n +2 $out/share/omnigraph/omnigraph.ts > $out/share/omnigraph/omnigraph.tmp.ts
            mv $out/share/omnigraph/omnigraph.tmp.ts $out/share/omnigraph/omnigraph.ts
          '';
        };
      in
      {
        packages.omnigraph = pkgs.writeShellScriptBin "omnigraph" ''
          exec ${pkgs.bun}/bin/bun run ${source}/share/omnigraph/omnigraph.ts "$@"
        '';

        packages.default = self.packages.${system}.omnigraph;

        apps.omnigraph = flake-utils.lib.mkApp {
          drv = self.packages.${system}.omnigraph;
        };

        apps.default = self.apps.${system}.omnigraph;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
          ];

          shellHook = ''
            export PATH="$PWD:$PATH"
          '';
        };
      }
    ) // {
      homeManagerModules = {
        default = homeManagerModule;
        omnigraph = homeManagerModule;
      };
    };
}

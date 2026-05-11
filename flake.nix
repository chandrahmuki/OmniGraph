{
  description = "Knowledge graph CLI for any project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
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
            rm -rf $out/share/omnigraph/.omnigraph
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
    );
}

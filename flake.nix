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
        
        omnigraph-store-path = pkgs.stdenv.mkDerivation {
          pname = "omnigraph";
          version = "0.2.0";
          src = self;
          
          installPhase = ''
            mkdir -p $out/share/omnigraph
            # Remove the shebang line and let bun handle it
            tail -n +2 omnigraph.ts > $out/share/omnigraph/omnigraph.ts
            cp package.json $out/share/omnigraph/
            
            # Copy node_modules if exists
            if [ -d node_modules ]; then
              cp -r node_modules $out/share/omnigraph/
            fi
            
            echo $out > $out/share/omnigraph-path
          '';
        };
      in
      {
        packages.omnigraph = pkgs.writeShellScriptBin "omnigraph" ''
          OMNIGRAPH_PATH=$(cat ${omnigraph-store-path}/share/omnigraph-path)
          exec ${pkgs.bun}/bin/bun run "$OMNIGRAPH_PATH/share/omnigraph/omnigraph.ts" "$@"
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

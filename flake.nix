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
        
        omnigraph-script = pkgs.writeScript "omnigraph.ts" (builtins.readFile ./omnigraph.ts);
      in
      {
        packages.omnigraph = pkgs.writeShellScriptBin "omnigraph" ''
          exec ${pkgs.bun}/bin/bun run ${omnigraph-script} "$@"
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

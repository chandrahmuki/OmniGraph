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
        
        omnigraph-pkg = pkgs.buildNpmPackage {
          pname = "omnigraph";
          version = "0.2.0";
          src = self;
          
          nativeBuildInputs = with pkgs; [ bun ];
          buildInputs = with pkgs; [ bun ];
          
          # Just copy the ts file and create a wrapper
          installPhase = ''
            mkdir -p $out/bin $out/share/omnigraph
            cp omnigraph.ts $out/share/omnigraph/
            cp package.json $out/share/omnigraph/
            
            cat > $out/bin/omnigraph << 'EOF'
#!/bin/sh
exec bun run $out/share/omnigraph/omnigraph.ts "$@"
EOF
            chmod +x $out/bin/omnigraph
          '';
        };
      in
      {
        packages.omnigraph = omnigraph-pkg;
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

{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  name = "omnigraph-dev";

  packages = with pkgs; [
    bun
    chromium
    python3
    nodePackages_latest.typescript
  ];

  shellHook = ''
    export OMNIGRAPH_LIB="$(pwd)"
    echo "OmniGraph dev shell loaded"
    echo "  bun: $(bun --version)"
    echo "  chromium: $(chromium --version 2>/dev/null || echo 'not in PATH')"
    echo "  python: $(python3 --version 2>/dev/null)"
    echo ""
    echo "Commands:"
    echo "  bun run omnigraph.ts build          # build graph for current dir"
    echo "  bun run omnigraph.ts query <term>   # search nodes"
    echo "  bun run omnigraph.ts check <file>   # pre-edit impact"
    echo "  bun run omnigraph.ts search <term>  # search concepts (step 6+)"
    echo ""
    echo "Test screenshot:"
    echo "  chromium --headless --disable-gpu --screenshot=/tmp/og-test.png --window-size=1920,1080 file://$(pwd)/test-project/.omnigraph/index.html"
  '';
}

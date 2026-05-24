{
  lib,
  stdenv,
  nodejs,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  python3,
  makeWrapper,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "hermes-workspace";
  version = "2.3.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter = name: type:
      let
        baseName = builtins.baseNameOf name;
        relPath = lib.removePrefix (toString ../.) name;
      in
      # Exclude dirs that don't affect the build
      !(lib.hasPrefix "/.git" relPath)
      && !(lib.hasPrefix "/node_modules" relPath)
      && !(lib.hasPrefix "/dist" relPath)
      && !(lib.hasPrefix "/.output" relPath)
      && !(lib.hasPrefix "/.tanstack" relPath)
      && !(lib.hasPrefix "/.vinxi" relPath)
      && !(lib.hasPrefix "/release" relPath)
      && !(lib.hasPrefix "/electron/server-bundle.cjs" relPath)
      && !(lib.hasPrefix "/memory" relPath)
      && !(lib.hasPrefix "/screenshots" relPath)
      && baseName != ".env"
      && baseName != ".env.local";
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm;  # Ensure fetcher uses the same pnpm binary as the build
    fetcherVersion = 3;
    hash = "sha256-cgK1/KQkA9zOb1Zn5/OjV9qTXQEIVBaTWldbCbdRULs=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm      # provides the pnpm binary used by pnpmConfigHook
    pnpmConfigHook
    makeWrapper
  ];

  buildInputs = [ python3 ];

  # Give the build plenty of memory — same as the package.json script
  NODE_OPTIONS = "--max-old-space-size=2048";

  # Vite / TanStack Start require NODE_ENV=production for the SSR build so
  # runtime env vars aren't inlined into client bundles.
  NODE_ENV = "production";

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    local appDir="$out/lib/hermes-workspace"
    mkdir -p "$appDir"

    # Copy build artefacts and runtime sources
    cp -r dist "$appDir/"
    cp -r node_modules "$appDir/"
    cp -r skills "$appDir/"
    cp package.json server-entry.js "$appDir/"

    # pty-helper.py: Vite's copy-pty-helper plugin writes it during build
    # but we also ensure it's present here as a belt-and-suspenders measure.
    local ptyHelper="$appDir/dist/server/assets/pty-helper.py"
    if [ ! -f "$ptyHelper" ]; then
      mkdir -p "$(dirname "$ptyHelper")"
      cp src/server/pty-helper.py "$ptyHelper"
    fi

    # Create a wrapper script so the binary lands in $out/bin
    mkdir -p "$out/bin"
    makeWrapper "${nodejs}/bin/node" "$out/bin/hermes-workspace" \
      --add-flags "--max-old-space-size=2048" \
      --add-flags "$appDir/server-entry.js" \
      --set NODE_ENV "production" \
      --prefix PATH : "${python3}/bin"

    runHook postInstall
  '';

  meta = {
    description = "Desktop workspace for Hermes Agent — chat, orchestration, and multi-agent coding pipelines";
    homepage = "https://github.com/outsourc-e/hermes-workspace";
    license = lib.licenses.mit;
    maintainers = [ ];
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    mainProgram = "hermes-workspace";
  };
})

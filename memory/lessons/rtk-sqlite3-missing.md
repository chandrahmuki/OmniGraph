# Error: rtk wrapper doesn't have sqlite3

## Pattern
```
rtk sqlite3 ...
→ [rtk: No such file or directory (os error 2)]
```

## Root Cause
`sqlite3` is not installed in the user profile. The `rtk` wrapper only adds `git` to PATH, it cannot provide commands that aren't installed.

## Fix
- Install sqlite3: `nix profile install nixpkgs#sqlite`
- Or use nix run: `nix run nixpkgs#sqlite -- <args>`
- Or find it in the nix store: `find /nix/store -name sqlite3 -type f 2>/dev/null`

## Context
- Occurs on: muggy-nixos
- User profile: /etc/profiles/per-user/david/
- rtk location: /etc/profiles/per-user/david/bin/rtk
- Date first seen: 2026-05-05
- Frequency: RECURRING (happens every session)

## Prevention
- Check `which sqlite3` before using `rtk sqlite3`
- Add sqlite3 to home.nix packages if needed regularly

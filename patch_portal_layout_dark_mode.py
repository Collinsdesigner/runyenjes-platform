#!/usr/bin/env python3
"""
Reconciles PortalLayout.tsx's local dark-mode toggle with the account-backed
one in AuthContext (added by add_dark_mode_wiring.py).

Removes:
  - const [isDark, setIsDark] = useState(false);
  - the useEffect that reads document.documentElement.classList on mount
  - the local toggleDarkMode() function (with localStorage.setItem('runyenjes_dark_mode', ...))

Updates:
  - useAuth() destructure to pull toggleDarkMode from context
  - the toggle button's icon to read user.darkMode instead of isDark

Idempotent: safe to re-run.
"""
import re
import sys
from pathlib import Path

ROOT = Path.cwd()
PATH = ROOT / "frontend" / "src" / "components" / "portal" / "PortalLayout.tsx"

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

def main():
    if not PATH.exists():
        fail(f"File not found: {PATH}")
    text = PATH.read_text(encoding="utf-8")
    original = text

    already_done = "const { user, logout, toggleDarkMode } = useAuth();" in text and "function toggleDarkMode()" not in text
    if already_done:
        print("[OK] PortalLayout.tsx already uses AuthContext's toggleDarkMode, skipping")
        return

    # 1. Pull toggleDarkMode out of useAuth() instead of logout-only.
    pattern_destructure = re.compile(r"const\s*\{\s*user,\s*logout\s*\}\s*=\s*useAuth\(\);")
    m = pattern_destructure.search(text)
    if not m:
        fail("Could not find `const { user, logout } = useAuth();` to update")
    text = text[: m.start()] + "const { user, logout, toggleDarkMode } = useAuth();" + text[m.end():]

    # 2. Remove local isDark state.
    pattern_state = re.compile(r"\n\s*const \[isDark, setIsDark\] = useState\(false\);")
    m = pattern_state.search(text)
    if not m:
        fail("Could not find local `const [isDark, setIsDark] = useState(false);` to remove")
    text = text[: m.start()] + text[m.end():]

    # 3. Remove the mount-time useEffect reading the class list.
    pattern_effect = re.compile(
        r"\n\s*useEffect\(\(\) => \{\s*\n\s*setIsDark\(document\.documentElement\.classList\.contains\('dark'\)\);\s*\n\s*\}, \[\]\);"
    )
    m = pattern_effect.search(text)
    if not m:
        fail("Could not find the isDark-sync useEffect to remove")
    text = text[: m.start()] + text[m.end():]

    # 4. Remove the local toggleDarkMode function entirely.
    # Anchored on the known try/catch ending so we don't stop at the inner
    # closing brace of the try block (a non-greedy `.*?` would match that
    # first and leave `catch (e) {}` orphaned in the file).
    pattern_fn = re.compile(
        r"\n\s*function toggleDarkMode\(\) \{.*?\n\s*\} catch \(e\) \{\}\n\s*\}",
        re.DOTALL,
    )
    m = pattern_fn.search(text)
    if not m:
        fail("Could not find the local toggleDarkMode() function to remove")
    text = text[: m.start()] + text[m.end():]

    # 5. Swap the button's icon condition from isDark to user.darkMode.
    # Matched structurally (around the emoji, not on it) since emoji glyphs can
    # carry invisible variation-selector bytes that break literal matches (§57.18).
    pattern_icon = re.compile(r"\{isDark \? '.*?' : '.*?'\}")
    m = pattern_icon.search(text)
    if not m:
        fail("Could not find the toggle button's `{isDark ? '...' : '...'}` icon expression")
    matched = m.group(0)
    replaced = matched.replace("isDark", "user.darkMode", 1)
    text = text[: m.start()] + replaced + text[m.end():]

    if text == original:
        print("[OK] No changes needed")
        return

    PATH.write_text(text, encoding="utf-8")
    print(f"[OK] wrote {PATH}")

if __name__ == "__main__":
    main()

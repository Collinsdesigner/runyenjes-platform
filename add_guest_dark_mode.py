#!/usr/bin/env python3
"""
Adds guest (logged-out) dark mode support:

  1. AuthContext.tsx:
     - Adds guestDarkMode state, sourced from localStorage('runyenjes_guest_dark_mode')
     - Exposes a single `darkMode` value on the context: user.darkMode when logged
       in, guestDarkMode when logged out
     - toggleDarkMode() now branches: account PATCH when logged in, localStorage
       write when logged out
     - The <html class="dark"> effect now tracks this unified value

  2. Home.tsx:
     - Pulls darkMode/toggleDarkMode from useAuth()
     - Adds a sun/moon toggle button to the logged-out guest header

Idempotent: safe to re-run.
"""
import re
import sys
from pathlib import Path

ROOT = Path.cwd()

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

def read(path: Path) -> str:
    if not path.exists():
        fail(f"File not found: {path}")
    return path.read_text(encoding="utf-8")

def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")
    print(f"[OK] wrote {path}")

# ---------------------------------------------------------------------------
# 1. AuthContext.tsx
# ---------------------------------------------------------------------------
def patch_auth_context():
    path = ROOT / "frontend" / "src" / "context" / "AuthContext.tsx"
    text = read(path)

    if "guestDarkMode" in text:
        print("[OK] AuthContext.tsx: guest dark mode already wired, skipping")
        return

    # 1a. Add `darkMode: boolean;` to the context value interface.
    marker = "  toggleDarkMode: () => Promise<void>;\n}"
    if marker not in text:
        fail("Could not find AuthContextValue's toggleDarkMode line to add darkMode: boolean; near")
    text = text.replace(
        marker,
        "  toggleDarkMode: () => Promise<void>;\n  darkMode: boolean;\n}",
        1,
    )

    # 1b. Add guestDarkMode state, right after the `user` state declaration.
    user_state_marker = "  const [user, setUser] = useState<CurrentUser | null>(() => {\n    const stored = localStorage.getItem('runyenjes_user');\n    return stored ? JSON.parse(stored) : null;\n  });"
    if user_state_marker not in text:
        fail("Could not find the `user` useState block to anchor guestDarkMode state after")
    guest_state = user_state_marker + """

  const [guestDarkMode, setGuestDarkMode] = useState<boolean>(
    () => localStorage.getItem('runyenjes_guest_dark_mode') === 'true'
  );

  const darkMode = user ? Boolean(user.darkMode) : guestDarkMode;"""
    text = text.replace(user_state_marker, guest_state, 1)

    # 1c. Point the <html class="dark"> effect at the unified `darkMode` value.
    old_effect = "  useEffect(() => {\n    document.documentElement.classList.toggle('dark', Boolean(user?.darkMode));\n  }, [user?.darkMode]);"
    if old_effect not in text:
        fail("Could not find the existing dark-class useEffect to update")
    new_effect = "  useEffect(() => {\n    document.documentElement.classList.toggle('dark', darkMode);\n  }, [darkMode]);"
    text = text.replace(old_effect, new_effect, 1)

    # 1d. Update toggleDarkMode to branch on logged-in vs guest.
    old_toggle = """  async function toggleDarkMode() {
    if (!user || !token) return;

    const next = !user.darkMode;

    // Optimistic local update first.
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, darkMode: next };
      localStorage.setItem('runyenjes_user', JSON.stringify(updated));
      return updated;
    });

    try {
      await api('/profile/theme', {
        method: 'PATCH',
        token,
        body: { darkMode: next },
      });
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
      // Roll back on failure.
      setUser((prev) => {
        if (!prev) return prev;
        const reverted = { ...prev, darkMode: !next };
        localStorage.setItem('runyenjes_user', JSON.stringify(reverted));
        return reverted;
      });
    }
  }"""
    if old_toggle not in text:
        fail("Could not find the existing toggleDarkMode function to update")
    new_toggle = """  async function toggleDarkMode() {
    // Logged-out guest: browser-only preference, no account to save to.
    if (!user || !token) {
      setGuestDarkMode((prev) => {
        const next = !prev;
        localStorage.setItem('runyenjes_guest_dark_mode', String(next));
        return next;
      });
      return;
    }

    const next = !user.darkMode;

    // Optimistic local update first.
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, darkMode: next };
      localStorage.setItem('runyenjes_user', JSON.stringify(updated));
      return updated;
    });

    try {
      await api('/profile/theme', {
        method: 'PATCH',
        token,
        body: { darkMode: next },
      });
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
      // Roll back on failure.
      setUser((prev) => {
        if (!prev) return prev;
        const reverted = { ...prev, darkMode: !next };
        localStorage.setItem('runyenjes_user', JSON.stringify(reverted));
        return reverted;
      });
    }
  }"""
    text = text.replace(old_toggle, new_toggle, 1)

    # 1e. Expose `darkMode` in the provider value.
    old_value = "        updateAvatar,\n        toggleDarkMode,\n      }}"
    if old_value not in text:
        fail("Could not find the provider value block to add darkMode to")
    text = text.replace(
        old_value,
        "        updateAvatar,\n        toggleDarkMode,\n        darkMode,\n      }}",
        1,
    )

    write(path, text)

# ---------------------------------------------------------------------------
# 2. Home.tsx
# ---------------------------------------------------------------------------
def patch_home():
    path = ROOT / "frontend" / "src" / "pages" / "Home.tsx"
    text = read(path)

    if "toggleDarkMode" in text:
        print("[OK] Home.tsx: dark mode toggle already present, skipping")
        return

    # 2a. Pull darkMode/toggleDarkMode out of useAuth().
    old_destructure = "  const { user, token, logout } = useAuth();"
    if old_destructure not in text:
        fail("Could not find `const { user, token, logout } = useAuth();` in Home.tsx")
    text = text.replace(
        old_destructure,
        "  const { user, token, logout, darkMode, toggleDarkMode } = useAuth();",
        1,
    )

    # 2b. Add a toggle button to the guest header, right before "Member sign in".
    old_button = """          <button
            onClick={() => navigate('/login')}
            className="text-sm bg-rgreen text-white px-3 py-1.5 rounded-md"
          >
            Member sign in
          </button>"""
    if old_button not in text:
        fail("Could not find the 'Member sign in' button in Home.tsx's guest header")
    new_button = """          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkMode ? '☀' : '🌙'}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-sm bg-rgreen text-white px-3 py-1.5 rounded-md"
          >
            Member sign in
          </button>"""
    text = text.replace(old_button, new_button, 1)

    write(path, text)

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    patch_auth_context()
    patch_home()
    print("[OK] Guest dark mode wiring applied.")

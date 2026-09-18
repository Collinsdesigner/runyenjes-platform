#!/usr/bin/env python3
"""
Wires up per-account dark mode:
  1. backend/prisma/schema.prisma   -> add `darkMode Boolean @default(false)` to User
  2. backend/src/routes/profile.routes.ts -> include darkMode in /me, add PATCH /theme
  3. frontend/src/context/AuthContext.tsx -> track darkMode, apply <html class="dark">, toggleDarkMode()
  4. frontend/tailwind.config.* -> ensure darkMode: 'class'

Idempotent: safe to re-run. Exits with [FAIL] and touches no files if anything
expected isn't found (per the anchor-editing lessons in the roadmap, §57.18).
"""
import re
import sys
import glob
from pathlib import Path

ROOT = Path.cwd()

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

def already_applied(text, marker):
    return marker in text

def read(path: Path) -> str:
    if not path.exists():
        fail(f"File not found: {path}")
    return path.read_text(encoding="utf-8")

def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")
    print(f"[OK] wrote {path}")

# ---------------------------------------------------------------------------
# 1. schema.prisma
# ---------------------------------------------------------------------------
def patch_schema():
    candidates = glob.glob(str(ROOT / "backend" / "prisma" / "schema.prisma"))
    if not candidates:
        fail("Could not find backend/prisma/schema.prisma")
    path = Path(candidates[0])
    text = read(path)

    if already_applied(text, "darkMode"):
        print("[OK] schema.prisma: darkMode field already present, skipping")
        return

    # Match the `model User {` block and insert before its closing brace.
    pattern = re.compile(r"(model\s+User\s*\{)(.*?)(\n\})", re.DOTALL)
    m = pattern.search(text)
    if not m:
        fail("Could not locate `model User { ... }` block in schema.prisma")

    insertion = "\n  darkMode  Boolean  @default(false)"
    new_block = m.group(1) + m.group(2) + insertion + m.group(3)
    text = text[: m.start()] + new_block + text[m.end():]
    write(path, text)

# ---------------------------------------------------------------------------
# 2. profile.routes.ts
# ---------------------------------------------------------------------------
def patch_profile_routes():
    path = ROOT / "backend" / "src" / "routes" / "profile.routes.ts"
    text = read(path)

    changed = False

    # 2a. Add darkMode to the /me select block.
    if "darkMode: true" in text:
        print("[OK] profile.routes.ts: /me already selects darkMode, skipping")
    else:
        select_pattern = re.compile(
            r"(role:\s*true,\s*\n)(\s*)(admissionNumber:\s*true,)"
        )
        m = select_pattern.search(text)
        if not m:
            fail("Could not locate the /me select block to add darkMode")
        text = (
            text[: m.start()]
            + m.group(1)
            + m.group(2)
            + "darkMode: true,\n"
            + m.group(2)
            + m.group(3)
            + text[m.end():]
        )
        changed = True

    # 2b. Add the PATCH /theme route (before `export default router;`).
    if "router.patch('/theme'" in text or 'router.patch("/theme"' in text:
        print("[OK] profile.routes.ts: /theme route already present, skipping")
    else:
        export_pattern = re.compile(r"\nexport default router;\s*$")
        m = export_pattern.search(text)
        if not m:
            fail("Could not locate `export default router;` to insert /theme route before it")

        theme_route = '''
// ---------- Update my own dark mode preference ----------
router.patch('/theme', requireAuth, async (req, res) => {
  try {
    const { darkMode } = req.body;

    if (typeof darkMode !== 'boolean') {
      return res.status(400).json({
        error: 'darkMode (boolean) is required',
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { darkMode },
      select: {
        id: true,
        darkMode: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Theme update failed:', error);
    res.status(500).json({
      error: 'Failed to update theme preference',
    });
  }
});
'''
        text = text[: m.start()] + "\n" + theme_route + text[m.start():]
        changed = True

    if changed:
        write(path, text)
    else:
        print("[OK] profile.routes.ts: nothing to change")

# ---------------------------------------------------------------------------
# 3. AuthContext.tsx
# ---------------------------------------------------------------------------
def patch_auth_context():
    path = ROOT / "frontend" / "src" / "context" / "AuthContext.tsx"
    text = read(path)

    if already_applied(text, "toggleDarkMode"):
        print("[OK] AuthContext.tsx: toggleDarkMode already present, skipping")
        return

    # 3a. Add darkMode to CurrentUser interface.
    text = text.replace(
        "  avatarUrl: string | null;\n  mustChangePassword?: boolean;\n}",
        "  avatarUrl: string | null;\n  mustChangePassword?: boolean;\n  darkMode?: boolean;\n}",
        1,
    )

    # 3b. Add toggleDarkMode to the context value interface.
    text = text.replace(
        "  updateAvatar: (avatarUrl: string | null) => void;\n}",
        "  updateAvatar: (avatarUrl: string | null) => void;\n  toggleDarkMode: () => Promise<void>;\n}",
        1,
    )

    # 3c. Apply the `dark` class whenever `user` changes.
    apply_effect = '''
  useEffect(() => {
    document.documentElement.classList.toggle('dark', Boolean(user?.darkMode));
  }, [user?.darkMode]);
'''
    marker = "  useEffect(() => {\n    const unregister = registerSessionExpiredHandler(() => {"
    if marker not in text:
        fail("Could not locate the session-expired useEffect to anchor the dark-mode effect near")
    text = text.replace(marker, apply_effect.rstrip("\n") + "\n\n" + marker, 1)

    # 3d. Include darkMode when refreshing from /profile/me.
    text = text.replace(
        "          role: currentUser.role,\n          avatarUrl: currentUser.avatarUrl ?? null,\n        };",
        "          role: currentUser.role,\n          avatarUrl: currentUser.avatarUrl ?? null,\n          darkMode: Boolean(currentUser.darkMode),\n        };",
        1,
    )

    # 3e. Add the toggleDarkMode function (near updateAvatar).
    toggle_fn = '''
  async function toggleDarkMode() {
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
  }
'''
    marker2 = "  if (authLoading) {"
    if marker2 not in text:
        fail("Could not locate `if (authLoading)` to anchor toggleDarkMode function before it")
    text = text.replace(marker2, toggle_fn.rstrip("\n") + "\n\n" + marker2, 1)

    # 3f. Expose toggleDarkMode in the provider value.
    text = text.replace(
        "        updateAvatar,\n      }}",
        "        updateAvatar,\n        toggleDarkMode,\n      }}",
        1,
    )

    write(path, text)

# ---------------------------------------------------------------------------
# 4. tailwind.config
# ---------------------------------------------------------------------------
def patch_tailwind_config():
    candidates = list((ROOT / "frontend").glob("tailwind.config.*"))
    if not candidates:
        fail("Could not find frontend/tailwind.config.*")
    path = candidates[0]
    text = read(path)

    if "darkMode" in text:
        print(f"[OK] {path.name}: darkMode already configured, skipping")
        return

    pattern = re.compile(r"(export default\s*\{|module\.exports\s*=\s*\{)")
    m = pattern.search(text)
    if not m:
        fail(f"Could not locate the config object opening in {path.name}")

    text = text[: m.end()] + "\n  darkMode: 'class'," + text[m.end():]
    write(path, text)

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    patch_schema()
    patch_profile_routes()
    patch_auth_context()
    patch_tailwind_config()
    print("[OK] All dark mode wiring patches applied.")

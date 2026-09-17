#!/usr/bin/env python3
"""
Adds a responsive nav drawer to PortalLayout.tsx -- fixes both true mobile
devices AND a narrowed/minimized desktop window, since Tailwind's `md:`
breakpoint responds to viewport width, not device type. One fix covers
both cases the user described.

Changes:
  - Sidebar goes from `hidden md:flex` (invisible + unreachable below md,
    with zero way to open it) to a fixed slide-in drawer below md, with a
    hamburger button to open it, a close button inside it, a tap-to-close
    backdrop, and auto-close on nav link tap. At md and above, behavior is
    unchanged from before (always-visible static sidebar).
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
PORTAL_LAYOUT_PATH = os.path.join(ROOT, "frontend", "src", "components", "portal", "PortalLayout.tsx")


def already_applied(path, marker):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        return marker in f.read()


def replace_once(path, old, new, label):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(old)
    if count == 0:
        raise SystemExit(f"[FAIL] Anchor not found for '{label}' in {path}\n"
                          f"       Looked for:\n{old!r}")
    if count > 1:
        raise SystemExit(f"[FAIL] Anchor for '{label}' appears {count} times in {path} "
                          f"(expected exactly once) -- refusing to guess which one.")

    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] {label} -> {path}")


if already_applied(PORTAL_LAYOUT_PATH, "mobileNavOpen"):
    print(f"[SKIP] Mobile nav drawer already present -> {PORTAL_LAYOUT_PATH}")
    exit(0)

# 1. Add state
state_anchor = "  const [isDark, setIsDark] = useState(false);\n"
state_new = (
    "  const [isDark, setIsDark] = useState(false);\n"
    "  const [mobileNavOpen, setMobileNavOpen] = useState(false);\n"
)
replace_once(PORTAL_LAYOUT_PATH, state_anchor, state_new, "mobileNavOpen state")

# 2. Backdrop + sidebar drawer transform + close button
sidebar_anchor = '''      {/* ================= SIDEBAR ================= */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-gray-200 flex-col h-full dark:bg-gray-900 dark:border-gray-700">

        {/* Branding */}'''

sidebar_new = '''      {/* Mobile nav backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col h-full bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-700 transform transition-transform duration-200 md:static md:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* Close button, mobile/narrow-window only */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Close menu"
        >
          ✕
        </button>

        {/* Branding */}'''

replace_once(PORTAL_LAYOUT_PATH, sidebar_anchor, sidebar_new, "sidebar drawer + backdrop + close button")

# 3. Close drawer when a nav link is tapped
navlink_anchor = '''                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>'''
navlink_new = '''                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>'''
replace_once(PORTAL_LAYOUT_PATH, navlink_anchor, navlink_new, "close drawer on nav link tap")

# 4. Hamburger button in the header
header_anchor = '''        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 dark:bg-gray-900 dark:border-gray-700">

          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 truncate dark:text-gray-100">
              {title}
            </h1>

            <p className="text-xs text-gray-500 truncate dark:text-gray-400">
              Welcome, {user.name}
            </p>
          </div>'''

header_new = '''        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 dark:bg-gray-900 dark:border-gray-700">

          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              aria-label="Open menu"
            >
              ☰
            </button>

            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 truncate dark:text-gray-100">
                {title}
              </h1>

              <p className="text-xs text-gray-500 truncate dark:text-gray-400">
                Welcome, {user.name}
              </p>
            </div>
          </div>'''

replace_once(PORTAL_LAYOUT_PATH, header_anchor, header_new, "hamburger button in header")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend change, no migration).")

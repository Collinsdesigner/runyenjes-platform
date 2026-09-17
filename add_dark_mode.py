#!/usr/bin/env python3
"""
Adds real, toggleable dark mode across the platform:
  1. tailwind.config.js -> darkMode: 'class'
  2. index.css           -> dark-mode fallback background/text + color-scheme
  3. index.html          -> tiny synchronous inline script applying the
                             saved preference BEFORE React mounts (no flash
                             of light content), same localStorage key the
                             toggle button uses
  4. PortalLayout.tsx    -> sun/moon toggle button in the top bar, next to
                             notifications
  5. Mass pass over every .tsx file under src/pages and src/components:
     for every PLAIN string className="..." found, appends the matching
     dark: variant for any recognized light-mode utility class present,
     if not already there. Skips template-literal classNames (className={`...`})
     entirely, to avoid corrupting embedded JS expressions -- those may
     need a careful manual/second pass later.

Safe to re-run: steps 1-4 check for existing markers first; step 5's
substitution only adds a dark: variant if it isn't already present for
that exact token in that exact className string, so re-running is a no-op
on files already processed.
"""
import os
import re

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend")
SRC = os.path.join(FRONTEND, "src")

TAILWIND_CONFIG_PATH = os.path.join(FRONTEND, "tailwind.config.js")
INDEX_CSS_PATH = os.path.join(SRC, "index.css")
INDEX_HTML_PATH = os.path.join(FRONTEND, "index.html")
PORTAL_LAYOUT_PATH = os.path.join(SRC, "components", "portal", "PortalLayout.tsx")


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


# ------------------------------------------------------------------
# 1. tailwind.config.js -- darkMode: 'class'
# ------------------------------------------------------------------
if already_applied(TAILWIND_CONFIG_PATH, "darkMode"):
    print(f"[SKIP] darkMode already set -> {TAILWIND_CONFIG_PATH}")
else:
    anchor = "export default {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n"
    new = "export default {\n  darkMode: 'class',\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n"
    replace_once(TAILWIND_CONFIG_PATH, anchor, new, "tailwind.config.js darkMode: 'class'")

# ------------------------------------------------------------------
# 2. index.css -- dark-mode fallback
# ------------------------------------------------------------------
if already_applied(INDEX_CSS_PATH, "html.dark"):
    print(f"[SKIP] Dark CSS fallback already present -> {INDEX_CSS_PATH}")
else:
    anchor = "html, body, #root {\n  height: 100%;\n}\n"
    new = (
        "html, body, #root {\n  height: 100%;\n}\n\n"
        "/* Dark mode fallback -- applied the instant the 'dark' class is on\n"
        "   <html> (see index.html's inline script), so there's a sane base\n"
        "   background/text color even before per-component dark: classes\n"
        "   take over. */\n"
        "html.dark {\n  color-scheme: dark;\n}\n\n"
        "html.dark body {\n"
        "  background-color: #030712;\n"
        "  color: #f3f4f6;\n"
        "}\n"
    )
    replace_once(INDEX_CSS_PATH, anchor, new, "index.css dark-mode fallback")

# ------------------------------------------------------------------
# 3. index.html -- no-flash inline script
# ------------------------------------------------------------------
if not os.path.exists(INDEX_HTML_PATH):
    print(f"[FAIL] {INDEX_HTML_PATH} not found -- paste `cat frontend/index.html` so this step can be added correctly.")
elif already_applied(INDEX_HTML_PATH, "runyenjes_dark_mode"):
    print(f"[SKIP] No-flash script already present -> {INDEX_HTML_PATH}")
else:
    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as f:
        html_content = f.read()

    anchor = "<head>"
    if html_content.count(anchor) != 1:
        raise SystemExit(
            f"[FAIL] Could not find exactly one '<head>' tag in {INDEX_HTML_PATH} -- paste its content."
        )

    script = (
        "<head>\n"
        "    <script>\n"
        "      (function () {\n"
        "        try {\n"
        "          if (localStorage.getItem('runyenjes_dark_mode') === 'true') {\n"
        "            document.documentElement.classList.add('dark');\n"
        "          }\n"
        "        } catch (e) {}\n"
        "      })();\n"
        "    </script>\n"
    )
    html_content = html_content.replace(anchor, script, 1)
    with open(INDEX_HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[OK] index.html no-flash dark-mode script -> {INDEX_HTML_PATH}")

# ------------------------------------------------------------------
# 4. PortalLayout.tsx -- toggle button
# ------------------------------------------------------------------
if already_applied(PORTAL_LAYOUT_PATH, "runyenjes_dark_mode"):
    print(f"[SKIP] Dark mode toggle already present -> {PORTAL_LAYOUT_PATH}")
else:
    state_anchor = "  const [settings, setSettings] = useState<SiteSettings | null>(null);\n"
    state_new = (
        "  const [settings, setSettings] = useState<SiteSettings | null>(null);\n"
        "  const [isDark, setIsDark] = useState(false);\n\n"
        "  useEffect(() => {\n"
        "    setIsDark(document.documentElement.classList.contains('dark'));\n"
        "  }, []);\n\n"
        "  function toggleDarkMode() {\n"
        "    const next = !isDark;\n"
        "    setIsDark(next);\n"
        "    document.documentElement.classList.toggle('dark', next);\n"
        "    try {\n"
        "      localStorage.setItem('runyenjes_dark_mode', String(next));\n"
        "    } catch (e) {}\n"
        "  }\n"
    )
    replace_once(PORTAL_LAYOUT_PATH, state_anchor, state_new, "PortalLayout.tsx dark mode state + toggle function")

    button_anchor = '''            {/* Notifications */}
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              aria-label="Notifications"
            >
              🔔
            </button>
'''
    button_new = '''            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Notifications */}
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Notifications"
            >
              🔔
            </button>
'''
    replace_once(PORTAL_LAYOUT_PATH, button_anchor, button_new, "PortalLayout.tsx dark mode toggle button")

# ------------------------------------------------------------------
# 5. Mass dark: variant injection across plain className="..." strings
# ------------------------------------------------------------------
LIGHT_TO_DARK = {
    "bg-white": "dark:bg-gray-900",
    "bg-gray-50": "dark:bg-gray-950",
    "bg-gray-100": "dark:bg-gray-800",
    "bg-green-50": "dark:bg-green-950",
    "bg-red-50": "dark:bg-red-950",
    "bg-blue-50": "dark:bg-blue-950",
    "text-gray-900": "dark:text-gray-100",
    "text-gray-800": "dark:text-gray-200",
    "text-gray-700": "dark:text-gray-300",
    "text-gray-600": "dark:text-gray-400",
    "text-gray-500": "dark:text-gray-400",
    "text-gray-400": "dark:text-gray-500",
    "text-green-700": "dark:text-green-300",
    "text-green-600": "dark:text-green-400",
    "text-red-700": "dark:text-red-300",
    "text-red-600": "dark:text-red-400",
    "text-blue-700": "dark:text-blue-300",
    "border-gray-200": "dark:border-gray-700",
    "border-gray-100": "dark:border-gray-800",
    "border-gray-300": "dark:border-gray-600",
    "border-green-200": "dark:border-green-800",
    "border-red-200": "dark:border-red-800",
    "border-blue-100": "dark:border-blue-800",
    "divide-gray-100": "dark:divide-gray-800",
    "divide-gray-200": "dark:divide-gray-700",
    "hover:bg-gray-50": "dark:hover:bg-gray-800",
    "hover:bg-gray-100": "dark:hover:bg-gray-700",
}

CLASSNAME_RE = re.compile(r'className="([^"]*)"')


def process_classname(match):
    original = match.group(1)
    tokens = original.split()
    token_set = set(tokens)
    to_add = []
    for token in tokens:
        dark_variant = LIGHT_TO_DARK.get(token)
        if dark_variant and dark_variant not in token_set and dark_variant not in to_add:
            to_add.append(dark_variant)
    if not to_add:
        return match.group(0)
    return f'className="{original} {" ".join(to_add)}"'


def process_file(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    new_content, count = CLASSNAME_RE.subn(process_classname, content)
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True
    return False


changed_files = []
for base_dir in [os.path.join(SRC, "pages"), os.path.join(SRC, "components")]:
    if not os.path.isdir(base_dir):
        continue
    for dirpath, _, filenames in os.walk(base_dir):
        for filename in filenames:
            if filename.endswith(".tsx"):
                full_path = os.path.join(dirpath, filename)
                if process_file(full_path):
                    changed_files.append(full_path)

print(f"\n[OK] Mass dark: variant pass complete -- {len(changed_files)} file(s) updated:")
for f in changed_files:
    print(f"     {f}")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend change, no migration).")
print("NOTE: template-literal classNames (className={`...`}) were intentionally skipped -- ")
print("some conditional/selected states may still look light-mode. Flag any you spot and we'll fix them individually.")

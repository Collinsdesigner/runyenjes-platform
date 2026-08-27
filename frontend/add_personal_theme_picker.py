#!/usr/bin/env python3
"""
Adds a personal accent-color picker to Profile.tsx: a handful of preset
swatches the user can click to change their own view, independent of the
institution's branding color. Stored in localStorage (client-side only,
per-browser -- no backend/schema change needed for a cosmetic preference).

Patches App.tsx and PortalLayout.tsx so their color-setting effects check
for a personal override first, and only fall back to the institution's
color if the user hasn't picked one. This prevents the institution
effect (which reruns on every load) from stomping the personal choice.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 add_personal_theme_picker.py

Idempotent: skips already-patched files.
"""

import os
import sys

PROFILE_PATH = os.path.join("src", "pages", "Profile.tsx")
APP_PATH = os.path.join("src", "App.tsx")
LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")

PRESET_SWATCHES_BLOCK = """
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">My Accent Color</p>
            <p className="text-xs text-gray-400 mb-3">
              Personal preference, just for your own view -- doesn't change anyone else's.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { name: 'Institution Default', value: '' },
                { name: 'Green', value: '#0B7A2B' },
                { name: 'Blue', value: '#1D4ED8' },
                { name: 'Purple', value: '#7C3AED' },
                { name: 'Rose', value: '#E11D48' },
                { name: 'Amber', value: '#D97706' },
                { name: 'Teal', value: '#0D9488' },
              ].map((swatch) => (
                <button
                  key={swatch.name}
                  type="button"
                  title={swatch.name}
                  onClick={() => {
                    if (swatch.value) {
                      localStorage.setItem('runyenjes_personal_accent', swatch.value);
                      document.documentElement.style.setProperty('--color-primary', swatch.value);
                    } else {
                      localStorage.removeItem('runyenjes_personal_accent');
                      window.location.reload();
                    }
                  }}
                  className="w-8 h-8 rounded-full border-2 border-white shadow ring-1 ring-gray-200"
                  style={{ backgroundColor: swatch.value || '#9CA3AF' }}
                />
              ))}
            </div>
          </div>
"""

APP_OLD_EFFECT = """  useEffect(() => {
    api('/settings')
      .then((settings) => {
        if (settings?.primaryColor) {
          document.documentElement.style.setProperty('--color-primary', settings.primaryColor);
        }
        if (settings?.secondaryColor) {
          document.documentElement.style.setProperty('--color-secondary', settings.secondaryColor);
        }
      })
      .catch(() => {}); // if this fails, the app just keeps the default colors
  }, []);"""

APP_NEW_EFFECT = """  useEffect(() => {
    api('/settings')
      .then((settings) => {
        const personalAccent = localStorage.getItem('runyenjes_personal_accent');
        if (personalAccent) {
          document.documentElement.style.setProperty('--color-primary', personalAccent);
        } else if (settings?.primaryColor) {
          document.documentElement.style.setProperty('--color-primary', settings.primaryColor);
        }
        if (settings?.secondaryColor) {
          document.documentElement.style.setProperty('--color-secondary', settings.secondaryColor);
        }
      })
      .catch(() => {}); // if this fails, the app just keeps the default colors
  }, []);"""

LAYOUT_OLD_EFFECT = """        if (data?.primaryColor) {
          document.documentElement.style.setProperty(
            '--color-primary',
            data.primaryColor
          );
        }"""

LAYOUT_NEW_EFFECT = """        const personalAccent = localStorage.getItem('runyenjes_personal_accent');
        if (personalAccent) {
          document.documentElement.style.setProperty('--color-primary', personalAccent);
        } else if (data?.primaryColor) {
          document.documentElement.style.setProperty(
            '--color-primary',
            data.primaryColor
          );
        }"""


def patch_profile():
    if not os.path.isfile(PROFILE_PATH):
        print("ERROR: '" + PROFILE_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(PROFILE_PATH, "r") as f:
        content = f.read()
    if "My Accent Color" in content:
        print("SKIP  " + PROFILE_PATH + " already has the accent color picker.")
        return

    anchor = "          {error && <p className=\"text-xs text-rmaroon mt-2\">{error}</p>}"
    if anchor not in content:
        print("ERROR: could not find the error-message anchor in " + PROFILE_PATH + ". Patch manually.")
        sys.exit(1)

    content = content.replace(anchor, PRESET_SWATCHES_BLOCK + "\n" + anchor)
    with open(PROFILE_PATH, "w") as f:
        f.write(content)
    print("PATCHED " + PROFILE_PATH + " (added personal accent color picker)")


def patch_app():
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        content = f.read()
    if "runyenjes_personal_accent" in content:
        print("SKIP  " + APP_PATH + " already patched.")
        return
    if APP_OLD_EFFECT not in content:
        print("ERROR: could not find the expected color-setting effect in " + APP_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(APP_OLD_EFFECT, APP_NEW_EFFECT)
    with open(APP_PATH, "w") as f:
        f.write(content)
    print("PATCHED " + APP_PATH + " (respects personal accent override)")


def patch_layout():
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        content = f.read()
    if "runyenjes_personal_accent" in content:
        print("SKIP  " + LAYOUT_PATH + " already patched.")
        return
    if LAYOUT_OLD_EFFECT not in content:
        print("ERROR: could not find the expected color-setting effect in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(LAYOUT_OLD_EFFECT, LAYOUT_NEW_EFFECT)
    with open(LAYOUT_PATH, "w") as f:
        f.write(content)
    print("PATCHED " + LAYOUT_PATH + " (respects personal accent override)")


def main():
    patch_profile()
    patch_app()
    patch_layout()
    print("")
    print("Done.")


if __name__ == "__main__":
    main()

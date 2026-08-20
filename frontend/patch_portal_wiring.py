#!/usr/bin/env python3
"""
Follow-up patch script — use this if generate_erp_portals.py already wrote
the 9 new page files successfully but failed to patch PortalLayout.tsx,
PortalRedirect.tsx, or App.tsx (e.g. due to trailing whitespace mismatches).

This version matches by finding anchor LINES (tolerant of trailing
whitespace) and inserting new content next to them, instead of requiring
an exact multi-line block match.

Patches:
  src/components/portal/PortalLayout.tsx  (adds nav sections for the 4 new roles)
  src/pages/PortalRedirect.tsx            (adds redirect cases for the 4 new roles)
  src/App.tsx                             (adds imports + routes for the 9 new pages)

USAGE (run from ~/runyenjes-platform/frontend):
    python3 patch_portal_wiring.py

Idempotent: skips a file if it looks already patched.
"""

import os
import sys

LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
REDIRECT_PATH = os.path.join("src", "pages", "PortalRedirect.tsx")
APP_PATH = os.path.join("src", "App.tsx")


def read_lines(path):
    if not os.path.isfile(path):
        print(f"ERROR: '{path}' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(path, "r") as f:
        return f.readlines()


def find_line_index(lines, needle, start=0):
    """Return the index of the first line containing `needle` (substring match), or None."""
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


NEW_ROLE_SECTIONS = """
  FINANCE_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/finance', icon: '\u2302' }],
    },
    {
      title: 'Finance',
      items: [{ label: 'Invoices & Payments', path: '/finance/invoices', icon: '\U0001f4b0' }],
    },
  ],

  HR_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/hr', icon: '\u2302' }],
    },
    {
      title: 'Human Resources',
      items: [{ label: 'Staff & Leave', path: '/hr/staff', icon: '\U0001f465' }],
    },
  ],

  EXAM_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/examinations', icon: '\u2302' }],
    },
    {
      title: 'Examinations',
      items: [{ label: 'Exams & Results', path: '/examinations/results', icon: '\U0001f4ca' }],
    },
  ],

  STORES_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/stores', icon: '\u2302' }],
    },
    {
      title: 'Stores',
      items: [{ label: 'Inventory', path: '/stores/items', icon: '\U0001f4e6' }],
    },
  ],
"""


def patch_layout():
    lines = read_lines(LAYOUT_PATH)
    joined = "".join(lines)
    if "FINANCE_OFFICER:" in joined:
        print(f"SKIP  {LAYOUT_PATH} already patched.")
        return

    admin_idx = find_line_index(lines, "ADMIN: [")
    if admin_idx is None:
        print(f"ERROR: could not find 'ADMIN: [' in {LAYOUT_PATH}. Patch manually.")
        sys.exit(1)

    # Find the line that closes the whole roleSections object: a line whose
    # stripped content is exactly "};" — search after the ADMIN line.
    close_idx = None
    for i in range(admin_idx, len(lines)):
        if lines[i].strip() == "};":
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing '};' after ADMIN block in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)

    new_lines = lines[:close_idx] + [NEW_ROLE_SECTIONS] + lines[close_idx:]
    with open(LAYOUT_PATH, "w") as f:
        f.writelines(new_lines)
    print(f"PATCHED {LAYOUT_PATH} (added 4 new role nav sections before line {close_idx + 1})")


NEW_REDIRECT_CASES = """
    case 'FINANCE_OFFICER':
      return <Navigate to="/finance" replace />;

    case 'HR_OFFICER':
      return <Navigate to="/hr" replace />;

    case 'EXAM_OFFICER':
      return <Navigate to="/examinations" replace />;

    case 'STORES_OFFICER':
      return <Navigate to="/stores" replace />;
"""


def patch_redirect():
    lines = read_lines(REDIRECT_PATH)
    joined = "".join(lines)
    if "FINANCE_OFFICER" in joined:
        print(f"SKIP  {REDIRECT_PATH} already patched.")
        return

    student_idx = find_line_index(lines, "case 'STUDENT'")
    if student_idx is None:
        print(f"ERROR: could not find \"case 'STUDENT'\" in {REDIRECT_PATH}. Patch manually.")
        sys.exit(1)

    default_idx = find_line_index(lines, "default:", start=student_idx)
    if default_idx is None:
        print(f"ERROR: could not find 'default:' after STUDENT case in {REDIRECT_PATH}. Patch manually.")
        sys.exit(1)

    new_lines = lines[:default_idx] + [NEW_REDIRECT_CASES] + lines[default_idx:]
    with open(REDIRECT_PATH, "w") as f:
        f.writelines(new_lines)
    print(f"PATCHED {REDIRECT_PATH} (added redirect cases for 4 new roles before line {default_idx + 1})")


NEW_APP_IMPORTS = """import FinancePortal from './pages/portal/FinancePortal';
import FinanceInvoices from './pages/finance/FinanceInvoices';
import HrPortal from './pages/portal/HrPortal';
import HrStaff from './pages/hr/HrStaff';
import ExaminationsPortal from './pages/portal/ExaminationsPortal';
import ExaminationsResults from './pages/examinations/ExaminationsResults';
import StoresPortal from './pages/portal/StoresPortal';
import StoresInventory from './pages/stores/StoresInventory';
import AdminUsers from './pages/admin/AdminUsers';
"""

NEW_APP_ROUTES = """                <Route path="/finance" element={<FinancePortal />} />
                <Route path="/finance/invoices" element={<FinanceInvoices />} />
                <Route path="/hr" element={<HrPortal />} />
                <Route path="/hr/staff" element={<HrStaff />} />
                <Route path="/examinations" element={<ExaminationsPortal />} />
                <Route path="/examinations/results" element={<ExaminationsResults />} />
                <Route path="/stores" element={<StoresPortal />} />
                <Route path="/stores/items" element={<StoresInventory />} />
                <Route path="/admin/users" element={<AdminUsers />} />
"""


def patch_app():
    lines = read_lines(APP_PATH)
    joined = "".join(lines)
    if "FinancePortal" in joined:
        print(f"SKIP  {APP_PATH} already patched.")
        return

    import_idx = find_line_index(lines, "StudentTimetable from './pages/portal/StudentTimetable'")
    if import_idx is None:
        print(f"ERROR: could not find StudentTimetable import in {APP_PATH}. Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/registrar/timetable"')
    if route_idx is None:
        print(f"ERROR: could not find registrar/timetable route in {APP_PATH}. Patch manually.")
        sys.exit(1)

    # Insert routes first (higher index) so import_idx stays valid.
    if route_idx > import_idx:
        lines_after_route = lines[:route_idx + 1] + [NEW_APP_ROUTES] + lines[route_idx + 1:]
        lines_after_route = (
            lines_after_route[:import_idx + 1] + [NEW_APP_IMPORTS] + lines_after_route[import_idx + 1:]
        )
    else:
        # Unexpected ordering — fall back to inserting independently, imports first.
        lines_tmp = lines[:import_idx + 1] + [NEW_APP_IMPORTS] + lines[import_idx + 1:]
        route_idx2 = find_line_index(lines_tmp, '"/registrar/timetable"')
        lines_after_route = lines_tmp[:route_idx2 + 1] + [NEW_APP_ROUTES] + lines_tmp[route_idx2 + 1:]

    with open(APP_PATH, "w") as f:
        f.writelines(lines_after_route)
    print(f"PATCHED {APP_PATH} (added 9 imports + 9 routes)")


def main():
    patch_layout()
    patch_redirect()
    patch_app()
    print("\nDone. Review with:")
    print("  git diff src/App.tsx src/pages/PortalRedirect.tsx src/components/portal/PortalLayout.tsx")


if __name__ == "__main__":
    main()

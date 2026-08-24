#!/usr/bin/env python3
"""
Generates src/pages/jobs/JobBoard.tsx -- a single page that adapts to the
viewer: any non-student can post a listing and see "My Postings"; Alumni
(and Admin) additionally see the open listings feed.

Patches:
  src/components/portal/PortalLayout.tsx -> adds a 'Job Board' link to the
                                             ALUMNI section, and a second
                                             item in the shared 'My Work'
                                             self-service section for staff
  src/App.tsx                             -> import + route for /jobs

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_job_board.py

Idempotent: skips existing page file (use --force to overwrite), skips
patches already applied.
"""

import argparse
import os
import sys

PAGES_DIR = os.path.join("src", "pages")
JOB_BOARD_PATH = os.path.join(PAGES_DIR, "jobs", "JobBoard.tsx")
LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
APP_PATH = os.path.join("src", "App.tsx")

JOB_BOARD_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Posting {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  applyLink: string | null;
  contactEmail: string | null;
  status: string;
  postedBy?: { id: string; name: string; role: string };
}

const BROWSE_ROLES = ['ALUMNI', 'ADMIN'];

export default function JobBoard() {
  const { token, user } = useAuth();
  const canBrowse = user ? BROWSE_ROLES.includes(user.role) : false;

  const [openPostings, setOpenPostings] = useState<Posting[]>([]);
  const [myPostings, setMyPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [applyLink, setApplyLink] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const calls: Promise<any>[] = [api('/jobs/my-postings', { token })];
      if (canBrowse) calls.unshift(api('/jobs', { token }));
      const results = await Promise.all(calls);
      if (canBrowse) {
        setOpenPostings(results[0]);
        setMyPostings(results[1]);
      } else {
        setMyPostings(results[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load job board');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!title || !company || !description) {
      setError('Title, company and description are required');
      return;
    }
    try {
      await api('/jobs', {
        method: 'POST',
        token,
        body: {
          title,
          company,
          location: location || undefined,
          description,
          applyLink: applyLink || undefined,
          contactEmail: contactEmail || undefined,
        },
      });
      setMessage('Job posted');
      setTitle('');
      setCompany('');
      setLocation('');
      setDescription('');
      setApplyLink('');
      setContactEmail('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post job');
    }
  }

  async function handleStatus(id: string, status: 'OPEN' | 'CLOSED') {
    setError('');
    setMessage('');
    try {
      await api(`/jobs/${id}/status`, { method: 'PATCH', token, body: { status } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update posting');
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/jobs/${id}`, { method: 'DELETE', token });
      setMessage('Posting deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete posting');
    }
  }

  return (
    <PortalLayout title="Job Board">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Job Board</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canBrowse
              ? 'Browse open opportunities, or post one for others to see.'
              : 'Post a job opening for alumni to see.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handlePost} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Post an Opening</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Job title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Apply link (optional)"
              value={applyLink}
              onChange={(e) => setApplyLink(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
              placeholder="Contact email (optional)"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <textarea
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
              placeholder="Description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Post Opening
          </button>
        </form>

        {canBrowse && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Open Opportunities</h3>
            {loading && <p className="text-sm text-gray-400">Loading...</p>}
            {!loading && openPostings.length === 0 && (
              <p className="text-sm text-gray-400">No open postings right now.</p>
            )}
            {openPostings.map((p) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{p.title}</h4>
                    <p className="text-sm text-gray-500">
                      {p.company}
                      {p.location ? ` \u2014 ${p.location}` : ''}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{p.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{p.description}</p>
                <div className="text-xs text-gray-400 mt-2 space-x-3">
                  {p.applyLink && <span>Apply: {p.applyLink}</span>}
                  {p.contactEmail && <span>Contact: {p.contactEmail}</span>}
                </div>
                {p.postedBy && (
                  <p className="text-xs text-gray-400 mt-1">Posted by {p.postedBy.name}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">My Postings</h3>
          {myPostings.length === 0 && <p className="text-sm text-gray-400">You haven't posted anything yet.</p>}
          {myPostings.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{p.title}</h4>
                  <p className="text-sm text-gray-500">
                    {p.company}
                    {p.location ? ` \u2014 ${p.location}` : ''}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{p.status}</span>
              </div>
              <div className="mt-2 space-x-3">
                {p.status === 'OPEN' ? (
                  <button
                    className="text-amber-600 text-xs font-medium"
                    onClick={() => handleStatus(p.id, 'CLOSED')}
                  >
                    Close
                  </button>
                ) : (
                  <button
                    className="text-green-600 text-xs font-medium"
                    onClick={() => handleStatus(p.id, 'OPEN')}
                  >
                    Reopen
                  </button>
                )}
                <button className="text-red-600 text-xs font-medium" onClick={() => handleDelete(p.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def write_page(force: bool) -> None:
    os.makedirs(os.path.dirname(JOB_BOARD_PATH), exist_ok=True)
    if os.path.exists(JOB_BOARD_PATH) and not force:
        print("SKIP  " + JOB_BOARD_PATH + " already exists (use --force to overwrite)")
        return
    with open(JOB_BOARD_PATH, "w") as f:
        f.write(JOB_BOARD_TSX)
    print("WROTE " + JOB_BOARD_PATH)


def patch_layout() -> None:
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "/jobs" in joined:
        print("SKIP  " + LAYOUT_PATH + " already has a Job Board link.")
        return

    alumni_idx = find_line_index(lines, "ALUMNI: [")
    if alumni_idx is None:
        print("ERROR: could not find 'ALUMNI: [' in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    alumni_close = None
    depth = 0
    for i in range(alumni_idx, len(lines)):
        depth += lines[i].count("[") - lines[i].count("]")
        if depth == 0 and i > alumni_idx:
            alumni_close = i
            break
    if alumni_close is None:
        print("ERROR: could not find closing bracket for ALUMNI section. Patch manually.")
        sys.exit(1)
    job_board_section = (
        "    {\n"
        "      title: 'Career',\n"
        "      items: [{ label: 'Job Board', path: '/jobs', icon: '\U0001f4bc' }],\n"
        "    },\n"
    )
    lines = lines[:alumni_close] + [job_board_section] + lines[alumni_close:]

    idx = find_line_index(lines, "label: 'Staff Self-Service', path: '/workers'")
    if idx is None:
        print("WARNING: could not find the 'My Work' self-service line to extend.")
        print("         ALUMNI now has a Job Board link, but staff won't see one in nav.")
    else:
        old_line = lines[idx]
        if "Job Board" not in old_line:
            new_line = old_line.replace(
                "}] }]",
                "}, { label: 'Job Board', path: '/jobs', icon: '\U0001f4bc' }] }]",
            )
            if new_line == old_line:
                print("WARNING: could not extend the 'My Work' items array automatically. Add manually.")
            else:
                lines[idx] = new_line

    with open(LAYOUT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + LAYOUT_PATH + " (added Job Board to ALUMNI nav + shared My Work section)")


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "JobBoard" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "AdminAlumni from './pages/admin/AdminAlumni'")
    if import_idx is None:
        import_idx = find_line_index(lines, "AdminPortal from './pages/portal/AdminPortal'")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/admin/alumni"')
    if route_idx is None:
        route_idx = find_line_index(lines, '"/admin"')
    if route_idx is None:
        print("ERROR: could not find an anchor route in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = "import JobBoard from './pages/jobs/JobBoard';\n"
    new_route = '                <Route path="/jobs" element={<JobBoard />} />\n'

    if route_idx > import_idx:
        lines2 = lines[: route_idx + 1] + [new_route] + lines[route_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        route_idx2 = find_line_index(lines2, '"/admin/alumni"')
        if route_idx2 is None:
            route_idx2 = find_line_index(lines2, '"/admin"')
        lines3 = lines2[: route_idx2 + 1] + [new_route] + lines2[route_idx2 + 1 :]

    with open(APP_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + APP_PATH + " (added JobBoard import + route)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_page(args.force)
    patch_layout()
    patch_app()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()

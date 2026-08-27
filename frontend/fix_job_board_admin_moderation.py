#!/usr/bin/env python3
"""
Rewrites JobBoard.tsx to give Admin real moderation power:
  - Alumni: post + browse OPEN postings + manage own postings (unchanged).
  - Non-admin staff (Teacher, Registrar, etc.): post + manage own postings.
  - Admin: post + manage own postings, PLUS a full 'All Postings
    (Moderation)' table showing every posting from every poster, any
    status, with Close/Reopen/Delete on each row -- not just their own.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 fix_job_board_admin_moderation.py

Always overwrites JobBoard.tsx (safe to re-run).
"""

import os

JOB_BOARD_PATH = os.path.join("src", "pages", "jobs", "JobBoard.tsx")

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
  postedById?: string;
  postedBy?: { id: string; name: string; role: string };
}

const BROWSE_ROLES = ['ALUMNI', 'ADMIN'];

export default function JobBoard() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canBrowse = user ? BROWSE_ROLES.includes(user.role) : false;

  const [openPostings, setOpenPostings] = useState<Posting[]>([]);
  const [allPostings, setAllPostings] = useState<Posting[]>([]);
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
      const myPostingsData = await api('/jobs/my-postings', { token });
      setMyPostings(myPostingsData);

      if (isAdmin) {
        const all = await api('/jobs', { token });
        setAllPostings(all);
      } else if (canBrowse) {
        const open = await api('/jobs', { token });
        setOpenPostings(open);
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

  function PostingCard({ p, showPoster }: { p: Posting; showPoster: boolean }) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
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
        {showPoster && p.postedBy && (
          <p className="text-xs text-gray-400 mt-1">
            Posted by {p.postedBy.name} ({p.postedBy.role})
          </p>
        )}
        <div className="mt-2 space-x-3">
          {p.status === 'OPEN' ? (
            <button className="text-amber-600 text-xs font-medium" onClick={() => handleStatus(p.id, 'CLOSED')}>
              Close
            </button>
          ) : (
            <button className="text-green-600 text-xs font-medium" onClick={() => handleStatus(p.id, 'OPEN')}>
              Reopen
            </button>
          )}
          <button className="text-red-600 text-xs font-medium" onClick={() => handleDelete(p.id)}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <PortalLayout title="Job Board">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Job Board</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Post an opening, and moderate every listing on the board.'
              : canBrowse
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

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {isAdmin && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">All Postings (Moderation)</h3>
            {!loading && allPostings.length === 0 && (
              <p className="text-sm text-gray-400">No postings on the board yet.</p>
            )}
            {allPostings.map((p) => (
              <PostingCard key={p.id} p={p} showPoster />
            ))}
          </div>
        )}

        {!isAdmin && canBrowse && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Open Opportunities</h3>
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
                {p.postedBy && <p className="text-xs text-gray-400 mt-1">Posted by {p.postedBy.name}</p>}
              </div>
            ))}
          </div>
        )}

        {!isAdmin && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">My Postings</h3>
            {myPostings.length === 0 && <p className="text-sm text-gray-400">You haven't posted anything yet.</p>}
            {myPostings.map((p) => (
              <PostingCard key={p.id} p={p} showPoster={false} />
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""


def main():
    os.makedirs(os.path.dirname(JOB_BOARD_PATH), exist_ok=True)
    with open(JOB_BOARD_PATH, "w", encoding="utf-8") as f:
        f.write(JOB_BOARD_TSX)
    print("REWROTE " + JOB_BOARD_PATH + " (Admin now gets full moderation over every posting)")


if __name__ == "__main__":
    main()

// RUNYENJES-SETUP-V1
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const proseCls = [
  '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4',
  '[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-3',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2',
  '[&_p]:my-3 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3',
  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3',
  '[&_li]:my-1',
  '[&_table]:w-full [&_table]:text-sm [&_table]:my-4',
  '[&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-gray-300 [&_th]:p-2',
  '[&_td]:border-b [&_td]:border-gray-200 [&_td]:p-2 [&_td]:align-top',
  '[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm dark:[&_code]:bg-gray-800',
  '[&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-amber-400 [&_blockquote]:pl-4 [&_blockquote]:my-4',
  '[&_hr]:my-6',
].join(' ');

const btn =
  'border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium dark:border-gray-600 dark:text-gray-200';

// Public on purpose: during a first installation nobody has an account yet.
// The guide contains instructions only, never secrets.
export default function DeploymentGuide() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/deployment-guide.md')
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then((t) => {
        // A missing file can come back as the app's own HTML page.
        if (/^\s*<!doctype html|^\s*<html/i.test(t)) throw new Error('not found');
        setText(t);
      })
      .catch(() => setError('The guide could not be loaded.'));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 print:bg-white">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-lg shadow p-6 sm:p-8 text-gray-800 dark:text-gray-100">
        <div className="flex flex-wrap gap-2 mb-6 print:hidden">
          <button type="button" className={btn} onClick={() => window.history.back()}>
            Back
          </button>
          <button type="button" className={btn} onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {!error && !text && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

        {text && (
          <div className={proseCls}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-rgreen">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {text}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

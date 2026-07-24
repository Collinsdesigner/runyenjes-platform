import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export default function VideoCall() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !user) return;

    function loadJitsiScript(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) return resolve();
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load the video call service'));
        document.body.appendChild(script);
      });
    }

    loadJitsiScript()
      .then(() => {
        if (!containerRef.current) return;

        // Room name is tied to the group's own id — private and unique per class/department,
        // without us needing to run any video/signaling servers ourselves.
        const roomName = `runyenjes-${groupId}`;

        apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName,
          parentNode: containerRef.current,
          userInfo: { displayName: user.name },
          width: '100%',
          height: '100%',
          configOverwrite: {
            prejoinPageEnabled: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
        });

        apiRef.current.addListener('videoConferenceLeft', () => {
          navigate(`/groups/${groupId}`);
        });

        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      apiRef.current?.dispose();
    };
  }, [groupId, user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to join this call.
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate(`/groups/${groupId}`)}
          className="text-sm text-gray-300 underline"
        >
          ← Back to chat
        </button>
        <span className="text-xs text-gray-400">Runyenjes Video Call</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 m-4 rounded-md">{error}</div>
      )}
      {loading && !error && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Connecting to the call…
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { api } from './api/client';
import Home from './pages/Home';
import Login from './pages/Login';
import Apply from './pages/Apply';
import Admissions from './pages/Admissions';
import Groups from './pages/Groups';
import GroupChat from './pages/GroupChat';
import Continuation from './pages/Continuation';
import Library from './pages/Library';
import LibraryUnits from './pages/LibraryUnits';
import Admin from './pages/Admin';
import Browser from './pages/Browser';
import Profile from './pages/Profile';
import VideoCall from './pages/VideoCall';
import AIAssistant from './pages/AIAssistant';
// ShortCourses removed for now — redundant with department programs (see pages/ShortCourses.tsx if ever needed again)

export default function App() {
  // Apply live brand colors from Admin Settings once at startup, so every
  // existing "bg-rgreen"/"text-rgreen" class across the app reflects
  // whatever's saved in the database — no per-page changes needed.
  useEffect(() => {
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
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupChat />} />
          <Route path="/groups/:groupId/call" element={<VideoCall />} />
          <Route path="/continuation" element={<Continuation />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:programId" element={<LibraryUnits />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/browser" element={<Browser />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/ai" element={<AIAssistant />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

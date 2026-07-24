import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Apply from './pages/Apply';
import Admissions from './pages/Admissions';
import Groups from './pages/Groups';
import GroupChat from './pages/GroupChat';
import Continuation from './pages/Continuation';
import Library from './pages/Library';
import LibraryUnits from './pages/LibraryUnits';

export default function App() {
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
          <Route path="/continuation" element={<Continuation />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:programId" element={<LibraryUnits />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

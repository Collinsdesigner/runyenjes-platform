import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { api } from './api/client';
import Home from './pages/Home';
import Login from './pages/Login';
import Apply from './pages/Apply';
import AboutRTVC from './pages/AboutRTVC';
import Admissions from './pages/Admissions';
import Groups from './pages/Groups';
import GroupChat from './pages/GroupChat';
import Continuation from './pages/Continuation';
import Library from './pages/Library';
import LibraryUnits from './pages/LibraryUnits';
import UnitTutor from './pages/UnitTutor';
import Admin from './pages/Admin';
import Browser from './pages/Browser';
import Profile from './pages/Profile';
import Security from './pages/Security';
import VideoCall from './pages/VideoCall';
import PortalRedirect from './pages/PortalRedirect';
import StudentPortal from './pages/portal/StudentPortal';
import TeacherPortal from './pages/portal/TeacherPortal';
import AdminPortal from './pages/portal/AdminPortal';
import AlumniPortal from './pages/portal/AlumniPortal';
import AdminAlumni from './pages/admin/AdminAlumni';
import JobBoard from './pages/jobs/JobBoard';
import Announcements from './pages/announcements/Announcements';
import Notebook from './pages/notebook/Notebook';
import Reports from './pages/reports/Reports';
import WorkersPortal from './pages/portal/WorkersPortal';
import ProcurementPortal from './pages/portal/ProcurementPortal';
import ProcurementRequests from './pages/procurement/ProcurementRequests';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAdmissions from './pages/admin/AdminAdmissions';
import AdminLibrary from './pages/admin/AdminLibrary';
import AdminStudents from './pages/admin/AdminStudents';
import AdminStaff from './pages/admin/AdminStaff';
import AdminBulkImport from './pages/admin/AdminBulkImport';
import TeacherAssignments from './pages/teacher/TeacherAssignments';
import TeacherUnits from './pages/teacher/TeacherUnits';
import TeacherClasses from './pages/teacher/TeacherClasses';
import TeacherStudents from './pages/teacher/TeacherStudents';
import TeacherAttendance from './pages/teacher/TeacherAttendance';
import TeacherAssessments from './pages/teacher/TeacherAssessments';
import TeacherResults from './pages/teacher/TeacherResults';
import StudentAssignments from './pages/student/StudentAssignments';
import StudentAcademics from './pages/student/StudentAcademics';
import StudentFees from './pages/student/StudentFees';
import StudentResults from './pages/student/StudentResults';
import AdminAcademic from './pages/admin/AdminAcademic';
import AdminFinance from './pages/admin/AdminFinance';
import RegistrarPortal from './pages/portal/RegistrarPortal';
import RegistrarStudents from './pages/registrar/RegistrarStudents';
import RegistrarProgrammes from './pages/registrar/RegistrarProgrammes';
import RegistrarStudentAcademic from './pages/registrar/RegistrarStudentAcademic';
import AIAssistant from './pages/AIAssistant';
import RegistrarTimetable from './pages/registrar/RegistrarTimetable';
import StudentTimetable from './pages/portal/StudentTimetable';
import FinancePortal from './pages/portal/FinancePortal';
import FinanceInvoices from './pages/finance/FinanceInvoices';
import HrPortal from './pages/portal/HrPortal';
import HrStaff from './pages/hr/HrStaff';
import ExaminationsPortal from './pages/portal/ExaminationsPortal';
import ExaminationsResults from './pages/examinations/ExaminationsResults';
import StoresPortal from './pages/portal/StoresPortal';
import StoresInventory from './pages/stores/StoresInventory';
import AdminUsers from './pages/admin/AdminUsers';
// ShortCourses removed for now — redundant with department programs (see pages/ShortCourses.tsx if ever needed again)

export default function App() {
  // Apply live brand colors from Admin Settings once at startup, so every
  // existing "bg-rgreen"/"text-rgreen" class across the app reflects
  // whatever's saved in the database — no per-page changes needed.
  useEffect(() => {
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
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/about-rtvc" element={<AboutRTVC />} />

          <Route path="/login" element={<Login />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupChat />} />
          <Route path="/groups/:groupId/call" element={<VideoCall />} />
          <Route path="/continuation" element={<Continuation />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:programId" element={<LibraryUnits />} />
          <Route path="/library/units/:unitId/tutor" element={<UnitTutor />} />
         <Route path="/admin" element={<AdminPortal />} />
                <Route path="/alumni" element={<AlumniPortal />} />
                <Route path="/admin/alumni" element={<AdminAlumni />} />
                <Route path="/jobs" element={<JobBoard />} />
                <Route path="/registrar/announcements" element={<Announcements />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/notebook" element={<Notebook />} />
                <Route path="/registrar/reports" element={<Reports />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/communication" element={<Announcements />} />
                <Route path="/workers" element={<WorkersPortal />} />
                <Route path="/procurement" element={<ProcurementPortal />} />
                <Route path="/procurement/requests" element={<ProcurementRequests />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/admissions" element={<AdminAdmissions />} />
                <Route path="/admin/library" element={<AdminLibrary />} />
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/staff" element={<AdminStaff />} />
                <Route path="/admin/bulk-import" element={<AdminBulkImport />} />
                <Route path="/admin/academic" element={<AdminAcademic />} />
                <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/browser" element={<Browser />} />
         <Route path="/profile" element={<Profile />} />
         <Route path="/portal" element={<PortalRedirect />} />
         <Route path="/student" element={<StudentPortal />} />
         <Route path="/student/timetable" element={<StudentTimetable />} />
         <Route path="/teacher" element={<TeacherPortal />} />
                <Route path="/teacher/assignments" element={<TeacherAssignments />} />
                <Route path="/teacher/units" element={<TeacherUnits />} />
                <Route path="/teacher/classes" element={<TeacherClasses />} />
                <Route path="/teacher/students" element={<TeacherStudents />} />
                <Route path="/teacher/attendance" element={<TeacherAttendance />} />
                <Route path="/teacher/assessments" element={<TeacherAssessments />} />
                <Route path="/teacher/results" element={<TeacherResults />} />
                <Route path="/student/assignments" element={<StudentAssignments />} />
                <Route path="/student/academics" element={<StudentAcademics />} />
                <Route path="/student/fees" element={<StudentFees />} />
                <Route path="/student/results" element={<StudentResults />} />
         <Route path="/security" element={<Security />} />
         <Route path="/registrar" element={<RegistrarPortal />} />
         <Route path="/registrar/students" element={<RegistrarStudents />} />
         <Route path="/registrar/students/:studentId/academic" element={<RegistrarStudentAcademic />} />
          <Route path="/registrar/programmes" element={<RegistrarProgrammes />} />
         <Route path="/ai" element={<AIAssistant />} />

                <Route path="/registrar/timetable" element={<RegistrarTimetable />} />
                <Route path="/finance" element={<FinancePortal />} />
                <Route path="/finance/invoices" element={<FinanceInvoices />} />
                <Route path="/hr" element={<HrPortal />} />
                <Route path="/hr/staff" element={<HrStaff />} />
                <Route path="/examinations" element={<ExaminationsPortal />} />
                <Route path="/examinations/results" element={<ExaminationsResults />} />
                <Route path="/stores" element={<StoresPortal />} />
                <Route path="/stores/items" element={<StoresInventory />} />
                <Route path="/admin/users" element={<AdminUsers />} />
</Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

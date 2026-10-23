import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { api } from './api/client';
import Home from './pages/Home';
import Login from './pages/Login';
import Setup from './pages/Setup';
import DeploymentGuide from './pages/DeploymentGuide';
import ModuleGate from './components/ModuleGate';
import AdminModules from './pages/admin/AdminModules';
import Apply from './pages/Apply';
import AboutInstitution from './pages/AboutInstitution';
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
import TeacherContentGenerator from './pages/teacher/TeacherContentGenerator';
import TeacherEarlyWarning from './pages/teacher/TeacherEarlyWarning';
import TeacherAssessments from './pages/teacher/TeacherAssessments';
import TeacherResults from './pages/teacher/TeacherResults';
import StudentAssignments from './pages/student/StudentAssignments';
import StudentAcademics from './pages/student/StudentAcademics';
import StudentFees from './pages/student/StudentFees';
import StudentResults from './pages/student/StudentResults';
import StudentRecords from './pages/student/StudentRecords';
import AdminAcademic from './pages/admin/AdminAcademic';
import AdminFinance from './pages/admin/AdminFinance';
import RegistrarPortal from './pages/portal/RegistrarPortal';
import RegistrarStudents from './pages/registrar/RegistrarStudents';
import RegistrarProgrammes from './pages/registrar/RegistrarProgrammes';
import AcademicStructure from './pages/registrar/AcademicStructure';
import RegistrarStudentAcademic from './pages/registrar/RegistrarStudentAcademic';
import RegistrarAcademicRecords from './pages/registrar/RegistrarAcademicRecords';
import RegistrarDocuments from './pages/registrar/RegistrarDocuments';
import RegistrarLetters from './pages/registrar/RegistrarLetters';
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
import AdminAuditLog from './pages/admin/AdminAuditLog';
import StudentRequests from './pages/student/StudentRequests';
import FinanceApprovals from './pages/finance/FinanceApprovals';
import RegistrarApprovals from './pages/registrar/RegistrarApprovals';
// ShortCourses removed for now — redundant with department programs (see pages/ShortCourses.tsx if ever needed again)

export default function App() {
  // Apply live brand colors from Admin Settings once at startup, so every
  // existing "bg-rgreen"/"text-rgreen" class across the app reflects
  // whatever's saved in the database — no per-page changes needed.
  useEffect(() => {
    api('/settings')
      .then((settings) => {
        // SETUP_REDIRECT_V1: a fresh install has no SiteSettings row yet, so
        // the server reports configured:false. Send the installer to the wizard.
        if (settings && settings.configured === false && !['/setup', '/deployment-guide'].includes(window.location.pathname)) {
          window.location.replace('/setup');
          return;
        }
        // SETTINGS_TITLE_V1: browser tab title comes from settings
        if (settings?.institutionName) document.title = settings.institutionName;
        // institution_colors: remembered so index.html can apply them before first paint
        if (settings?.primaryColor) {
          try {
            localStorage.setItem(
              'institution_colors',
              JSON.stringify({ primary: settings.primaryColor, secondary: settings.secondaryColor || null })
            );
          } catch {
            // storage unavailable: the colors still apply once settings load
          }
        }
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

          <Route path="/about" element={<AboutInstitution />} />

          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/deployment-guide" element={<DeploymentGuide />} />
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
                <Route path="/alumni" element={<ModuleGate moduleKey="alumni"><AlumniPortal /></ModuleGate>} />
                <Route path="/admin/alumni" element={<ModuleGate moduleKey="alumni"><AdminAlumni /></ModuleGate>} />
                <Route path="/jobs" element={<ModuleGate moduleKey="alumni"><JobBoard /></ModuleGate>} />
                <Route path="/registrar/announcements" element={<Announcements />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/notebook" element={<Notebook />} />
                <Route path="/registrar/reports" element={<Reports />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/communication" element={<Announcements />} />
                <Route path="/workers" element={<ModuleGate moduleKey="hr"><WorkersPortal /></ModuleGate>} />
                <Route path="/procurement" element={<ModuleGate moduleKey="procurement"><ProcurementPortal /></ModuleGate>} />
                <Route path="/procurement/requests" element={<ModuleGate moduleKey="procurement"><ProcurementRequests /></ModuleGate>} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/modules" element={<AdminModules />} />
                <Route path="/admin/admissions" element={<AdminAdmissions />} />
                <Route path="/admin/library" element={<AdminLibrary />} />
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/staff" element={<AdminStaff />} />
                <Route path="/admin/bulk-import" element={<AdminBulkImport />} />
                <Route path="/admin/academic" element={<AdminAcademic />} />
                <Route path="/admin/finance" element={<ModuleGate moduleKey="finance"><AdminFinance /></ModuleGate>} />
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
                <Route path="/teacher/content-generator" element={<TeacherContentGenerator />} />
                <Route path="/teacher/early-warning" element={<TeacherEarlyWarning />} />
                <Route path="/teacher/assessments" element={<TeacherAssessments />} />
                <Route path="/teacher/results" element={<TeacherResults />} />
                <Route path="/student/assignments" element={<StudentAssignments />} />
                <Route path="/student/academics" element={<StudentAcademics />} />
                <Route path="/student/fees" element={<ModuleGate moduleKey="finance"><StudentFees /></ModuleGate>} />
                <Route path="/student/results" element={<StudentResults />} />
                <Route path="/student/records" element={<StudentRecords />} />
         <Route path="/security" element={<Security />} />
         <Route path="/registrar" element={<RegistrarPortal />} />
         <Route path="/registrar/students" element={<RegistrarStudents />} />
         <Route path="/registrar/students/:studentId/academic" element={<RegistrarStudentAcademic />} />
                <Route path="/registrar/academic" element={<RegistrarAcademicRecords />} />
                <Route path="/registrar/documents" element={<RegistrarDocuments />} />
                <Route path="/registrar/letters" element={<RegistrarLetters />} />
          <Route path="/registrar/programmes" element={<RegistrarProgrammes />} />
                <Route path="/registrar/structure" element={<AcademicStructure />} />
         <Route path="/ai" element={<AIAssistant />} />

                <Route path="/registrar/timetable" element={<RegistrarTimetable />} />
                <Route path="/finance" element={<ModuleGate moduleKey="finance"><FinancePortal /></ModuleGate>} />
                <Route path="/finance/invoices" element={<ModuleGate moduleKey="finance"><FinanceInvoices /></ModuleGate>} />
                <Route path="/hr" element={<ModuleGate moduleKey="hr"><HrPortal /></ModuleGate>} />
                <Route path="/hr/staff" element={<ModuleGate moduleKey="hr"><HrStaff /></ModuleGate>} />
                <Route path="/examinations" element={<ExaminationsPortal />} />
                <Route path="/examinations/results" element={<ExaminationsResults />} />
                <Route path="/stores" element={<ModuleGate moduleKey="stores"><StoresPortal /></ModuleGate>} />
                <Route path="/stores/items" element={<ModuleGate moduleKey="stores"><StoresInventory /></ModuleGate>} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/audit-log" element={<AdminAuditLog />} />
                <Route path="/student/requests" element={<StudentRequests />} />
                <Route path="/finance/approvals" element={<ModuleGate moduleKey="finance"><FinanceApprovals /></ModuleGate>} />
                <Route path="/registrar/approvals" element={<RegistrarApprovals />} />
</Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import SignUpPage from '@/pages/auth/SignUpPage';
import ActivatePage from '@/pages/auth/ActivatePage';
import TwoFactorVerifyPage from '@/pages/auth/TwoFactorVerifyPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import InvitePage from '@/pages/auth/InvitePage';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import CourseListPage from '@/pages/courses/CourseListPage';
import CourseDetailPage from '@/pages/courses/CourseDetailPage';
import CourseFormPage from '@/pages/courses/CourseFormPage';
import DictionaryPage from '@/pages/dictionary/DictionaryPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function RoleGuard({ role, children }: { role: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== role) return <Navigate to="/" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/2fa/verify" element={<TwoFactorVerifyPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Protected */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="courses" element={<CourseListPage />} />
        <Route
          path="courses/new"
          element={
            <RoleGuard role="TEACHER">
              <CourseFormPage />
            </RoleGuard>
          }
        />
        <Route path="courses/:id" element={<CourseDetailPage />} />
        <Route
          path="courses/:id/edit"
          element={
            <RoleGuard role="TEACHER">
              <CourseFormPage />
            </RoleGuard>
          }
        />
        <Route
          path="dictionary"
          element={
            <RoleGuard role="TEACHER">
              <DictionaryPage />
            </RoleGuard>
          }
        />
        <Route
          path="admin/users"
          element={
            <RoleGuard role="ADMIN">
              <AdminUsersPage />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

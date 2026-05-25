import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', roles: ['TEACHER', 'STUDENT', 'ADMIN'] },
  { path: '/courses', label: 'Courses', roles: ['TEACHER', 'STUDENT'] },
  { path: '/dictionary', label: 'Dictionary', roles: ['TEACHER'] },
  { path: '/admin/users', label: 'Manage Users', roles: ['ADMIN'] },
];

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);

  return (
    <aside className="hidden w-64 border-r border-gray-200 bg-white md:block">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-indigo-600">TeacherSupporter</h1>
      </div>
      <nav className="mt-4 space-y-1 px-3">
        {navItems
          .filter((item) => !user || item.roles.includes(user.role))
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
}

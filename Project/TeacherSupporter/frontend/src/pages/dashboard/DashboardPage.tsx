import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { coursesApi } from '@/api/courses';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'TEACHER';

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () =>
      isTeacher ? coursesApi.list().then((r) => r.data) : coursesApi.myCourses().then((r) => r.data),
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => coursesApi.myAssignments().then((r) => r.data),
    enabled: !isTeacher,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName || 'User'}
        </h1>
        <p className="text-sm text-gray-500">
          {isTeacher ? 'Manage your courses and students' : 'View your courses and assignments'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="text-sm font-medium text-gray-500">
            {isTeacher ? 'My Courses' : 'Enrolled Courses'}
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {coursesLoading ? '...' : courses?.length ?? 0}
          </p>
        </div>

        {!isTeacher && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm font-medium text-gray-500">My Assignments</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {assignmentsLoading ? '...' : assignments?.length ?? 0}
            </p>
          </div>
        )}

        {isTeacher && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm font-medium text-gray-500">Quick Actions</p>
            <div className="mt-3">
              <Link
                to="/courses/new"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Create Course
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Recent courses */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isTeacher ? 'My Courses' : 'Enrolled Courses'}
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {coursesLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">Loading courses...</div>
          ) : !courses || courses.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              {isTeacher
                ? 'No courses yet. Create your first course!'
                : 'You are not enrolled in any courses yet.'}
            </div>
          ) : (
            courses.slice(0, 5).map((course) => (
              <Link
                key={course.id}
                to={`/courses/${course.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{course.name}</p>
                  <p className="text-sm text-gray-500">{course.description}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    course.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : course.status === 'DRAFT'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {course.status}
                </span>
              </Link>
            ))
          )}
        </div>
        {courses && courses.length > 5 && (
          <div className="border-t border-gray-200 px-6 py-3">
            <Link to="/courses" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              View all courses
            </Link>
          </div>
        )}
      </div>

      {/* Student assignments */}
      {!isTeacher && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">My Assignments</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {assignmentsLoading ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">Loading assignments...</div>
            ) : !assignments || assignments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No assignments yet.
              </div>
            ) : (
              assignments.slice(0, 5).map((assignment) => (
                <div key={assignment.id} className="px-6 py-4">
                  <p className="font-medium text-gray-900">{assignment.title}</p>
                  <p className="text-sm text-gray-500">{assignment.description}</p>
                  <div className="mt-1 flex gap-4 text-xs text-gray-400">
                    {assignment.dueDate && <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                      {assignment.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

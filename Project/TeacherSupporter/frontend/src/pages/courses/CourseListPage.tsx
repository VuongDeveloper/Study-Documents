import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { coursesApi } from '@/api/courses';

export default function CourseListPage() {
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'TEACHER';
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState('');

  const { data: courses, isLoading, error } = useQuery({
    queryKey: ['courses'],
    queryFn: () =>
      isTeacher ? coursesApi.list().then((r) => r.data) : coursesApi.myCourses().then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => coursesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setDeleteError('');
    },
    onError: () => {
      setDeleteError('Failed to delete course.');
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500">
            {isTeacher ? 'Manage your courses' : 'Your enrolled courses'}
          </p>
        </div>
        {isTeacher && (
          <Link
            to="/courses/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Course
          </Link>
        )}
      </div>

      {deleteError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{deleteError}</div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Failed to load courses.
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        {isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Loading courses...</div>
        ) : !courses || courses.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            {isTeacher
              ? 'No courses yet. Create your first course!'
              : 'You are not enrolled in any courses.'}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Start Date</th>
                <th className="px-6 py-3 font-medium text-gray-500">End Date</th>
                <th className="px-6 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/courses/${course.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                      {course.name}
                    </Link>
                    {course.description && (
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{course.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
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
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {course.startDate ? new Date(course.startDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {course.endDate ? new Date(course.endDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Link
                        to={`/courses/${course.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-500"
                      >
                        View
                      </Link>
                      {isTeacher && (
                        <>
                          <Link
                            to={`/courses/${course.id}/edit`}
                            className="text-sm text-gray-600 hover:text-gray-500"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(course.id, course.name)}
                            className="text-sm text-red-600 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

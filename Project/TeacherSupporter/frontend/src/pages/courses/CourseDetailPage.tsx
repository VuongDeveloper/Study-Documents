import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/authStore';
import { coursesApi } from '@/api/courses';
import type { AxiosError } from 'axios';

const assignmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  documentUrl: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

type AssignmentForm = z.infer<typeof assignmentSchema>;

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const courseId = Number(id);
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'TEACHER';
  const queryClient = useQueryClient();
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [enrollError, setEnrollError] = useState('');

  const { data: course, isLoading: courseLoading, error: courseError } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.get(courseId).then((r) => r.data),
    enabled: !isNaN(courseId),
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['course-assignments', courseId],
    queryFn: () => coursesApi.getAssignments(courseId).then((r) => r.data),
    enabled: !isNaN(courseId),
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ['course-enrollments', courseId],
    queryFn: () => coursesApi.getEnrollments(courseId).then((r) => r.data),
    enabled: !isNaN(courseId) && isTeacher,
  });

  const createAssignmentMutation = useMutation({
    mutationFn: (data: AssignmentForm) =>
      coursesApi.createAssignment(courseId, { ...data, courseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assignments', courseId] });
      setShowAssignmentForm(false);
      reset();
      setFormError('');
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setFormError(err.response?.data?.message || 'Failed to create assignment.');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) => coursesApi.deleteAssignment(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assignments', courseId] });
    },
  });

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => coursesApi.listStudents().then((r) => r.data),
    enabled: isTeacher,
  });

  const enrollMutation = useMutation({
    mutationFn: (studentId: number) => coursesApi.enroll({ courseId, studentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-enrollments', courseId] });
      setSelectedStudentId('');
      setEnrollError('');
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setEnrollError(err.response?.data?.message || 'Failed to enroll student.');
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: (enrollmentId: number) => coursesApi.unenroll(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-enrollments', courseId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      coursesApi.update(courseId, {
        name: course!.name,
        description: course!.description,
        status,
        startDate: course!.startDate,
        endDate: course!.endDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  // Students not already enrolled in this course — candidates for the picker.
  const enrolledStudentIds = new Set((enrollments ?? []).map((e) => e.studentId));
  const availableStudents = (students ?? []).filter((s) => !enrolledStudentIds.has(s.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssignmentForm>({
    resolver: zodResolver(assignmentSchema),
  });

  if (courseLoading) {
    return <div className="text-center text-sm text-gray-500">Loading course...</div>;
  }

  if (courseError || !course) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        Failed to load course details.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/courses" className="text-sm text-indigo-600 hover:text-indigo-500">
            &larr; Back to Courses
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{course.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{course.description}</p>
        </div>
        {isTeacher && (
          <Link
            to={`/courses/${courseId}/edit`}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Edit Course
          </Link>
        )}
      </div>

      {/* Course info */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs font-medium uppercase text-gray-500">Status</p>
          {isTeacher ? (
            <select
              value={course.status}
              onChange={(e) => statusMutation.mutate(e.target.value)}
              disabled={statusMutation.isPending}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          ) : (
            <p className="mt-1 font-medium text-gray-900">{course.status}</p>
          )}
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs font-medium uppercase text-gray-500">Start Date</p>
          <p className="mt-1 font-medium text-gray-900">
            {course.startDate ? new Date(course.startDate).toLocaleDateString() : 'Not set'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs font-medium uppercase text-gray-500">End Date</p>
          <p className="mt-1 font-medium text-gray-900">
            {course.endDate ? new Date(course.endDate).toLocaleDateString() : 'Not set'}
          </p>
        </div>
      </div>

      {/* Assignments */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Assignments</h2>
          {isTeacher && (
            <button
              onClick={() => setShowAssignmentForm(!showAssignmentForm)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {showAssignmentForm ? 'Cancel' : 'Add Assignment'}
            </button>
          )}
        </div>

        {/* Assignment creation form */}
        {showAssignmentForm && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            {formError && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>
            )}
            <form onSubmit={handleSubmit((data) => createAssignmentMutation.mutate(data))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  {...register('title')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  {...register('description')}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    {...register('startDate')}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <input
                    type="date"
                    {...register('dueDate')}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Document URL</label>
                <input
                  type="text"
                  {...register('documentUrl')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="https://..."
                />
              </div>
              <button
                type="submit"
                disabled={createAssignmentMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createAssignmentMutation.isPending ? 'Creating...' : 'Create Assignment'}
              </button>
            </form>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {assignmentsLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">Loading assignments...</div>
          ) : !assignments || assignments.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">No assignments yet.</div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <Link
                    to={`/courses/${courseId}/assignments/${assignment.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    {assignment.title}
                  </Link>
                  {assignment.description && (
                    <p className="mt-0.5 text-sm text-gray-500">{assignment.description}</p>
                  )}
                  <div className="mt-1 flex gap-3 text-xs text-gray-400">
                    {assignment.startDate && (
                      <span>Start: {new Date(assignment.startDate).toLocaleDateString()}</span>
                    )}
                    {assignment.dueDate && (
                      <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        assignment.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {assignment.status}
                    </span>
                  </div>
                </div>
                {isTeacher && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${assignment.title}"?`)) {
                        deleteAssignmentMutation.mutate(assignment.id);
                      }
                    }}
                    className="text-sm text-red-600 hover:text-red-500"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Enrolled students (teacher only) */}
      {isTeacher && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Enrolled Students</h2>
          </div>

          {/* Add student picker */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            {enrollError && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{enrollError}</div>
            )}
            <div className="flex items-center gap-3">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">
                  {availableStudents.length === 0
                    ? 'No students available to add'
                    : 'Select a student to enroll...'}
                </option>
                {availableStudents.map((student) => {
                  const name = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim();
                  return (
                    <option key={student.id} value={student.id}>
                      {name ? `${name} (${student.email})` : student.email}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={() => selectedStudentId && enrollMutation.mutate(Number(selectedStudentId))}
                disabled={!selectedStudentId || enrollMutation.isPending}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {enrollMutation.isPending ? 'Enrolling...' : 'Enroll'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {enrollmentsLoading ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">Loading students...</div>
            ) : !enrollments || enrollments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">No students enrolled yet.</div>
            ) : (
              enrollments.map((enrollment) => (
                <div key={enrollment.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{enrollment.studentName}</p>
                    <p className="text-xs text-gray-400">
                      Enrolled: {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        enrollment.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {enrollment.status}
                    </span>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${enrollment.studentName} from this course?`)) {
                          unenrollMutation.mutate(enrollment.id);
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-500"
                    >
                      Remove
                    </button>
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

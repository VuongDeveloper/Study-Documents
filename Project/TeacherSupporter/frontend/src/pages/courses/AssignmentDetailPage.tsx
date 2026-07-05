import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/authStore';
import { coursesApi } from '@/api/courses';
import type { AxiosError } from 'axios';
import type { SubmissionResponse } from '@/types';

const editSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.string().optional(),
  documentUrl: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

const submitSchema = z
  .object({
    textContent: z.string().optional(),
    linkUrl: z.string().optional(),
  })
  .passthrough();
type SubmitForm = z.infer<typeof submitSchema>;

const gradeSchema = z.object({
  score: z.coerce.number().min(0, 'Min 0').max(100, 'Max 100'),
  feedback: z.string().optional(),
});
type GradeForm = z.infer<typeof gradeSchema>;

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ message?: string }>)?.response?.data?.message || fallback;
}

export default function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const id = Number(assignmentId);
  const user = useAuthStore((s) => s.user);
  const isTeacher = user?.role === 'TEACHER';
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const { data: assignment, isLoading, error } = useQuery({
    queryKey: ['assignment', id],
    queryFn: () => coursesApi.getAssignment(id).then((r) => r.data),
    enabled: !isNaN(id),
  });

  // Teacher: all attempts for this assignment. Student: only their own.
  const { data: teacherSubs } = useQuery({
    queryKey: ['assignment-submissions', id],
    queryFn: () => coursesApi.getAssignmentSubmissions(id).then((r) => r.data),
    enabled: !isNaN(id) && isTeacher,
  });
  const { data: mySubs } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => coursesApi.mySubmissions().then((r) => r.data),
    enabled: !isNaN(id) && !isTeacher,
  });

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const submitForm = useForm<SubmitForm>({ resolver: zodResolver(submitSchema) });

  const updateMutation = useMutation({
    mutationFn: (data: EditForm) =>
      coursesApi.updateAssignment(id, { ...data, courseId: Number(courseId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      queryClient.invalidateQueries({ queryKey: ['course-assignments', Number(courseId)] });
      setEditing(false);
      setEditError('');
    },
    onError: (err) => setEditError(errMsg(err, 'Failed to update assignment.')),
  });

  const [submitError, setSubmitError] = useState('');
  const [file, setFile] = useState<File | undefined>(undefined);
  const submitMutation = useMutation({
    mutationFn: (data: SubmitForm) =>
      coursesApi.submitAssignment(id, {
        textContent: data.textContent,
        linkUrl: data.linkUrl,
        file,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
      submitForm.reset();
      setFile(undefined);
      setSubmitError('');
    },
    onError: (err) => setSubmitError(errMsg(err, 'Failed to submit.')),
  });

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500">Loading assignment...</div>;
  }
  if (error || !assignment) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        Failed to load assignment.
      </div>
    );
  }

  const myAttempts = (mySubs ?? []).filter((s) => s.assignmentId === id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to={`/courses/${courseId}`}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            &larr; Back to Course
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{assignment.title}</h1>
          <div className="mt-1 flex gap-3 text-xs text-gray-400">
            {assignment.startDate && (
              <span>Start: {new Date(assignment.startDate).toLocaleDateString()}</span>
            )}
            {assignment.dueDate && (
              <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
            )}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              {assignment.status}
            </span>
          </div>
        </div>
        {isTeacher && (
          <button
            onClick={() => {
              setEditing((v) => !v);
              if (!editing) {
                editForm.reset({
                  title: assignment.title,
                  description: assignment.description ?? '',
                  status: assignment.status ?? 'DRAFT',
                  documentUrl: assignment.documentUrl ?? '',
                  startDate: assignment.startDate ?? '',
                  dueDate: assignment.dueDate ?? '',
                });
              }
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {editing ? 'Cancel' : 'Edit Assignment'}
          </button>
        )}
      </div>

      {/* Description / detail */}
      {!editing && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {assignment.description || 'No description provided.'}
          </p>
          {assignment.documentUrl && (
            <a
              href={assignment.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500"
            >
              View attached document &rarr;
            </a>
          )}
        </div>
      )}

      {/* Teacher edit form */}
      {isTeacher && editing && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          {editError && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</div>
          )}
          <form
            onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                {...editForm.register('title')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {editForm.formState.errors.title && (
                <p className="mt-1 text-xs text-red-600">
                  {editForm.formState.errors.title.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                {...editForm.register('description')}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  {...editForm.register('startDate')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  {...editForm.register('dueDate')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  {...editForm.register('status')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Document URL</label>
                <input
                  type="text"
                  {...editForm.register('documentUrl')}
                  placeholder="https://..."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* Student: submit + own attempts */}
      {!isTeacher && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Submit your work</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Each submission creates a new attempt. Provide text, a link, a file, or any
              combination.
            </p>
          </div>
          <div className="px-6 py-4">
            {submitError && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
            )}
            <form
              onSubmit={submitForm.handleSubmit((data) => submitMutation.mutate(data))}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700">Text answer</label>
                <textarea
                  {...submitForm.register('textContent')}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Link</label>
                <input
                  type="text"
                  {...submitForm.register('linkUrl')}
                  placeholder="https://..."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">File</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0])}
                  className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit attempt'}
              </button>
            </form>
          </div>
          <div className="border-t border-gray-200 px-6 py-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Your attempts</h3>
            {myAttempts.length === 0 ? (
              <p className="text-sm text-gray-500">No attempts yet.</p>
            ) : (
              <div className="space-y-3">
                {myAttempts.map((s) => (
                  <SubmissionCard key={s.id} submission={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Teacher: all student attempts + grading */}
      {isTeacher && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Student Submissions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {!teacherSubs || teacherSubs.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">No submissions yet.</div>
            ) : (
              teacherSubs.map((s) => <GradeRow key={s.id} submission={s} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ submission: s }: { submission: SubmissionResponse }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">
          Attempt #{s.attemptNumber} &middot; {new Date(s.submittedAt).toLocaleString()}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            s.status === 'GRADED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {s.status}
        </span>
      </div>
      {s.textContent && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{s.textContent}</p>}
      {s.linkUrl && (
        <a
          href={s.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-sm text-indigo-600 hover:text-indigo-500"
        >
          {s.linkUrl}
        </a>
      )}
      {s.fileDownloadUrl && (
        <a
          href={s.fileDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-sm text-indigo-600 hover:text-indigo-500"
        >
          Download {s.fileName ?? 'file'} &darr;
        </a>
      )}
      {s.status === 'GRADED' && (
        <div className="mt-2 rounded-md bg-green-50 p-2 text-sm text-green-800">
          <span className="font-semibold">Score: {s.score}</span>
          {s.feedback && <p className="mt-0.5 whitespace-pre-wrap">{s.feedback}</p>}
        </div>
      )}
    </div>
  );
}

function GradeRow({ submission: s }: { submission: SubmissionResponse }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [gradeError, setGradeError] = useState('');
  const { register, handleSubmit, formState } = useForm<GradeForm>({
    resolver: zodResolver(gradeSchema),
    defaultValues: { score: s.score ?? undefined, feedback: s.feedback ?? '' },
  });

  const gradeMutation = useMutation({
    mutationFn: (data: GradeForm) =>
      coursesApi.gradeSubmission(s.id, { score: data.score, feedback: data.feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-submissions', s.assignmentId] });
      setOpen(false);
      setGradeError('');
    },
    onError: (err) => setGradeError(errMsg(err, 'Failed to save grade.')),
  });

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {s.studentName}{' '}
            <span className="text-xs font-normal text-gray-400">attempt #{s.attemptNumber}</span>
          </p>
          <p className="text-xs text-gray-400">{new Date(s.submittedAt).toLocaleString()}</p>
          {s.textContent && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{s.textContent}</p>
          )}
          {s.linkUrl && (
            <a
              href={s.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-indigo-600 hover:text-indigo-500"
            >
              {s.linkUrl}
            </a>
          )}
          {s.fileDownloadUrl && (
            <a
              href={s.fileDownloadUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-indigo-600 hover:text-indigo-500"
            >
              Download {s.fileName ?? 'file'} &darr;
            </a>
          )}
        </div>
        <div className="ml-4 flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              s.status === 'GRADED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {s.status === 'GRADED' ? `Score: ${s.score}` : 'SUBMITTED'}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            {open ? 'Cancel' : s.status === 'GRADED' ? 'Edit grade' : 'Grade'}
          </button>
        </div>
      </div>

      {open && (
        <form
          onSubmit={handleSubmit((data) => gradeMutation.mutate(data))}
          className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3"
        >
          {gradeError && (
            <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{gradeError}</div>
          )}
          <div className="flex items-end gap-3">
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-700">Score (0–100)</label>
              <input
                type="number"
                step="0.5"
                {...register('score')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {formState.errors.score && (
                <p className="mt-1 text-xs text-red-600">{formState.errors.score.message}</p>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700">Feedback</label>
              <textarea
                {...register('feedback')}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={gradeMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {gradeMutation.isPending ? 'Saving...' : 'Save grade'}
          </button>
        </form>
      )}
    </div>
  );
}

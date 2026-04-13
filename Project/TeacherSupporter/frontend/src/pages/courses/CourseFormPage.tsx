import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { coursesApi } from '@/api/courses';
import type { AxiosError } from 'axios';

const courseSchema = z.object({
  name: z.string().min(1, 'Course name is required'),
  description: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type CourseForm = z.infer<typeof courseSchema>;

export default function CourseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const courseId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data: existingCourse, isLoading: courseLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.get(courseId).then((r) => r.data),
    enabled: isEdit && !isNaN(courseId),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseForm>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      status: 'DRAFT',
    },
  });

  useEffect(() => {
    if (existingCourse) {
      reset({
        name: existingCourse.name,
        description: existingCourse.description || '',
        status: existingCourse.status || 'DRAFT',
        startDate: existingCourse.startDate ? existingCourse.startDate.split('T')[0] : '',
        endDate: existingCourse.endDate ? existingCourse.endDate.split('T')[0] : '',
      });
    }
  }, [existingCourse, reset]);

  const createMutation = useMutation({
    mutationFn: (data: CourseForm) => coursesApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      navigate(`/courses/${response.data.id}`);
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setError(err.response?.data?.message || 'Failed to create course.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CourseForm) => coursesApi.update(courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      navigate(`/courses/${courseId}`);
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setError(err.response?.data?.message || 'Failed to update course.');
    },
  });

  const onSubmit = (data: CourseForm) => {
    setError('');
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && courseLoading) {
    return <div className="text-center text-sm text-gray-500">Loading course...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/courses" className="text-sm text-indigo-600 hover:text-indigo-500">
          &larr; Back to Courses
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Course' : 'Create Course'}
        </h1>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Course name
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., Introduction to Computer Science"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Course description..."
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                id="startDate"
                type="date"
                {...register('startDate')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                id="endDate"
                type="date"
                {...register('endDate')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : isEdit ? 'Update Course' : 'Create Course'}
            </button>
            <Link
              to="/courses"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

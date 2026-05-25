import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminApi } from '@/api/admin';
import type { AdminCreateUserRequest, AdminUserResponse } from '@/types';
import type { AxiosError } from 'axios';

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(['STUDENT', 'TEACHER']),
  authMethod: z.enum(['PASSWORD', 'GOOGLE']),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'STUDENT', authMethod: 'PASSWORD' },
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(0, 50);
      setUsers(res.data.content);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const onCreate = async (data: CreateForm) => {
    setError('');
    setSuccess('');
    try {
      const payload: AdminCreateUserRequest = data;
      const res = await adminApi.createUser(payload);
      setSuccess(
        res.data.status === 'INVITATION_SENT'
          ? `Invitation email sent to ${res.data.email}.`
          : `User ${res.data.email} created. Temp password emailed.`
      );
      reset();
      loadUsers();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Failed to create user.');
    }
  };

  const onChangeRole = async (id: number, role: string) => {
    try {
      await adminApi.updateRole(id, role);
      loadUsers();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Failed to update role.');
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      await adminApi.deleteUser(id);
      loadUsers();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Failed to delete user.');
    }
  };

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-gray-900">User Management</h1>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create new user</h2>
        <form onSubmit={handleSubmit(onCreate)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              {...register('email')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              {...register('role')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Auth method</label>
            <select
              {...register('authMethod')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="PASSWORD">Password (temp password emailed)</option>
              <option value="GOOGLE">Google (invitation link emailed)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">First name</label>
            <input
              {...register('firstName')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Last name</label>
            <input
              {...register('lastName')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create user
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Existing users</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Email</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Provider</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No users.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-3">{u.email}</td>
                <td className="px-6 py-3">
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || '-'}
                </td>
                <td className="px-6 py-3">
                  {u.role === 'ADMIN' ? (
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      ADMIN
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => onChangeRole(u.id, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="STUDENT">STUDENT</option>
                      <option value="TEACHER">TEACHER</option>
                    </select>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-600">{u.provider}</td>
                <td className="px-6 py-3 text-gray-600">
                  {u.mustChangePassword ? 'Must change password' : u.activated ? 'Active' : 'Inactive'}
                </td>
                <td className="px-6 py-3 text-right">
                  {u.role !== 'ADMIN' && (
                    <button
                      onClick={() => onDelete(u.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

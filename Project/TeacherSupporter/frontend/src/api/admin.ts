import apiClient from './client';
import type {
  AdminCreateUserRequest,
  AdminCreateUserResponse,
  AdminUserResponse,
  PageResponse,
} from '@/types';

export const adminApi = {
  createUser: (data: AdminCreateUserRequest) =>
    apiClient.post<AdminCreateUserResponse>('/auth/admin/users', data),
  listUsers: (page = 0, size = 20) =>
    apiClient.get<PageResponse<AdminUserResponse>>('/auth/admin/users', {
      params: { page, size },
    }),
  updateRole: (id: number, role: string) =>
    apiClient.patch<AdminUserResponse>(`/auth/admin/users/${id}`, { role }),
  deleteUser: (id: number) => apiClient.delete(`/auth/admin/users/${id}`),
};

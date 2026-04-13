import apiClient from './client';
import type {
  CourseRequest,
  CourseResponse,
  AssignmentRequest,
  AssignmentResponse,
  EnrollmentRequest,
  EnrollmentResponse,
} from '@/types';

export const coursesApi = {
  list: (page = 0, size = 20) =>
    apiClient.get<CourseResponse[]>('/courses/courses', { params: { page, size } }),
  get: (id: number) =>
    apiClient.get<CourseResponse>(`/courses/courses/${id}`),
  create: (data: CourseRequest) =>
    apiClient.post<CourseResponse>('/courses/courses', data),
  update: (id: number, data: CourseRequest) =>
    apiClient.put<CourseResponse>(`/courses/courses/${id}`, data),
  delete: (id: number) =>
    apiClient.delete(`/courses/courses/${id}`),

  // Assignments
  getAssignments: (courseId: number) =>
    apiClient.get<AssignmentResponse[]>(`/courses/courses/${courseId}/assignments`),
  createAssignment: (courseId: number, data: AssignmentRequest) =>
    apiClient.post<AssignmentResponse>(`/courses/courses/${courseId}/assignments`, data),
  getAssignment: (id: number) =>
    apiClient.get<AssignmentResponse>(`/assignments/assignments/${id}`),
  updateAssignment: (id: number, data: AssignmentRequest) =>
    apiClient.put<AssignmentResponse>(`/assignments/assignments/${id}`, data),
  deleteAssignment: (id: number) =>
    apiClient.delete(`/assignments/assignments/${id}`),

  // Enrollments
  enroll: (data: EnrollmentRequest) =>
    apiClient.post<EnrollmentResponse>('/enrollments/enrollments', data),
  unenroll: (id: number) =>
    apiClient.delete(`/enrollments/enrollments/${id}`),
  getEnrollments: (courseId: number) =>
    apiClient.get<EnrollmentResponse[]>('/enrollments/enrollments', { params: { courseId } }),

  // Student self-service
  myCourses: () =>
    apiClient.get<CourseResponse[]>('/students/students/me/courses'),
  myAssignments: () =>
    apiClient.get<AssignmentResponse[]>('/students/students/me/assignments'),
};

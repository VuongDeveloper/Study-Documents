import apiClient from './client';
import type {
  CourseRequest,
  CourseResponse,
  AssignmentRequest,
  AssignmentResponse,
  EnrollmentRequest,
  EnrollmentResponse,
  SubmissionResponse,
  GradeRequest,
  StudentResponse,
  PageResponse,
} from '@/types';

export const coursesApi = {
  list: async (page = 0, size = 20) => {
    const res = await apiClient.get<PageResponse<CourseResponse>>('/courses/courses', {
      params: { page, size },
    });
    return { ...res, data: res.data.content };
  },
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

  // Submissions
  getAssignmentSubmissions: (assignmentId: number) =>
    apiClient.get<SubmissionResponse[]>(`/assignments/assignments/${assignmentId}/submissions`),
  submitAssignment: (
    assignmentId: number,
    form: { textContent?: string; linkUrl?: string; file?: File }
  ) => {
    const fd = new FormData();
    if (form.textContent) fd.append('textContent', form.textContent);
    if (form.linkUrl) fd.append('linkUrl', form.linkUrl);
    if (form.file) fd.append('file', form.file);
    // FormData body: with no global Content-Type default on apiClient, axios
    // sets multipart/form-data with the correct boundary automatically.
    return apiClient.post<SubmissionResponse>(
      `/assignments/assignments/${assignmentId}/submissions`,
      fd
    );
  },
  getSubmission: (id: number) =>
    apiClient.get<SubmissionResponse>(`/submissions/submissions/${id}`),
  gradeSubmission: (id: number, data: GradeRequest) =>
    apiClient.post<SubmissionResponse>(`/submissions/submissions/${id}/grade`, data),
  mySubmissions: () =>
    apiClient.get<SubmissionResponse[]>('/submissions/submissions/me'),

  // Enrollments
  enroll: (data: EnrollmentRequest) =>
    apiClient.post<EnrollmentResponse>('/enrollments/enrollments', data),
  unenroll: (id: number) =>
    apiClient.delete(`/enrollments/enrollments/${id}`),
  getEnrollments: (courseId: number) =>
    apiClient.get<EnrollmentResponse[]>('/enrollments/enrollments', { params: { courseId } }),

  // Students (teacher: list all to pick enrollees)
  listStudents: () =>
    apiClient.get<StudentResponse[]>('/students/students'),

  // Student self-service
  myCourses: () =>
    apiClient.get<CourseResponse[]>('/students/students/me/courses'),
  myAssignments: () =>
    apiClient.get<AssignmentResponse[]>('/students/students/me/assignments'),
};

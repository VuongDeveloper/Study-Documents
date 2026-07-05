// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role: 'TEACHER' | 'STUDENT';
  activationMethod: 'EMAIL' | 'SCREEN';
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  requiresTwoFactor: boolean;
  mustChangePassword: boolean;
  tempToken?: string;
}

export interface ChangePasswordRequest {
  tempToken: string;
  newPassword: string;
}

export interface AdminCreateUserRequest {
  email: string;
  role: 'STUDENT' | 'TEACHER';
  authMethod: 'PASSWORD' | 'GOOGLE';
  firstName?: string;
  lastName?: string;
}

export interface AdminCreateUserResponse {
  email: string;
  role: string;
  authMethod: string;
  status: 'USER_CREATED' | 'INVITATION_SENT';
}

export interface AdminUserResponse {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  provider: string;
  activated: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface TotpVerifyRequest {
  tempToken: string;
  code: string;
}

export interface TotpSetupResponse {
  secret: string;
  qrCodeUri: string;
}

export interface UserResponse {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  provider: string;
  totpEnabled: boolean;
  activated: boolean;
}

export interface ActivationResponse {
  message: string;
  activationLink?: string;
}

// Course types
export interface CourseRequest {
  name: string;
  description?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface CourseResponse {
  id: number;
  name: string;
  description: string;
  status: string;
  teacherUserId: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

// Student types
export interface StudentResponse {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// Assignment types
export interface AssignmentRequest {
  courseId: number;
  title: string;
  description?: string;
  status?: string;
  documentUrl?: string;
  startDate?: string;
  dueDate?: string;
}

export interface AssignmentResponse {
  id: number;
  courseId: number;
  title: string;
  description: string;
  status: string;
  documentUrl: string;
  startDate: string;
  dueDate: string;
  createdAt: string;
}

// Submission types
export interface SubmissionResponse {
  id: number;
  assignmentId: number;
  studentId: number;
  studentName: string;
  attemptNumber: number;
  textContent: string | null;
  linkUrl: string | null;
  fileName: string | null;
  fileDownloadUrl: string | null;
  status: 'SUBMITTED' | 'GRADED';
  score: number | null;
  feedback: string | null;
  gradedBy: number | null;
  submittedAt: string;
  gradedAt: string | null;
}

export interface GradeRequest {
  score: number;
  feedback?: string;
}

// Enrollment types
export interface EnrollmentRequest {
  courseId: number;
  studentId: number;
}

export interface EnrollmentResponse {
  id: number;
  courseId: number;
  studentId: number;
  studentName: string;
  enrolledAt: string;
  status: string;
}

// Dictionary types
export interface WordDefinitionRequest {
  word: string;
  meaning?: string;
  usage?: string;
  notes?: string;
  examples?: string[];
  tags?: string[];
  images?: string[];
  extra?: Record<string, unknown>;
}

export interface WordDefinitionResponse {
  id: string;
  word: string;
  meaning: string;
  usage: string;
  notes: string;
  examples: string[];
  tags: string[];
  images: string[];
  extra: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  parentIds: string[];
  childIds: string[];
}

export interface WordLinkRequest {
  parentWordId: string;
  childWordId: string;
  position?: number;
}

export interface WordGraphResponse {
  id: string;
  word: string;
  meaning: string;
  children: WordGraphResponse[];
}

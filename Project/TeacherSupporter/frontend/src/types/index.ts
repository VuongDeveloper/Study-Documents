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
  tempToken?: string;
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

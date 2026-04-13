import apiClient from './client';
import type {
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  TotpVerifyRequest,
  ActivationResponse,
  UserResponse,
  TotpSetupResponse,
} from '@/types';

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<ActivationResponse>('/auth/register', data),
  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login', data),
  verifyTwoFactor: (data: TotpVerifyRequest) =>
    apiClient.post<LoginResponse>('/auth/verify-2fa', data),
  activate: (code: string) =>
    apiClient.post(`/auth/activate?code=${code}`),
  refresh: (refreshToken: string) =>
    apiClient.post<LoginResponse>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
  getMe: () =>
    apiClient.get<UserResponse>('/auth/me'),
  setupTwoFactor: () =>
    apiClient.post<TotpSetupResponse>('/auth/me/enable-2fa'),
  enableTwoFactor: (code: string) =>
    apiClient.post(`/auth/me/enable-2fa/verify?code=${code}`),
  disableTwoFactor: () =>
    apiClient.post('/auth/me/disable-2fa'),
};

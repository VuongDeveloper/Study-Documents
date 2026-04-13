import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import type { AxiosError } from 'axios';

const totpSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});

type TotpForm = z.infer<typeof totpSchema>;

export default function TwoFactorVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTokens, setUser } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tempToken = (location.state as { tempToken?: string })?.tempToken;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TotpForm>({
    resolver: zodResolver(totpSchema),
  });

  if (!tempToken) {
    return <Navigate to="/login" />;
  }

  const onSubmit = async (formData: TotpForm) => {
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.verifyTwoFactor({
        tempToken,
        code: formData.code,
      });

      setTokens(data.accessToken, data.refreshToken);
      const meResponse = await authApi.getMe();
      setUser(meResponse.data);
      navigate('/');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                {...register('code')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="000000"
              />
              {errors.code && (
                <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { authApi } from '@/api/auth';
import type { AxiosError } from 'axios';

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setMessage('No activation code provided.');
      return;
    }

    authApi
      .activate(code)
      .then(() => {
        setStatus('success');
        setMessage('Your account has been activated successfully!');
      })
      .catch((err: AxiosError<{ message?: string }>) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Activation failed. The link may be expired or invalid.');
      });
  }, [code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Account Activation</h1>

          {status === 'loading' && (
            <div className="mt-6">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="mt-4 text-sm text-gray-600">Activating your account...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="mt-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="mt-4 text-sm text-green-700">{message}</p>
              <Link
                to="/login"
                className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Go to login
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="mt-4 text-sm text-red-700">{message}</p>
              <Link
                to="/login"
                className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

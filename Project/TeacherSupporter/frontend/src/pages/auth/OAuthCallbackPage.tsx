import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken || !refreshToken) {
      setError('Missing tokens from OAuth callback.');
      return;
    }

    setTokens(accessToken, refreshToken);

    authApi
      .getMe()
      .then((res) => {
        setUser(res.data);
        navigate('/', { replace: true });
      })
      .catch(() => {
        setError('Failed to load user profile.');
      });
  }, [searchParams, setTokens, setUser, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Back to login
            </button>
          </>
        ) : (
          <p className="text-gray-600">Signing you in...</p>
        )}
      </div>
    </div>
  );
}

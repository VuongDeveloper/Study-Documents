import { useEffect } from 'react';

export default function InvitePage() {
  useEffect(() => {
    window.location.replace('/oauth2/authorization/google');
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <p className="text-gray-600">Redirecting to Google sign-in...</p>
    </div>
  );
}

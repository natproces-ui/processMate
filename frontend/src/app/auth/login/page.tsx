import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">

      <div className="mb-6 text-center">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Connexion</h1>
        <p className="text-sm text-gray-500 mt-1">Accédez à votre espace ProcessMate</p>
      </div>

      <LoginForm />

    </div>
  );
}

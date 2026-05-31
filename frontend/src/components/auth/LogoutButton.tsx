'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LogOut } from 'lucide-react';

export default function LogoutButton({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      title="Déconnexion"
      className={className ?? 'flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors'}
    >
      <LogOut className="w-4 h-4" />
      {!iconOnly && <span>Déconnexion</span>}
    </button>
  );
}

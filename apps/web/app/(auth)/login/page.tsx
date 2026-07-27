'use client';

import { LoginForm } from '@/features/auth/components/login-form';
import { useAuthActions } from '@/features/auth/hooks/use-auth-actions';

export default function LoginPage() {
  const { login, isPending } = useAuthActions();
  return <LoginForm onSubmit={login} isPending={isPending} />;
}

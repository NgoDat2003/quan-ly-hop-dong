import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthLogin } from '@/lib/api/generated/auth/auth';
import type { LoginFormValues } from '@/lib/auth/auth-schemas';

export function useAuthActions() {
  const loginMutation = useAuthLogin();
  const queryClient = useQueryClient();
  const router = useRouter();

  const login = async (dto: LoginFormValues) => {
    try {
      // The access/refresh tokens arrive as httpOnly Set-Cookie headers —
      // the browser stores them automatically, nothing to read/persist
      // here. res.data.data now only carries { user }.
      await loginMutation.mutateAsync({ data: dto });
      queryClient.invalidateQueries();
      toast.success('Đăng nhập thành công');
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    }
  };

  return { login, isPending: loginMutation.isPending };
}

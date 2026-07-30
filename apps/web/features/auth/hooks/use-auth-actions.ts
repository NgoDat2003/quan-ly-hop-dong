import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthLogin } from '@/lib/api/generated/auth/auth';
import { setToken } from '@/lib/auth/auth-token';
import type { LoginFormValues } from '@/lib/auth/auth-schemas';

export function useAuthActions() {
  const loginMutation = useAuthLogin();
  const queryClient = useQueryClient();
  const router = useRouter();

  const login = async (dto: LoginFormValues) => {
    try {
      // res.data.data: the Orval fetch wrapper adds { data, status, headers }
      // (res.data), and the API's own envelope adds { statusCode, data }
      // (res.data.data) — two levels of nesting to unwrap.
      const res = await loginMutation.mutateAsync({ data: dto });
      setToken(res.data.data.accessToken);
      queryClient.invalidateQueries();
      toast.success('Đăng nhập thành công');
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    }
  };

  return { login, isPending: loginMutation.isPending };
}

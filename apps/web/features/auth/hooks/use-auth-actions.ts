import { useAuthLogin } from '@/lib/api/generated/auth/auth';
import type { LoginFormValues } from '@/lib/auth/auth-schemas';

export function useAuthActions() {
  const loginMutation = useAuthLogin();

  const login = async (dto: LoginFormValues) => {
    // TODO: implement — on success:
    //   setToken(res.data.data.accessToken)   <-- NOTE: res.data.data, not res.
    //     Two levels of nesting: the fetch mutator wraps every response as
    //     { data, status, headers } (res.data), and the API itself documents
    //     an envelope { statusCode, data } (res.data.data).
    //   then queryClient.invalidateQueries(), toast.success, router.push('/').
    // On failure: toast.error(err.message).
    // The catch exists only to keep the console clean while the backend is stubbed.
    try {
      await loginMutation.mutateAsync({ data: dto });
    } catch {
      // TODO: surface the error to the user
    }
  };

  return { login, isPending: loginMutation.isPending };
}

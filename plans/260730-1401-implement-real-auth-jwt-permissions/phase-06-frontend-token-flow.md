---
phase: 6
title: Frontend token flow
status: completed
priority: P2
effort: 30m
dependencies:
  - 3
---

# Phase 6: Frontend token flow

## Overview

Hoàn thiện `use-auth-actions.ts` theo đúng TODO đã ghi sẵn trong code: lưu token, invalidate cache, toast, redirect. Đây là phần nhỏ nhất trong plan — code đã có comment chỉ rõ từng bước cần làm, chỉ cần implement đúng theo đó.

## Key Insights

- `apps/web/lib/auth/auth-token.ts` đã có sẵn `getToken`/`setToken`/`clearToken` (localStorage) — CHƯA dùng ở đâu, chỉ cần gọi.
- Comment TODO trong `use-auth-actions.ts` đã ghi chính xác thứ tự cần làm và lưu ý quan trọng về double envelope: `res.data.data` (không phải `res.data`) — lớp ngoài là wrapper fetch của Orval, lớp trong mới là envelope thật của API (`{statusCode, data}`).
- `app/page.tsx` hiện chỉ là placeholder `<main>Training App</main>` — route `/` sau khi redirect từ login sẽ tạm thời vẫn là placeholder này (AppShell là plan riêng, sau plan này). Không tạo shell/dashboard ở phase này — ngoài scope.
- Không có `middleware.ts` hay route protection nào ở frontend (xác nhận cả base này và `maycha_QAQC_app` đều chỉ làm client-side, không phải gap cần vá trong plan này).

## Requirements

- Functional: Login thành công → lưu `accessToken` vào localStorage qua `setToken()`, invalidate React Query cache liên quan auth, hiện `toast.success`, redirect `router.push('/')`.
- Functional: Login thất bại → hiện `toast.error` với message lỗi (đọc từ response lỗi, không phải generic "có lỗi xảy ra" nếu backend đã trả message rõ ràng).
- Non-functional: Không thêm route/component UI mới ngoài việc hoàn thiện action hook đã có sẵn.

## Architecture

Không đổi kiến trúc — chỉ điền logic vào hook đã tồn tại, đúng pattern `use-{feature}-actions.ts` đã document trong `.agent/projectRules/frontend-architecture.md`.

## Related Code Files

- Modify: `apps/web/features/auth/hooks/use-auth-actions.ts`

## Implementation Steps

1. Đọc lại `apps/web/features/auth/hooks/use-auth-actions.ts` hiện có — comment TODO đã ghi chi tiết, bám sát đúng thứ tự đó.
2. Implement:
   ```typescript
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
         const res = await loginMutation.mutateAsync({ data: dto });
         setToken(res.data.data.accessToken); // res.data.data: Orval fetch wrapper + API envelope
         queryClient.invalidateQueries();
         toast.success('Đăng nhập thành công');
         router.push('/');
       } catch (err) {
         toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại');
       }
     };

     return { login, isPending: loginMutation.isPending };
   }
   ```
   Điều chỉnh `invalidateQueries()` phạm vi cụ thể hơn nếu có query key rõ ràng cho user/session — đánh giá lúc code (base hiện chỉ có 1 feature auth, chưa có query key convention rộng hơn để tham chiếu).
3. Chạy `pnpm --filter=web check-types`.
4. Verify thủ công: chạy `pnpm dev` (cả api + web, cần seed admin từ Phase 4 + Postgres bật), đăng nhập qua `/login` với `admin@example.com`/`admin12345`, xác nhận: token lưu vào localStorage (DevTools → Application → Local Storage), toast thành công hiện ra, redirect về `/`. Test sai password → toast lỗi hiện ra, không redirect.

## Success Criteria

- [ ] Login thành công lưu token, invalidate cache, toast, redirect `/` — verify thủ công qua browser thật.
- [ ] Login thất bại hiện toast lỗi, không redirect, không lưu token.
- [ ] `pnpm --filter=web check-types` pass.
- [ ] Không có route/UI mới nào được tạo ngoài phạm vi hook.

## Risk Assessment

Rủi ro thấp — thay đổi cô lập trong 1 hook, không ảnh hưởng phần khác của FE. Rủi ro duy nhất: đọc sai tầng envelope (`res.data` thay vì `res.data.data`) — đã có comment cảnh báo sẵn trong code, chỉ cần làm đúng theo đó.

## Security Considerations

Token lưu ở `localStorage` (không phải httpOnly cookie) — chấp nhận được cho skeleton hiện tại (không đổi kiến trúc lưu token ở phase này, đây là quyết định đã có sẵn từ trước, ngoài scope thay đổi của plan). Nếu dự án cụ thể cần bảo mật cao hơn (XSS resistance), cân nhắc chuyển sang httpOnly cookie — không phải việc của base skeleton này.

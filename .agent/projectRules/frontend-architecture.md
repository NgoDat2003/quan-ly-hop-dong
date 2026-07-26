# Frontend Architecture: Tách UI khỏi Action/Side-effect

## Nguyên tắc cốt lõi

Bắt buộc cho mọi feature mới, bất kể quy mô:

1. **Component chỉ render.** Không gọi mutation hook trực tiếp kèm xử lý side-effect trong component lớn, không viết `try/catch` + toast (`sonner`) inline trong JSX file, không định nghĩa cấu hình bảng/cột lớn (`ColumnDef` của TanStack Table dùng trong shadcn/ui `<DataTable>`) ngay trong component — tách ra file `-columns.tsx` riêng.
2. **Action/side-effect tách hook riêng.** "Side-effect" = bất cứ điều gì có tác dụng phụ ra ngoài component: gọi mutation API, hiện toast, invalidate cache, điều hướng route, ghi log. Toàn bộ side-effect của 1 feature gom vào `features/{feature}/hooks/use-{feature}-actions.ts`.
3. **Giới hạn 300 dòng/file.** Vượt ngưỡng được phép nếu có lý do rõ ràng (component orchestration phức tạp thật sự) — không phải mặc định, phải là ngoại lệ có ghi chú.
4. **Pure business logic tách file riêng + test khi có thể.** Hàm tính toán/transform thuần (không side-effect) đặt trong `lib/{feature}/{feature}-domain.ts` hoặc `{feature}-mappers.ts`, kèm `.spec.ts` cạnh file.

## Feature Module Structure (Frontend)

```
app/(app)/{feature}/
├── page.tsx                     # Chỉ render, không business logic, không gọi Orval hook trực tiếp kèm side-effect
└── [id]/page.tsx                # Pass-through mỏng

features/{feature}/
├── components/
│   ├── {feature}-list.tsx       # Thuần UI
│   ├── {feature}-detail.tsx     # Thuần UI
│   └── {feature}-columns.ts     # Cấu hình bảng/cột tách riêng
└── hooks/
    └── use-{feature}-actions.ts # Toàn bộ side-effect: mutation, toast, invalidate, redirect

lib/{feature}/
├── {feature}-domain.ts          # Pure business logic + .spec.ts
└── {feature}-mappers.ts
```

Hook action colocate trong `features/{feature}/hooks/` — không đặt ở `hooks/{feature}/` top-level, để giữ toàn bộ code của 1 feature (trừ pure logic dùng chung) nằm gọn trong 1 thư mục.

## Ví dụ: trước/sau tách action

**Trước (bẩn — action trộn trong component):**
```tsx
// app/(app)/{feature}/page.tsx
export default function FeaturePage() {
  const { data } = useFeatureListFeatures();       // Orval-generated hook
  const createMutation = useFeatureCreateFeature(); // Orval-generated hook

  const handleCreate = async (values) => {
    try {
      const result = await createMutation.mutateAsync({ data: values });
      toast.success('Tạo thành công');
      queryClient.invalidateQueries({ queryKey: ['feature'] });
      router.push(`/feature/${result.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [ /* nhiều dòng định nghĩa cột trộn trong component */ ];

  return <DataTable columns={columns} onCreate={handleCreate} data={data} />;
}
```

**Sau (sạch — action tách riêng):**
```tsx
// features/feature/hooks/use-feature-actions.ts
export function useFeatureActions() {
  const createMutation = useFeatureCreateFeature();
  const queryClient = useQueryClient();
  const router = useRouter();

  const createItem = async (values: CreateFeatureDto) => {
    try {
      const result = await createMutation.mutateAsync({ data: values });
      toast.success('Tạo thành công');
      queryClient.invalidateQueries({ queryKey: ['feature'] });
      router.push(`/feature/${result.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return { createItem, isCreating: createMutation.isPending };
}
```
```tsx
// features/feature/components/feature-columns.ts
export const featureColumns: ColumnDef<FeatureListItemDto>[] = [ /* định nghĩa cột tách riêng */ ];
```
```tsx
// app/(app)/{feature}/page.tsx — giờ chỉ render
export default function FeaturePage() {
  const { data } = useFeatureListFeatures();
  const { createItem, isCreating } = useFeatureActions();

  return <FeatureList data={data} columns={featureColumns} onCreate={createItem} loading={isCreating} />;
}
```

## Nếu dùng thêm state library (Zustand/Redux)

Chỉ thêm khi feature thật sự cần state chia sẻ phức tạp ngoài server cache. Khi đó áp dụng **Pure Store**:
- Store CHỈ chứa state + reducer, KHÔNG side-effect (toast/API call/console.log) bên trong action.
- Side-effect vẫn nằm trong `features/{feature}/hooks/use-{feature}-actions.ts` gọi store action, không đặt trong store.
- Nếu store vượt 300 dòng, tách slice: `store/{domain}/{domain.slice.ts,.selectors.ts,.types.ts}`.

## shadcn/ui Components

Dùng trực tiếp từ `@/components/ui/*` (sinh qua shadcn CLI, dựa trên Radix UI + Tailwind CSS), không tự dựng lại primitives layer song song.

### Form Pattern (react-hook-form + zod + shadcn/ui Form)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import type { CreateEntityDto } from '@/lib/api/generated/model';

const entitySchema = z.object({ name: z.string().min(1, 'Bắt buộc') });

export function EntityForm({ onSubmit }: { onSubmit: (dto: CreateEntityDto) => void }) {
  const form = useForm<CreateEntityDto>({ resolver: zodResolver(entitySchema) });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Lưu</Button>
      </form>
    </Form>
  );
}
```

Submit handler (side-effect) không xử lý trực tiếp trong form component — gọi qua `use-{feature}-actions.ts`.

## API Contract Layer (Orval)

```
lib/api/
├── generated/           # Orval output — KHÔNG sửa tay
│   ├── {name}.ts         # Fetch function + React Query hooks
│   └── model/             # DTO/enum types
└── http-client.ts        # Custom fetch mutator — auth, error handling, base URL
```

```tsx
// Generated tự động — KHÔNG viết tay, chỉ dùng
import { useFeatureListFeatures, useFeatureCreateFeature } from '@/lib/api/generated/maycha';

// Dùng trong features/{feature}/hooks/use-{feature}-actions.ts,
// KHÔNG dùng trực tiếp trong component lớn kèm side-effect
```

## New Feature Checklist (Frontend)

- [ ] `page.tsx` chỉ render, không business logic, không gọi Orval hook trực tiếp kèm side-effect
- [ ] Component UI trong `features/{feature}/components/`
- [ ] Side-effect (mutation, toast, invalidate, redirect) trong `features/{feature}/hooks/use-{feature}-actions.ts`
- [ ] Pure logic + mapper trong `lib/{feature}/`, kèm `.spec.ts` nếu có thể
- [ ] Cấu hình bảng/cột tách file `-columns.ts` riêng nếu component vượt 300 dòng
- [ ] Dùng type/hook từ `lib/api/generated/`, không tự viết tay DTO/service trùng lặp

## Common Mistakes to Avoid

| Category | Don't | Do |
|----------|-------|-----|
| **API Contract** | Viết tay DTO/type ở frontend | Dùng type sinh từ `lib/api/generated/model` |
| **API Contract** | Sửa tay file trong `lib/api/generated/` | Sửa DTO/Swagger ở backend, chạy lại `pnpm codegen` |
| **Component** | Gọi mutation + toast + invalidate + redirect trực tiếp trong component | Tách vào `features/{feature}/hooks/use-{feature}-actions.ts` |
| **Component** | Định nghĩa `ColumnDef` dài inline trong page | Tách file `{feature}-columns.ts` riêng |
| **File size** | File vượt 300 dòng không lý do | Tách theo UI/action/pure-logic; ngoại lệ phải có ghi chú |
| **Cache** | Quên invalidate sau mutation | `queryClient.invalidateQueries()` trong action hook |

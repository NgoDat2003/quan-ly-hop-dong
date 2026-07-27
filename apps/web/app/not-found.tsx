import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Không tìm thấy trang</CardTitle>
          <CardDescription>Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={cn(buttonVariants({ className: 'w-full' }))}>
            Về trang chủ
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

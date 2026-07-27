'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đã xảy ra lỗi</CardTitle>
          <CardDescription>{error.message || 'Có lỗi không xác định xảy ra.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} className="w-full">
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

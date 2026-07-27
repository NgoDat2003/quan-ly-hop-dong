import { z } from 'zod';

// Mirrors LoginDto on the backend (email @IsEmail, password @MinLength(8)).
// Keep in sync by hand — this base does not generate zod from OpenAPI.
export const loginSchema = z.object({
  email: z.email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

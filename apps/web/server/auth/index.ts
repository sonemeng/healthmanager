import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getDb } from '@openvitals/database/client';
import { accounts, profiles, sessions, users, verifications } from '@openvitals/database';
import crypto from 'crypto';

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]{0,49}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function containsControlCharacters(value: string) {
  return /[\x00-\x1F\x7F]/.test(value);
}

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;

      const body = ctx.body as { name?: unknown; email?: unknown; password?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!NAME_PATTERN.test(name)) {
        throw new APIError('BAD_REQUEST', { message: '姓名包含不支持的字符。' });
      }
      if (!EMAIL_PATTERN.test(email) || containsControlCharacters(email)) {
        throw new APIError('BAD_REQUEST', { message: '请输入合法的邮箱地址。' });
      }
      if (password.length < 8 || password.length > 128 || containsControlCharacters(password)) {
        throw new APIError('BAD_REQUEST', { message: '密码须为 8 至 128 个字符，且不能包含控制字符。' });
      }

      ctx.body = { ...body, name, email, password };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Create the account owner's profile before any family members exist.
          await getDb().insert(profiles).values({
            id: crypto.randomUUID(),
            userId: user.id,
            name: user.name || '本人',
            avatarColor: '#18a058',
            isDefault: true,
            sortOrder: 0,
          });
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session;

import { z } from 'zod';
import { createRouter, protectedProcedure } from '../init';
import { feedback } from '@openvitals/database';

const feedbackRecipient = 'sonemeng@hotmail.com';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!);
}

export const feedbackRouter = createRouter({
  create: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      rating: z.enum(['TERRIBLE', 'BAD', 'OKAY', 'GOOD', 'AMAZING']).nullable().optional(),
      page: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(feedback).values({
        userId: ctx.userId,
        message: input.message,
        rating: input.rating ?? null,
        page: input.page,
      });

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return { success: true, emailDelivered: false };
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? 'HealthManager Feedback <onboarding@resend.dev>',
          to: [feedbackRecipient],
          subject: `HealthManager feedback${input.rating ? `: ${input.rating}` : ''}`,
          html: `<h2>New feedback</h2><p><strong>Rating:</strong> ${escapeHtml(input.rating ?? 'Not provided')}</p><p><strong>Page:</strong> ${escapeHtml(input.page ?? 'Not provided')}</p><p><strong>User ID:</strong> ${escapeHtml(ctx.userId)}</p><hr/><p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
        }),
      });

      if (!response.ok) {
        console.error('[feedback] Resend notification failed:', await response.text());
        return { success: true, emailDelivered: false };
      }

      return { success: true, emailDelivered: true };
    }),
});

'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';

async function sendEmail(args: { email: string; organizationName: string; acceptUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY ?? 're_emulate_test_key';
  const baseUrl = (process.env.RESEND_BASE_URL ?? 'https://api.resend.com').replace(/\/+$/, '');
  const from = process.env.RESEND_FROM ?? 'onboarding@example.com';
  const response = await fetch(`${baseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.email],
      subject: `Convite para ${args.organizationName}`,
      html: `<p>Você foi convidado para entrar em <strong>${args.organizationName}</strong>.</p><p><a href="${args.acceptUrl}">Entre para ativar sua conta</a></p>`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send invitation email: ${response.status} ${body}`);
  }
}

export const sendInvitation = internalAction({
  args: {
    email: v.string(),
    organizationName: v.string(),
    invitationId: v.string(),
    acceptUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendEmail(args);
  },
});

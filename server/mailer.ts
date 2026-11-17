export interface Email {
  to: string;
  subject: string;
  text: string;
  /** Evita e-mail duplicado se a mesma requisição for repetida. */
  idempotencyKey: string;
}

export type Mailer = (message: Email) => Promise<void>;

export function createResendMailer(apiKey: string, from: string): Mailer {
  return async ({ to, subject, text, idempotencyKey }) => {
    // A resposta do provedor pode conter dados pessoais: nunca registre nem repasse.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Resend respondeu ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !body.id) {
      throw new Error('Resend não confirmou o envio.');
    }
  };
}

export function inviteEmail(to: string, name: string, link: string, requestId: string): Email {
  return {
    to,
    subject: 'Seu acesso ao Xilo Studio',
    text: `Olá, ${name}!\n\nVocê recebeu acesso ao Xilo Studio.\nCrie sua senha neste link:\n\n${link}\n\nO link vale por 7 dias e só pode ser usado uma vez.\nSe você não esperava este convite, ignore esta mensagem.`,
    idempotencyKey: `xilo-invite/${requestId}`,
  };
}

export function resetEmail(to: string, link: string, requestId: string): Email {
  return {
    to,
    subject: 'Redefinir sua senha do Xilo Studio',
    text: `Recebemos um pedido para definir a senha da sua conta no Xilo Studio.\nUse este link:\n\n${link}\n\nO link vale por 1 hora e só pode ser usado uma vez.\nSe você não fez esse pedido, ignore esta mensagem: sua senha atual continua valendo.`,
    idempotencyKey: `xilo-reset/${requestId}`,
  };
}

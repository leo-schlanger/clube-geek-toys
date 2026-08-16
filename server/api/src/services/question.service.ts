import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { getMemberIdForUser } from '../middleware/ownership.js';
import { SHOP_CANONICAL_URL } from '../config/env.js';
import { auditLog } from '../utils/audit.js';
import { notify } from './notification.service.js';
import { sendTemplateEmail } from './email.service.js';

/**
 * Perguntas e respostas no produto.
 *
 * A pergunta aparece na loja assim que é feita, marcada como "aguardando
 * resposta". Não há aprovação prévia, então `status='hidden'` é a moderação a
 * posteriori e o limite por usuário abaixo é o que segura spam.
 */

/** Perguntas não respondidas que um usuário pode ter em aberto ao mesmo tempo. */
export const MAX_OPEN_QUESTIONS_PER_USER = 10;

export interface ProductQuestion {
  id: string;
  productId: string;
  userId: string;
  memberId: string | null;
  body: string;
  status: 'published' | 'hidden';
  answerBody: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName?: string | null;
  productName?: string | null;
  productSlug?: string | null;
}

function mapQuestion(row: pg.QueryResultRow): ProductQuestion {
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    memberId: row.member_id ?? null,
    body: row.body,
    status: row.status,
    answerBody: row.answer_body ?? null,
    answeredBy: row.answered_by ?? null,
    answeredAt: row.answered_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: row.author_name ?? null,
    productName: row.product_name ?? null,
    productSlug: row.product_slug ?? null,
  };
}

/** Só o primeiro nome vai pra vitrine — pergunta pública não expõe nome completo. */
const AUTHOR_NAME_SQL = `COALESCE(NULLIF(SPLIT_PART(m.full_name, ' ', 1), ''), 'Cliente')`;

async function resolveProductId(productIdOrSlug: string): Promise<string> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(productIdOrSlug);
  const result = await query(
    isUuid
      ? `SELECT id FROM products WHERE id = $1`
      : `SELECT id FROM products WHERE slug = $1 AND active = TRUE`,
    [productIdOrSlug]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  }
  return result.rows[0].id as string;
}

export async function listProductQuestions(
  productIdOrSlug: string,
  opts: { page?: number; limit?: number } = {}
): Promise<{ questions: ProductQuestion[]; total: number; page: number; limit: number }> {
  const productId = await resolveProductId(productIdOrSlug);
  const limit = Math.max(1, Math.min(opts.limit || 10, 50));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT q.*, ${AUTHOR_NAME_SQL} AS author_name
       FROM product_questions q
       LEFT JOIN members m ON m.id = q.member_id
       WHERE q.product_id = $1 AND q.status = 'published'
       ORDER BY (q.answered_at IS NOT NULL) DESC, q.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM product_questions
       WHERE product_id = $1 AND status = 'published'`,
      [productId]
    ),
  ]);

  return {
    questions: data.rows.map(mapQuestion),
    total: count.rows[0].total as number,
    page,
    limit,
  };
}

export async function askQuestion(
  userId: string,
  productIdOrSlug: string,
  body: string
): Promise<ProductQuestion> {
  const text = body.trim();
  if (text.length < 5) {
    throw new AppError(400, 'Escreva a pergunta com pelo menos 5 caracteres.', 'QUESTION_TOO_SHORT');
  }
  if (text.length > 1000) {
    throw new AppError(400, 'Pergunta muito longa (máximo 1000 caracteres).', 'QUESTION_TOO_LONG');
  }

  const productId = await resolveProductId(productIdOrSlug);

  // Sem aprovação prévia, este teto é o que impede alguém de encher a loja.
  const open = await query(
    `SELECT COUNT(*)::int AS total FROM product_questions
     WHERE user_id = $1 AND answered_at IS NULL AND status = 'published'`,
    [userId]
  );
  if ((open.rows[0].total as number) >= MAX_OPEN_QUESTIONS_PER_USER) {
    throw new AppError(
      429,
      'Você já tem várias perguntas aguardando resposta. Espere as respostas antes de perguntar de novo.',
      'TOO_MANY_OPEN_QUESTIONS'
    );
  }

  const memberId = await getMemberIdForUser(userId);
  const result = await query(
    `INSERT INTO product_questions (product_id, user_id, member_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [productId, userId, memberId, text]
  );

  await auditLog('question.asked', userId, { productId, questionId: result.rows[0].id });
  return mapQuestion(result.rows[0]);
}

/** Perguntas feitas pelo usuário (aba "minhas perguntas"). */
export async function listUserQuestions(userId: string): Promise<ProductQuestion[]> {
  const result = await query(
    `SELECT q.*, p.name AS product_name, p.slug AS product_slug
     FROM product_questions q
     JOIN products p ON p.id = q.product_id
     WHERE q.user_id = $1
     ORDER BY q.created_at DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows.map(mapQuestion);
}

export async function adminListQuestions(
  opts: { answered?: boolean; page?: number; limit?: number } = {}
): Promise<{ questions: ProductQuestion[]; total: number; page: number; limit: number }> {
  const conditions: string[] = [];
  if (opts.answered === true) conditions.push(`q.answered_at IS NOT NULL`);
  if (opts.answered === false) conditions.push(`q.answered_at IS NULL`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const limit = Math.max(1, Math.min(opts.limit || 30, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT q.*, p.name AS product_name, p.slug AS product_slug,
              COALESCE(m.full_name, u.email) AS author_name
       FROM product_questions q
       JOIN products p ON p.id = q.product_id
       JOIN users u ON u.id = q.user_id
       LEFT JOIN members m ON m.id = q.member_id
       ${where}
       ORDER BY (q.answered_at IS NULL) DESC, q.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM product_questions q ${where}`),
  ]);

  return {
    questions: data.rows.map(mapQuestion),
    total: count.rows[0].total as number,
    page,
    limit,
  };
}

/** Quantas estão esperando resposta (badge da aba do admin). */
export async function countPendingQuestions(): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS total FROM product_questions
     WHERE answered_at IS NULL AND status = 'published'`
  );
  return result.rows[0].total as number;
}

/**
 * Publica a resposta e avisa quem perguntou. A notificação nasce na mesma
 * transação: sem resposta gravada não existe aviso, e vice-versa.
 */
export async function answerQuestion(
  id: string,
  answer: string,
  adminUserId: string
): Promise<ProductQuestion> {
  const text = answer.trim();
  if (text.length < 1) {
    throw new AppError(400, 'Escreva a resposta.', 'ANSWER_EMPTY');
  }
  if (text.length > 2000) {
    throw new AppError(400, 'Resposta muito longa (máximo 2000 caracteres).', 'ANSWER_TOO_LONG');
  }

  const client = await getClient();
  let question: ProductQuestion;
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE product_questions
       SET answer_body = $1, answered_by = $2, answered_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [text, adminUserId, id]
    );
    if (updated.rows.length === 0) {
      throw new AppError(404, 'Pergunta não encontrada.', 'QUESTION_NOT_FOUND');
    }
    question = mapQuestion(updated.rows[0]);

    const product = await client.query(`SELECT name, slug FROM products WHERE id = $1`, [
      question.productId,
    ]);
    const productName = (product.rows[0]?.name as string) ?? 'seu produto';
    const productSlug = product.rows[0]?.slug as string | undefined;

    await notify(client, {
      userId: question.userId,
      kind: 'question_answered',
      title: 'Sua pergunta foi respondida',
      body: `${productName}: ${text.slice(0, 160)}`,
      link: productSlug ? `/produto/${productSlug}` : null,
    });

    await client.query('COMMIT');
    question.productName = productName;
    question.productSlug = productSlug ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await auditLog('question.answered', adminUserId, {
    questionId: id,
    productId: question.productId,
  });

  // E-mail fora da transação e sem bloquear: a notificação no perfil já é o
  // canal garantido, o e-mail é reforço.
  void sendAnswerEmail(question).catch((err) =>
    console.error('[QUESTION] answer email error:', err)
  );

  return question;
}

async function sendAnswerEmail(question: ProductQuestion): Promise<void> {
  const recipient = await query(
    `SELECT u.email, COALESCE(m.full_name, u.email) AS name
     FROM users u
     LEFT JOIN members m ON m.user_id = u.id
     WHERE u.id = $1`,
    [question.userId]
  );
  const row = recipient.rows[0];
  if (!row?.email) return;

  await sendTemplateEmail({
    template: 'question-answered',
    to: row.email as string,
    variables: {
      name: (row.name as string) || 'Cliente',
      product_name: question.productName || 'produto',
      question: question.body,
      answer: question.answerBody || '',
      product_url: question.productSlug
        ? `${SHOP_CANONICAL_URL}/produto/${question.productSlug}`
        : SHOP_CANONICAL_URL,
    },
  });
}

export async function setQuestionStatus(
  id: string,
  status: 'published' | 'hidden',
  adminUserId: string
): Promise<ProductQuestion> {
  const result = await query(
    `UPDATE product_questions SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Pergunta não encontrada.', 'QUESTION_NOT_FOUND');
  }
  await auditLog('question.status_changed', adminUserId, { questionId: id, status });
  return mapQuestion(result.rows[0]);
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Product questions. What these pin:
 *
 *  1. A question is public at once, so the per-user cap on open questions is
 *     the spam brake — the 11th unanswered one is a 429.
 *  2. The public author name is the first name only.
 *  3. The answer and its in-app notification commit together; the e-mail goes
 *     after, and its failure does not undo the answer.
 */

const { queryMock, clientQuery, release, memberIdFor, notifyMock, emailMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  memberIdFor: vi.fn(async () => 'm1'),
  notifyMock: vi.fn(async () => {}),
  emailMock: vi.fn(async () => ({ status: 'sent' })),
  auditMock: vi.fn(async () => {}),
}));
vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQuery, release }),
}));
vi.mock('../config/env.js', () => ({ env: {}, SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br' }));
vi.mock('../middleware/ownership.js', () => ({ getMemberIdForUser: memberIdFor }));
vi.mock('./notification.service.js', () => ({ notify: notifyMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: emailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  MAX_OPEN_QUESTIONS_PER_USER,
  adminListQuestions,
  answerQuestion,
  askQuestion,
  countPendingQuestions,
  listProductQuestions,
  listUserQuestions,
  setQuestionStatus,
} from './question.service.js';

const P1 = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const qRow = (over: Record<string, unknown> = {}) => ({
  id: 'q1', product_id: P1, user_id: 'u1', body: 'Tem em estoque?', status: 'published', created_at: 'x', updated_at: 'x', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockReset();
  clientQuery.mockReset();
});

describe('asking', () => {
  it('stores a question for the product, tied to the member', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: P1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [qRow()] });
    const q = await askQuestion('u1', 'holder', '  Tem em estoque?  ');
    expect(queryMock.mock.calls[2][1]).toEqual([P1, 'u1', 'm1', 'Tem em estoque?']);
    expect(q.body).toBe('Tem em estoque?');
    expect(auditMock).toHaveBeenCalledWith('question.asked', 'u1', { productId: P1, questionId: 'q1' });
  });

  it('holds back a user with too many open questions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: P1 }] }).mockResolvedValueOnce({ rows: [{ total: MAX_OPEN_QUESTIONS_PER_USER }] });
    await expect(askQuestion('u1', P1, 'Mais uma pergunta')).rejects.toMatchObject({ statusCode: 429 });
  });

  it('refuses too short, too long and an unknown product', async () => {
    await expect(askQuestion('u1', P1, ' oi ')).rejects.toMatchObject({ code: 'QUESTION_TOO_SHORT' });
    await expect(askQuestion('u1', P1, 'x'.repeat(1001))).rejects.toMatchObject({ code: 'QUESTION_TOO_LONG' });
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(askQuestion('u1', 'sumiu', 'Tem em estoque?')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('reading', () => {
  it('lists published questions with the first name only, answered first', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: P1 }] })
      .mockResolvedValueOnce({ rows: [qRow({ author_name: 'Laura' })] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = await listProductQuestions(P1, { page: 2, limit: 99 });
    expect(queryMock.mock.calls[1][0]).toContain("SPLIT_PART(m.full_name, ' ', 1)");
    expect(queryMock.mock.calls[1][1]).toEqual([P1, 50, 50]);
    expect(res).toMatchObject({ total: 1, page: 2, limit: 50 });
    expect(res.questions[0].authorName).toBe('Laura');
  });

  it("lists a user's own questions and the admin queue", async () => {
    queryMock.mockResolvedValueOnce({ rows: [qRow({ product_name: 'Holder' })] });
    expect((await listUserQuestions('u1'))[0].productName).toBe('Holder');

    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await adminListQuestions({ answered: false, limit: 500 });
    expect(queryMock.mock.calls[1][0]).toContain('q.answered_at IS NULL');
    expect(queryMock.mock.calls[1][1]).toEqual([100, 0]);

    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await adminListQuestions({ answered: true });
    expect(queryMock.mock.calls[3][0]).toContain('q.answered_at IS NOT NULL');

    queryMock.mockResolvedValueOnce({ rows: [{ total: 7 }] });
    expect(await countPendingQuestions()).toBe(7);
  });
});

describe('answering', () => {
  it('stores the answer and the notification together, then e-mails', async () => {
    clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('UPDATE product_questions')) return { rows: [qRow({ answer_body: 'Sim!' })] };
      if (text.includes('SELECT name, slug')) return { rows: [{ name: 'Holder', slug: 'holder' }] };
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ email: 'laura@example.com', name: 'Laura' }] });

    const q = await answerQuestion('q1', '  Sim!  ', 'admin-1');

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE product_questions'), ['Sim!', 'admin-1', 'q1']);
    expect(notifyMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 'u1', kind: 'question_answered', link: '/produto/holder' }));
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(q).toMatchObject({ productName: 'Holder', productSlug: 'holder' });
    await vi.waitFor(() =>
      expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({
        template: 'question-answered',
        to: 'laura@example.com',
        variables: expect.objectContaining({ product_url: 'https://shop.geekpoptoys.com.br/produto/holder', answer: 'Sim!' }),
      }))
    );
  });

  it('keeps the answer when the e-mail fails', async () => {
    clientQuery.mockImplementation(async (text: string) =>
      text.includes('UPDATE product_questions') ? { rows: [qRow()] } : { rows: [] }
    );
    queryMock.mockRejectedValue(new Error('smtp down'));
    const q = await answerQuestion('q1', 'Sim', 'admin-1');
    expect(q.productName).toBe('seu produto');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rolls back a missing question and refuses an empty or huge answer', async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    await expect(answerQuestion('nope', 'Sim', 'admin-1')).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(notifyMock).not.toHaveBeenCalled();
    await expect(answerQuestion('q1', '   ', 'a')).rejects.toMatchObject({ code: 'ANSWER_EMPTY' });
    await expect(answerQuestion('q1', 'x'.repeat(2001), 'a')).rejects.toMatchObject({ code: 'ANSWER_TOO_LONG' });
  });

  it('hides a question, 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [qRow({ status: 'hidden' })] });
    expect((await setQuestionStatus('q1', 'hidden', 'admin-1')).status).toBe('hidden');
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(setQuestionStatus('nope', 'hidden', 'admin-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

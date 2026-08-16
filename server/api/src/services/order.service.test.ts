import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Checkout da loja — o caminho que decide **quanto o cliente paga** e **quanto
 * estoque sai**. Até 16/08/2026 estava em 0% de cobertura: 840 linhas sem um
 * único teste, porque o `coverage.include` do vitest só media `src/**` e
 * `server/api/src/utils/**` — o backend inteiro ficava fora da conta dos "74%".
 *
 * O que estes testes protegem, em ordem de prejuízo:
 *
 *  1. Preço vem do banco, nunca do cliente.
 *  2. Desconto de membro e de atacado **não** empilham.
 *  3. Frete nunca entra no desconto.
 *  4. Linhas repetidas do mesmo SKU somam antes da checagem de estoque
 *     (senão 2×"3 unidades" passa por um estoque de 5).
 *  5. Crédito de loja não deixa o total ficar negativo.
 *  6. Produto com variação exige SKU; SKU de outro produto é recusado.
 */

const { queryMock, clientQueryMock, releaseMock, pickOptionMock, redeemMock, memberIdMock, approvedAccountMock, stripeMock, auditMock, sendEmailMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    pickOptionMock: vi.fn(),
    redeemMock: vi.fn(),
    memberIdMock: vi.fn(),
    approvedAccountMock: vi.fn(),
    stripeMock: vi.fn(),
    auditMock: vi.fn(),
    sendEmailMock: vi.fn(),
  }));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));

vi.mock('../config/env.js', () => ({
  env: {
    PIX_KEY: '574a10c6-9aa6-4bbb-a698-000000000000',
    PIX_MERCHANT_NAME: 'GEEK E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
    NODE_ENV: 'test',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
  },
}));

vi.mock('./shipping.service.js', () => ({
  normalizeCep: (v: string) => String(v).replace(/\D/g, ''),
  pickOptionFromQuote: pickOptionMock,
  trackingUrlForCode: (c: string) => `https://rastreio/${c}`,
}));

vi.mock('./store-credit.service.js', () => ({
  redeemForOrder: redeemMock,
  restoreCreditForOrder: vi.fn(async () => {}),
}));

vi.mock('./wholesale.service.js', () => ({ getApprovedAccountByUserId: approvedAccountMock }));
vi.mock('../middleware/ownership.js', () => ({ getMemberIdForUser: memberIdMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./stock.service.js', () => ({ recordOrderMovements: vi.fn(async () => {}) }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/stripe.js', () => ({ getStripe: stripeMock }));

import { createOrder } from './order.service.js';
import { AppError } from '../middleware/error-handler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADDRESS = {
  cep: '22041-001',
  street: 'Av. Atlântica',
  number: '1702',
  neighborhood: 'Copacabana',
  city: 'Rio de Janeiro',
  state: 'RJ',
};

function baseInput(over: Record<string, unknown> = {}) {
  return {
    items: [{ productId: 'p1', quantity: 1 }],
    customer: { name: 'Laura', email: 'laura@example.com' },
    shippingAddress: ADDRESS,
    shipping: { quoteToken: 'tok', serviceId: 'pac' },
    paymentMethod: 'pix' as const,
    ...over,
  };
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Photocard BTS',
    slug: 'photocard-bts',
    price: '100.00',
    stock: 10,
    active: true,
    images: ['/uploads/a.jpg'],
    wholesale_enabled: false,
    wholesale_min_qty: 1,
    has_variants: false,
    ...over,
  };
}

/** Captura o INSERT em `orders` para conferir os valores gravados. */
function insertedOrderValues(): unknown[] {
  const call = clientQueryMock.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO orders')
  );
  if (!call) throw new Error('nenhum INSERT INTO orders foi emitido');
  return call[1] as unknown[];
}

/** Índices dos parâmetros do INSERT em `orders` (ver order.service.ts). */
const COL = {
  customerName: 2,
  customerEmail: 3,
  subtotal: 6,
  discount: 7,
  discountReason: 8,
  shippingCost: 9,
  total: 14,
};

/**
 * Monta o cliente de transação: BEGIN, SELECT de produtos, SELECT de variações,
 * INSERT do pedido, INSERTs de item, COMMIT.
 */
function setupTx(opts: {
  products?: Record<string, unknown>[];
  variants?: Record<string, unknown>[];
}) {
  const products = opts.products ?? [product()];
  const variants = opts.variants ?? [];
  // Os dois comandos rodam com RETURNING *, então o mock guarda a linha inserida
  // e o UPDATE a devolve com os campos alterados por cima. Sem isso o UPDATE
  // "perderia" colunas que o banco real devolve (customer_name, email…) e um
  // teste do caminho de crédito passaria lendo undefined.
  let inserted: Record<string, unknown> = {};
  clientQueryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [] };
    if (sql.includes('FROM products')) return { rows: products };
    if (sql.includes('FROM product_variants')) return { rows: variants };
    if (sql.includes('INSERT INTO orders')) {
      const p = params as unknown[];
      inserted = {
        id: 'o1',
        order_number: 1001,
        customer_name: p[COL.customerName],
        customer_email: p[COL.customerEmail],
        subtotal: p[COL.subtotal],
        discount: p[COL.discount],
        discount_reason: p[COL.discountReason],
        shipping_cost: p[COL.shippingCost],
        store_credit_applied: 0,
        total: p[COL.total],
        status: 'pending',
        payment_method: 'pix',
        items: [],
      };
      return { rows: [inserted] };
    }
    if (sql.includes('UPDATE orders')) {
      const p = params as unknown[];
      return {
        rows: [
          {
            ...inserted,
            discount: p[0],
            discount_reason: p[1],
            store_credit_applied: p[2],
            total: p[3],
          },
        ],
      };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  redeemMock.mockResolvedValue(0);
  memberIdMock.mockResolvedValue(null);
  auditMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue(undefined);
  pickOptionMock.mockReturnValue({
    id: 'pac',
    name: 'PAC',
    service: 'PAC',
    price: 24,
    days: 8,
  });
});

// ─── Preço e desconto ────────────────────────────────────────────────────────

describe('createOrder — dinheiro', () => {
  it('usa o preço do banco, ignorando qualquer coisa vinda do cliente', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    // O cliente manda um preço na linha; o serviço só aceita productId+quantity.
    await createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, price: 1 }] }));

    const v = insertedOrderValues();
    expect(v[COL.subtotal]).toBe(200);
    expect(v[COL.total]).toBe(224); // 200 + 24 de frete
  });

  it('aplica os 15% de membro sobre os produtos, nunca sobre o frete', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] }); // membership ativa

    await createOrder(baseInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(15);
    expect(v[COL.discountReason]).toBe('member_15');
    // 100 − 15 + 24 = 109. Se o frete entrasse no desconto daria 105,40.
    expect(v[COL.total]).toBe(109);
    expect(v[COL.shippingCost]).toBe(24);
  });

  it('não dá desconto de membro para assinatura vencida', async () => {
    setupTx({});
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [] }); // o filtro de expiry_date não devolveu nada

    await createOrder(baseInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(0);
    expect(v[COL.discountReason]).toBeNull();
  });

  it('atacado usa 25% e NÃO empilha com os 15% de membro', async () => {
    setupTx({ products: [product({ price: '100.00', wholesale_enabled: true })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    memberIdMock.mockResolvedValue('m1'); // é membro também — não pode somar

    await createOrder(
      baseInput({ channel: 'wholesale', cnpj: '11.222.333/0001-81' }),
      { userId: 'u1' } as never
    );

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(25);
    expect(v[COL.discountReason]).toBe('wholesale_25');
    // 25 + 15 empilhados dariam 60 de desconto e total 64.
    expect(v[COL.total]).toBe(99);
  });

  it('crédito de loja entra depois do desconto do canal e nunca deixa o total negativo', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    // Teto passado ao redeem é o valor dos produtos após desconto, não o total.
    redeemMock.mockImplementation(async (_c: unknown, _u: string, cap: number) => cap);

    const res = await createOrder(baseInput({ applyStoreCredit: true }), { userId: 'u1' } as never);

    expect(redeemMock).toHaveBeenCalledWith(expect.anything(), 'u1', 100, 'o1');
    // Crédito cobre os produtos; o frete continua a pagar.
    expect(res.order.total).toBe(24);
    expect(res.order.total).toBeGreaterThanOrEqual(0);
  });

  it('não tenta usar crédito de visitante sem login', async () => {
    setupTx({});
    await createOrder(baseInput({ applyStoreCredit: true }));
    expect(redeemMock).not.toHaveBeenCalled();
  });
});

// ─── Estoque ─────────────────────────────────────────────────────────────────

describe('createOrder — estoque', () => {
  it('soma linhas repetidas do mesmo SKU antes de checar o estoque', async () => {
    // 5 em estoque, o carrinho manda 3 + 3 em linhas separadas.
    setupTx({ products: [product({ stock: 5 })] });

    await expect(
      createOrder(
        baseInput({
          items: [
            { productId: 'p1', quantity: 3 },
            { productId: 'p1', quantity: 3 },
          ],
        })
      )
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('recusa quantidade zero ou negativa', async () => {
    setupTx({});
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 0 }] }))
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: -5 }] }))
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
  });

  it('recusa produto inativo mesmo que o id exista', async () => {
    setupTx({ products: [product({ active: false })] });
    await expect(createOrder(baseInput())).rejects.toMatchObject({
      code: 'PRODUCT_UNAVAILABLE',
    });
  });

  it('desfaz a transação quando alguma linha falha', async () => {
    setupTx({ products: [product({ stock: 0 })] });
    await expect(createOrder(baseInput())).rejects.toThrow(AppError);
    const sqls = clientQueryMock.mock.calls.map((c) => String(c[0]).trim());
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(releaseMock).toHaveBeenCalled();
  });
});

// ─── Variações ───────────────────────────────────────────────────────────────

describe('createOrder — variações', () => {
  const parent = product({ has_variants: true, price: '100.00', stock: 0 });
  const variant = {
    id: 'v1',
    product_id: 'p1',
    name: 'Rosa / M',
    price: '80.00',
    stock: 4,
    active: true,
    images: ['/uploads/rosa.jpg'],
  };

  it('cobra o preço do SKU, não o do produto pai', async () => {
    setupTx({ products: [parent], variants: [variant] });

    await createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, variantId: 'v1' }] }));

    const v = insertedOrderValues();
    expect(v[COL.subtotal]).toBe(160); // 2 × 80, não 2 × 100
  });

  it('exige o SKU quando o produto tem variação', async () => {
    setupTx({ products: [parent], variants: [] });
    await expect(createOrder(baseInput())).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' });
  });

  it('recusa SKU que pertence a outro produto', async () => {
    setupTx({
      products: [parent],
      variants: [{ ...variant, product_id: 'OUTRO' }],
    });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 1, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'VARIANT_UNAVAILABLE' });
  });

  it('recusa SKU em produto sem variação', async () => {
    setupTx({ products: [product()], variants: [variant] });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 1, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'VARIANT_NOT_ALLOWED' });
  });

  it('checa o estoque do SKU, não o do pai', async () => {
    setupTx({ products: [parent], variants: [{ ...variant, stock: 1 }] });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
});

// ─── Atacado ─────────────────────────────────────────────────────────────────

describe('createOrder — atacado', () => {
  it('exige login', async () => {
    setupTx({});
    await expect(
      createOrder(baseInput({ channel: 'wholesale', cnpj: '11222333000181' }))
    ).rejects.toMatchObject({ code: 'WHOLESALE_AUTH_REQUIRED' });
  });

  it('recusa conta não aprovada', async () => {
    setupTx({});
    approvedAccountMock.mockResolvedValue(null);
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'WHOLESALE_NOT_APPROVED' });
  });

  it('recusa CNPJ que não bate com o cadastro aprovado', async () => {
    setupTx({});
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11444777000161' });
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'CNPJ_MISMATCH' });
  });

  it('recusa produto que não está liberado para atacado', async () => {
    setupTx({ products: [product({ wholesale_enabled: false })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_WHOLESALE' });
  });

  it('exige a quantidade mínima por produto', async () => {
    setupTx({ products: [product({ wholesale_enabled: true, wholesale_min_qty: 6 })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    await expect(
      createOrder(
        baseInput({
          channel: 'wholesale',
          cnpj: '11222333000181',
          items: [{ productId: 'p1', quantity: 2 }],
        }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'WHOLESALE_MIN_QTY' });
  });
});

// ─── Entrada / frete ─────────────────────────────────────────────────────────

describe('createOrder — validação de entrada', () => {
  it('recusa carrinho vazio', async () => {
    await expect(createOrder(baseInput({ items: [] }))).rejects.toMatchObject({
      code: 'EMPTY_CART',
    });
  });

  it('recusa endereço incompleto', async () => {
    await expect(
      createOrder(baseInput({ shippingAddress: { ...ADDRESS, city: '' } }))
    ).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('recusa CEP que não tem 8 dígitos', async () => {
    await expect(
      createOrder(baseInput({ shippingAddress: { ...ADDRESS, cep: '2204' } }))
    ).rejects.toMatchObject({ code: 'INVALID_CEP' });
  });

  it('exige a opção de frete escolhida', async () => {
    await expect(
      createOrder(baseInput({ shipping: { quoteToken: '', serviceId: '' } }))
    ).rejects.toMatchObject({ code: 'SHIPPING_REQUIRED' });
  });

  it('revalida o frete pelo token assinado — preço nunca vem do cliente', async () => {
    setupTx({});
    pickOptionMock.mockReturnValue({ id: 'pac', name: 'PAC', service: 'PAC', price: 41.9, days: 12 });

    await createOrder(baseInput());

    expect(pickOptionMock).toHaveBeenCalledWith('tok', 'pac', expect.any(Array), '22041001');
    const v = insertedOrderValues();
    expect(v[COL.shippingCost]).toBe(41.9);
    expect(v[COL.total]).toBe(141.9);
  });
});

// ─── Aviso de PIX pendente ───────────────────────────────────────────────────

/**
 * PIX da loja não tem webhook: o pedido nasce `pending` e só sai disso quando um
 * admin confere o extrato e confirma no painel. Até 16/08/2026 esse fluxo não
 * avisava ninguém — o cliente pagava e a loja não ficava sabendo.
 */
describe('createOrder — aviso de PIX pendente', () => {
  function pixEmail() {
    return sendEmailMock.mock.calls.find(
      (c) => (c[0] as { template?: string })?.template === 'admin-pix-order-pending'
    )?.[0] as { to: string; variables: Record<string, string> } | undefined;
  }

  it('avisa o admin com pedido, cliente, valor e TX ID', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput());

    const email = pixEmail();
    expect(email).toBeDefined();
    expect(email!.to).toBe('geeketoys@gmail.com');
    expect(email!.variables).toMatchObject({
      order_number: '1001',
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
    });
    // TX ID é o que liga o extrato bancário ao pedido — sem ele o aviso é inútil.
    expect(email!.variables.tx_id).toMatch(/^CGT[A-Z0-9]+$/);
    expect(email!.variables.total).toMatch(/^\d+,\d{2}$/);
  });

  it('aponta o CTA para a aba de pedidos do painel admin', async () => {
    setupTx({});

    await createOrder(baseInput());

    expect(pixEmail()!.variables.admin_url).toBe(
      'https://admin.geeketoys.com.br/admin?tab=orders'
    );
  });

  it('não avisa quando o pagamento é cartão', async () => {
    setupTx({});
    stripeMock.mockReturnValue({
      paymentIntents: { create: async () => ({ id: 'pi_1', client_secret: 'cs_1' }) },
    });

    await createOrder(baseInput({ paymentMethod: 'credit_card' }));

    expect(pixEmail()).toBeUndefined();
  });

  // O aviso nasce dentro do try do checkout, cujo catch cancela o pedido e
  // devolve o crédito. Falha de e-mail não pode derrubar uma compra legítima.
  it('conclui o pedido mesmo se o envio do e-mail explodir', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    sendEmailMock.mockImplementation(() => {
      throw new Error('Resend fora do ar');
    });

    const result = await createOrder(baseInput());

    expect(result.order.status).toBe('pending');
    expect(result.pixData?.emvCode).toContain('br.gov.bcb.pix');
    // nada de UPDATE ... status = 'cancelled'
    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes("status = 'cancelled'")
      )
    ).toBe(false);
  });

  it('conclui o pedido mesmo se o e-mail rejeitar a promise', async () => {
    setupTx({});
    sendEmailMock.mockRejectedValue(new Error('429 rate limited'));

    const result = await createOrder(baseInput());

    expect(result.order.status).toBe('pending');
  });
});

import { describe, it, expect } from 'vitest';
import { generatePixEMV, generatePixTxId } from './pix.js';

const BASE = {
  pixKey: '574a10c6-9aa6-4bbb-a698-1234567890ab',
  amount: 129.9,
  merchantName: 'GEEK E TOYS',
  merchantCity: 'RIO DE JANEIRO',
  txId: 'CGTMFXYZ12AB',
};

/** CRC16-CCITT (FALSE) — reimplementado aqui pra conferir o do código sob teste. */
function crc16(data: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(data, 'utf8');
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Percorre o EMV e devolve [id, valor]; joga se algum length não bater em bytes. */
function parseTlv(payload: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.substr(i, 2);
    const len = parseInt(payload.substr(i + 2, 2), 10);
    if (Number.isNaN(len)) throw new Error(`length inválido no offset ${i}`);
    const value = payload.substr(i + 4, len);
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes !== len) {
      throw new Error(`ID=${id} declara ${len} mas ocupa ${bytes} bytes: "${value}"`);
    }
    out.push([id, value]);
    i += 4 + len;
  }
  return out;
}

describe('generatePixEMV', () => {
  it('monta o BR Code com os campos obrigatórios na ordem da spec', () => {
    const { emvCode } = generatePixEMV(BASE);
    const ids = parseTlv(emvCode).map(([id]) => id);

    expect(ids).toEqual(['00', '26', '52', '53', '54', '58', '59', '60', '62', '63']);
    // IDs em ordem ascendente — exigência do EMV
    expect([...ids].sort()).toEqual(ids);
  });

  it('embute a chave PIX sob o GUI br.gov.bcb.pix', () => {
    const { emvCode } = generatePixEMV(BASE);
    const merchantAccount = parseTlv(emvCode).find(([id]) => id === '26')![1];

    expect(parseTlv(merchantAccount)).toEqual([
      ['00', 'br.gov.bcb.pix'],
      ['01', BASE.pixKey],
    ]);
  });

  it('grava o valor com 2 casas e a moeda 986 (BRL)', () => {
    const fields = Object.fromEntries(parseTlv(generatePixEMV(BASE).emvCode));
    expect(fields['54']).toBe('129.90');
    expect(fields['53']).toBe('986');
    expect(fields['58']).toBe('BR');
  });

  it('fecha com um CRC16 válido sobre o payload + "6304"', () => {
    const { emvCode } = generatePixEMV(BASE);
    expect(crc16(emvCode.slice(0, -4))).toBe(emvCode.slice(-4));
  });

  // Regressão: `tlv()` contava caracteres UTF-16. Com acento no nome do recebedor
  // o length saía menor que os bytes reais e o app do banco recusava o código.
  it('mantém length em bytes com nome acentuado', () => {
    const { emvCode } = generatePixEMV({
      ...BASE,
      merchantName: 'GEEKPOP & TOYS AÇÃO',
      merchantCity: 'SÃO GONÇALO',
    });

    expect(() => parseTlv(emvCode)).not.toThrow();
    expect(crc16(emvCode.slice(0, -4))).toBe(emvCode.slice(-4));

    const fields = Object.fromEntries(parseTlv(emvCode));
    expect(fields['59']).toBe('GEEKPOP & TOYS ACAO');
    expect(fields['60']).toBe('SAO GONCALO');
  });

  it('trunca nome em 25 e cidade em 15 caracteres', () => {
    const fields = Object.fromEntries(
      parseTlv(
        generatePixEMV({
          ...BASE,
          merchantName: 'X'.repeat(40),
          merchantCity: 'Y'.repeat(40),
        }).emvCode
      )
    );
    expect(fields['59']).toHaveLength(25);
    expect(fields['60']).toHaveLength(15);
  });

  // A chave de recebimento pode ser e-mail, CPF, telefone ou aleatória (UUID).
  // Produção rodou meses com uma chave aleatória que não era a conta da loja;
  // o gerador aceita qualquer formato, então o teste fixa que nenhum deles
  // quebra o length em bytes nem o CRC.
  it.each([
    ['e-mail', 'ecoeletricrj@gmail.com'],
    ['CPF', '12345678909'],
    ['telefone', '+5521999998888'],
    ['aleatória', '574a10c6-9aa6-4bbb-a698-1234567890ab'],
  ])('aceita chave do tipo %s', (_tipo, pixKey) => {
    const { emvCode } = generatePixEMV({ ...BASE, pixKey });

    const merchantAccount = parseTlv(emvCode).find(([id]) => id === '26')![1];
    expect(parseTlv(merchantAccount)).toEqual([
      ['00', 'br.gov.bcb.pix'],
      ['01', pixKey],
    ]);
    expect(crc16(emvCode.slice(0, -4))).toBe(emvCode.slice(-4));
  });

  it('devolve txId e expiração coerentes', () => {
    const before = Date.now();
    const result = generatePixEMV({ ...BASE, expirationMinutes: 30 });
    const expires = new Date(result.expiresAt).getTime();

    expect(result.txId).toBe(BASE.txId);
    expect(expires).toBeGreaterThanOrEqual(before + 29 * 60 * 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 31 * 60 * 1000);
  });
});

describe('generatePixTxId', () => {
  it('gera id alfanumérico dentro do limite de 25 chars', () => {
    for (let i = 0; i < 50; i++) {
      const txId = generatePixTxId();
      expect(txId).toMatch(/^[A-Z0-9]{1,25}$/);
    }
  });

  it('não repete em chamadas seguidas', () => {
    const ids = new Set(Array.from({ length: 200 }, generatePixTxId));
    expect(ids.size).toBeGreaterThan(190);
  });
});

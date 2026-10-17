import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

import {
  requireBillingAddress,
  readStoredBillingAddress,
  toPagarmeAddress,
} from './billing-address.js';

const sample = {
  cep: '22011-001',
  street: 'Rua Barata Ribeiro',
  number: '181',
  complement: 'Loja J',
  neighborhood: 'Copacabana',
  city: 'Rio de Janeiro',
  state: 'rj',
};

describe('requireBillingAddress', () => {
  it('normaliza CEP e UF e monta a linha no formato da loja', () => {
    const address = requireBillingAddress(sample);
    expect(address.cep).toBe('22011001');
    expect(address.state).toBe('RJ');
    expect(toPagarmeAddress(address)).toEqual({
      line_1: '181, Rua Barata Ribeiro, Copacabana',
      line_2: 'Loja J',
      zip_code: '22011001',
      city: 'Rio de Janeiro',
      state: 'RJ',
      country: 'BR',
    });
  });

  it('omite complemento em branco', () => {
    const address = requireBillingAddress({ ...sample, complement: '  ' });
    expect(address.complement).toBeUndefined();
    expect(toPagarmeAddress(address)).not.toHaveProperty('line_2');
  });

  it('recusa UF que não existe e CEP curto', () => {
    expect(() => requireBillingAddress({ ...sample, state: 'XX' })).toThrow('UF inválida.');
    expect(() => requireBillingAddress({ ...sample, cep: '220' })).toThrow('CEP inválido.');
    expect(() => requireBillingAddress(undefined)).toThrow('Informe o endereço de cobrança.');
  });
});

describe('readStoredBillingAddress', () => {
  it('aceita o JSON que o banco devolve e recusa lixo', () => {
    expect(readStoredBillingAddress({ ...sample, state: 'RJ', cep: '22011001' })?.city).toBe(
      'Rio de Janeiro',
    );
    expect(readStoredBillingAddress(null)).toBeNull();
    expect(readStoredBillingAddress({ cep: '1' })).toBeNull();
  });
});

describe('toPagarmeAddress', () => {
  it('não inventa endereço quando o CEP não fecha 8 dígitos', () => {
    expect(toPagarmeAddress({ cep: '220', street: 'Rua X', number: '1' })).toBeUndefined();
  });
});

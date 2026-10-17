import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import type { PagarmeCustomerInput } from './pagarme.js';

/**
 * The 27 federative units. Duplicated on the SPA (`src/lib/billing-address.ts`):
 * the browser cannot import this module. Each copy has its own test.
 */
export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type BrazilianUf = (typeof BRAZILIAN_UFS)[number];

const ufSet: ReadonlySet<string> = new Set(BRAZILIAN_UFS);

export const billingAddressSchema = z.object({
  cep: z.string({ message: 'Informe o CEP.' }).trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido.'),
  street: z.string({ message: 'Informe a rua.' }).trim().min(1, 'Informe a rua.').max(200),
  number: z.string({ message: 'Informe o número.' }).trim().min(1, 'Informe o número.').max(20),
  complement: z.string().trim().max(100, 'Complemento longo demais.').optional(),
  neighborhood: z.string({ message: 'Informe o bairro.' }).trim().min(1, 'Informe o bairro.').max(120),
  city: z.string({ message: 'Informe a cidade.' }).trim().min(1, 'Informe a cidade.').max(120),
  state: z
    .string({ message: 'Informe o estado.' })
    .trim()
    .length(2, 'Informe a UF com 2 letras.')
    .transform((value) => value.toUpperCase())
    .refine((value): value is BrazilianUf => ufSet.has(value), 'UF inválida.'),
});

export interface BillingAddress {
  /** Eight digits, no hyphen. */
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

function normalize(parsed: z.infer<typeof billingAddressSchema>): BillingAddress {
  const complement = parsed.complement?.trim();
  return {
    cep: parsed.cep.replace(/\D/g, ''),
    street: parsed.street,
    number: parsed.number,
    ...(complement ? { complement } : {}),
    neighborhood: parsed.neighborhood,
    city: parsed.city,
    state: parsed.state,
  };
}

/** Refuse a club charge that arrived without a usable billing address. */
export function requireBillingAddress(input: unknown): BillingAddress {
  if (input == null || typeof input !== 'object') {
    throw new AppError(400, 'Informe o endereço de cobrança.', 'BILLING_ADDRESS_REQUIRED');
  }
  const parsed = billingAddressSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Informe o endereço de cobrança.';
    throw new AppError(400, message, 'BILLING_ADDRESS_REQUIRED');
  }
  return normalize(parsed.data);
}

/**
 * Address already stored on the member. Null when the column is empty or the
 * JSON no longer matches the schema — a later charge then has to ask again.
 */
export function readStoredBillingAddress(value: unknown): BillingAddress | null {
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = billingAddressSchema.safeParse(raw);
  if (!parsed.success) return null;
  return normalize(parsed.data);
}

/** What we persist. `pg` wants a string for a `jsonb` parameter. */
export function billingAddressJson(address: BillingAddress): string {
  return JSON.stringify(address);
}

export const SAVE_MEMBER_BILLING_ADDRESS_SQL =
  'UPDATE members SET billing_address = $1::jsonb, updated_at = NOW() WHERE id = $2';

/**
 * Loose on purpose: the shop passes a shipping row that may be half empty
 * (pickup still carries a real CEP). Club charges go through
 * `requireBillingAddress` first, so they never hit the undefined branch.
 */
export function toPagarmeAddress(addr: {
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}): PagarmeCustomerInput['address'] | undefined {
  const zip = (addr.cep ?? '').replace(/\D/g, '');
  if (zip.length !== 8) return undefined;
  const line1 = [addr.number, addr.street, addr.neighborhood]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (!line1) return undefined;
  const complement = (addr.complement ?? '').trim();
  return {
    line_1: line1,
    ...(complement ? { line_2: complement } : {}),
    zip_code: zip,
    city: (addr.city ?? '').trim(),
    state: (addr.state ?? '').trim().toUpperCase(),
    country: 'BR',
  };
}

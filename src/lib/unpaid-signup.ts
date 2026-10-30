import type { Member } from '../types'

export interface UnpaidSignupState {
  /** Short tag for the list row. */
  label: string
  /** One sentence for the member's detail. */
  detail: string
}

/**
 * Why a pending member has no open charge.
 *
 * Since 30/10/2026 a lapsed club PIX is marked `failed`, so "no open charge"
 * no longer means "nothing was ever charged".
 */
export function describeUnpaidSignup(member: Pick<Member, 'lastPayment'>): UnpaidSignupState {
  const last = member.lastPayment
  if (!last) {
    return {
      label: 'Sem cobrança',
      detail: 'Nenhuma cobrança foi criada na Pagar.me.',
    }
  }
  if (last.method === 'pix' && last.status === 'failed') {
    return {
      label: 'PIX venceu sem pagamento',
      detail: 'O PIX foi gerado, venceu e não foi pago. Nada entrou.',
    }
  }
  if (last.status === 'failed') {
    return {
      label: 'Cartão recusado',
      detail: 'A última tentativa no cartão foi recusada. Nada entrou.',
    }
  }
  return {
    label: 'Sem pagamento',
    detail: 'Há tentativa de pagamento registrada, mas nada entrou.',
  }
}

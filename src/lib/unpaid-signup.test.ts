import { describe, it, expect } from 'vitest'
import { describeUnpaidSignup } from './unpaid-signup'

describe('describeUnpaidSignup', () => {
  it('sem tentativa nenhuma é cadastro sem cobrança', () => {
    expect(describeUnpaidSignup({ lastPayment: null }).label).toBe('Sem cobrança')
    expect(describeUnpaidSignup({}).label).toBe('Sem cobrança')
  })

  it('PIX encerrado pela conciliação é PIX vencido, não "sem cobrança"', () => {
    const state = describeUnpaidSignup({ lastPayment: { status: 'failed', providerStatus: 'expired', method: 'pix' } })
    expect(state.label).toBe('PIX venceu sem pagamento')
  })

  it('cartão que falhou é recusa', () => {
    const state = describeUnpaidSignup({ lastPayment: { status: 'failed', providerStatus: 'failed', method: 'credit_card' } })
    expect(state.label).toBe('Cartão recusado')
  })

  it('qualquer outro estado diz só que nada entrou', () => {
    const state = describeUnpaidSignup({ lastPayment: { status: 'cancelled', providerStatus: null, method: 'pix' } })
    expect(state.label).toBe('Sem pagamento')
  })
})

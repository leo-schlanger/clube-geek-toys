import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('./api-client', () => ({ api: { get: getMock, post: postMock } }))

import {
  checkInTicket,
  createReservation,
  extractTicketCode,
  getPublicTicket,
} from './event-tickets'

beforeEach(() => vi.clearAllMocks())

describe('extractTicketCode', () => {
  it('tira o código da URL lida no QR', () => {
    expect(extractTicketCode('https://shop.geekpoptoys.com.br/ingresso/T-AAAA-BBBB-CCCC')).toBe(
      'T-AAAA-BBBB-CCCC'
    )
  })

  it('aceita o código digitado direto na portaria', () => {
    expect(extractTicketCode('  t-aaaa-bbbb-cccc ')).toBe('T-AAAA-BBBB-CCCC')
  })

  it('ignora query string e hash colados no fim do link', () => {
    expect(extractTicketCode('https://exemplo.com/ingresso/T-1111-2222-3333?x=1#topo')).toBe(
      'T-1111-2222-3333'
    )
  })
})

describe('createReservation', () => {
  it('devolve a reserva criada com o link dos ingressos', async () => {
    postMock.mockResolvedValue({
      data: { reservation: { code: 'R-AAAA-BBBB' }, ticketsUrl: 'https://loja/ingressos/R-AAAA-BBBB' },
    })

    const result = await createReservation('kpop-night-2026-09-06', {
      buyerName: 'Ana',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'Ana', kind: 'full' }],
    })

    expect(result.ok).toBe(true)
    expect(postMock).toHaveBeenCalledWith(
      '/events/kpop-night-2026-09-06/reservations',
      expect.objectContaining({ attendees: [{ name: 'Ana', kind: 'full' }] }),
      { skipAuth: true }
    )
  })

  it('devolve o erro da API para a loja poder cair no WhatsApp', async () => {
    postMock.mockResolvedValue({ error: 'Muitas consultas. Aguarde um momento.' })

    const result = await createReservation('kpop-night-2026-09-06', {
      buyerName: 'Ana',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'Ana', kind: 'full' }],
    })

    expect(result).toEqual({ ok: false, error: 'Muitas consultas. Aguarde um momento.' })
  })
})

describe('getPublicTicket', () => {
  it('devolve null quando o código não existe', async () => {
    getMock.mockResolvedValue({ error: 'Ingresso não encontrado.', status: 404 })
    expect(await getPublicTicket('T-ZZZZ-ZZZZ-ZZZZ')).toBeNull()
  })
})

describe('checkInTicket', () => {
  it('transforma falha de rede em recusa explicada, não em entrada liberada', async () => {
    postMock.mockResolvedValue({ error: 'Sem conexão com a internet.' })

    const result = await checkInTicket('T-AAAA-BBBB-CCCC')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('request_failed')
  })
})

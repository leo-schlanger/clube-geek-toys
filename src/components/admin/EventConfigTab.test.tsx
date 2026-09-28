/**
 * EventConfigTab — flyers and link buttons.
 *
 * Laura asked for the competition poster next to the event one and a button
 * to the sign-up form, and could not find how to "link an image". These pin
 * that the panel now does both: the link rides the normal Save, the extra
 * image uploads on its own, and removing one image keeps the others.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EventConfig } from '../../data/event'

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
  updateEvent: vi.fn(),
  uploadEventFlyer: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  confirm: vi.fn(async (..._args: unknown[]) => true),
}))

vi.mock('../../lib/events', async () => {
  const actual = await vi.importActual<typeof import('../../lib/events')>('../../lib/events')
  return {
    ...actual,
    listEvents: mocks.listEvents,
    updateEvent: mocks.updateEvent,
    uploadEventFlyer: mocks.uploadEventFlyer,
    createEvent: vi.fn(),
    duplicateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    uploadEventBanner: vi.fn(),
  }
})
vi.mock('../../lib/api-client', () => ({ api: {} }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => mocks.confirm }))

import { EventConfigTab } from './EventConfigTab'

const EVENT: EventConfig = {
  id: 'evento-geekpop',
  slug: 'evento-geekpop',
  status: 'published',
  title: 'Evento GeekPop',
  shortTitle: 'Evento',
  bannerText: '',
  bannerImageUrl: 'https://api.example/uploads/events/evento-geekpop/banner-1.jpg',
  flyers: [
    { url: 'https://api.example/uploads/events/evento-geekpop/flyer-1.jpg' },
    { url: 'https://api.example/uploads/events/evento-geekpop/flyer-2.jpg' },
  ],
  links: [],
  startsAt: '2026-10-11T14:00:00-03:00',
  endsAt: '2026-10-11T18:00:00-03:00',
  location: { name: 'Mar Palace', address: 'Copacabana', mapsUrl: null },
  description: [],
  highlights: [],
  memberPerk: null,
  ticketReservation: {
    enabled: true,
    priceBRL: 22,
    currencyLabel: 'R$',
    maxPerReservation: null,
    whatsappNumber: '5511914662881',
    notes: null,
  },
  priceCents: 2200,
}

async function openEditor(event: EventConfig = EVENT) {
  mocks.listEvents.mockResolvedValue([event])
  render(<EventConfigTab />)
  await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
}

describe('EventConfigTab — flyers and links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateEvent.mockImplementation(async (_id: string, input: Partial<EventConfig>) => ({
      ...EVENT,
      ...input,
    }))
  })

  it('saves a link button with the event, adding https when missing', async () => {
    await openEditor()

    await userEvent.click(screen.getByRole('button', { name: /Adicionar botão/ }))
    await userEvent.type(screen.getByLabelText('Texto do botão'), 'Inscrição da competição')
    await userEvent.type(screen.getByLabelText('Link'), 'forms.gle/abc')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalled())
    const [id, payload] = mocks.updateEvent.mock.calls[0]
    expect(id).toBe('evento-geekpop')
    expect(payload.links).toEqual([
      { label: 'Inscrição da competição', url: 'https://forms.gle/abc' },
    ])
    // Save must not rewrite the flyers: they are managed by upload/remove.
    expect(payload).not.toHaveProperty('flyers')
  })

  it('does not save a button without a link', async () => {
    await openEditor()

    await userEvent.click(screen.getByRole('button', { name: /Adicionar botão/ }))
    await userEvent.type(screen.getByLabelText('Texto do botão'), 'Inscrição')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(mocks.toastError).toHaveBeenCalledWith('Falta o endereço do botão "Inscrição".')
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('uploads an extra image', async () => {
    mocks.uploadEventFlyer.mockResolvedValue(EVENT)
    await openEditor({ ...EVENT, flyers: [] })

    const file = new File(['x'], 'competicao.jpg', { type: 'image/jpeg' })
    const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]
    await userEvent.upload(input, file)

    await waitFor(() => expect(mocks.uploadEventFlyer).toHaveBeenCalledWith('evento-geekpop', file))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Imagem adicionada')
  })

  it('removes one image and keeps the others', async () => {
    await openEditor()

    const image = screen.getByAltText('Imagem 1 do evento')
    const remove = image.parentElement!.querySelector('button')!
    await userEvent.click(remove)

    await waitFor(() =>
      expect(mocks.updateEvent).toHaveBeenCalledWith('evento-geekpop', {
        flyers: [{ url: 'https://api.example/uploads/events/evento-geekpop/flyer-2.jpg' }],
      })
    )
  })

  it('stops offering uploads at the cap', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ url: `https://x.example/${i}.jpg` }))
    await openEditor({ ...EVENT, flyers: six })

    expect(screen.queryByRole('button', { name: /Adicionar imagem/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Limite de 6 imagens/)).toBeInTheDocument()
  })
})

/**
 * Field validation. On 28/09/2026 the event said R$ 22 in the price and in
 * three texts while the owner meant R$ 20, and a typo in the price used to
 * turn silently into a free event. Now it is the price that is charged by
 * PIX, so the panel refuses what it cannot charge and flags texts that quote
 * another price.
 */
describe('EventConfigTab — validação dos campos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(true)
    mocks.updateEvent.mockImplementation(async (_id: string, input: Partial<EventConfig>) => ({
      ...EVENT,
      ...input,
    }))
  })

  async function setPrice(value: string) {
    const price = screen.getByLabelText('Entrada inteira')
    await userEvent.clear(price)
    if (value) await userEvent.type(price, value)
  }

  it('recusa um valor de entrada que não é número', async () => {
    await openEditor()
    await setPrice('vinte')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/Valor da entrada inválido/))
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('não abre reservas sem valor de entrada', async () => {
    await openEditor()
    await setPrice('')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/Informe o valor da entrada/))
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('salva 20,00 como 2000 centavos', async () => {
    await openEditor()
    await setPrice('20,00')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalled())
    expect(mocks.updateEvent.mock.calls[0][1].priceCents).toBe(2000)
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('recusa máximo por reserva fora de 1 a 500', async () => {
    await openEditor()
    const max = screen.getByLabelText('Máx. por reserva')
    await userEvent.type(max, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/Máx. por reserva/))
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('recusa WhatsApp sem DDI com as reservas abertas', async () => {
    await openEditor()
    const whats = screen.getByLabelText('WhatsApp da loja')
    await userEvent.clear(whats)
    await userEvent.type(whats, '21999999999')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/WhatsApp da loja/))
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('avisa quando a faixa fala em outro preço, e não salva se ela for corrigir', async () => {
    mocks.confirm.mockResolvedValue(false)
    await openEditor({ ...EVENT, bannerText: 'Evento de K-pop · Entrada R$ 22' })
    await setPrice('20,00')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    const [options] = mocks.confirm.mock.calls[0] as [{ description: string }]
    expect(options.description).toContain('Faixa do topo: R$ 22')
    expect(mocks.updateEvent).not.toHaveBeenCalled()
  })

  it('confere também as linhas de entrada da descrição e dos destaques, não a premiação', async () => {
    mocks.confirm.mockResolvedValue(false)
    await openEditor({
      ...EVENT,
      priceCents: 2000,
      description: ['Entrada: R$ 22 por pessoa.', 'Premiação: 1º lugar R$ 200.'],
      highlights: ['Entrada R$ 22 por pessoa', '1º lugar R$ 200 · 2º R$ 100'],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    const [options] = mocks.confirm.mock.calls[0] as [{ description: string }]
    expect(options.description).toContain('Descrição: R$ 22')
    expect(options.description).toContain('Destaques: R$ 22')
    expect(options.description).not.toContain('200')
  })

  it('aceita o preço de membro (metade) nos textos', async () => {
    await openEditor({
      ...EVENT,
      priceCents: 2000,
      bannerText: 'Entrada R$ 20',
      memberPerk: 'Membros: R$ 10',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalled())
    expect(mocks.confirm).not.toHaveBeenCalled()
  })
})

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
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => async () => true }))

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
    whatsappNumber: '',
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

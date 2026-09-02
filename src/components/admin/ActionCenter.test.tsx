/**
 * ActionCenter — the "Painel do dia" worklist.
 *
 * What these tests protect, ordered by how much a regression would cost:
 *
 *  1. Empty queues stay hidden, so the panel is only as long as the day's work.
 *  2. Urgent queues sort above routine ones, whatever the counts say.
 *  3. Every card lands on the tab that can actually clear it.
 *  4. The age label reads forward for expiring memberships and backward for
 *     everything else — "vence em 3 dias" vs "espera há 3 dias".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionCenter } from './ActionCenter'
import type { ActionItem, ActionItemsReport } from '../../lib/reports'

const { getActionItemsMock } = vi.hoisted(() => ({ getActionItemsMock: vi.fn() }))

vi.mock('../../lib/reports', () => ({ getActionItems: getActionItemsMock }))

function report(items: Partial<ActionItem>[]): ActionItemsReport {
  const full = items.map((i) => ({ oldestDays: null, count: 0, ...i }) as ActionItem)
  return { items: full, totalPending: full.reduce((s, i) => s + i.count, 0) }
}

async function renderPanel(data: ActionItemsReport, onNavigate = vi.fn()) {
  getActionItemsMock.mockResolvedValue(data)
  render(<ActionCenter onNavigate={onNavigate} />)
  await waitFor(() => expect(getActionItemsMock).toHaveBeenCalled())
  return onNavigate
}

describe('ActionCenter', () => {
  beforeEach(() => {
    getActionItemsMock.mockReset()
  })

  it('shows the all-clear state when nothing is pending', async () => {
    await renderPanel(report([{ key: 'pix_pending', count: 0 }]))

    expect(await screen.findByText('Nada pendente')).toBeInTheDocument()
    expect(screen.queryByText('PIX aguardando')).not.toBeInTheDocument()
  })

  it('hides queues at zero and shows the ones with work', async () => {
    await renderPanel(
      report([
        { key: 'pix_pending', count: 2, oldestDays: 3 },
        { key: 'reviews_pending', count: 0 },
      ])
    )

    expect(await screen.findByText('PIX aguardando')).toBeInTheDocument()
    expect(screen.queryByText('Avaliações a moderar')).not.toBeInTheDocument()
  })

  it('puts urgent queues before routine ones regardless of count', async () => {
    // `pix_pending` used to be the urgent example here. It stopped being one
    // when Pagar.me took over: the webhook confirms it, so a pending PIX is
    // something to watch, not something to do. An out-of-stock SKU still is.
    await renderPanel(
      report([
        { key: 'members_expiring', count: 40, oldestDays: 2 },
        { key: 'stock_out', count: 1, oldestDays: 1 },
      ])
    )

    await screen.findByText('SKUs esgotados')
    const cards = screen.getAllByRole('button', { name: /abrir/i })
    expect(cards[0]).toHaveTextContent('SKUs esgotados')
    expect(cards[1]).toHaveTextContent('Assinaturas vencendo')
  })

  /**
   * The wording is the whole point of the card. It told the shop to check the
   * bank statement and confirm by hand — work that no longer exists, and that
   * someone following it would do on a payment already settled.
   */
  it('não manda mais conferir o extrato para um PIX pendente', async () => {
    await renderPanel(report([{ key: 'pix_pending', count: 2, oldestDays: 1 }]))

    expect(await screen.findByText('PIX aguardando')).toBeInTheDocument()
    expect(screen.getByText(/Confirma sozinho quando o PIX cair/i)).toBeInTheDocument()
    expect(screen.queryByText(/extrato/i)).not.toBeInTheDocument()
  })

  it('opens the tab that clears the queue', async () => {
    const onNavigate = await renderPanel(report([{ key: 'wholesale_pending', count: 1, oldestDays: 5 }]))

    await userEvent.click(await screen.findByRole('button', { name: /Atacado a aprovar/i }))

    expect(onNavigate).toHaveBeenCalledWith('wholesale')
  })

  it('reads a waiting queue backwards in time', async () => {
    await renderPanel(report([{ key: 'to_separate', count: 1, oldestDays: 3 }]))

    expect(await screen.findByText('espera há 3 dias')).toBeInTheDocument()
  })

  it('reads expiring memberships forwards in time', async () => {
    await renderPanel(report([{ key: 'members_expiring', count: 1, oldestDays: 3 }]))

    expect(await screen.findByText('vence em 3 dias')).toBeInTheDocument()
  })

  it('says "vence hoje" rather than "vence em 0 dias"', async () => {
    await renderPanel(report([{ key: 'members_expiring', count: 1, oldestDays: 0 }]))

    expect(await screen.findByText('vence hoje')).toBeInTheDocument()
  })

  it('omits the age on stock, which has no queue date', async () => {
    await renderPanel(report([{ key: 'stock_out', count: 4, oldestDays: null }]))

    expect(await screen.findByText('SKUs esgotados')).toBeInTheDocument()
    expect(screen.queryByText(/espera há/)).not.toBeInTheDocument()
  })

  it('ignores a queue key the frontend does not know', async () => {
    // A backend that grows a queue before this build ships must not crash the
    // dashboard everyone lands on.
    await renderPanel(
      report([
        { key: 'brand_new_queue' as ActionItem['key'], count: 3 },
        { key: 'pix_pending', count: 1, oldestDays: 1 },
      ])
    )

    expect(await screen.findByText('PIX aguardando')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /abrir/i })).toHaveLength(1)
  })

  it('totals the pending items in the header', async () => {
    await renderPanel(
      report([
        { key: 'pix_pending', count: 2, oldestDays: 1 },
        { key: 'to_ship', count: 3, oldestDays: 1 },
      ])
    )

    expect(await screen.findByText('5 pendências')).toBeInTheDocument()
  })
})

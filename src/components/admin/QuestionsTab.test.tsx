/**
 * QuestionsTab — answering customers from the panel.
 *
 * What these pin: the queue opens on "Aguardando", an answer is trimmed and
 * sent once, the pending counter goes down, an empty answer is refused, and a
 * question can be hidden from the shop and published back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ProductQuestion } from '../../lib/questions'

const mocks = vi.hoisted(() => ({
  adminListQuestions: vi.fn(),
  answerQuestion: vi.fn(),
  setQuestionStatus: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../../lib/questions', () => ({
  adminListQuestions: mocks.adminListQuestions,
  answerQuestion: mocks.answerQuestion,
  setQuestionStatus: mocks.setQuestionStatus,
}))
vi.mock('../../lib/subdomain', () => ({ getShopUrl: () => 'https://shop.example' }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

import { QuestionsTab } from './QuestionsTab'

function question(over: Partial<ProductQuestion> = {}): ProductQuestion {
  return {
    id: 'q1', productId: 'p1', userId: 'u1', memberId: null, body: 'Tem em estoque?', status: 'published',
    answerBody: null, answeredBy: null, answeredAt: null, createdAt: '2026-09-27T12:00:00Z', updatedAt: 'x',
    authorName: 'Laura', productName: 'Holder', productSlug: 'holder', ...over,
  }
}

async function renderTab(list: ProductQuestion[], pending = list.length) {
  mocks.adminListQuestions.mockResolvedValue({ questions: list, total: list.length, pending, page: 1, limit: 20 })
  render(<QuestionsTab />)
  await waitFor(() => expect(mocks.adminListQuestions).toHaveBeenCalled())
}

beforeEach(() => vi.clearAllMocks())

describe('QuestionsTab', () => {
  it('opens on the unanswered queue and links the product in the shop', async () => {
    await renderTab([question()])
    expect(mocks.adminListQuestions).toHaveBeenCalledWith({ answered: false, page: 1, limit: 20 })
    expect(await screen.findByText('1 aguardando resposta')).toBeInTheDocument()
    expect(screen.getByTitle('Abrir na loja')).toHaveAttribute('href', 'https://shop.example/produto/holder')
  })

  it('answers, trimmed, and takes the question off the pending count', async () => {
    mocks.answerQuestion.mockResolvedValue(question({ answerBody: 'Sim!', answeredAt: 'now' }))
    await renderTab([question()])
    fireEvent.change(await screen.findByLabelText('Resposta para a pergunta de Laura'), { target: { value: '  Sim!  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }))
    await waitFor(() => expect(mocks.answerQuestion).toHaveBeenCalledWith('q1', 'Sim!'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Resposta publicada — o cliente foi notificado')
    await waitFor(() => expect(screen.queryByText('1 aguardando resposta')).not.toBeInTheDocument())
  })

  it('keeps "Responder" off for a blank answer and reports a failed one', async () => {
    await renderTab([question()])
    const button = await screen.findByRole('button', { name: /Responder/ })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Resposta para a pergunta de Laura'), { target: { value: '   ' } })
    expect(button).toBeDisabled()
    expect(mocks.answerQuestion).not.toHaveBeenCalled()

    mocks.answerQuestion.mockResolvedValue(null)
    fireEvent.change(screen.getByLabelText('Resposta para a pergunta de Laura'), { target: { value: 'Sim' } })
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Erro ao enviar a resposta'))
  })

  it('hides a question from the shop and publishes it back', async () => {
    mocks.setQuestionStatus.mockResolvedValueOnce(question({ status: 'hidden' }))
    await renderTab([question()])
    fireEvent.click(await screen.findByRole('button', { name: 'Esconder pergunta' }))
    await waitFor(() => expect(mocks.setQuestionStatus).toHaveBeenCalledWith('q1', 'hidden'))
    expect(await screen.findByText('Escondida')).toBeInTheDocument()

    mocks.setQuestionStatus.mockResolvedValueOnce(question())
    fireEvent.click(screen.getByRole('button', { name: 'Publicar pergunta' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenLastCalledWith('Pergunta publicada'))
  })

  it('switches filters and shows an empty queue', async () => {
    await renderTab([])
    expect(await screen.findByText('Nenhuma pergunta aguardando')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Respondidas' }))
    await waitFor(() => expect(mocks.adminListQuestions).toHaveBeenLastCalledWith({ answered: true, page: 1, limit: 20 }))
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    await waitFor(() => expect(mocks.adminListQuestions).toHaveBeenLastCalledWith({ answered: undefined, page: 1, limit: 20 }))
  })

  it('says so when the queue cannot load', async () => {
    mocks.adminListQuestions.mockRejectedValue(new Error('offline'))
    render(<QuestionsTab />)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Erro ao carregar perguntas'))
  })
})

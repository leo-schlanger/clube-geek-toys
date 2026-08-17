/**
 * TermsOfUse Page Tests
 *
 * Covers: rendering title, all section headings, key content,
 * back link, and legal elements.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TermsOfUse from './TermsOfUse'

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsOfUse />
    </MemoryRouter>
  )
}

describe('TermsOfUse', () => {
  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Termos de Uso')).toBeInTheDocument()
  })

  it('renders the company name', () => {
    renderPage()
    expect(screen.getByText(/N\. STANLEY SCHLANGER/)).toBeInTheDocument()
  })

  it('renders CNPJ', () => {
    renderPage()
    expect(screen.getByText(/52\.846\.344\/0001-10/)).toBeInTheDocument()
  })

  it('renders all section headings', () => {
    renderPage()
    const sections = [
      'Identificação',
      '1. O Clube de Vantagens',
      '2. Cadastro e Segurança',
      '3. Assinaturas e Pagamentos',
      '4. Cancelamento e Rescisão',
      '5. Compras na Loja Online',
      '6. Uso do Site',
      '7. Limitação de Responsabilidade',
      '8. Propriedade Intelectual',
      '9. Alterações nos Termos',
      '10. Foro e Legislação Aplicável',
    ]

    for (const heading of sections) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('renders contact email', () => {
    renderPage()
    const emailLink = screen.getByText('contato@geeketoys.com.br')
    expect(emailLink.closest('a')).toHaveAttribute('href', 'mailto:contato@geeketoys.com.br')
  })

  it('renders back link pointing to /', () => {
    renderPage()
    const backLink = screen.getByText('Voltar')
    expect(backLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders last-updated date', () => {
    renderPage()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
    expect(screen.getByText(/17 de agosto de 2026/)).toBeInTheDocument()
  })

  it('mentions CDC (Consumer Defense Code)', () => {
    renderPage()
    const matches = screen.getAllByText(/Código de Defesa do Consumidor/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('mentions the single annual club plan', () => {
    renderPage()
    expect(screen.getByText(/plano único de assinatura anual/i)).toBeInTheDocument()
  })

  it('mentions right of withdrawal (7 days)', () => {
    renderPage()
    expect(screen.getByText(/Direito de Arrependimento/)).toBeInTheDocument()
  })

  it('mentions Stripe as payment processor', () => {
    renderPage()
    expect(screen.getByText(/Stripe/)).toBeInTheDocument()
  })

  it('mentions the 15% product discount benefit', () => {
    renderPage()
    expect(screen.getByText(/15% de desconto em qualquer produto/i)).toBeInTheDocument()
  })
})

describe('TermsOfUse — compras na loja', () => {
  // The Art. 49 window for goods runs from delivery, not from the order. The
  // page previously only covered the subscription, where it runs from signup.
  it('conta o arrependimento de produto a partir do recebimento', () => {
    render(
      <MemoryRouter>
        <TermsOfUse />
      </MemoryRouter>
    )
    expect(
      screen.getByText(/7 \(sete\) dias corridos contados do recebimento do produto/i)
    ).toBeInTheDocument()
  })

  it('descreve troca por defeito e prazo de entrega como estimativa', () => {
    render(
      <MemoryRouter>
        <TermsOfUse />
      </MemoryRouter>
    )
    expect(screen.getByText(/Art\. 18 do CDC/i)).toBeInTheDocument()
    expect(screen.getByText(/são estimativas informadas pela transportadora/i)).toBeInTheDocument()
  })
})

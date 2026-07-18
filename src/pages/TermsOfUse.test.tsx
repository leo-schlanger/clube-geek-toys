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
      '5. Uso do Site',
      '6. Limitação de Responsabilidade',
      '7. Propriedade Intelectual',
      '8. Alterações nos Termos',
      '9. Foro e Legislação Aplicável',
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
    expect(screen.getByText(/26 de março de 2026/)).toBeInTheDocument()
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

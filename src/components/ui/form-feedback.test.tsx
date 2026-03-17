import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormFeedback, FormFieldFeedback } from './form-feedback'

describe('FormFeedback', () => {
  it('should render children when idle', () => {
    render(
      <FormFeedback state="idle">
        <button>Submit</button>
      </FormFeedback>
    )
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('should render loading state with default text', () => {
    render(<FormFeedback state="loading" />)
    expect(screen.getByText('Processando...')).toBeInTheDocument()
  })

  it('should render loading state with custom text', () => {
    render(<FormFeedback state="loading" loadingText="Please wait..." />)
    expect(screen.getByText('Please wait...')).toBeInTheDocument()
  })

  it('should render loading state with progress', () => {
    render(<FormFeedback state="loading" progress={50} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('should render success state with default text', () => {
    render(<FormFeedback state="success" />)
    expect(screen.getByText('Sucesso!')).toBeInTheDocument()
  })

  it('should render success state with custom text', () => {
    render(<FormFeedback state="success" successText="Done!" />)
    expect(screen.getByText('Done!')).toBeInTheDocument()
  })

  it('should render error state with default text', () => {
    render(<FormFeedback state="error" />)
    expect(screen.getByText('Erro ao processar')).toBeInTheDocument()
  })

  it('should render error state with custom text', () => {
    render(<FormFeedback state="error" errorText="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<FormFeedback state="loading" className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('FormFieldFeedback', () => {
  it('should return null when no error or success', () => {
    const { container } = render(<FormFieldFeedback />)
    expect(container).toBeEmptyDOMElement()
  })

  it('should render error message', () => {
    render(<FormFieldFeedback error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('should render success indicator', () => {
    render(<FormFieldFeedback success />)
    expect(screen.getByText('Válido')).toBeInTheDocument()
  })

  it('should prefer error over success', () => {
    render(<FormFieldFeedback error="Error message" success />)
    expect(screen.getByText('Error message')).toBeInTheDocument()
    expect(screen.queryByText('Válido')).not.toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<FormFieldFeedback error="Error" className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('should have error styling', () => {
    const { container } = render(<FormFieldFeedback error="Error" />)
    expect(container.firstChild).toHaveClass('text-red-500')
  })

  it('should have success styling', () => {
    const { container } = render(<FormFieldFeedback success />)
    expect(container.firstChild).toHaveClass('text-green-500')
  })
})

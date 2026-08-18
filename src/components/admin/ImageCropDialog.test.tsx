import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageCropDialog } from './ImageCropDialog'

function jpegFile() {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', { type: 'image/jpeg' })
}

describe('ImageCropDialog', () => {
  it('shows crop controls, aspect and size presets', () => {
    render(<ImageCropDialog files={[jpegFile()]} onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /Cortar imagem/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Photocard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quadrado/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1200 px/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Personalizado/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aplicar recorte/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Usar sem cortar/i })).toBeInTheDocument()
  })

  it('cancels without completing', () => {
    const onCancel = vi.fn()
    const onComplete = vi.fn()
    render(<ImageCropDialog files={[jpegFile()]} onComplete={onComplete} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('skips crop and returns the original file', () => {
    const onComplete = vi.fn()
    const file = jpegFile()
    render(<ImageCropDialog files={[file]} onComplete={onComplete} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Usar sem cortar/i }))
    expect(onComplete).toHaveBeenCalledWith([file])
  })

  it('rotates in both directions and wraps around', () => {
    render(<ImageCropDialog files={[jpegFile()]} onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('0°')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Girar à direita/i }))
    expect(screen.getByText('90°')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Girar à esquerda/i }))
    expect(screen.getByText('0°')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Girar à esquerda/i }))
    expect(screen.getByText('270°')).toBeInTheDocument()
  })

  it('offers to keep the rotation without cropping', () => {
    render(<ImageCropDialog files={[jpegFile()]} onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Usar sem cortar/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Girar à direita/i }))
    expect(screen.getByRole('button', { name: /Girar sem cortar/i })).toBeInTheDocument()
  })

  it('opens custom width/height fields', () => {
    render(<ImageCropDialog files={[jpegFile()]} onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Personalizado/i }))
    expect(screen.getByLabelText(/Largura/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Altura/i)).toBeInTheDocument()
  })
})

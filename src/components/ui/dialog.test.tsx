import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog'

describe('Dialog', () => {
  it('should render trigger button', () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByText('Open Dialog')).toBeInTheDocument()
  })

  it('should not render content when closed', () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>Dialog content</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument()
  })

  it('should render content when open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Visible Title</DialogTitle>
          <DialogDescription>Visible description</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByText('Visible Title')).toBeInTheDocument()
    expect(screen.getByText('Visible description')).toBeInTheDocument()
  })

  it('should render close button with sr-only text', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByText('Fechar')).toBeInTheDocument()
  })

  it('should render DialogHeader', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader data-testid="dialog-header">
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Desc</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByTestId('dialog-header')).toBeInTheDocument()
  })

  it('should render DialogFooter', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
          <DialogFooter data-testid="dialog-footer">
            <button>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByTestId('dialog-footer')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('should render DialogClose', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
          <DialogClose data-testid="close-btn">Cancel</DialogClose>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByTestId('close-btn')).toBeInTheDocument()
  })

  it('DialogHeader should have displayName', () => {
    expect(DialogHeader.displayName).toBe('DialogHeader')
  })

  it('DialogFooter should have displayName', () => {
    expect(DialogFooter.displayName).toBe('DialogFooter')
  })

  it('DialogTitle should have displayName', () => {
    expect(DialogTitle.displayName).toBeDefined()
  })

  it('DialogDescription should have displayName', () => {
    expect(DialogDescription.displayName).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from './sheet'

describe('Sheet', () => {
  it('should render trigger button', () => {
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByText('Open Sheet')).toBeInTheDocument()
  })

  it('should not render content when closed', () => {
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>Sheet content here</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.queryByText('Sheet Title')).not.toBeInTheDocument()
  })

  it('should render content when open', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Visible Title</SheetTitle>
          <SheetDescription>Visible description</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByText('Visible Title')).toBeInTheDocument()
    expect(screen.getByText('Visible description')).toBeInTheDocument()
  })

  it('should render close button inside content', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('should render SheetHeader', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader data-testid="sheet-header">
            <SheetTitle>Header Title</SheetTitle>
            <SheetDescription>Header desc</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByTestId('sheet-header')).toBeInTheDocument()
  })

  it('should render SheetFooter', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
          <SheetFooter data-testid="sheet-footer">
            <button>Save</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByTestId('sheet-footer')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('should render SheetClose', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
          <SheetClose data-testid="close-btn">Cancel</SheetClose>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByTestId('close-btn')).toBeInTheDocument()
  })

  it('SheetHeader should have displayName', () => {
    expect(SheetHeader.displayName).toBe('SheetHeader')
  })

  it('SheetFooter should have displayName', () => {
    expect(SheetFooter.displayName).toBe('SheetFooter')
  })
})

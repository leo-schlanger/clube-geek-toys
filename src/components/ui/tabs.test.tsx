import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

function renderTabs({
  defaultValue = 'tab1',
  value,
  onValueChange,
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (v: string) => void
} = {}) {
  return render(
    <Tabs defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('should render tabs with trigger buttons', () => {
    renderTabs()
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument()
  })

  it('should render the tablist', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('should show content of default selected tab', () => {
    renderTabs({ defaultValue: 'tab1' })
    expect(screen.getByText('Content 1')).toBeInTheDocument()
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument()
    expect(screen.queryByText('Content 3')).not.toBeInTheDocument()
  })

  it('should switch content when clicking a tab trigger', () => {
    renderTabs()

    // Initially tab 1 is shown
    expect(screen.getByText('Content 1')).toBeInTheDocument()

    // Click tab 2
    fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument()
    expect(screen.getByText('Content 2')).toBeInTheDocument()

    // Click tab 3
    fireEvent.click(screen.getByRole('tab', { name: 'Tab 3' }))
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument()
    expect(screen.getByText('Content 3')).toBeInTheDocument()
  })

  it('should call onValueChange when tab is clicked', () => {
    const onChange = vi.fn()
    renderTabs({ onValueChange: onChange })

    fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))
    expect(onChange).toHaveBeenCalledWith('tab2')
  })

  it('should work in controlled mode', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Tabs value="tab1" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Content 1')).toBeInTheDocument()
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument()

    // Click tab 2 - should call onChange but not switch (controlled)
    fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))
    expect(onChange).toHaveBeenCalledWith('tab2')

    // Rerender with new controlled value
    rerender(
      <Tabs value="tab2" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.queryByText('Content 1')).not.toBeInTheDocument()
    expect(screen.getByText('Content 2')).toBeInTheDocument()
  })
})

describe('TabsTrigger', () => {
  it('should set aria-selected on active trigger', () => {
    renderTabs({ defaultValue: 'tab1' })
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'false')
  })

  it('should set data-state attribute', () => {
    renderTabs({ defaultValue: 'tab1' })
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('data-state', 'inactive')
  })

  it('should have type="button"', () => {
    renderTabs()
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('type', 'button')
  })

  it('should support disabled state', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" disabled>Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeDisabled()
  })
})

describe('TabsContent', () => {
  it('should have role="tabpanel"', () => {
    renderTabs({ defaultValue: 'tab1' })
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('should set data-state="active" on visible panel', () => {
    renderTabs({ defaultValue: 'tab1' })
    expect(screen.getByRole('tabpanel')).toHaveAttribute('data-state', 'active')
  })

  it('should not render inactive content at all', () => {
    renderTabs({ defaultValue: 'tab1' })
    // Only one tabpanel should be in the DOM
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })
})

describe('TabsList', () => {
  it('should have role="tablist"', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList className="my-tabs" data-testid="list">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>
    )
    expect(screen.getByTestId('list')).toHaveClass('my-tabs')
  })
})

describe('Tabs context error', () => {
  it('should throw if TabsTrigger is used outside Tabs', () => {
    expect(() => {
      render(<TabsTrigger value="test">Orphan</TabsTrigger>)
    }).toThrow('Tabs compound components must be used within <Tabs>')
  })

  it('should throw if TabsContent is used outside Tabs', () => {
    expect(() => {
      render(<TabsContent value="test">Orphan</TabsContent>)
    }).toThrow('Tabs compound components must be used within <Tabs>')
  })
})

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  // gap-2 keeps icon and label evenly spaced; shrink-0 on the svg stops the
  // icon collapsing or wrapping on its own; whitespace-nowrap keeps the label
  // on one line.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-green-500 text-white hover:bg-green-600",
        warning: "bg-yellow-500 text-white hover:bg-yellow-600",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 gap-1.5 text-sm",
        lg: "h-11 rounded-md px-8 gap-2.5",
        xl: "h-14 rounded-lg px-10 text-lg gap-2.5",
        icon: "h-10 w-10 gap-0 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }))

    // asChild applies the styles TO the child instead of wrapping it.
    //
    // Wrapping deformed the button: the <a> became the flex container's only
    // child, and the <svg> inside it (display:block via Tailwind preflight)
    // pushed the label onto a second line. It also produced an <a> inside a
    // <button>, which is invalid HTML.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      // react-hooks/refs warns because it cannot tell forwarding a ref from
      // reading ref.current during render. Here it is only passed to the child,
      // which is what attaches it to the DOM node.
      // eslint-disable-next-line react-hooks/refs
      return React.cloneElement(child, {
        ...props,
        ref,
        className: cn(classes, child.props.className),
      } as React.Attributes)
    }

    return (
      <button className={classes} ref={ref} {...props}>
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  // gap-2: espaçamento estável entre ícone e texto
  // shrink-0 no svg: ícone não esmaga nem quebra de linha sozinho
  // whitespace-nowrap: texto do botão não quebra no meio
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

    // asChild aplica o estilo NO filho, em vez de embrulhá-lo num <button>.
    //
    // Embrulhar deformava o botão: o <a> virava o único filho do flex, e dentro
    // dele o <svg> (display:block pelo preflight do Tailwind) empurrava o texto
    // para a linha de baixo — ícone em cima, texto embaixo. Também gerava
    // <a> dentro de <button>, que é HTML inválido.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      // react-hooks/refs alerta porque não distingue encaminhar a ref de ler
      // ref.current durante o render. Aqui ela só é repassada ao filho, que é
      // quem vai anexá-la ao nó do DOM.
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

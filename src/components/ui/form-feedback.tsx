import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { SuccessAnimation, ErrorAnimation, LoadingDots } from "./success-animation"
import { Progress } from "./progress"

type FeedbackState = "idle" | "loading" | "success" | "error"

interface FormFeedbackProps {
  state: FeedbackState
  loadingText?: string
  successText?: string
  errorText?: string
  progress?: number
  children?: ReactNode
  className?: string
}

export function FormFeedback({
  state,
  loadingText = "Processando...",
  successText = "Sucesso!",
  errorText = "Erro ao processar",
  progress,
  children,
  className,
}: FormFeedbackProps) {
  if (state === "idle") {
    return <>{children}</>
  }

  return (
    <div className={cn("flex flex-col items-center justify-center py-8 space-y-4", className)}>
      {state === "loading" && (
        <>
          {progress !== undefined ? (
            <div className="w-full max-w-xs space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                {progress}%
              </p>
            </div>
          ) : (
            <LoadingDots />
          )}
          <p className="text-sm text-muted-foreground">{loadingText}</p>
        </>
      )}

      {state === "success" && (
        <>
          <SuccessAnimation />
          <p className="text-sm font-medium text-green-600">{successText}</p>
        </>
      )}

      {state === "error" && (
        <>
          <ErrorAnimation />
          <p className="text-sm font-medium text-red-600">{errorText}</p>
        </>
      )}
    </div>
  )
}

interface FormFieldFeedbackProps {
  error?: string
  success?: boolean
  className?: string
}

export function FormFieldFeedback({ error, success, className }: FormFieldFeedbackProps) {
  if (!error && !success) return null

  return (
    <div
      className={cn(
        "text-sm mt-1 flex items-center gap-1",
        error && "text-red-500 animate-shake",
        success && "text-green-500",
        className
      )}
    >
      {error && (
        <>
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </>
      )}
      {success && !error && (
        <>
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>Válido</span>
        </>
      )}
    </div>
  )
}

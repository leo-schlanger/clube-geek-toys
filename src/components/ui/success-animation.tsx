import { cn } from "../../lib/utils"

interface SuccessAnimationProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeMap = {
  sm: 40,
  md: 64,
  lg: 96,
}

export function SuccessAnimation({ size = "md", className }: SuccessAnimationProps) {
  const dimension = sizeMap[size]
  const strokeWidth = size === "sm" ? 3 : size === "md" ? 4 : 5

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 64 64"
        className="animate-scale-in"
      >
        {/* Background circle */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          className="stroke-green-500/20"
          strokeWidth={strokeWidth}
        />
        {/* Animated circle */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          className="stroke-green-500"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray="176"
          strokeDashoffset="176"
          style={{
            animation: "checkmark 0.5s ease-out forwards",
          }}
        />
        {/* Checkmark */}
        <path
          d="M20 32 L28 40 L44 24"
          fill="none"
          className="stroke-green-500 animate-checkmark"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

interface ErrorAnimationProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function ErrorAnimation({ size = "md", className }: ErrorAnimationProps) {
  const dimension = sizeMap[size]
  const strokeWidth = size === "sm" ? 3 : size === "md" ? 4 : 5

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 64 64"
        className="animate-scale-in"
      >
        {/* Background circle */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          className="stroke-red-500/20"
          strokeWidth={strokeWidth}
        />
        {/* Animated circle */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          className="stroke-red-500"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray="176"
          strokeDashoffset="176"
          style={{
            animation: "checkmark 0.5s ease-out forwards",
          }}
        />
        {/* X mark */}
        <path
          d="M22 22 L42 42 M42 22 L22 42"
          fill="none"
          className="stroke-red-500 animate-checkmark"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

interface LoadingDotsProps {
  className?: string
}

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full bg-primary animate-bounce"
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.6s",
          }}
        />
      ))}
    </div>
  )
}

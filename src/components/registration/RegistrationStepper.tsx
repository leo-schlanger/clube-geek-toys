import { motion } from "framer-motion"
import {
  Check,
  CreditCard,
  FileText,
  MailCheck,
  User,
  UserCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"

interface RegistrationStepperProps {
  currentStep: number // 1-5
  completedSteps: Set<number>
}

interface StepDef {
  label: string
  icon: LucideIcon
}

const steps: StepDef[] = [
  { label: "Conta", icon: User },
  { label: "Dados", icon: UserCheck },
  { label: "Email", icon: MailCheck },
  { label: "Contrato", icon: FileText },
  { label: "Pagamento", icon: CreditCard },
]

export function RegistrationStepper({
  currentStep,
  completedSteps,
}: RegistrationStepperProps) {
  return (
    <nav aria-label="Etapas do cadastro" className="w-full px-2 sm:px-0">
      <ol className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const stepNumber = idx + 1
          const isCompleted = completedSteps.has(stepNumber)
          const isActive = currentStep === stepNumber
          const isPending = !isCompleted && !isActive

          return (
            <li
              key={stepNumber}
              className="flex flex-1 items-center last:flex-none"
            >
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <motion.div
                    className={cn(
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300",
                      isCompleted &&
                        "border-green-500 bg-green-500 text-white",
                      isActive &&
                        "border-primary bg-primary text-primary-foreground",
                      isPending &&
                        "border-muted bg-muted text-muted-foreground"
                    )}
                    initial={false}
                    animate={
                      isActive
                        ? { scale: [1, 1.08, 1] }
                        : { scale: 1 }
                    }
                    transition={
                      isActive
                        ? {
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }
                        : { duration: 0.3 }
                    }
                  >
                    {isCompleted ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        <Check className="h-5 w-5" strokeWidth={3} />
                      </motion.div>
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </motion.div>

                  {/* Active ring pulse */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      initial={{ opacity: 0.6, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.6 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                  )}
                </div>

                {/* Label — visible on sm+ */}
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    isCompleted && "text-green-500",
                    isActive && "text-primary",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line */}
              {stepNumber < steps.length && (
                <div className="relative mx-2 h-0.5 flex-1 bg-muted sm:mx-3">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-green-500"
                    initial={false}
                    animate={{
                      width: isCompleted ? "100%" : "0%",
                    }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

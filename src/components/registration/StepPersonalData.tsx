import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CreditCard,
  HelpCircle,
  Loader2,
  Phone,
  User,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { validateCPF, cn } from "../../lib/utils"
import {
  fullCPFValidation,
  type CPFValidationResult,
} from "../../lib/cpf-validation"
import { isCPFRegistered } from "../../lib/members"
import { sanitizeName, normalizePhone, normalizeCPF } from "../../lib/sanitize"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  fullName: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  cpf: z.string().refine((val) => validateCPF(val), "CPF invalido"),
  phone: z.string().min(10, "Telefone invalido"),
})

type FormValues = z.infer<typeof schema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepPersonalDataProps {
  onNext: (data: {
    fullName: string
    cpf: string
    phone: string
  }) => void
  onBack: () => void
  loading: boolean
  defaultValues?: {
    fullName?: string
    cpf?: string
    phone?: string
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ---------------------------------------------------------------------------
// Rate-limit state (module-level so it survives re-renders)
// ---------------------------------------------------------------------------

const CPF_RATE_LIMIT = { attempts: 0, lockedUntil: 0 }
const MAX_CPF_ATTEMPTS = 5
const CPF_COOLDOWN_MS = 60_000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepPersonalData({
  onNext,
  onBack,
  loading,
  defaultValues,
}: StepPersonalDataProps) {
  // CPF async validation state
  const [cpfStatus, setCpfStatus] = useState<
    "idle" | "loading" | "valid" | "warning" | "error"
  >("idle")
  const [cpfMessage, setCpfMessage] = useState("")
  const cpfValidatingRef = useRef(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      cpf: defaultValues?.cpf ? maskCPF(defaultValues.cpf) : "",
      phone: defaultValues?.phone ? maskPhone(defaultValues.phone) : "",
    },
  })

  const cpfValue = watch("cpf")

  // ----- CPF masking -----
  const handleCPFChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskCPF(e.target.value)
      setValue("cpf", masked, { shouldValidate: false })
      // Reset async status while typing
      if (cpfStatus !== "idle") {
        setCpfStatus("idle")
        setCpfMessage("")
      }
    },
    [setValue, cpfStatus]
  )

  // ----- CPF async validation on blur -----
  const handleCPFBlur = useCallback(async () => {
    const digits = (cpfValue ?? "").replace(/\D/g, "")
    if (digits.length !== 11) return
    if (!validateCPF(digits)) {
      setCpfStatus("error")
      setCpfMessage("CPF invalido")
      return
    }

    // Rate limiting
    const now = Date.now()
    if (now < CPF_RATE_LIMIT.lockedUntil) {
      const secs = Math.ceil((CPF_RATE_LIMIT.lockedUntil - now) / 1000)
      toast.warning(`Aguarde ${secs}s antes de validar outro CPF`)
      return
    }
    CPF_RATE_LIMIT.attempts++
    if (CPF_RATE_LIMIT.attempts > MAX_CPF_ATTEMPTS) {
      CPF_RATE_LIMIT.lockedUntil = now + CPF_COOLDOWN_MS
      CPF_RATE_LIMIT.attempts = 0
      toast.warning("Muitas tentativas. Aguarde 1 minuto.")
      return
    }

    if (cpfValidatingRef.current) return
    cpfValidatingRef.current = true
    setCpfStatus("loading")

    try {
      // Check if already registered
      const registered = await isCPFRegistered(digits)
      if (registered) {
        setCpfStatus("error")
        setCpfMessage("CPF ja cadastrado no sistema")
        cpfValidatingRef.current = false
        return
      }

      // Full validation (format + Brasil API)
      const result: CPFValidationResult = await fullCPFValidation(digits)

      if (!result.valid) {
        setCpfStatus("error")
        setCpfMessage(result.message)
      } else if (result.exists === true) {
        setCpfStatus("valid")
        setCpfMessage(result.message)
      } else {
        // exists === null (API unavailable or CPF not in database)
        setCpfStatus("warning")
        setCpfMessage(result.message)
      }
    } catch {
      setCpfStatus("warning")
      setCpfMessage("Nao foi possivel verificar o CPF")
    } finally {
      cpfValidatingRef.current = false
    }
  }, [cpfValue])

  // ----- Phone masking -----
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue("phone", maskPhone(e.target.value), { shouldValidate: false })
    },
    [setValue]
  )

  // ----- Reset async CPF status on defaultValues change -----
  useEffect(() => {
    if (defaultValues?.cpf) {
      setCpfStatus("idle")
      setCpfMessage("")
    }
  }, [defaultValues?.cpf])

  // ----- Submit -----
  const onSubmit = (data: FormValues) => {
    if (cpfStatus === "error") {
      toast.error(cpfMessage || "Corrija o CPF antes de continuar")
      return
    }

    onNext({
      fullName: sanitizeName(data.fullName),
      cpf: normalizeCPF(data.cpf),
      phone: normalizePhone(data.phone),
    })
  }

  // ----- CPF status icon -----
  const cpfIcon = () => {
    switch (cpfStatus) {
      case "loading":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      case "valid":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "warning":
        return <HelpCircle className="h-4 w-4 text-yellow-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ---- Full Name ---- */}
        <div className="space-y-2">
          <label
            htmlFor="fullName"
            className="block text-sm font-medium text-foreground"
          >
            Nome completo
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="fullName"
              type="text"
              placeholder="Seu nome completo"
              className={cn(
                "w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.fullName ? "border-red-500" : "border-border"
              )}
              {...register("fullName")}
            />
          </div>
          {errors.fullName && (
            <p className="text-xs text-red-500">{errors.fullName.message}</p>
          )}
        </div>

        {/* ---- CPF ---- */}
        <div className="space-y-2">
          <label
            htmlFor="cpf"
            className="block text-sm font-medium text-foreground"
          >
            CPF
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              className={cn(
                "w-full rounded-lg border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.cpf || cpfStatus === "error"
                  ? "border-red-500"
                  : cpfStatus === "valid"
                    ? "border-green-500"
                    : cpfStatus === "warning"
                      ? "border-yellow-500"
                      : "border-border"
              )}
              {...register("cpf", {
                onChange: handleCPFChange,
                onBlur: handleCPFBlur,
              })}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {cpfIcon()}
            </span>
          </div>
          {errors.cpf && (
            <p className="text-xs text-red-500">{errors.cpf.message}</p>
          )}
          {cpfMessage && cpfStatus !== "idle" && !errors.cpf && (
            <p
              className={cn(
                "text-xs",
                cpfStatus === "valid" && "text-green-500",
                cpfStatus === "warning" && "text-yellow-500",
                cpfStatus === "error" && "text-red-500"
              )}
            >
              {cpfMessage}
            </p>
          )}
        </div>

        {/* ---- Phone ---- */}
        <div className="space-y-2">
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-foreground"
          >
            Telefone
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="phone"
              type="text"
              inputMode="numeric"
              placeholder="(00) 00000-0000"
              className={cn(
                "w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.phone ? "border-red-500" : "border-border"
              )}
              {...register("phone", { onChange: handlePhoneChange })}
            />
          </div>
          {errors.phone && (
            <p className="text-xs text-red-500">{errors.phone.message}</p>
          )}
        </div>

        {/* ---- Footer buttons ---- */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <button
            type="submit"
            disabled={loading || cpfStatus === "loading"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Proximo
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  )
}

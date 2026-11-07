import { CheckCircle, Gift } from 'lucide-react'
import { CLUB_PLAN } from '../../types'
import { MemberSection } from './MemberSection'

export function BenefitsSection() {
  return (
    <MemberSection icon={Gift} title="Seus benefícios">
      <ul className="space-y-3">
        {CLUB_PLAN.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <span className="text-sm">{benefit}</span>
          </li>
        ))}
      </ul>
    </MemberSection>
  )
}

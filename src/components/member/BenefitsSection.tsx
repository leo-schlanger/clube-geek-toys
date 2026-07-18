import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { CLUB_PLAN } from '../../types'
import { CheckCircle, Gift } from 'lucide-react'

export function BenefitsSection() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-primary" />
          Benefícios do {CLUB_PLAN.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {CLUB_PLAN.benefits.map((benefit, index) => (
            <li
              key={index}
              className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
            >
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span className="text-sm">{benefit}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

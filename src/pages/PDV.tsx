import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Loading } from '../components/ui/loading'
import { QRScanner } from '../components/QRScanner'
import { PLANS, type Member, type PlanType } from '../types'
import { formatCPF, getStatusLabel } from '../lib/utils'
import { getMemberByCPF, isMemberActive } from '../lib/members'
import {
  Camera,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  RefreshCw,
  LogOut,
} from 'lucide-react'

interface VerificationResult {
  member: Member | null
  isValid: boolean
  message: string
}

export default function PDV() {
  const { signOut } = useAuth()
  const [mode, setMode] = useState<'scanner' | 'search'>('search')
  const [showScanner, setShowScanner] = useState(false)
  const [cpfSearch, setCpfSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)

  /**
   * Handle QR Code scan
   */
  async function handleQRScan(data: string) {
    setShowScanner(false)
    setLoading(true)
    setResult(null)

    try {
      const qrData = JSON.parse(data)
      if (qrData.cpf) {
        await verifyMember(qrData.cpf)
      } else {
        setResult({
          member: null,
          isValid: false,
          message: 'QR Code inválido',
        })
      }
    } catch {
      setResult({
        member: null,
        isValid: false,
        message: 'Erro ao ler QR Code',
      })
    }

    setLoading(false)
  }

  /**
   * Handle CPF search
   */
  async function handleCPFSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!cpfSearch.trim()) return

    setLoading(true)
    setResult(null)

    const cleanCPF = cpfSearch.replace(/\D/g, '')
    await verifyMember(cleanCPF)

    setLoading(false)
  }

  /**
   * Verify member by CPF
   */
  async function verifyMember(cpf: string) {
    try {
      const member = await getMemberByCPF(cpf)

      if (!member) {
        setResult({
          member: null,
          isValid: false,
          message: 'CPF não encontrado no sistema',
        })
        return
      }

      const isActive = isMemberActive(member)
      const isExpired = new Date(member.expiryDate) < new Date()

      setResult({
        member,
        isValid: isActive,
        message: isActive
          ? 'Membro ativo - pode aplicar desconto!'
          : isExpired
          ? 'Assinatura expirada - desconto não disponível'
          : 'Assinatura pendente - desconto não disponível',
      })
    } catch (error) {
      console.error('Error verifying member:', error)
      setResult({
        member: null,
        isValid: false,
        message: 'Erro ao verificar membro',
      })
    }
  }

  /**
   * Reset verification
   */
  function resetVerification() {
    setResult(null)
    setCpfSearch('')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 rounded" />
            <div>
              <h1 className="font-heading font-bold">PDV - Clube Geek & Toys</h1>
              <p className="text-xs text-muted-foreground">Verificação de membros</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === 'search' ? 'default' : 'outline'}
            onClick={() => { setMode('search'); setShowScanner(false) }}
            className="flex-1"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar CPF
          </Button>
          <Button
            variant={mode === 'scanner' ? 'default' : 'outline'}
            onClick={() => { setMode('scanner'); setShowScanner(true) }}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scanner QR
          </Button>
        </div>

        {/* Search Mode */}
        {mode === 'search' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Buscar por CPF</CardTitle>
              <CardDescription>Digite o CPF do cliente para verificar a assinatura</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCPFSearch} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Digite o CPF..."
                  value={cpfSearch}
                  onChange={(e) => setCpfSearch(e.target.value)}
                  className="flex-1"
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || !cpfSearch.trim()}>
                  {loading ? <Loading size="sm" /> : <Search className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Scanner Mode */}
        {mode === 'scanner' && showScanner && (
          <div className="mb-6">
            <QRScanner
              onScan={handleQRScan}
              onClose={() => { setShowScanner(false); setMode('search') }}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <Card className="mb-6">
            <CardContent className="py-12">
              <Loading size="lg" text="Verificando..." />
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && !loading && (
          <Card
            className={`mb-6 border-2 ${
              result.isValid
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-red-500 bg-red-50 dark:bg-red-900/20'
            }`}
          >
            <CardContent className="py-8">
              {/* Status Icon */}
              <div className="flex justify-center mb-6">
                {result.isValid ? (
                  <div className="p-4 rounded-full bg-green-500 text-white">
                    <CheckCircle className="h-16 w-16" />
                  </div>
                ) : (
                  <div className="p-4 rounded-full bg-red-500 text-white">
                    <XCircle className="h-16 w-16" />
                  </div>
                )}
              </div>

              {/* Message */}
              <p
                className={`text-center text-xl font-bold mb-6 ${
                  result.isValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                }`}
              >
                {result.message}
              </p>

              {/* Member Info */}
              {result.member && (
                <div className="bg-card rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{result.member.fullName}</h3>
                      <p className="text-sm text-muted-foreground">{formatCPF(result.member.cpf)}</p>
                    </div>
                    <Badge
                      variant={
                        result.member.plan === 'silver'
                          ? 'silver'
                          : result.member.plan === 'gold'
                          ? 'gold'
                          : 'black'
                      }
                      className="ml-auto"
                    >
                      {PLANS[result.member.plan as PlanType].icon}{' '}
                      {PLANS[result.member.plan as PlanType].name}
                    </Badge>
                  </div>

                  <hr />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={result.member.status === 'active' ? 'success' : 'destructive'}>
                        {getStatusLabel(result.member.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Validade</p>
                      <p className="font-medium">
                        {new Date(result.member.expiryDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {result.isValid && (
                    <>
                      <hr />
                      <div className="grid grid-cols-2 gap-4 p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <div className="text-center">
                          <p className="text-3xl font-bold text-green-600">
                            {PLANS[result.member.plan as PlanType].discountProducts}%
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Desconto em Produtos
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-3xl font-bold text-green-600">
                            {PLANS[result.member.plan as PlanType].discountServices}%
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Desconto em Serviços
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {!result.isValid && (
                    <div className="flex items-center gap-2 p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Cliente precisa renovar a assinatura para usar os descontos
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Reset Button */}
              <div className="mt-6 text-center">
                <Button onClick={resetVerification} size="lg">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Nova Verificação
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function TermsOfUse() {
    return (
        <div className="min-h-screen bg-background py-12 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Link>
                </div>

                <div className="glass p-8 md:p-12 rounded-2xl border border-border shadow-2xl">
                    <h1 className="text-4xl font-heading font-bold mb-8 gradient-text">Termos de Uso</h1>
                    <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
                        <p className="text-sm"><strong>Última atualização:</strong> Março de 2026</p>

                        <p>Ao utilizar os sites da <strong>Geek & Toys</strong> e o <strong>Clube de Vantagens</strong>, você concorda com os seguintes termos:</p>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">1. O Clube de Vantagens</h2>
                            <p>O Clube oferece descontos exclusivos em nossa loja física e online, brindes e acessos antecipados, dependendo do plano escolhido (Silver, Gold ou Black).</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">2. Cadastro e Segurança</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Você é responsável pela veracidade dos dados informados e pela guarda de sua senha.</li>
                                <li>O uso da conta é pessoal e intransferível.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">3. Assinaturas e Pagamentos</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>As assinaturas podem ser mensais ou anuais com renovação automática.</li>
                                <li>O cancelamento interrompe a renovação futura, mas não gera estorno de períodos já pagos (salvo direito de arrependimento legal de 7 dias para novas assinaturas).</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">4. Uso do Site</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>É proibido o uso do site para fins ilegais ou para tentar comprometer a segurança da plataforma.</li>
                                <li>Reservamo-nos o direito de suspender contas que violem estes termos.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">5. Propriedade Intelectual</h2>
                            <p>Todo o conteúdo (logos, textos, imagens) é propriedade da Geek & Toys ou licenciadores parceiros.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">6. Foro</h2>
                            <p>Fica eleito o foro da Comarca do Rio de Janeiro - RJ para dirimir controvérsias.</p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

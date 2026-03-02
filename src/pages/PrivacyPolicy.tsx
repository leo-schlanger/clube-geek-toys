import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPolicy() {
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
                    <h1 className="text-4xl font-heading font-bold mb-8 gradient-text">Política de Privacidade</h1>
                    <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
                        <p className="text-sm"><strong>Última atualização:</strong> Março de 2026</p>

                        <p>A <strong>Geek & Toys Collection</strong>, sediada em Copacabana, Rio de Janeiro - RJ, valoriza a sua privacidade. Esta política descreve como coletamos e usamos seus dados em conformidade com a Lei Geral de Proteção de Dados (LGPD).</p>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">1. Dados Coletados</h2>
                            <p>Coletamos informações necessárias para a prestação de nossos serviços:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Dados de Cadastro:</strong> Nome completo, e-mail, CPF, telefone e senha (criptografada).</li>
                                <li><strong>Dados de Pagamento:</strong> Processados de forma segura por parceiros integrados (não armazenamos dados de cartão de crédito em nossos servidores).</li>
                                <li><strong>Dados de Navegação:</strong> Cookies e endereço IP para segurança e melhoria da experiência.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">2. Finalidade do Tratamento</h2>
                            <p>Seus dados são utilizados para:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Gestão da assinatura do "Clube de Vantagens".</li>
                                <li>Processamento de pagamentos.</li>
                                <li>Comunicação sobre pedidos, novidades e suporte.</li>
                                <li>Cumprimento de obrigações legais.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">3. Direitos do Titular (LGPD)</h2>
                            <p>Você tem o direito de:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Confirmar a existência de tratamento de dados.</li>
                                <li>Acessar, corrigir ou excluir seus dados.</li>
                                <li>Revogar consentimento a qualquer momento.</li>
                                <li>Portabilidade dos dados.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">4. Compartilhamento de Dados</h2>
                            <p>Não vendemos seus dados. Compartilhamos apenas com:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Processadores de pagamento.</li>
                                <li>Serviços de hospedagem e infraestrutura de TI.</li>
                                <li>Autoridades judiciais, se solicitado por lei.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">5. Contato</h2>
                            <p>Para questões sobre seus dados: <a href="mailto:contato@geeketoys.com.br" className="text-primary hover:underline">contato@geeketoys.com.br</a></p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

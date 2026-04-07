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
                        <p className="text-sm"><strong>Última atualização:</strong> 26 de março de 2026</p>

                        <section className="space-y-3 bg-muted/20 p-4 rounded-lg">
                            <h2 className="text-2xl font-semibold text-foreground">Identificação</h2>
                            <p><strong>N. STANLEY SCHLANGER COMERCIO DE ARTIGOS EM GERAL LTDA</strong></p>
                            <p>Nome Fantasia: <strong>GEEK & TOYS</strong></p>
                            <p>CNPJ: 52.846.344/0001-10</p>
                            <p>Endereço: Rua Barata Ribeiro, 181, Loja J - Copacabana, Rio de Janeiro - RJ, CEP 22.011-001</p>
                            <p>E-mail: <a href="mailto:contato@geeketoys.com.br" className="text-primary hover:underline">contato@geeketoys.com.br</a></p>
                        </section>

                        <p>Ao utilizar os sites da <strong>Geek & Toys</strong> e o <strong>Clube de Vantagens</strong>, você concorda com os seguintes termos, elaborados em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/90) e demais legislações aplicáveis:</p>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">1. O Clube de Vantagens</h2>
                            <p>O Clube oferece descontos exclusivos em nossa loja física e online, brindes e acessos antecipados, dependendo do plano escolhido (Silver, Gold ou Black). Os benefícios específicos de cada plano estão detalhados na página de assinatura e no contrato de adesão.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">2. Cadastro e Segurança</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Você é responsável pela veracidade dos dados informados e pela guarda de sua senha.</li>
                                <li>O uso da conta é pessoal e intransferível, vinculado ao CPF do titular.</li>
                                <li>Em caso de suspeita de uso indevido, comunique-nos imediatamente.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">3. Assinaturas e Pagamentos</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>As assinaturas podem ser mensais ou anuais com renovação automática.</li>
                                <li><strong>Direito de Arrependimento (Art. 49, CDC):</strong> O consumidor pode desistir da contratação no prazo de 7 (sete) dias a contar da assinatura, com reembolso integral dos valores pagos.</li>
                                <li>Após o período de arrependimento, o cancelamento interrompe a renovação futura, mas não gera estorno de períodos já pagos.</li>
                                <li>Os pagamentos são processados de forma segura via PagBank (PIX ou cartão de crédito).</li>
                                <li>Os valores podem ser reajustados anualmente, com comunicação prévia de 30 dias.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">4. Cancelamento e Rescisão</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>O cancelamento pode ser solicitado a qualquer momento pela área do membro ou por e-mail.</li>
                                <li>Planos mensais não possuem fidelidade mínima.</li>
                                <li>Planos anuais, após o período de arrependimento, não são reembolsáveis.</li>
                                <li>Reservamo-nos o direito de cancelar assinaturas em caso de fraude, uso indevido ou violação destes termos.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">5. Uso do Site</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>É proibido o uso do site para fins ilegais ou para tentar comprometer a segurança da plataforma.</li>
                                <li>Reservamo-nos o direito de suspender ou cancelar contas que violem estes termos.</li>
                                <li>É proibida a revenda ou transferência de benefícios do clube.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">6. Limitação de Responsabilidade</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Os descontos são válidos apenas durante a vigência da assinatura e conforme disponibilidade.</li>
                                <li>Não nos responsabilizamos por indisponibilidades temporárias do sistema por motivos técnicos ou de força maior.</li>
                                <li>O programa de pontos está sujeito às regras específicas descritas no contrato de adesão.</li>
                                <li>Esta limitação não se aplica a direitos garantidos pelo Código de Defesa do Consumidor.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">7. Propriedade Intelectual</h2>
                            <p>Todo o conteúdo (logos, textos, imagens, software) é propriedade da Geek & Toys ou de seus licenciadores, protegido pela Lei de Direitos Autorais (Lei nº 9.610/98). É proibida a reprodução sem autorização expressa.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">8. Alterações nos Termos</h2>
                            <p>Estes termos podem ser alterados a qualquer momento. Alterações significativas serão comunicadas por e-mail com antecedência mínima de 15 dias. O uso continuado após a notificação implica aceitação das novas condições.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">9. Foro e Legislação Aplicável</h2>
                            <p>Este contrato é regido pelas leis brasileiras. Fica eleito o foro da Comarca do Rio de Janeiro - RJ para dirimir controvérsias, sem prejuízo do direito do consumidor de optar pelo foro de seu domicílio (Art. 101, I, CDC).</p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-background py-12 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        Voltar
                    </Link>
                </div>

                <div className="glass p-8 md:p-12 rounded-2xl border border-border shadow-2xl">
                    <h1 className="text-4xl font-heading font-bold mb-8 gradient-text">Política de Privacidade</h1>
                    <div className="prose max-w-none space-y-6 text-muted-foreground">
                        <p className="text-sm"><strong>Última atualização:</strong> 17 de agosto de 2026</p>

                        <section className="space-y-3 bg-muted/20 p-4 rounded-lg">
                            <h2 className="text-2xl font-semibold text-foreground">Controlador dos Dados</h2>
                            <p><strong>N. STANLEY SCHLANGER COMERCIO DE ARTIGOS EM GERAL LTDA</strong></p>
                            <p>Nome Fantasia: <strong>GEEKPOP & TOYS</strong></p>
                            <p>CNPJ: 52.846.344/0001-10</p>
                            <p>Endereço: Rua Barata Ribeiro, 181, Loja J - Copacabana, Rio de Janeiro - RJ, CEP 22.011-001</p>
                            <p>Encarregado de Dados (DPO): <a href="mailto:contato@geeketoys.com.br" className="text-primary hover:underline">contato@geeketoys.com.br</a></p>
                        </section>

                        <p>Esta política descreve como coletamos, utilizamos, armazenamos e protegemos seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).</p>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">1. Dados Coletados</h2>
                            <p>Coletamos informações necessárias para a prestação de nossos serviços:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Dados de Cadastro:</strong> Nome completo, e-mail, CPF, telefone e senha (armazenada com criptografia).</li>
                                <li><strong>Perfil da loja (opcional):</strong> Data de nascimento, gênero, endereço e foto de perfil. Nenhum desses campos é obrigatório — você pode criar conta e comprar sem preencher qualquer um deles, e apagá-los quando quiser. O campo gênero inclui a opção "prefiro não dizer".</li>
                                <li><strong>Compras e entrega:</strong> Itens do pedido, endereço de entrega, valor, forma de pagamento e código de rastreio.</li>
                                <li><strong>Produtos salvos:</strong> A lista de produtos que você marca para comprar depois, visível apenas para você.</li>
                                <li><strong>Atacado (CNPJ):</strong> Para contas de atacado, CNPJ, razão social, nome fantasia, inscrição estadual, ramo de atividade e contato da empresa.</li>
                                <li><strong>Dados de Pagamento:</strong> Cartão processado pela Pagar.me — o número vai do seu navegador direto para ela e não passa pelos nossos servidores; guardamos apenas a bandeira e os quatro últimos dígitos. No PIX, guardamos somente o identificador da cobrança.</li>
                                <li><strong>Dados de Navegação:</strong> Endereço IP, tipo de navegador, páginas visitadas, data e hora de acesso.</li>
                                <li><strong>Dados de Contrato:</strong> Assinatura digital, data/hora, IP no momento da assinatura.</li>
                                <li><strong>Perguntas sobre produtos:</strong> O texto da pergunta e o <strong>primeiro nome</strong> de quem perguntou ficam públicos na página do produto, junto da nossa resposta. Nome completo, e-mail e telefone nunca aparecem.</li>
                                <li><strong>Imagens de eventos e da loja:</strong> Fotos publicadas na galeria do site institucional podem conter pessoas identificáveis presentes em eventos abertos ou na loja física.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">2. Base Legal e Finalidade</h2>
                            <p>Tratamos seus dados com as seguintes bases legais (Art. 7º, LGPD):</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Execução de contrato:</strong> Gestão da assinatura do Clube de Vantagens, processamento de pagamentos, entrega de benefícios.</li>
                                <li><strong>Consentimento:</strong> Envio de comunicações promocionais e novidades (você pode revogar a qualquer momento).</li>
                                <li><strong>Obrigação legal:</strong> Cumprimento de obrigações fiscais e regulatórias.</li>
                                <li><strong>Legítimo interesse:</strong> Melhoria dos serviços, segurança da plataforma, prevenção a fraudes.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">3. Tempo de Retenção</h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Dados de cadastro:</strong> Mantidos durante a vigência da assinatura e por até 5 anos após o cancelamento para fins legais.</li>
                                <li><strong>Dados de pagamento:</strong> Mantidos por 5 anos conforme legislação fiscal.</li>
                                <li><strong>Contratos assinados:</strong> Mantidos por 10 anos para fins de comprovação legal.</li>
                                <li><strong>Logs de navegação:</strong> Mantidos por 6 meses para fins de segurança.</li>
                                <li><strong>Perguntas e respostas:</strong> Mantidas enquanto o produto estiver no catálogo. Ao excluir a conta, o texto é anonimizado e sai da vitrine.</li>
                                <li><strong>Fotos da galeria:</strong> Mantidas enquanto a divulgação fizer sentido, ou até pedido de remoção.</li>
                                <li><strong>Perfil da loja:</strong> Mantido enquanto a conta existir. Ao excluir a conta, os dados de perfil e os produtos salvos são apagados, não apenas anonimizados.</li>
                                <li><strong>Pedidos da loja:</strong> Mantidos por 5 anos por obrigação fiscal. Ao excluir a conta, os dados pessoais do pedido são anonimizados e apenas os valores permanecem, para fins contábeis.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">Conteúdo público que você cria</h2>
                            <p>
                                Perguntas feitas na página de um produto ficam visíveis para outros clientes assim que
                                enviadas, identificadas apenas pelo primeiro nome. Não inclua dados pessoais no texto.
                                Você pode pedir a remoção a qualquer momento, e a exclusão da conta anonimiza o que já
                                foi publicado.
                            </p>
                            <p>
                                As fotos da galeria são registradas em eventos abertos ao público e na loja física, e
                                publicadas para divulgação. Não são vendidas nem cedidas, e o site não oferece
                                download. Para retirar uma foto em que você aparece, escreva para o contato abaixo
                                indicando o álbum — a remoção é feita sem necessidade de justificativa.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">4. Direitos do Titular (Art. 18, LGPD)</h2>
                            <p>Você pode exercer os seguintes direitos:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Confirmação da existência de tratamento.</li>
                                <li>Acesso aos dados pessoais.</li>
                                <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
                                <li>Anonimização, bloqueio ou eliminação de dados desnecessários.</li>
                                <li>Portabilidade dos dados a outro fornecedor.</li>
                                <li>Eliminação dos dados tratados com consentimento.</li>
                                <li>Informação sobre compartilhamento.</li>
                                <li>Revogação do consentimento.</li>
                            </ul>
                            <p className="mt-2"><strong>Como exercer:</strong> Envie um e-mail para <a href="mailto:contato@geeketoys.com.br" className="text-primary hover:underline">contato@geeketoys.com.br</a> com o assunto "Exercício de Direitos LGPD". Responderemos em até 15 dias.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">5. Compartilhamento de Dados</h2>
                            <p>Não vendemos seus dados. Compartilhamos apenas com:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Pagar.me (Stone):</strong> Processamento de pagamentos com cartão e PIX.</li>
                                <li><strong>Melhor Envio e Correios:</strong> Cálculo de frete e envio. Para a cotação enviamos apenas o CEP de destino e as medidas do pacote; ao despachar, os dados de entrega necessários para a etiqueta.</li>
                                <li><strong>Servidor próprio (VPS):</strong> Hospedagem e banco de dados PostgreSQL.</li>
                                <li><strong>Resend:</strong> Envio de e-mails transacionais.</li>
                                <li><strong>Umami:</strong> Estatísticas de acesso, hospedado em servidor próprio. Não usa cookies nem cria perfil individual.</li>
                                <li><strong>Autoridades:</strong> Quando exigido por lei ou ordem judicial.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">6. Transferência Internacional</h2>
                            <p>Alguns de nossos prestadores de serviços (Resend, entre outros) podem armazenar dados em servidores localizados fora do Brasil. O processamento de pagamentos é feito pela Pagar.me, no Brasil. Essas transferências são realizadas com base em:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Cláusulas contratuais padrão aprovadas pela ANPD.</li>
                                <li>Certificações de adequação dos prestadores às normas de proteção de dados.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">7. Medidas de Segurança</h2>
                            <p>Implementamos medidas técnicas e organizacionais para proteger seus dados:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Criptografia de dados em trânsito (HTTPS/TLS).</li>
                                <li>Autenticação segura com JWT (JSON Web Tokens).</li>
                                <li>Senhas armazenadas com hash criptográfico (nunca em texto plano).</li>
                                <li>Controle de acesso baseado em funções (admin, vendedor, membro).</li>
                                <li>Monitoramento e logs de auditoria.</li>
                                <li>Backups regulares e plano de recuperação.</li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">8. Cookies</h2>
                            <p>Utilizamos cookies para:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Cookies essenciais:</strong> Autenticação e funcionamento do site.</li>
                                <li><strong>Cookies de desempenho:</strong> Análise de uso anonimizada para melhoria do serviço.</li>
                            </ul>
                            <p>Você pode gerenciar cookies nas configurações do seu navegador.</p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">9. Contato e Reclamações</h2>
                            <p>Para questões sobre seus dados ou para registrar reclamações:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>E-mail:</strong> <a href="mailto:contato@geeketoys.com.br" className="text-primary hover:underline">contato@geeketoys.com.br</a></li>
                                <li><strong>ANPD:</strong> Você também pode registrar reclamação junto à Autoridade Nacional de Proteção de Dados em <a href="https://www.gov.br/anpd" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">www.gov.br/anpd</a></li>
                            </ul>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground">10. Alterações</h2>
                            <p>Esta política pode ser atualizada periodicamente. Alterações significativas serão comunicadas por e-mail ou notificação no site.</p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

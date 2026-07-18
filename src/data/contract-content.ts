/**
 * Contract Content - Regulamento do Clube Geek & Toys
 * Estruturado para geração de PDF com pdf-lib
 */

export interface ContractSection {
  title: string
  content: string[]
}

export const CONTRACT_SECTIONS: ContractSection[] = [
  {
    title: '1. SOBRE O CLUBE GEEK & TOYS',
    content: [
      'O CLUBE GEEK & TOYS VIP é um programa de fidelidade exclusivo da loja GEEK & TOYS, destinado a oferecer vantagens, descontos e benefícios especiais aos seus membros.',
      'A participação no Clube é voluntária e requer a adesão ao plano anual do Clube, mediante pagamento da anuidade correspondente.',
      'O Clube reserva-se o direito de modificar, suspender ou encerrar o programa a qualquer momento, mediante comunicação prévia de 30 (trinta) dias aos membros, por e-mail.',
    ],
  },
  {
    title: '2. PLANO E BENEFÍCIOS',
    content: [
      'O Clube Geek & Toys possui um único plano, de vigência anual, no valor vigente no momento da adesão.',
      'BENEFÍCIO PRINCIPAL: 15% (quinze por cento) de desconto em qualquer produto, válido tanto na loja física quanto na loja online do Clube Geek & Toys.',
      'BENEFÍCIOS ADICIONAIS: brinde especial de boas-vindas e entrada gratuita nos eventos participantes promovidos ou apoiados pela loja.',
      'Os benefícios são válidos apenas durante a vigência da assinatura e não são cumulativos com outras promoções, salvo indicação expressa.',
    ],
  },
  {
    title: '3. PAGAMENTO E RENOVAÇÃO',
    content: [
      'A assinatura é anual, com valor conforme tabela vigente no momento da adesão.',
      'O pagamento pode ser realizado via PIX ou cartão de crédito.',
      'A renovação é anual e automática quando contratada por assinatura recorrente, salvo cancelamento solicitado pelo membro antes da data de vencimento.',
      'O Clube reserva-se o direito de reajustar o valor da assinatura anualmente, mediante comunicação prévia de 30 (trinta) dias.',
      'Em caso de inadimplência superior a 15 (quinze) dias, os benefícios serão suspensos até a regularização.',
    ],
  },
  {
    title: '4. CANCELAMENTO',
    content: [
      'O membro pode solicitar o cancelamento a qualquer momento através da área do membro ou por contato direto com a loja.',
      'O cancelamento será efetivado ao final do período já pago, não havendo reembolso proporcional.',
      'A assinatura anual, uma vez contratada, não é passível de reembolso após o prazo de arrependimento previsto neste regulamento.',
      'Após o cancelamento, o membro perde imediatamente o acesso aos benefícios do Clube.',
    ],
  },
  {
    title: '5. USO DOS BENEFÍCIOS',
    content: [
      'Os benefícios do Clube são pessoais e intransferíveis, vinculados ao CPF do membro cadastrado.',
      'Para utilizar o desconto, o membro deve apresentar sua carteirinha digital ou informar o CPF no momento da compra na loja física, ou estar autenticado na loja online.',
      'O desconto não é cumulativo com outras promoções da loja, salvo indicação expressa.',
      'O uso indevido ou fraudulento dos benefícios acarretará no cancelamento imediato da assinatura, sem direito a reembolso.',
    ],
  },
  {
    title: '6. PRIVACIDADE E PROTEÇÃO DE DADOS',
    content: [
      'Os dados pessoais coletados são utilizados exclusivamente para operação do Clube e comunicação com os membros.',
      'O tratamento dos dados é realizado em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).',
      'O membro pode solicitar a qualquer momento o acesso, correção ou exclusão de seus dados pessoais.',
      'Os dados não serão compartilhados com terceiros, exceto quando necessário para operação dos serviços (processadores de pagamento, por exemplo).',
    ],
  },
  {
    title: '7. ASSINATURA ELETRÔNICA',
    content: [
      'Este contrato é firmado de forma eletrônica, nos termos da Lei nº 14.063/2020, que dispõe sobre o uso de assinaturas eletrônicas.',
      'A assinatura eletrônica simples aqui utilizada tem validade jurídica plena para os fins deste termo de adesão.',
      'O documento é assinado mediante desenho digital da assinatura do membro, registrando-se data, hora, endereço IP e identificador único (hash SHA-256) para fins de auditoria e comprovação de autenticidade.',
      'Uma cópia do contrato assinado será enviada ao e-mail cadastrado do membro.',
    ],
  },
  {
    title: '8. DIREITO DE ARREPENDIMENTO',
    content: [
      'Nos termos do Art. 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990), o membro que contratar o Clube de forma remota (internet) poderá desistir da contratação no prazo de 7 (sete) dias corridos a contar da adesão, com direito ao reembolso integral dos valores pagos.',
      'Para exercer o direito de arrependimento, o membro deve entrar em contato através do e-mail contato@geeketoys.com.br ou pelo canal de atendimento disponível na área do membro.',
      'O reembolso será processado em até 30 (trinta) dias após a solicitação, utilizando o mesmo meio de pagamento da contratação.',
    ],
  },
  {
    title: '9. FORO',
    content: [
      'Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o Foro da Comarca do Rio de Janeiro/RJ, com exclusão de qualquer outro, por mais privilegiado que seja.',
      'As partes declaram ter lido e compreendido integralmente este regulamento, concordando com todos os seus termos e condições.',
    ],
  },
]

export const CONTRACT_TITLE = 'CLUBE GEEK & TOYS VIP'
export const CONTRACT_SUBTITLE = 'REGULAMENTO E TERMO DE ADESÃO'

export const CONTRACT_DECLARATION = `Declaro que li integralmente o presente Regulamento e Termo de Adesão do Clube Geek & Toys VIP, compreendi todas as suas cláusulas e condições, e manifesto minha livre e espontânea concordância com todos os termos aqui estabelecidos.

Declaro ainda que as informações por mim fornecidas são verdadeiras e que estou ciente de que a falsidade nas declarações pode acarretar o cancelamento da minha participação no Clube, sem direito a reembolso.`

/**
 * Email Validation Utilities
 *
 * Validação robusta de emails incluindo:
 * - Formato RFC 5322
 * - Bloqueio de emails temporários/descartáveis
 * - Verificação de domínio via DNS
 */

import { logger } from './logger'

// =============================================================================
// Types
// =============================================================================

export interface EmailValidationResult {
  valid: boolean
  error?: string
  warnings?: string[]
}

// =============================================================================
// Disposable Email Domains (emails temporários)
// =============================================================================

/**
 * Lista de domínios de email temporários/descartáveis mais comuns
 * Fonte: https://github.com/disposable-email-domains/disposable-email-domains
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // Mais populares
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamail.net',
  'guerrillamail.biz',
  'sharklasers.com',
  'grr.la',
  'guerrillamailblock.com',
  '10minutemail.com',
  '10minutemail.net',
  'minutemail.com',
  'tempinbox.com',
  'tempr.email',
  'discard.email',
  'discardmail.com',
  'throwaway.email',
  'throwawaymail.com',
  'fakeinbox.com',
  'fakemailgenerator.com',
  'mailnesia.com',
  'maildrop.cc',
  'mailcatch.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'gawab.com',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'spam4.me',
  'spamfree24.org',
  'spamfree24.de',
  'spamfree24.info',
  'spamfree24.net',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmail.ws',
  'trashemail.de',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'emailondeck.com',
  'mailexpire.com',
  'tempail.com',
  'tempomail.fr',
  'temporarymail.com',
  'temporaryemail.net',
  'tmpmail.org',
  'tmpmail.net',
  'mailnull.com',
  'e4ward.com',
  'spamex.com',
  'mytrashmail.com',
  'mt2009.com',
  'thankyou2010.com',
  'trash2009.com',
  'mt2014.com',
  'tempsky.com',
  'bodhi.lawlita.com',
  'bofthew.com',
  'clrmail.com',
  'disposableinbox.com',
  'emailthe.net',
  'getonemail.com',
  'getonemail.net',
  'girlsundertheinfluence.com',
  'gishpuppy.com',
  'goemailgo.com',
  'great-host.in',
  'greensloth.com',
  'gsrv.co.uk',
  'haltospam.com',
  'hotpop.com',
  'imgof.com',
  'imstations.com',
  'incognitomail.com',
  'incognitomail.net',
  'ipoo.org',
  'irish2me.com',
  'jetable.com',
  'kasmail.com',
  'kaspop.com',
  'keepmymail.com',
  'killmail.com',
  'killmail.net',
  'klassmaster.com',
  'klassmaster.net',
  'mailbidon.com',
  'mailblocks.com',
  'mailfreeonline.com',
  'mailin8r.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'mailincubator.com',
  'mailme.lv',
  'mailmetrash.com',
  'mailmoat.com',
  'mailnator.com',
  'mailseal.de',
  'mailshell.com',
  'mailsiphon.com',
  'mailslite.com',
  'mailzilla.com',
  'mailzilla.org',
  'mbx.cc',
  'mega.zik.dj',
  'meltmail.com',
  'messagebeamer.de',
  'mierdamail.com',
  'mintemail.com',
  'moburl.com',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'msa.minsmail.com',
  'mt2009.com',
  'mypartyclip.de',
  'myphantomemail.com',
  'myspaceinc.com',
  'myspaceinc.net',
  'myspacepimpedup.com',
  'mytrashmail.com',
  'neomailbox.com',
  'nepwk.com',
  'nervmich.net',
  'nervtmansen.net',
  'netmails.com',
  'netmails.net',
  'netzidiot.de',
  'neverbox.com',
  'no-spam.ws',
  'nobulk.com',
  'noclickemail.com',
  'nogmailspam.info',
  'nomail.xl.cx',
  'nomail2me.com',
  'nomorespamemails.com',
  'nospam.ze.tc',
  'nospam4.us',
  'nospamfor.us',
  'nospamthanks.info',
  'notmailinator.com',
  'nowmymail.com',
  'nurfuerspam.de',
  'nus.edu.sg',
  'nwldx.com',
  'objectmail.com',
  'obobbo.com',
  'oneoffemail.com',
  'onewaymail.com',
  'online.ms',
  'oopi.org',
  'ordinaryamerican.net',
  'otherinbox.com',
  'ourklips.com',
  'outlawspam.com',
  'ovpn.to',
  'owlpic.com',
  'pancakemail.com',
  'pjjkp.com',
  'politikerclub.de',
  'poofy.org',
  'pookmail.com',
  'privacy.net',
  'privatdemail.net',
  'proxymail.eu',
  'prtnx.com',
  'punkass.com',
  'putthisinyourspamdatabase.com',
  'quickinbox.com',
  'rcpt.at',
  'reallymymail.com',
  'realtyalerts.ca',
  'recode.me',
  'recursor.net',
  'recyclemail.dk',
  'regbypass.com',
  'regbypass.comsafe-mail.net',
  'rejectmail.com',
  'remail.cf',
  'rhyta.com',
  'rklips.com',
  'rmqkr.net',
  'rppkn.com',
  'rtrtr.com',
  's0ny.net',
  'safe-mail.net',
  'safersignup.de',
  'safetymail.info',
  'safetypost.de',
  'sandelf.de',
  'saynotospams.com',
  'schafmail.de',
  'selfdestructingmail.com',
  'sendspamhere.com',
  'shiftmail.com',
  'shitmail.me',
  'shortmail.net',
  'sibmail.com',
  'sinnlos-mail.de',
  'siteposter.net',
  'skeefmail.com',
  'slaskpost.se',
  'slopsbox.com',
  'slowfoodfoothills.xyz',
  'smashmail.de',
  'smellfear.com',
  'snakemail.com',
  'sneakemail.com',
  'snkmail.com',
  'sofimail.com',
  'sofort-mail.de',
  'sogetthis.com',
  'soodonims.com',
  'spam.la',
  'spam.su',
  'spam4.me',
  'spamavert.com',
  'spambob.com',
  'spambob.net',
  'spambob.org',
  'spambog.com',
  'spambog.de',
  'spambog.net',
  'spambog.ru',
  'spambox.info',
  'spambox.irishspringrealty.com',
  'spambox.us',
  'spamcannon.com',
  'spamcannon.net',
  'spamcero.com',
  'spamcon.org',
  'spamcorptastic.com',
  'spamday.com',
  'spamex.com',
  'spamfighter.cf',
  'spamfighter.ga',
  'spamfighter.gq',
  'spamfighter.ml',
  'spamfighter.tk',
  'spamfree.eu',
  'spamfree24.com',
  'spamfree24.de',
  'spamfree24.eu',
  'spamfree24.info',
  'spamfree24.net',
  'spamfree24.org',
  'spamgoes.in',
  'spamherelots.com',
  'spamhereplease.com',
  'spamhole.com',
  'spamify.com',
  'spaminator.de',
  'spamkill.info',
  'spaml.com',
  'spaml.de',
  'spammotel.com',
  'spamobox.com',
  'spamoff.de',
  'spamsalad.in',
  'spamslicer.com',
  'spamspot.com',
  'spamthis.co.uk',
  'spamthisplease.com',
  'spamtrail.com',
  'spamtroll.net',
  'speed.1s.fr',
  'spoofmail.de',
  'squizzy.de',
  'ssoia.com',
  'startkeys.com',
  'stinkefinger.net',
  'stop-my-spam.cf',
  'stop-my-spam.com',
  'stop-my-spam.ga',
  'stop-my-spam.ml',
  'stop-my-spam.tk',
  'streetwisemail.com',
  'stuffmail.de',
  'super-auswahl.de',
  'supergreatmail.com',
  'supermailer.jp',
  'superrito.com',
  'superstachel.de',
  'suremail.info',
  'svk.jp',
  'sweetxxx.de',
  'tafmail.com',
  'tagyourself.com',
  'talkinator.com',
  'tapchicuoihoi.com',
  'techemail.com',
  'techgroup.me',
  'teewars.org',
  'teleosaurs.xyz',
  'teleworm.com',
  'teleworm.us',
  'temp.emeraldwebmail.com',
  'temp.headstrong.de',
  'tempail.com',
  'tempalias.com',
  'tempe-mail.com',
  'tempemail.biz',
  'tempemail.co.za',
  'tempemail.com',
  'tempemail.net',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.co',
  'tempmail.de',
  'tempmail.eu',
  'tempmail.it',
  'tempmail.net',
  'tempmail.us',
  'tempmail2.com',
  'tempmaildemo.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempomail.fr',
  'temporarily.de',
  'temporarioemail.com.br',
  'temporaryemail.net',
  'temporaryemail.us',
  'temporaryforwarding.com',
  'temporaryinbox.com',
  'temporarymailaddress.com',
  'tempthe.net',
  'thankyou2010.com',
  'thc.st',
  'thelimestones.com',
  'thisisnotmyrealemail.com',
  'throam.com',
  'throwawayemailaddress.com',
  'tilien.com',
  'tittbit.in',
  'tmailinator.com',
  'toiea.com',
  'tokenmail.de',
  'toomail.biz',
  'topranklist.de',
  'tradermail.info',
  'trash-amil.com',
  'trash-mail.at',
  'trash-mail.com',
  'trash-mail.de',
  'trash-mail.ga',
  'trash-mail.gq',
  'trash-mail.ml',
  'trash-mail.tk',
  'trash2009.com',
  'trashemail.de',
  'trashmail.at',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmail.ws',
  'trashmailer.com',
  'trashymail.com',
  'trashymail.net',
  'trbvm.com',
  'trickmail.net',
  'trillianpro.com',
  'tryalert.com',
  'turual.com',
  'twinmail.de',
  'twoweirdtricks.com',
  'tyldd.com',
  'uggsrock.com',
  'umail.net',
  'upliftnow.com',
  'uplipht.com',
  'uroid.com',
  'us.af',
  'valemail.net',
  'venompen.com',
  'veryrealemail.com',
  'viditag.com',
  'viralplays.com',
  'vpn.st',
  'vsimcard.com',
  'vubby.com',
  'wasteland.rfc822.org',
  'webemail.me',
  'webm4il.info',
  'webuser.in',
  'wee.my',
  'weg-werf-email.de',
  'wegwerf-email-addressen.de',
  'wegwerf-emails.de',
  'wegwerfadresse.de',
  'wegwerfemail.com',
  'wegwerfemail.de',
  'wegwerfmail.de',
  'wegwerfmail.info',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wetrainbayarea.com',
  'wetrainbayarea.org',
  'wh4f.org',
  'whatiaas.com',
  'whatpaas.com',
  'whopy.com',
  'whtjddn.33mail.com',
  'whyspam.me',
  'willhackforfood.biz',
  'willselfdestruct.com',
  'winemaven.info',
  'wronghead.com',
  'wuzup.net',
  'wuzupmail.net',
  'wwwnew.eu',
  'xagloo.co',
  'xagloo.com',
  'xemaps.com',
  'xents.com',
  'xmaily.com',
  'xoxy.net',
  'yapped.net',
  'yep.it',
  'yogamaven.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'yourdomain.com',
  'ypmail.webarnak.fr.eu.org',
  'yuurok.com',
  'zehnminutenmail.de',
  'zippymail.info',
  'zoaxe.com',
  'zoemail.com',
  'zoemail.net',
  'zoemail.org',
  'zomg.info',
  'zxcv.com',
  'zxcvbnm.com',
  'zzz.com',
])

// =============================================================================
// Email Format Validation (RFC 5322)
// =============================================================================

/**
 * Regex RFC 5322 simplificada mas rigorosa para emails comuns
 * Valida formato local@domain.tld com regras restritivas
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/**
 * Valida formato do email usando regex RFC 5322
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false

  const normalizedEmail = email.trim().toLowerCase()

  // Limites de tamanho
  if (normalizedEmail.length > 254) return false

  const [localPart, domain] = normalizedEmail.split('@')
  if (!localPart || !domain) return false
  if (localPart.length > 64) return false
  if (domain.length > 253) return false

  // Validação com regex
  return EMAIL_REGEX.test(normalizedEmail)
}

// =============================================================================
// Disposable Email Check
// =============================================================================

/**
 * Verifica se o email é de um provedor temporário/descartável
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false

  const domain = email.toLowerCase().split('@')[1]
  if (!domain) return false

  return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

/**
 * Extrai o domínio do email
 */
export function getEmailDomain(email: string): string | null {
  if (!email) return null
  const parts = email.toLowerCase().split('@')
  return parts.length === 2 ? parts[1] : null
}

// =============================================================================
// Domain Validation (DNS/MX)
// =============================================================================

/**
 * Verifica se o domínio do email existe via API de DNS
 * Usa a API dns.google.com (gratuita e confiável)
 */
export async function verifyEmailDomain(email: string): Promise<{
  valid: boolean
  hasMX: boolean
  error?: string
}> {
  const domain = getEmailDomain(email)

  if (!domain) {
    return { valid: false, hasMX: false, error: 'Domínio inválido' }
  }

  try {
    // Verifica MX records usando DNS over HTTPS do Google
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5s timeout
      }
    )

    if (!response.ok) {
      logger.warn('DNS lookup failed:', response.status)
      // Não falha a validação se a API estiver indisponível
      return { valid: true, hasMX: true, error: 'Não foi possível verificar o domínio' }
    }

    const data = await response.json()

    // Status 0 = NOERROR (domínio existe)
    // Status 3 = NXDOMAIN (domínio não existe)
    if (data.Status === 3) {
      return { valid: false, hasMX: false, error: 'Domínio não existe' }
    }

    // Verifica se tem registros MX
    const hasMX = data.Answer && data.Answer.length > 0

    if (!hasMX) {
      // Domínio existe mas não tem MX - pode ainda receber emails via A record
      // Verifica se tem A record
      const aResponse = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        }
      )

      if (aResponse.ok) {
        const aData = await aResponse.json()
        if (aData.Answer && aData.Answer.length > 0) {
          // Tem A record, pode receber emails
          return { valid: true, hasMX: false }
        }
      }

      return { valid: false, hasMX: false, error: 'Domínio não pode receber emails' }
    }

    return { valid: true, hasMX: true }
  } catch (error) {
    logger.warn('Error verifying email domain:', error)
    // Em caso de erro de rede, não bloqueia o usuário
    return { valid: true, hasMX: true, error: 'Não foi possível verificar o domínio' }
  }
}

// =============================================================================
// Full Email Validation
// =============================================================================

/**
 * Validação completa de email
 *
 * @param email - Email a validar
 * @param options - Opções de validação
 * @returns Resultado da validação
 *
 * @example
 * const result = await validateEmail('user@tempmail.com')
 * // { valid: false, error: 'Email temporário não é permitido' }
 *
 * const result = await validateEmail('user@gmail.com')
 * // { valid: true }
 */
export async function validateEmail(
  email: string,
  options: {
    checkDisposable?: boolean
    checkDomain?: boolean
  } = {}
): Promise<EmailValidationResult> {
  const { checkDisposable = true, checkDomain = true } = options

  const warnings: string[] = []

  // 1. Validação de formato
  if (!isValidEmailFormat(email)) {
    return { valid: false, error: 'Formato de email inválido' }
  }

  // 2. Verificar email temporário/descartável
  if (checkDisposable && isDisposableEmail(email)) {
    return { valid: false, error: 'Emails temporários não são permitidos' }
  }

  // 3. Verificar domínio (async)
  if (checkDomain) {
    const domainResult = await verifyEmailDomain(email)

    if (!domainResult.valid) {
      return { valid: false, error: domainResult.error || 'Domínio de email inválido' }
    }

    if (domainResult.error) {
      warnings.push(domainResult.error)
    }

    if (!domainResult.hasMX) {
      warnings.push('Domínio pode ter problemas para receber emails')
    }
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/**
 * Validação síncrona (apenas formato e disposable)
 * Use quando não puder fazer chamadas async
 */
export function validateEmailSync(email: string): EmailValidationResult {
  if (!isValidEmailFormat(email)) {
    return { valid: false, error: 'Formato de email inválido' }
  }

  if (isDisposableEmail(email)) {
    return { valid: false, error: 'Emails temporários não são permitidos' }
  }

  return { valid: true }
}

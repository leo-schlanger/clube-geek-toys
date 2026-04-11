/**
 * Backend defense-in-depth: reject sign-ups from known disposable email providers.
 * This list mirrors src/lib/email-validation.ts (frontend). Keep them in sync — any addition
 * here should be reflected on the frontend (and vice versa) for consistent UX.
 *
 * Source: https://github.com/disposable-email-domains/disposable-email-domains
 */

const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  // Popular
  'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'guerrillamail.org',
  'guerrillamail.net', 'guerrillamail.biz', 'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
  '10minutemail.com', '10minutemail.net', 'minutemail.com', 'tempinbox.com', 'tempr.email',
  'discard.email', 'discardmail.com', 'throwaway.email', 'throwawaymail.com', 'fakeinbox.com',
  'fakemailgenerator.com', 'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'yopmail.com',
  'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
  'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'gawab.com', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spam4.me', 'spamfree24.org', 'spamfree24.de', 'spamfree24.info', 'spamfree24.net',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.ws',
  'trashemail.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'emailondeck.com',
  'mailexpire.com', 'tempail.com', 'tempomail.fr', 'temporarymail.com', 'temporaryemail.net',
  'tmpmail.org', 'tmpmail.net', 'mailnull.com', 'e4ward.com', 'spamex.com', 'mytrashmail.com',
  'mt2009.com', 'thankyou2010.com', 'trash2009.com', 'mt2014.com', 'tempsky.com',
  // Generic patterns
  'getnada.com', 'mohmal.com', 'fakemail.net', 'mailfa.tk', 'tempmailaddress.com',
  'mailtothis.com', 'tafmail.com', 'mailbox.in.ua', 'incognitomail.com', 'incognitomail.net',
  'inboxalias.com', 'mailmate.com', 'spambox.us', 'tempemail.net', 'tempemail.com',
  'tempemail.co.za', 'getairmail.com', 'tempmailo.com', 'mintemail.com', 'mytemp.email',
  'inboxbear.com', 'jetable.org', 'mvrht.com', 'mailcuk.com', 'binkmail.com', 'opayq.com',
  'spambog.com', 'spambog.de', 'spambog.net', 'spambog.ru', 'spamday.com', 'spamhole.com',
  'spamify.com', 'spamspot.com', 'spamthis.co.uk', 'spamthisplease.com', 'spamtrail.com',
  'spamtroll.net', 'tempmaildemo.com', 'tempmailer.com', 'tempmailer.de', 'temporarily.de',
  'temporaryemail.us', 'temporaryforwarding.com', 'temporaryinbox.com', 'temporarymailaddress.com',
  'tmailinator.com', 'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.info',
  'zehnminutenmail.de', 'zippymail.info',
]);

/**
 * Returns true if the email's domain is on the disposable list.
 * Case-insensitive. Returns false for empty/invalid input (caller validates format separately).
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.substring(at + 1).toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

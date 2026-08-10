/**
 * Brazilian CNPJ helpers — digits-only storage, Modulo 11 validation.
 */

/** Strip to digits only. */
export function normalizeCnpj(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** Format 14 digits as 00.000.000/0000-00. */
export function formatCnpj(digits: string): string {
  const d = normalizeCnpj(digits);
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Validates a Brazilian CNPJ using the Modulo 11 checksum algorithm.
 * Accepts formatted or digits-only input.
 */
export function isValidCnpj(cnpj: string): boolean {
  const d = normalizeCnpj(cnpj);
  if (!/^\d{14}$/.test(d)) return false;
  // Reject known invalid sequences (all same digit)
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigit = (base: string, factors: number[]): number => {
    let sum = 0;
    for (let i = 0; i < factors.length; i++) {
      sum += parseInt(base.charAt(i), 10) * factors[i];
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcDigit(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(d.charAt(12), 10)) return false;

  const d2 = calcDigit(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d2 !== parseInt(d.charAt(13), 10)) return false;

  return true;
}

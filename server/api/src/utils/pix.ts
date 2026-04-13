/**
 * PIX EMV Code (BR Code) generator.
 *
 * Generates a static PIX QR code string following the Banco Central do Brasil
 * EMV specification. No external API needed — just the PIX key + amount.
 *
 * Reference: https://www.bcb.gov.br/content/estabilidadefinanceira/forumpireunioes/AnexoI-PadsQRCodeBRCode.pdf
 */

// ─── EMV TLV helpers ─────────────────────────────────────────────────────────

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// ─── CRC16-CCITT ─────────────────────────────────────────────────────────────

function crc16(data: string): string {
  const polynomial = 0x1021;
  let crc = 0xFFFF;
  const bytes = Buffer.from(data, 'utf8');
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ─── PIX EMV generator ──────────────────────────────────────────────────────

export interface PixQRData {
  /** The full EMV code string (for copy-paste / QR rendering) */
  emvCode: string;
  /** The PIX key used */
  pixKey: string;
  /** Amount in BRL */
  amount: number;
  /** Unique transaction ID */
  txId: string;
  /** Expiration timestamp (ISO string) */
  expiresAt: string;
}

/**
 * Generate a PIX EMV QR Code string.
 *
 * @param pixKey - The PIX key (UUID, CPF, email, phone, or random key)
 * @param amount - Amount in BRL (e.g. 29.90)
 * @param merchantName - Business name (max 25 chars)
 * @param merchantCity - City name (max 15 chars)
 * @param txId - Unique transaction ID (max 25 chars, alphanumeric)
 * @param expirationMinutes - Minutes until the QR code expires (default 30)
 */
export function generatePixEMV(opts: {
  pixKey: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  txId: string;
  expirationMinutes?: number;
}): PixQRData {
  const {
    pixKey,
    amount,
    merchantName,
    merchantCity,
    txId,
    expirationMinutes = 30,
  } = opts;

  // Payload Format Indicator
  const id00 = tlv('00', '01');

  // Merchant Account Information (PIX)
  // GUI = br.gov.bcb.pix (mandatory)
  // Key = the PIX key
  const gui = tlv('00', 'br.gov.bcb.pix');
  const key = tlv('01', pixKey);
  const id26 = tlv('26', gui + key);

  // Merchant Category Code
  const id52 = tlv('52', '0000');

  // Transaction Currency (986 = BRL)
  const id53 = tlv('53', '986');

  // Transaction Amount
  const id54 = tlv('54', amount.toFixed(2));

  // Country Code
  const id58 = tlv('58', 'BR');

  // Merchant Name (trim to 25 chars)
  const name = merchantName.substring(0, 25);
  const id59 = tlv('59', name);

  // Merchant City (trim to 15 chars)
  const city = merchantCity.substring(0, 15);
  const id60 = tlv('60', city);

  // Additional Data Field Template — txId
  const txIdField = tlv('05', txId.substring(0, 25));
  const id62 = tlv('62', txIdField);

  // Build payload without CRC
  const payload = id00 + id26 + id52 + id53 + id54 + id58 + id59 + id60 + id62;

  // CRC placeholder: '6304' (ID=63, length=04)
  const payloadWithCrcPlaceholder = payload + '6304';

  // Calculate CRC16
  const checksum = crc16(payloadWithCrcPlaceholder);
  const emvCode = payloadWithCrcPlaceholder.replace(/6304$/, `6304${checksum}`);

  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();

  return {
    emvCode,
    pixKey,
    amount,
    txId,
    expiresAt,
  };
}

/**
 * Generate a unique txId for PIX transactions.
 * Format: CGT + timestamp base36 + random chars (max 25 chars total).
 */
export function generatePixTxId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CGT${ts}${rand}`.substring(0, 25);
}

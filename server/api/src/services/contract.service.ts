import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { env } from '../config/env.js';

export async function saveContract(
  data: {
    memberId: string;
    memberName: string;
    memberCpf: string;
    memberEmail: string;
    plan: string;
    signaturePreview?: string;
    signedAt: string;
    ipAddress?: string;
    userAgent?: string;
    documentHash?: string;
  },
  file?: Express.Multer.File
) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Supersede existing active contracts
    await client.query(
      `UPDATE contracts SET status = 'superseded' WHERE member_id = $1 AND status = 'active'`,
      [data.memberId]
    );

    const contractId = `contract_${data.memberId}_${Date.now()}`;
    const pdfPath = file ? file.path.replace(/\\/g, '/') : null;
    const pdfUrl = file ? `${env.API_URL}/uploads/contracts/${data.memberId}/${file.filename}` : null;
    const signedAt = data.signedAt || new Date().toISOString();

    await client.query(
      `INSERT INTO contracts (id, member_id, member_name, member_cpf, member_email, plan,
       signature_preview, signed_at, ip_address, user_agent, document_hash, pdf_url, pdf_path, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')`,
      [
        contractId, data.memberId, data.memberName, data.memberCpf, data.memberEmail,
        data.plan, data.signaturePreview || null, signedAt,
        data.ipAddress || null, data.userAgent || null, data.documentHash || null,
        pdfUrl, pdfPath,
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, member_id, details)
       VALUES ('contract_signed', $1, $2)`,
      [data.memberId, JSON.stringify({ contractId, plan: data.plan, hash: data.documentHash })]
    );

    await client.query('COMMIT');

    return {
      id: contractId,
      pdfUrl,
      status: 'active',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveContract(memberId: string) {
  const result = await query(
    `SELECT * FROM contracts WHERE member_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [memberId]
  );
  return result.rows.length > 0 ? mapContractRow(result.rows[0]) : null;
}

export async function getContractHistory(memberId: string) {
  const result = await query(
    `SELECT * FROM contracts WHERE member_id = $1 ORDER BY created_at DESC`,
    [memberId]
  );
  return result.rows.map(mapContractRow);
}

function mapContractRow(row: pg.QueryResultRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    memberCpf: row.member_cpf,
    memberEmail: row.member_email,
    plan: row.plan,
    signaturePreview: row.signature_preview,
    signedAt: row.signed_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    documentHash: row.document_hash,
    pdfUrl: row.pdf_url,
    pdfPath: row.pdf_path,
    status: row.status,
    createdAt: row.created_at,
  };
}

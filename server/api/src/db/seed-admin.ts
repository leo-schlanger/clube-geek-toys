import bcrypt from 'bcrypt';
import pg from 'pg';
import readline from 'readline';

const { Pool } = pg;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set. Usage: DATABASE_URL=postgresql://... npx tsx src/db/seed-admin.ts');
    process.exit(1);
  }

  const email = await ask('Admin email: ');
  const password = await ask('Admin password: ');

  if (!email || !password) {
    console.error('Email and password are required.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
       VALUES ($1, $2, 'admin', TRUE, NOW())
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = $2
       RETURNING id, email, role`,
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    console.log(`\nAdmin created successfully:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role: ${user.role}`);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

main();

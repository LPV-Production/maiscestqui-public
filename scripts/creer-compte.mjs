// ============================================================
// Crée un compte (ou change son mot de passe).
//
//   npm run compte -- --remote     → sur la vraie base en ligne
//   npm run compte -- --local      → sur la base de test de ton PC
//
// Le script te demande l'identifiant, le nom affiché et le mot de passe.
// Le mot de passe ne quitte jamais ton PC : seule son empreinte est envoyée.
// ============================================================
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';

const target = process.argv.includes('--remote') ? '--remote' : process.argv.includes('--local') ? '--local' : null;
if (!target) {
  console.error('Précise --local (base de test) ou --remote (base en ligne). Ex. : npm run compte -- --remote');
  process.exit(1);
}

/** Pose une question ; si "hidden", les caractères tapés ne s'affichent pas. */
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Saisie cachée : on lit le clavier touche par touche, sans jamais rien réafficher. */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); } // Ctrl+C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1); // Retour arrière
        else if (c >= ' ') value += c;
      }
    };
    stdin.on('data', onData);
  });
}

/** Sans terminal (tests automatiques) : lit identifiant, nom et mot de passe sur 3 lignes. */
async function readPiped() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/);
}

let id, label, password;
if (process.stdin.isTTY) {
  id = (await ask('Identifiant de connexion (ex. camille) : ')).trim().toLowerCase();
  label = (await ask('Nom affiché (ex. Camille) : ')).trim();
  // On redemande tant que le mot de passe n'est pas valide (au lieu de tout recommencer)
  for (;;) {
    password = await askHidden('Mot de passe (10 caractères min., rien ne s’affiche) : ');
    if (password.length < 10) { console.log(`✗ Trop court (${password.length} caractères). Recommence.`); continue; }
    if ((await askHidden('Retape le mot de passe : ')) === password) break;
    console.log('✗ Les deux saisies sont différentes. Recommence.');
  }
} else {
  [id = '', label = '', password = ''] = await readPiped();
  id = id.trim().toLowerCase();
  label = label.trim();
}

if (!/^[a-z0-9_-]{2,30}$/.test(id)) { console.error('✗ Identifiant invalide (lettres minuscules, chiffres, - ou _).'); process.exit(1); }
if (!label || label.length > 40) { console.error('✗ Nom affiché invalide.'); process.exit(1); }
if (password.length < 10) { console.error('✗ Mot de passe trop court (10 caractères minimum).'); process.exit(1); }

// Même format que le serveur (server/lib/auth.ts)
const ITERATIONS = 100000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const stored = `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const sql = [
  `INSERT INTO users (id, label, password_hash) VALUES (${q(id)}, ${q(label)}, ${q(stored)})`,
  `ON CONFLICT(id) DO UPDATE SET label = excluded.label, password_hash = excluded.password_hash;`,
  // Un changement de mot de passe déconnecte tous les appareils
  `DELETE FROM sessions WHERE user_id = ${q(id)};`,
].join('\n');

console.log(`\nEnregistrement du compte « ${label} » (${target === '--remote' ? 'base en ligne' : 'base de test'})…`);
// Passé par un fichier temporaire (effacé juste après) : plus fiable qu'une ligne de commande sous Windows
const tmp = mkdtempSync(join(tmpdir(), 'mcq-compte-'));
const file = join(tmp, 'compte.sql');
writeFileSync(file, sql);
try {
  execSync(`npx wrangler d1 execute maiscestqui ${target} --file "${file}" --yes`, { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n✓ Compte « ${id} » prêt.`);

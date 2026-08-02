#!/usr/bin/env node
/**
 * Descarga los esquemas oficiales de Veri*Factu a `schemas/`.
 *
 *   node scripts/fetch-schemas.mjs            # descarga y verifica
 *   node scripts/fetch-schemas.mjs --check    # solo verifica lo ya vendorizado
 *
 * Los ficheros se guardan BYTE A BYTE como los publica la AEAT: no se parchean
 * en disco. `SuministroInformacion.xsd` importa `xmldsig-core-schema.xsd` por
 * HTTP y eso impide compilar el esquema sin red, pero la reescritura de ese
 * `schemaLocation` se hace EN MEMORIA en `tests/helpers/xsd.ts`. Así el sha256
 * de cada fichero sigue siendo comparable con el original de la AEAT, que es lo
 * que permite detectar que el esquema ha cambiado.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'schemas');

const AEAT =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/';

/** Fuentes. `tikeV1.0` es la ruta de descarga; el targetNamespace usa `tike` (no coinciden, es normal). */
const SOURCES = [
  { file: 'SuministroLR.xsd', url: AEAT + 'SuministroLR.xsd' },
  { file: 'SuministroInformacion.xsd', url: AEAT + 'SuministroInformacion.xsd' },
  { file: 'RespuestaSuministro.xsd', url: AEAT + 'RespuestaSuministro.xsd' },
  { file: 'ConsultaLR.xsd', url: AEAT + 'ConsultaLR.xsd' },
  { file: 'RespuestaConsultaLR.xsd', url: AEAT + 'RespuestaConsultaLR.xsd' },
  { file: 'SistemaFacturacion.wsdl', url: AEAT + 'SistemaFacturacion.wsdl' },
  { file: 'errores.properties', url: AEAT + 'errores.properties' },
  {
    file: 'xmldsig-core-schema.xsd',
    url: 'https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd',
    note: 'Copia del W3C. Sin ella SuministroInformacion.xsd no compila (import remoto).',
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Algunos despliegues de la AEAT presentan una cadena de certificación que
 * OpenSSL 3 rechaza por «CA signature digest algorithm too weak». Se intenta
 * primero la ruta normal y solo se relaja el nivel si esa falla.
 */
function download(url, { relaxed = false } = {}) {
  return new Promise((resolve, reject) => {
    const opts = relaxed ? { ciphers: 'DEFAULT@SECLEVEL=0' } : {};
    get(url, opts, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} en ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchOne(src) {
  try {
    return await download(src.url);
  } catch (err) {
    process.stderr.write(`  reintentando con SECLEVEL relajado (${err.code ?? err.message})\n`);
    return download(src.url, { relaxed: true });
  }
}

async function readChecksums() {
  const path = join(OUT, 'CHECKSUMS.txt');
  if (!existsSync(path)) return null;
  const map = new Map();
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const m = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  await mkdir(OUT, { recursive: true });
  const expected = await readChecksums();

  if (checkOnly && !expected) {
    process.stderr.write('No existe schemas/CHECKSUMS.txt. Ejecuta el script sin --check.\n');
    process.exit(1);
  }

  const results = [];
  let failed = false;

  for (const src of SOURCES) {
    const dest = join(OUT, src.file);
    let buf;

    if (checkOnly) {
      if (!existsSync(dest)) {
        process.stderr.write(`FALTA  ${src.file}\n`);
        failed = true;
        continue;
      }
      buf = await readFile(dest);
    } else {
      process.stdout.write(`descargando ${src.file}\n`);
      buf = await fetchOne(src);
      await writeFile(dest, buf);
    }

    const hash = sha256(buf);
    const previous = expected?.get(src.file);

    if (previous && previous !== hash) {
      process.stderr.write(
        `CAMBIADO  ${src.file}\n` +
          `   registrado: ${previous}\n` +
          `   actual:     ${hash}\n` +
          `   El esquema oficial ha cambiado. Revisa el diff antes de aceptarlo.\n`
      );
      failed = true;
    } else if (previous) {
      process.stdout.write(`ok  ${src.file}\n`);
    }

    results.push({ ...src, hash, bytes: buf.length });
  }

  if (checkOnly) {
    process.exit(failed ? 1 : 0);
  }

  await writeFile(
    join(OUT, 'CHECKSUMS.txt'),
    results.map((r) => `${r.hash}  ${r.file}`).join('\n') + '\n'
  );

  const fecha = process.env.SOURCE_DATE ?? new Date().toISOString().slice(0, 10);
  await writeFile(
    join(OUT, 'PROVENANCE.md'),
    `# Procedencia de los esquemas

Ficheros descargados **byte a byte** de la fuente oficial. No se modifican en disco:
el \`schemaLocation\` remoto de \`xmldsig-core-schema.xsd\` se reescribe **en memoria**
en \`tests/helpers/xsd.ts\`, para que estos \`sha256\` sigan siendo comparables con los
originales de la AEAT.

Regenerar con \`npm run schemas:fetch\`; verificar con \`npm run schemas:check\`.

| Fichero | Bytes | sha256 | Origen |
|---|---:|---|---|
${results
  .map((r) => `| \`${r.file}\` | ${r.bytes} | \`${r.hash.slice(0, 16)}…\` | ${r.url} |`)
  .join('\n')}

Descargados el ${fecha}.

## Notas

- La ruta de descarga es \`tikeV1.0\`, pero el \`targetNamespace\` de los esquemas
  es \`…/tike/cont/ws/…\`. **No coinciden**, y es lo esperado: no lo "corrijas".
- \`xmldsig-core-schema.xsd\` procede del W3C, no de la AEAT. Es necesaria porque
  \`SuministroInformacion.xsd\` la importa con una URL absoluta y sin ella el
  esquema no compila en un entorno sin red.
- \`errores.properties\` es el catálogo oficial de códigos de error. No participa
  en la validación; se vendoriza como referencia para la taxonomía de errores.
`
  );

  process.stdout.write(`\n${results.length} ficheros en schemas/\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});

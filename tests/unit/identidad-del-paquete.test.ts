/**
 * Identidad del paquete publicado.
 *
 * El nombre `verifactu` está ocupado en npm por un tercero desde 2024-01-30: una
 * sola versión de 223 bytes, sin descripción, sin repositorio y sin
 * dependencias. Publicar con ese nombre es **imposible**, y el `package.json`
 * lo declaraba igualmente, de modo que el fallo solo habría aparecido en el
 * momento de publicar, que es el peor momento posible.
 *
 * Se adopta un alcance de usuario. Y con eso aparece la trampa de los paquetes
 * con alcance: npm los publica como **privados por defecto**, así que sin
 * `publishConfig.access: "public"` el `npm publish` falla con un 402 pidiendo
 * una cuenta de pago —para un paquete que se quiere abierto—.
 *
 * El resto de los tests fija lo que se rompió una y otra vez durante la
 * auditoría: que la documentación afirme algo que el código no cumple. Si el
 * nombre cambia, las instrucciones de instalación tienen que cambiar con él.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  publishConfig?: { access?: string };
  repository?: { url?: string };
  homepage?: string;
  bugs?: { url?: string };
};

const README_ES = readFileSync(join(ROOT, 'README.md'), 'utf8');
const README_EN = readFileSync(join(ROOT, 'README.en.md'), 'utf8');

describe('Nombre del paquete', () => {
  it('no es «verifactu» a secas: ese nombre es de un tercero en npm', () => {
    expect(pkg.name).not.toBe('verifactu');
  });

  it('es el alcance elegido', () => {
    expect(pkg.name).toBe('@ramoncoroso/verifactu');
  });

  it('un paquete con alcance declara acceso público o npm lo publica privado', () => {
    // Sin esto, `npm publish` falla con 402 «Payment Required».
    if (pkg.name.startsWith('@')) {
      expect(pkg.publishConfig?.access).toBe('public');
    }
  });
});

describe('La documentación no puede divergir del nombre real', () => {
  it.each([
    ['README.md', README_ES],
    ['README.en.md', README_EN],
  ])('%s instala el paquete que de verdad se publica', (_f, readme) => {
    expect(readme).toContain(`npm install ${pkg.name}`);
  });

  it.each([
    ['README.md', README_ES],
    ['README.en.md', README_EN],
  ])('%s importa desde el paquete que de verdad se publica', (_f, readme) => {
    // Los ejemplos hacen `from '<nombre>'`; con el nombre viejo no compilarían
    // para nadie que instalase la librería.
    expect(readme).toContain(`from '${pkg.name}'`);
    expect(readme).not.toMatch(/from 'verifactu'/);
  });

  it.each([
    ['README.md', README_ES],
    ['README.en.md', README_EN],
  ])('%s ya no menciona el bloqueo, que está resuelto', (_f, readme) => {
    expect(readme).not.toMatch(/ocupado en npm|taken on npm/i);
  });
});

describe('Metadatos que npm usa para enlazar el paquete', () => {
  it('apuntan al repositorio real', () => {
    expect(pkg.repository?.url).toContain('ramoncoroso/verifactu');
    expect(pkg.homepage).toContain('ramoncoroso/verifactu');
    expect(pkg.bugs?.url).toContain('ramoncoroso/verifactu');
  });
});

describe('Qué viaja dentro del tarball', () => {
  const files = (pkg as unknown as { files?: string[] }).files ?? [];

  it('no redistribuye los esquemas de la AEAT ni el del W3C', () => {
    // Ningún módulo de `src/` los lee en tiempo de ejecución: solo se citan en
    // comentarios, y el único que abre los ficheros es el helper de tests. Ir
    // dentro del paquete significaba redistribuir documentos de la AEAT y el
    // `xmldsig-core-schema.xsd` del W3C bajo un paquete que se anuncia MIT, sin
    // que nadie que instale la librería los necesite.
    expect(files).not.toContain('schemas');
  });

  it('publica lo compilado', () => {
    expect(files).toContain('dist');
  });
});

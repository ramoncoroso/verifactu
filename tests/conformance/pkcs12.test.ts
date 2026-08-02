/**
 * PKCS#12 con cifrado heredado.
 *
 * Node 18+ va contra OpenSSL 3, cuyo proveedor por defecto **no** incluye RC2 ni
 * RC4. Las exportaciones antiguas de la FNMT usan `pbeWithSHA1And40BitRC2-CBC`,
 * así que un `.p12` perfectamente válido —y con la contraseña correcta— falla al
 * cargarse.
 *
 * Lo que hacía la librería era envolver el mensaje de OpenSSL en un
 * `CertificateError: Invalid certificate: Unsupported PKCS12 PFX data` con el
 * mismo código para los cuatro casos posibles. Al usuario le llegaba una frase
 * que no dice qué hacer y que no distingue su problema del de haberse
 * equivocado de contraseña.
 *
 * Y son perfectamente distinguibles. Medido en Node 22.22.1 / OpenSSL 3.5.5:
 *
 * | Caso | `err.code` | mensaje |
 * |---|---|---|
 * | heredado + contraseña CORRECTA | `ERR_CRYPTO_UNSUPPORTED_OPERATION` | `Unsupported PKCS12 PFX data` |
 * | heredado + contraseña incorrecta | — | `mac verify failure` |
 * | moderno + contraseña incorrecta | — | `mac verify failure` |
 * | bytes que no son PKCS#12 | — | `not enough data` |
 *
 * La distinción importa: `mac verify failure` es **exclusivamente** contraseña
 * incorrecta —el MAC se comprueba antes que el cifrado, por eso el heredado con
 * contraseña mala también lo da—. Confundirlos llevaría a decirle a alguien que
 * reexporte su certificado cuando lo único que pasa es que se equivocó de clave.
 *
 * Estos tests **no** mockean `node:tls`: cargan `.p12` reales.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { esPkcs12Heredado, validateCertificate } from '../../src/crypto/certificate.js';
import { CertificateError } from '../../src/errors/crypto-errors.js';

const CERTS = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/certs');
const CLAVE = 'test-password';

const leer = (n: string): Buffer => readFileSync(join(CERTS, n));

function errorDe(pfx: Buffer, password: string): Error {
  try {
    validateCertificate({ type: 'pfx', data: pfx, password });
  } catch (e) {
    return e as Error;
  }
  throw new Error('se esperaba un error y no lo hubo');
}

describe('PKCS#12 moderno', () => {
  it('carga sin error', () => {
    expect(() =>
      validateCertificate({ type: 'pfx', data: leer('moderno.p12'), password: CLAVE })
    ).not.toThrow();
  });
});

describe('PKCS#12 heredado (RC2-40) con la contraseña correcta', () => {
  const error = (): Error => errorDe(leer('heredado.p12'), CLAVE);

  it('se reconoce como cifrado heredado, no como certificado inválido genérico', () => {
    expect(error()).toBeInstanceOf(CertificateError);
    expect(error().message).toMatch(/heredado|RC2|legacy/i);
  });

  it('el mensaje NO culpa a la contraseña', () => {
    // Era el riesgo de tratar los dos casos igual.
    expect(error().message).not.toMatch(/contraseña incorrecta|wrong password/i);
  });

  it('el mensaje trae la salida recomendada: reexportar con cifrado moderno', () => {
    const m = error().message;
    expect(m).toContain('openssl pkcs12 -legacy');
    expect(m).toContain('-export');
    // El PEM intermedio lleva la clave privada SIN cifrar: borrarlo es parte de
    // la receta, no un adorno.
    expect(m).toMatch(/shred|rm -P/);
  });

  it('el mensaje trae también el paliativo, marcado como tal', () => {
    expect(error().message).toContain('--openssl-legacy-provider');
  });
});

describe('La forma del error depende de la versión de Node', () => {
  // El mismo `.p12`, tres respuestas distintas. Node 18 es el que rompió la
  // primera versión de la detección: devuelve la palabra «unsupported» a secas,
  // sin código. Estos vectores están medidos, no supuestos.
  it.each([
    ['Node 22.22.1 · OpenSSL 3.5.5', 'ERR_CRYPTO_UNSUPPORTED_OPERATION', 'Unsupported PKCS12 PFX data'],
    ['Node 20.20.2 · OpenSSL 3.0.19', 'ERR_CRYPTO_UNSUPPORTED_OPERATION', 'Unsupported PKCS12 PFX data'],
    ['Node 18.20.8 · OpenSSL 3.0.16', undefined, 'unsupported'],
  ])('%s se detecta', (_v, code, message) => {
    const e = Object.assign(new Error(message), code === undefined ? {} : { code });
    expect(esPkcs12Heredado(e)).toBe(true);
  });

  it.each(['mac verify failure', 'not enough data', 'unsupported certificate purpose'])(
    '«%s» NO se confunde con cifrado heredado',
    (message) => {
      expect(esPkcs12Heredado(new Error(message))).toBe(false);
    }
  );
});

describe('Contraseña incorrecta', () => {
  it.each(['moderno.p12', 'heredado.p12'])('%s lo dice sin rodeos', (fichero) => {
    const m = errorDe(leer(fichero), 'no-es-la-clave').message;
    expect(m).toMatch(/contraseña/i);
    // Y no manda a nadie a reexportar nada.
    expect(m).not.toContain('openssl pkcs12 -legacy');
  });
});

describe('Datos que no son un PKCS#12', () => {
  it('se distingue de los dos anteriores', () => {
    const m = errorDe(Buffer.from('esto no es un p12'), CLAVE).message;
    expect(m).not.toMatch(/contraseña/i);
    expect(m).not.toContain('openssl pkcs12 -legacy');
  });
});

describe('El camino real, que es donde el usuario se lo encuentra', () => {
  // `validateCertificate` no se invoca desde ningún punto de `src/`: el cliente
  // llama a `getTlsOptions()`, y el PKCS#12 no se parsea hasta que `https.request`
  // construye el contexto TLS —de forma síncrona—. Sin traducir ahí, todo el
  // diagnóstico anterior era inalcanzable y el usuario recibía un
  // `NetworkError: Request error: Unsupported PKCS12 PFX data`.
  it('un envío con un .p12 heredado falla con el mensaje accionable', async () => {
    const { VerifactuClient } = await import('../../src/client/verifactu-client.js');
    const client = new VerifactuClient({
      environment: 'sandbox',
      certificate: { type: 'pfx', data: leer('heredado.p12'), password: CLAVE },
      software: {
        name: 'verifactu-ts',
        developerTaxId: 'B99999999',
        version: '1.0.0',
        installationNumber: '001',
        systemType: 'S',
      },
      flowControl: false,
    });

    const error = await client
      .submitInvoice({
        operationType: 'A',
        issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
        recipients: [{ taxId: { type: 'NIF', value: 'A87654321' }, name: 'Cliente SA' }],
        invoiceType: 'F1',
        description: 'Servicios de prueba',
        id: { series: 'FC', number: '001', issueDate: new Date('2026-08-02T10:00:00Z') },
        taxBreakdown: { vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }] },
        totalAmount: 121,
      } as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CertificateError);
    expect((error as Error).message).toContain('openssl pkcs12 -legacy');
  });
});

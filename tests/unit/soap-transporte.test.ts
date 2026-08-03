/**
 * Transporte HTTP del cliente SOAP.
 *
 * Dos defectos, ambos de diagnóstico:
 *
 *  - **El código de estado no se miraba.** Un 403 del balanceador de la AEAT —el
 *    que sale cuando el certificado no está autorizado para el NIF— llega con un
 *    cuerpo HTML. Se parseaba «bien», la respuesta se resolvía con éxito, y el
 *    fallo aparecía tres capas más arriba como «Invalid response: missing
 *    RespuestaRegFactuSistemaFacturacion»: un error de negocio inventado para un
 *    problema de credenciales. Y peor: un 503 —que la AEAT devuelve cuando el
 *    servicio está saturado y que **sí** hay que reintentar— tampoco se
 *    distinguía, así que nunca se reintentaba.
 *
 *  - **No se negociaba compresión.** Una consulta paginada trae 10.000 registros;
 *    sin `Accept-Encoding` viajan varios MB de XML por cada página.
 *
 * La sutileza está en que un SOAPFault legítimo viaja con HTTP 500 (SOAP 1.1,
 * §6.2). Comprobar el estado antes de buscar el Fault convertiría todos los
 * faults en errores HTTP opacos, perdiendo el código de la AEAT.
 */

import { EventEmitter } from 'node:events';
import { gzipSync, deflateSync } from 'node:zlib';

import * as https from 'node:https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  sendSoapRequest,
  type SoapRequestOptions,
} from '../../src/client/soap-client.js';
import { HttpStatusError, SoapError } from '../../src/errors/network-errors.js';
import { isRetryableError } from '../../src/client/retry.js';
import type { TlsOptions } from '../../src/crypto/certificate.js';

vi.mock('node:https', () => ({ request: vi.fn() }));

const SOBRE = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ok/></soapenv:Body></soapenv:Envelope>`;

const PAGINA_403 = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">
<html><head><title>403 Forbidden</title></head>
<body><h1>Forbidden</h1><p>El certificado no est&aacute; autorizado.</p></body></html>`;

const tls: TlsOptions = { pfx: Buffer.from('pfx'), passphrase: 'x' };

const mockRequest = https.request as unknown as ReturnType<typeof vi.fn>;

let mockReq: EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function opciones(extra: Partial<SoapRequestOptions> = {}): SoapRequestOptions {
  return {
    url: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    soapAction: '""',
    body: '<x/>',
    tls,
    ...extra,
  };
}

/** Programa la respuesta que devolverá el `https.request` mockeado. */
function responder(
  cuerpo: Buffer | string,
  init: { statusCode?: number; headers?: Record<string, string> } = {}
): void {
  const res = Object.assign(new EventEmitter(), {
    statusCode: init.statusCode ?? 200,
    headers: init.headers ?? { 'content-type': 'text/xml' },
  });
  mockRequest.mockImplementation((_o: unknown, cb: (r: typeof res) => void) => {
    process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        res.emit('data', Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo));
        res.emit('end');
      });
    });
    return mockReq;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReq = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('Código de estado HTTP', () => {
  it('un 403 con página HTML lanza un error que dice 403, no un error de negocio', async () => {
    responder(PAGINA_403, { statusCode: 403, headers: { 'content-type': 'text/html' } });

    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).statusCode).toBe(403);
    expect((error as Error).message).toContain('403');
  });

  it('un 403 no se reintenta: reenviarlo no arregla un certificado no autorizado', async () => {
    responder(PAGINA_403, { statusCode: 403 });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(isRetryableError(error)).toBe(false);
  });

  it.each([429, 500, 502, 503, 504])('un %i sí se reintenta', async (codigo) => {
    responder('<html><body>error</body></html>', { statusCode: codigo });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpStatusError);
    expect(isRetryableError(error)).toBe(true);
  });

  it.each([400, 401, 404, 413])('un %i no se reintenta', async (codigo) => {
    responder('<html><body>error</body></html>', { statusCode: codigo });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(isRetryableError(error)).toBe(false);
  });

  it('respeta el Retry-After que envíe el servidor', async () => {
    responder('<html/>', { statusCode: 503, headers: { 'retry-after': '120' } });
    const error = (await sendSoapRequest(opciones()).catch((e: unknown) => e)) as HttpStatusError;
    expect(error.retry?.retryAfterMs).toBe(120_000);
  });

  it('el cuerpo de la respuesta se conserva en el error para poder diagnosticar', async () => {
    responder(PAGINA_403, { statusCode: 403 });
    const error = (await sendSoapRequest(opciones()).catch((e: unknown) => e)) as HttpStatusError;
    expect(error.responseBody).toContain('Forbidden');
  });

  it('trunca cuerpos enormes en el mensaje del error', async () => {
    responder('x'.repeat(50_000), { statusCode: 500 });
    const error = (await sendSoapRequest(opciones()).catch((e: unknown) => e)) as HttpStatusError;
    expect(error.message.length).toBeLessThan(2_000);
  });
});

describe('SOAPFault sobre HTTP 500', () => {
  // SOAP 1.1 §6.2 exige HTTP 500 para los faults. Si el estado se comprobara
  // antes de buscar el Fault, se perdería el código de la AEAT.
  const FAULT = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>
<soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema.</faultstring></soapenv:Fault>
</soapenv:Body></soapenv:Envelope>`;

  it('un fault con HTTP 500 sigue siendo SoapError, no HttpStatusError', async () => {
    responder(FAULT, { statusCode: 500 });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SoapError);
    expect((error as SoapError).aeatCode).toBe('4102');
  });

  it('un fault de cliente no se reintenta aunque venga con un 500 reintentable', async () => {
    responder(FAULT, { statusCode: 500 });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(isRetryableError(error)).toBe(false);
  });

  it('un fault de servidor con HTTP 500 sí se reintenta', async () => {
    responder(FAULT.replace('soapenv:Client', 'soapenv:Server'), { statusCode: 500 });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(isRetryableError(error)).toBe(true);
  });
});

describe('Compresión', () => {
  it('anuncia gzip y deflate en la petición', async () => {
    let cabeceras: Record<string, string> = {};
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });
    mockRequest.mockImplementation((o: Record<string, unknown>, cb: (r: typeof res) => void) => {
      cabeceras = o['headers'] as Record<string, string>;
      process.nextTick(() => {
        cb(res);
        process.nextTick(() => {
          res.emit('data', Buffer.from(SOBRE));
          res.emit('end');
        });
      });
      return mockReq;
    });

    await sendSoapRequest(opciones());

    expect(cabeceras['Accept-Encoding']).toMatch(/gzip/);
  });

  it('descomprime una respuesta gzip', async () => {
    responder(gzipSync(Buffer.from(SOBRE, 'utf8')), {
      headers: { 'content-encoding': 'gzip' },
    });
    const r = await sendSoapRequest(opciones());
    expect(r.body).toContain('<ok/>');
    expect(r.xml.name).toBe('Envelope');
  });

  it('descomprime una respuesta deflate', async () => {
    responder(deflateSync(Buffer.from(SOBRE, 'utf8')), {
      headers: { 'content-encoding': 'deflate' },
    });
    const r = await sendSoapRequest(opciones());
    expect(r.body).toContain('<ok/>');
  });

  it('ignora content-encoding: identity', async () => {
    responder(SOBRE, { headers: { 'content-encoding': 'identity' } });
    const r = await sendSoapRequest(opciones());
    expect(r.body).toContain('<ok/>');
  });

  it('un gzip corrupto lanza un error de red, no un error de parseo de XML', async () => {
    responder(Buffer.from('esto no es gzip'), { headers: { 'content-encoding': 'gzip' } });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/descomprimir|decompress/i);
  });

  it('un UTF-8 partido entre dos chunks no se corrompe', async () => {
    // Concatenar `chunk.toString()` por trozo rompe los multibyte a caballo
    // entre dos paquetes TCP. Ocurre con nombres como «Construcciones Peña».
    const xml = `<?xml version="1.0" encoding="UTF-8"?><r><a>Peña Ñandú €</a></r>`;
    const buf = Buffer.from(xml, 'utf8');
    const corte = buf.indexOf(Buffer.from('ñ', 'utf8')) + 1; // parte la 'ñ'
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });
    mockRequest.mockImplementation((_o: unknown, cb: (r: typeof res) => void) => {
      process.nextTick(() => {
        cb(res);
        process.nextTick(() => {
          res.emit('data', buf.subarray(0, corte));
          res.emit('data', buf.subarray(corte));
          res.emit('end');
        });
      });
      return mockReq;
    });

    const r = await sendSoapRequest(opciones());
    expect(r.body).toContain('Peña Ñandú €');
  });
});

describe('Límite de tamaño de respuesta', () => {
  it('aborta si la respuesta supera el máximo en vez de agotar la memoria', async () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });
    mockRequest.mockImplementation((_o: unknown, cb: (r: typeof res) => void) => {
      process.nextTick(() => {
        cb(res);
        process.nextTick(() => {
          res.emit('data', Buffer.alloc(2048));
          res.emit('data', Buffer.alloc(2048));
        });
      });
      return mockReq;
    });

    const error = await sendSoapRequest(opciones({ maxResponseBytes: 1024 })).catch(
      (e: unknown) => e
    );

    expect((error as Error).message).toMatch(/1024|demasiado grande|too large/i);
    // Y se corta la conexión: seguir leyendo un cuerpo que ya se descartó es
    // justo lo que convierte el problema en un agotamiento de memoria.
    expect(mockReq.destroy).toHaveBeenCalled();
  });

  it('el máximo por defecto deja pasar una consulta paginada completa', async () => {
    // Una página de ConsultaFactuSistemaFacturacion son 10.000 registros.
    const relleno = `<r>${'<a>x</a>'.repeat(200_000)}</r>`;
    responder(relleno);
    const r = await sendSoapRequest(opciones());
    expect(r.body.length).toBeGreaterThan(1_000_000);
  });
});

describe('Cuerpo de la petición', () => {
  it('el Content-Length coincide con los bytes enviados, no con los caracteres', async () => {
    let cabeceras: Record<string, string | number> = {};
    const cuerpo = '<r><a>Peña &amp; Ñandú €</a></r>';
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });
    mockRequest.mockImplementation((o: Record<string, unknown>, cb: (r: typeof res) => void) => {
      cabeceras = o['headers'] as Record<string, string | number>;
      process.nextTick(() => {
        cb(res);
        process.nextTick(() => {
          res.emit('data', Buffer.from(SOBRE));
          res.emit('end');
        });
      });
      return mockReq;
    });

    await sendSoapRequest(opciones({ body: cuerpo }));

    expect(cabeceras['Content-Length']).toBe(Buffer.byteLength(cuerpo, 'utf8'));
    expect(cabeceras['Content-Length']).not.toBe(cuerpo.length);
  });
});

describe('Redirecciones · el 302 con el que la AEAT pide certificado', () => {
  // Medido contra el servicio real de preproducción el 2026-08-03: sin
  // certificado de cliente —o con uno que no reconoce, comprobado con un
  // autofirmado— `prewww1.aeat.es` responde
  //
  //   HTTP/1.0 302 Moved Temporarily
  //   Location: https://sede.agenciatributaria.gob.es/Sede/errores/erro4033.html
  //
  // y esa página dice literalmente: «403 Error de identificación. No se detecta
  // certificado electrónico o no se ha seleccionado correctamente.»
  //
  // El cuerpo del 302 viene vacío, así que la librería intentaba parsearlo y
  // devolvía «Failed to parse SOAP response». El fallo de integración MÁS
  // COMÚN —falta el certificado— se presentaba como un problema de XML. Es el
  // mismo defecto de #30 por la vía del redirect, que nadie había tocado porque
  // exige hablar con el servicio real.
  const REDIRECCION_AEAT = 'https://sede.agenciatributaria.gob.es/Sede/errores/erro4033.html';

  it('un 302 no se intenta parsear como XML', async () => {
    responder('', { statusCode: 302, headers: { location: REDIRECCION_AEAT } });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as Error).message).not.toMatch(/parse/i);
  });

  it('el mensaje nombra el certificado, que es la causa', async () => {
    responder('', { statusCode: 302, headers: { location: REDIRECCION_AEAT } });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/certificado/i);
  });

  it('no se reintenta: reenviarlo no consigue un certificado', async () => {
    responder('', { statusCode: 302, headers: { location: REDIRECCION_AEAT } });
    const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
    expect(isRetryableError(error)).toBe(false);
  });

  it.each([301, 302, 303, 307, 308])(
    'un %i cualquiera también es un error: un servicio SOAP no redirige',
    async (codigo) => {
      responder('', { statusCode: codigo, headers: { location: 'https://otro.example/' } });
      const error = await sendSoapRequest(opciones()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpStatusError);
      expect((error as HttpStatusError).statusCode).toBe(codigo);
      // Seguir la redirección reenviaría el cuerpo firmado a otro host.
      expect((error as Error).message).toContain('otro.example');
    }
  );

  it('un 200 normal sigue funcionando', async () => {
    responder(SOBRE);
    const r = await sendSoapRequest(opciones());
    expect(r.statusCode).toBe(200);
  });
});

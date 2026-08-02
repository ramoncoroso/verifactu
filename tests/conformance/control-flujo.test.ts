/**
 * Control de flujo y envío por lotes: art. 16.2 de la OM HAC/1177/2024.
 *
 * > «c) Para poder realizar el siguiente envío, el sistema informático deberá
 * > esperar a que transcurran "t" segundos desde el anterior envío **o** deberá
 * > esperar a tener acumulados un número de registros de facturación igual al
 * > límite establecido en el diseño de registro para cada envío, **la
 * > circunstancia que ocurra primero**.»
 *
 * Dos hechos firmes: *t* vale **inicialmente** 60 s y la AEAT devuelve el valor
 * vigente en `TiempoEsperaEnvio`, obligatorio en toda respuesta según el
 * `RespuestaSuministro.xsd`. El máximo por envío son **1000** registros
 * (`SuministroLR.xsd`, `maxOccurs="1000"`).
 *
 * La librería no implementaba nada de esto: descartaba `TiempoEsperaEnvio` y
 * enviaba exactamente un `RegistroFactura` por petición, sin API de lote. Con
 * ese diseño, un cliente que respetase el art. 16.2 **nunca** podía usar la
 * rama de los 1000 registros y su caudal quedaba en 1 factura cada *t*
 * segundos.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubmissionPacer } from '../../src/client/pacer.js';
import { VerifactuClient } from '../../src/client/verifactu-client.js';
import {
  INITIAL_WAIT_SECONDS,
  MAX_RECORDS_PER_SUBMISSION,
} from '../../src/client/endpoints.js';
import { ConnectionError } from '../../src/errors/network-errors.js';
import type { Invoice } from '../../src/models/invoice.js';
import type { SoftwareInfo } from '../../src/models/party.js';
import { parseXml, type XmlNode } from '../../src/xml/parser.js';
import { buildRespuestaSuministro, wrapSoapResponse } from '../fixtures/aeat-respuesta.js';

/** Reloj y espera falsos: el tiempo avanza solo cuando alguien duerme. */
interface RelojFalso {
  readonly dormidas: number[];
  now(): number;
  sleep(ms: number): Promise<void>;
  avanzar(ms: number): void;
}

function relojFalso(): RelojFalso {
  let ahora = 1_000_000;
  const dormidas: number[] = [];
  return {
    dormidas,
    now: (): number => ahora,
    sleep: (ms: number): Promise<void> => {
      dormidas.push(ms);
      ahora += ms;
      return Promise.resolve();
    },
    avanzar: (ms: number): void => {
      ahora += ms;
    },
  };
}

describe('SubmissionPacer', () => {
  it('el primer envío no espera', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ now: r.now, sleep: r.sleep });
    await p.acquire();
    expect(r.dormidas).toEqual([]);
  });

  it('el valor inicial es el de la norma: 60 segundos', () => {
    expect(INITIAL_WAIT_SECONDS).toBe(60);
    expect(new SubmissionPacer().waitSeconds).toBe(60);
  });

  it('el segundo envío espera lo que falte de «t»', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    await p.acquire();
    r.avanzar(20_000); // el envío y su respuesta tardan 20 s
    await p.acquire();
    expect(r.dormidas).toEqual([40_000]);
  });

  // El literal dice «desde el anterior ENVÍO». Contar desde la respuesta regala
  // al servidor su tiempo de proceso y estira la cadencia real.
  it('el reloj cuenta desde el envío, no desde la respuesta', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    await p.acquire();
    r.avanzar(59_000); // una respuesta lentísima
    await p.acquire();
    // Si contara desde la respuesta habría dormido 60 s enteros.
    expect(r.dormidas).toEqual([1_000]);
  });

  it('el reloj corre igual aunque el envío falle', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    await p.acquire();
    // El envío revienta; no se le devuelve el hueco a nadie.
    r.avanzar(10_000);
    await p.acquire();
    expect(r.dormidas).toEqual([50_000]);
  });

  it('aplica el TiempoEsperaEnvio que devuelve la AEAT', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ now: r.now, sleep: r.sleep });
    await p.acquire();
    p.updateFromResponse(5);
    expect(p.waitSeconds).toBe(5);
    await p.acquire();
    expect(r.dormidas).toEqual([5_000]);
  });

  it.each([undefined, NaN, Infinity, -1])('ignora un TiempoEsperaEnvio absurdo (%s)', (valor) => {
    const p = new SubmissionPacer({ waitSeconds: 30 });
    p.updateFromResponse(valor);
    expect(p.waitSeconds).toBe(30);
  });

  it('acepta un 0: la AEAT puede levantar la limitación', () => {
    const p = new SubmissionPacer({ waitSeconds: 60 });
    p.updateFromResponse(0);
    expect(p.waitSeconds).toBe(0);
  });

  it('dos envíos concurrentes se serializan', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    const orden: number[] = [];
    await Promise.all([
      p.acquire().then(() => orden.push(1)),
      p.acquire().then(() => orden.push(2)),
      p.acquire().then(() => orden.push(3)),
    ]);
    expect(orden).toEqual([1, 2, 3]);
    // El primero pasa de largo; los otros dos esperan su turno completo.
    expect(r.dormidas).toEqual([60_000, 60_000]);
  });

  it('el estado se puede persistir y rehidratar', async () => {
    const r = relojFalso();
    const p1 = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    await p1.acquire();
    const guardado = p1.getState();
    expect(guardado.lastSubmissionAt).toBe(r.now());
    expect(guardado.waitSeconds).toBe(60);

    // Un proceso que reinicia: sin rehidratar, enviaría de inmediato.
    r.avanzar(10_000);
    const p2 = new SubmissionPacer({ state: guardado, now: r.now, sleep: r.sleep });
    await p2.acquire();
    expect(r.dormidas).toEqual([50_000]);
  });

  it('msUntilNextSlot informa sin consumir el hueco', async () => {
    const r = relojFalso();
    const p = new SubmissionPacer({ waitSeconds: 60, now: r.now, sleep: r.sleep });
    expect(p.msUntilNextSlot()).toBe(0);
    await p.acquire();
    expect(p.msUntilNextSlot()).toBe(60_000);
    r.avanzar(45_000);
    expect(p.msUntilNextSlot()).toBe(15_000);
    expect(r.dormidas).toEqual([]);
  });
});

const SOFTWARE: SoftwareInfo = {
  name: 'verifactu-ts',
  developerTaxId: 'B99999999',
  version: '1.0.0',
  installationNumber: '001',
  systemType: 'S',
};

function factura(numero: string): Invoice {
  return {
    operationType: 'A',
    issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
    recipients: [{ taxId: { type: 'NIF', value: 'A87654321' }, name: 'Cliente SA' }],
    invoiceType: 'F1',
    description: 'Servicios de prueba',
    id: { series: 'FC', number: numero, issueDate: new Date('2026-08-02T10:00:00Z') },
    taxBreakdown: { vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }] },
    totalAmount: 121,
  } as unknown as Invoice;
}

let enviados: string[];
let soap: { send: ReturnType<typeof vi.fn> };

/** Respuesta con una línea correcta por registro enviado. */
function respuesta(
  registros: number,
  tiempoEspera?: number
): { statusCode: number; body: string; xml: XmlNode; headers: Record<string, string> } {
  const body = wrapSoapResponse(
    buildRespuestaSuministro({
      estadoEnvio: 'Correcto',
      ...(tiempoEspera === undefined ? {} : { tiempoEsperaEnvio: String(tiempoEspera) }),
      lineas: Array.from({ length: registros }, (_, i) => ({
        estadoRegistro: 'Correcto' as const,
        numSerie: `FC${String(i + 1).padStart(3, '0')}`,
      })),
    })
  );
  return { statusCode: 200, body, xml: parseXml(body), headers: {} };
}

function cliente(config: Record<string, unknown> = {}): VerifactuClient {
  const c = new VerifactuClient({
    environment: 'sandbox',
    certificate: { type: 'pfx', data: Buffer.from('x'), password: 'x' },
    software: SOFTWARE,
    ...config,
  } as never);
  (c as unknown as { soapClient: unknown }).soapClient = soap;
  return c;
}

beforeEach(() => {
  enviados = [];
  soap = {
    send: vi.fn((_u: string, _a: string, body: string) => {
      enviados.push(body);
      return Promise.resolve(respuesta(1));
    }),
  };
});

describe('El cliente respeta la cadencia', () => {
  it('sin control de flujo explícito, el segundo envío espera 60 s', async () => {
    const r = relojFalso();
    const c = cliente({ flowControl: { now: r.now, sleep: r.sleep } });
    await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));
    expect(r.dormidas).toEqual([60_000]);
  });

  it('se puede desactivar para quien lo gestione por su cuenta', async () => {
    const r = relojFalso();
    const c = cliente({ flowControl: false });
    await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));
    expect(r.dormidas).toEqual([]);
    expect(enviados).toHaveLength(2);
  });

  it('el TiempoEsperaEnvio de la respuesta gobierna el siguiente envío', async () => {
    const r = relojFalso();
    soap.send = vi.fn((_u: string, _a: string, b: string) => {
      enviados.push(b);
      return Promise.resolve(respuesta(1, 2));
    });
    const c = cliente({ flowControl: { now: r.now, sleep: r.sleep } });
    await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));
    expect(r.dormidas).toEqual([2_000]);
  });

  it('un envío fallido no exime de esperar', async () => {
    const r = relojFalso();
    soap.send = vi
      .fn()
      .mockRejectedValueOnce(new ConnectionError('prewww1.aeat.es'))
      .mockImplementation((_u: string, _a: string, b: string) => {
        enviados.push(b);
        return Promise.resolve(respuesta(1));
      });
    const c = cliente({ flowControl: { now: r.now, sleep: r.sleep } });
    await expect(c.submitInvoice(factura('001'))).rejects.toThrow();
    await c.submitInvoice(factura('002'));
    expect(r.dormidas).toEqual([60_000]);
  });

  it('el estado del pacer se expone y se puede rehidratar', async () => {
    const r = relojFalso();
    const c1 = cliente({ flowControl: { now: r.now, sleep: r.sleep } });
    await c1.submitInvoice(factura('001'));
    const guardado = c1.getFlowControlState();
    expect(guardado.lastSubmissionAt).toBeGreaterThan(0);

    const c2 = cliente({ flowControl: { state: guardado, now: r.now, sleep: r.sleep } });
    await c2.submitInvoice(factura('002'));
    expect(r.dormidas).toEqual([60_000]);
  });
});

describe('Envío por lotes', () => {
  it('un lote viaja en UNA sola petición', async () => {
    soap.send = vi.fn((_u: string, _a: string, b: string) => {
      enviados.push(b);
      return Promise.resolve(respuesta(3));
    });
    const c = cliente({ flowControl: false });
    await c.submitInvoices([factura('001'), factura('002'), factura('003')]);
    expect(soap.send).toHaveBeenCalledTimes(1);
    expect((enviados[0]!.match(/<sfLR:RegistroFactura>/g) ?? []).length).toBe(3);
  });

  it('devuelve un resultado por factura, en el mismo orden', async () => {
    soap.send = vi.fn(() => Promise.resolve(respuesta(3)));
    const c = cliente({ flowControl: false });
    const r = await c.submitInvoices([factura('001'), factura('002'), factura('003')]);
    expect(r.results).toHaveLength(3);
    expect(r.results.map((x) => x.invoice.id.number)).toEqual(['001', '002', '003']);
    expect(r.results.every((x) => x.accepted)).toBe(true);
  });

  it('los registros del lote se encadenan entre sí', async () => {
    soap.send = vi.fn((_u: string, _a: string, b: string) => {
      enviados.push(b);
      return Promise.resolve(respuesta(2));
    });
    const c = cliente({ flowControl: false });
    const r = await c.submitInvoices([factura('001'), factura('002')]);
    // El segundo registro del mismo mensaje referencia la huella del primero.
    expect(enviados[0]).toContain(`Huella>${r.results[0]!.invoice.hash}<`);
    expect(c.getChainState().recordCount).toBe(2);
    expect(c.getChainState().lastHash).toBe(r.results[1]!.invoice.hash);
  });

  it('expone el estado global y el tiempo de espera del envío', async () => {
    soap.send = vi.fn(() => Promise.resolve(respuesta(2, 30)));
    const c = cliente({ flowControl: false });
    const r = await c.submitInvoices([factura('001'), factura('002')]);
    expect(r.estadoEnvio).toBe('Correcto');
    expect(r.tiempoEsperaEnvioSeconds).toBe(30);
  });

  it('el máximo por envío es el del XSD', () => {
    expect(MAX_RECORDS_PER_SUBMISSION).toBe(1000);
  });

  it('rechaza un lote de más de 1000 registros antes de tocar la cadena', async () => {
    const c = cliente({ flowControl: false });
    const antes = c.getChainState().recordCount;
    const muchas = Array.from({ length: 1001 }, (_, i) => factura(String(i + 1)));
    await expect(c.submitInvoices(muchas)).rejects.toThrow(/1000/);
    expect(c.getChainState().recordCount).toBe(antes);
    expect(soap.send).not.toHaveBeenCalled();
  });

  it('rechaza un lote vacío', async () => {
    const c = cliente({ flowControl: false });
    await expect(c.submitInvoices([])).rejects.toThrow();
  });

  it('una factura inválida no deja el lote a medias', async () => {
    const c = cliente({ flowControl: false });
    const antes = c.getChainState().recordCount;
    const invalida = { ...factura('002'), description: '' } as Invoice;
    await expect(c.submitInvoices([factura('001'), invalida])).rejects.toThrow(
      /DescripcionOperacion/
    );
    // Ni un solo registro del lote entra en la cadena.
    expect(c.getChainState().recordCount).toBe(antes);
    expect(soap.send).not.toHaveBeenCalled();
  });

  it('un lote consume UN hueco de cadencia, no uno por factura', async () => {
    const r = relojFalso();
    soap.send = vi.fn(() => Promise.resolve(respuesta(3)));
    const c = cliente({ flowControl: { now: r.now, sleep: r.sleep } });
    await c.submitInvoices([factura('001'), factura('002'), factura('003')]);
    // Es la razón de ser del lote: 3 facturas sin esperar 120 s.
    expect(r.dormidas).toEqual([]);
  });
});

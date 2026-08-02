/**
 * Cadena de registros: generación, reintento y encadenamiento tras rechazo.
 *
 * Este fichero fija el comportamiento **normativo**, que es contraintuitivo y ya
 * se documentó mal una vez:
 *
 *  - La cadena **debe avanzar** aunque la AEAT rechace el registro. Es local, se
 *    genera al expedir la factura, y un registro rechazado permanece en ella: su
 *    huella ya va impresa en el QR de una factura probablemente entregada, y
 *    suprimir un RF generado es lo que prohíben los arts. 7 y 10 del RRSIF. El
 *    remedio ante un rechazo es un alta de subsanación, no rehacer el anterior.
 *
 *  - El defecto real es el contrario: el reintento **regeneraba** el registro con
 *    un instante nuevo, produciendo dos huellas distintas para la misma factura
 *    justo cuando el primer envío pudo haber llegado.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VerifactuClient } from '../../src/client/verifactu-client.js';
import { ConnectionError } from '../../src/errors/network-errors.js';
import type { Invoice } from '../../src/models/invoice.js';
import type { SoftwareInfo } from '../../src/models/party.js';
import { parseXml } from '../../src/xml/parser.js';
import { buildRespuestaSuministro, wrapSoapResponse } from '../fixtures/aeat-respuesta.js';

const SOFTWARE: SoftwareInfo = {
  name: 'verifactu-ts',
  developerTaxId: 'B99999999',
  version: '1.0.0',
  installationNumber: '001',
  systemType: 'S',
};

function factura(numero = '001'): Invoice {
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

function respuesta(estado: 'Correcto' | 'Incorrecto' = 'Correcto', codigo?: number) {
  const body = wrapSoapResponse(
    buildRespuestaSuministro({
      estadoEnvio: estado === 'Correcto' ? 'Correcto' : 'Incorrecto',
      lineas: [
        {
          estadoRegistro: estado,
          ...(codigo === undefined ? {} : { codigoError: codigo }),
        },
      ],
    })
  );
  return { statusCode: 200, body, xml: parseXml(body), headers: {} };
}

let enviados: string[];
let soap: { send: ReturnType<typeof vi.fn> };

function cliente(): VerifactuClient {
  const c = new VerifactuClient({
    environment: 'sandbox',
    certificate: { type: 'pfx', data: Buffer.from('x'), password: 'x' },
    software: SOFTWARE,
  });
  (c as unknown as { soapClient: unknown }).soapClient = soap;
  return c;
}

beforeEach(() => {
  enviados = [];
  soap = {
    send: vi.fn((_url: string, _action: string, body: string) => {
      enviados.push(body);
      return Promise.resolve(respuesta());
    }),
  };
});

describe('Reintento · se reenvían los mismos bytes', () => {
  it('dos intentos envían un cuerpo byte a byte idéntico', async () => {
    let intento = 0;
    soap.send = vi.fn((_u: string, _a: string, body: string) => {
      enviados.push(body);
      intento++;
      return intento === 1
        ? Promise.reject(new ConnectionError('prewww1.aeat.es'))
        : Promise.resolve(respuesta());
    });

    const c = cliente();
    await c.submitInvoiceWithRetry(factura(), { initialDelayMs: 1100, maxRetries: 1 });

    expect(enviados).toHaveLength(2);
    // El defecto: `submitInvoice` ejecutaba `new Date()` en cada reintento, y
    // como FechaHoraHusoGenRegistro entra en la huella, el segundo intento
    // enviaba un registro DISTINTO. Con un retardo de 1100 ms el reintento cruza
    // frontera de segundo, que es la condición que lo dispara.
    expect(enviados[0]).toBe(enviados[1]);
  }, 20000);

  it('la huella no cambia entre intentos', async () => {
    let intento = 0;
    soap.send = vi.fn((_u: string, _a: string, body: string) => {
      enviados.push(body);
      intento++;
      return intento === 1
        ? Promise.reject(new ConnectionError('prewww1.aeat.es'))
        : Promise.resolve(respuesta());
    });

    const c = cliente();
    await c.submitInvoiceWithRetry(factura(), { initialDelayMs: 1100, maxRetries: 1 });

    const huellas = enviados.map((b) => /Huella>([0-9A-F]{64})</.exec(b)?.[1]);
    expect(huellas[0]).toBe(huellas[1]);
    expect(huellas[0]).toMatch(/^[0-9A-F]{64}$/);
  }, 20000);

  it('un reintento no consume dos posiciones de la cadena', async () => {
    let intento = 0;
    soap.send = vi.fn((_u: string, _a: string, body: string) => {
      enviados.push(body);
      intento++;
      return intento === 1
        ? Promise.reject(new ConnectionError('prewww1.aeat.es'))
        : Promise.resolve(respuesta());
    });

    const c = cliente();
    const antes = c.getChainState().recordCount;
    await c.submitInvoiceWithRetry(factura(), { initialDelayMs: 1100, maxRetries: 1 });
    expect(c.getChainState().recordCount).toBe(antes + 1);
  }, 20000);
});

describe('Rechazo · la cadena NO retrocede', () => {
  it('el estado de la cadena avanza aunque la AEAT rechace', async () => {
    soap.send = vi.fn((_u: string, _a: string, body: string) => {
      enviados.push(body);
      return Promise.resolve(respuesta('Incorrecto', 1103));
    });

    const c = cliente();
    const antes = c.getChainState();
    const r = await c.submitInvoice(factura());

    expect(r.accepted).toBe(false);
    expect(r.state).toBe('Incorrecto');
    // Revertir sería una no conformidad: el RF ya está generado y su huella
    // impresa. El remedio normativo es un alta de subsanación.
    expect(c.getChainState().recordCount).toBe(antes.recordCount + 1);
    expect(c.getChainState().lastHash).toBe(r.invoice.hash);
  });

  it('la factura siguiente encadena contra la rechazada', async () => {
    soap.send = vi
      .fn()
      .mockImplementationOnce((_u: string, _a: string, b: string) => {
        enviados.push(b);
        return Promise.resolve(respuesta('Incorrecto', 1103));
      })
      .mockImplementationOnce((_u: string, _a: string, b: string) => {
        enviados.push(b);
        return Promise.resolve(respuesta());
      });

    const c = cliente();
    const primera = await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));

    // El segundo envío referencia la huella del registro rechazado.
    expect(enviados[1]).toContain('RegistroAnterior');
    expect(enviados[1]).toContain(`Huella>${primera.invoice.hash}<`);
  });
});

describe('Encadenamiento', () => {
  it('el primer registro no lleva RegistroAnterior', async () => {
    const c = cliente();
    await c.submitInvoice(factura('001'));
    expect(enviados[0]).toContain('PrimerRegistro>S<');
    expect(enviados[0]).not.toContain('RegistroAnterior');
  });

  it('el segundo lleva RegistroAnterior y no PrimerRegistro', async () => {
    const c = cliente();
    await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));
    expect(enviados[1]).toContain('RegistroAnterior');
    expect(enviados[1]).not.toContain('PrimerRegistro');
  });

  it('RegistroAnterior lleva el NIF del emisor, que el XSD exige', async () => {
    const c = cliente();
    await c.submitInvoice(factura('001'));
    await c.submitInvoice(factura('002'));
    const anterior = /<[^>]*RegistroAnterior>([\s\S]*?)<\/[^>]*RegistroAnterior>/.exec(
      enviados[1]!
    )?.[1];
    expect(anterior).toContain('IDEmisorFactura>B12345678<');
    expect(anterior).toContain('NumSerieFactura>FC001<');
  });
});

describe('Subsanación · el remedio normativo tras un rechazo', () => {
  it('tras un rechazo, RechazoPrevio es X porque el registro no consta en la AEAT', async () => {
    const { datosSubsanacionTrasRechazo } = await import('../../src/crypto/chain.js');
    expect(datosSubsanacionTrasRechazo()).toEqual({ subsanacion: 'S', rechazoPrevio: 'X' });
  });

  it('tras una aceptación con errores, RechazoPrevio es N', async () => {
    const { datosSubsanacionTrasAceptacion } = await import('../../src/crypto/chain.js');
    expect(datosSubsanacionTrasAceptacion()).toEqual({ subsanacion: 'S', rechazoPrevio: 'N' });
  });
});

describe('Estado de la cadena · rehidratable', () => {
  it('conserva el NIF del emisor, que RegistroAnterior exige', async () => {
    const c = cliente();
    await c.submitInvoice(factura('001'));
    expect(c.getChainState().lastIssuerNif).toBe('B12345678');
  });

  it('rehidratar el estado permite seguir encadenando', async () => {
    const c1 = cliente();
    await c1.submitInvoice(factura('001'));
    const guardado = c1.getChainState();

    enviados = [];
    const c2 = new VerifactuClient({
      environment: 'sandbox',
      certificate: { type: 'pfx', data: Buffer.from('x'), password: 'x' },
      software: SOFTWARE,
      chainState: guardado,
    });
    (c2 as unknown as { soapClient: unknown }).soapClient = soap;
    await c2.submitInvoice(factura('002'));

    expect(enviados[0]).toContain(`Huella>${guardado.lastHash}<`);
    expect(enviados[0]).toContain('IDEmisorFactura>B12345678<');
  });
});

describe('La API no ofrece forma de retroceder', () => {
  it('RecordChain no expone revert, rollback ni restore', async () => {
    const { RecordChain } = await import('../../src/crypto/chain.js');
    const metodos = Object.getOwnPropertyNames(RecordChain.prototype);
    for (const prohibido of ['revert', 'rollback', 'restore', 'undo']) {
      expect(metodos).not.toContain(prohibido);
    }
  });
});

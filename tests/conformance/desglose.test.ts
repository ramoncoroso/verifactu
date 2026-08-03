/**
 * Desglose: régimen, calificación e impuesto por línea.
 *
 * El XSD sitúa `ClaveRegimen`, `CalificacionOperacion` e `Impuesto` dentro de
 * `DetalleType`, es decir **por línea**. La librería los emitía con los literales
 * `01`, `S1` y `01`, y `Invoice.operationRegimes` no llegaba jamás al cable. Con
 * eso, un arrendamiento de local (clave 11), una exportación (02), el criterio de
 * caja (07) o una operación con inversión del sujeto pasivo (S2) eran
 * **inexpresables**: el usuario rellenaba el campo y su valor se descartaba en
 * silencio, declarando régimen general lo que no lo es.
 *
 * Las reglas que se comprueban aquí no son interpretación: son las validaciones
 * que la AEAT publica en `errores.properties`, vendorizado en `schemas/`. Cada
 * `it` cita su código.
 */

import { describe, expect, it } from 'vitest';

import { mapDesglose } from '../../src/xml/mapping/invoice-to-registro.js';
import { VerifactuClient } from '../../src/client/verifactu-client.js';
import type { Invoice } from '../../src/models/invoice.js';
import type { SoftwareInfo } from '../../src/models/party.js';
import { extractSoapBody, formatXsdErrors, validateSuministro } from '../helpers/xsd.js';

const SOFTWARE: SoftwareInfo = {
  name: 'verifactu-ts',
  developerTaxId: 'B99999999',
  version: '1.0.0',
  installationNumber: '001',
  systemType: 'S',
};

function factura(overrides: Partial<Invoice> = {}): Invoice {
  return {
    operationType: 'A',
    issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
    recipients: [{ taxId: { type: 'NIF', value: 'A87654321' }, name: 'Cliente SA' }],
    invoiceType: 'F1',
    id: { series: 'FC', number: '0001', issueDate: new Date('2026-08-02T10:00:00Z') },
    description: 'Servicios de consultoría',
    taxBreakdown: { vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }] },
    totalAmount: 121,
    ...overrides,
  } as Invoice;
}

/** Genera el Body real, listo para validar contra el XSD. */
function cuerpo(invoice: Invoice): string {
  const client = new VerifactuClient({
    environment: 'sandbox',
    certificate: { type: 'pfx', data: Buffer.from('x'), password: 'x' },
    software: SOFTWARE,
  });
  const envelope = (
    client as unknown as { buildAltaSoapBody(i: unknown, t: Date, f: boolean): string }
  ).buildAltaSoapBody({ ...invoice, hash: 'A'.repeat(64) }, new Date('2026-08-02T12:00:00Z'), true);
  return extractSoapBody(envelope);
}

function claves(xml: string): string[] {
  return [...xml.matchAll(/<[^>]*ClaveRegimen>([^<]*)</g)].map((m) => m[1]!);
}

describe('ClaveRegimen por línea', () => {
  it('el régimen de la línea llega al XML', () => {
    const linea = mapDesglose(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '11' }],
        },
      })
    );
    expect(linea[0]?.claveRegimen).toBe('11');
  });

  it('dos líneas con regímenes distintos producen dos ClaveRegimen distintas', () => {
    const xml = cuerpo(
      factura({
        taxBreakdown: {
          vatBreakdowns: [
            { taxBase: 100, vatRate: 21, vatAmount: 21, regime: '01' },
            { taxBase: 200, vatRate: 21, vatAmount: 42, regime: '11' },
          ],
        },
        totalAmount: 363,
      })
    );
    expect(claves(xml)).toEqual(['01', '11']);
  });

  it('sin régimen de línea se hereda el de la factura', () => {
    const linea = mapDesglose(
      factura({
        operationRegimes: ['07'],
        taxBreakdown: { vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }] },
      })
    );
    expect(linea[0]?.claveRegimen).toBe('07');
  });

  it('el de la línea gana al de la factura', () => {
    const linea = mapDesglose(
      factura({
        operationRegimes: ['07'],
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '02' }],
        },
      })
    );
    expect(linea[0]?.claveRegimen).toBe('02');
  });

  it('sin nada, régimen general: el valor por defecto de siempre', () => {
    expect(mapDesglose(factura())[0]?.claveRegimen).toBe('01');
  });

  it('las líneas exentas y no sujetas también llevan su propio régimen', () => {
    const lineas = mapDesglose(
      factura({
        taxBreakdown: {
          exemptBreakdowns: [{ cause: 'E1', taxBase: 50, regime: '02' }],
          nonSubjectBreakdowns: [{ cause: 'N2', amount: 30, regime: '08' }],
        },
        totalAmount: 80,
      } as unknown as Partial<Invoice>)
    );
    expect(lineas.map((l) => l.claveRegimen)).toEqual(['02', '08']);
  });
});

describe('CalificacionOperacion por línea', () => {
  it('la inversión del sujeto pasivo (S2) es expresable', () => {
    const linea = mapDesglose(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 0, vatAmount: 0, qualification: 'S2' }],
        },
        totalAmount: 100,
      } as unknown as Partial<Invoice>)
    );
    expect(linea[0]?.calificacionOperacion).toBe('S2');
  });

  it('una factura con S2 valida contra el XSD', () => {
    const xml = cuerpo(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 0, vatAmount: 0, qualification: 'S2' }],
        },
        totalAmount: 100,
      } as unknown as Partial<Invoice>)
    );
    const r = validateSuministro(xml);
    expect(formatXsdErrors(r)).toBe('');
  });

  it('sin calificación explícita se mantiene S1', () => {
    expect(mapDesglose(factura())[0]?.calificacionOperacion).toBe('S1');
  });
});

describe('Impuesto por línea', () => {
  it('el IGIC es expresable', () => {
    const linea = mapDesglose(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 7, vatAmount: 7, tax: '03', regime: '01' }],
        },
        totalAmount: 107,
      } as unknown as Partial<Invoice>)
    );
    expect(linea[0]?.impuesto).toBe('03');
  });

  it('sin impuesto explícito se mantiene IVA', () => {
    expect(mapDesglose(factura())[0]?.impuesto).toBe('01');
  });

  // Error 1260 · «El campo ClaveRegimen solo debe de estar cumplimentado si el
  // campo Impuesto está vacío o tiene valor IVA(01) o IPSI(02) o IGIC(03)».
  it('con Impuesto 05 (Otros) NO se emite ClaveRegimen', () => {
    const linea = mapDesglose(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21, tax: '05' }],
        },
      } as unknown as Partial<Invoice>)
    );
    expect(linea[0]?.claveRegimen).toBeUndefined();
  });

  // Error 1245 · «Si el campo Impuesto está vacío o tiene valor IVA(01) o
  // IPSI(02) o IGIC(03) el campo ClaveRegimen debe de estar cumplimentado».
  it.each(['01', '02', '03'])('con Impuesto %s SÍ se emite ClaveRegimen', (impuesto) => {
    const linea = mapDesglose(
      factura({
        taxBreakdown: {
          vatBreakdowns: [
            { taxBase: 100, vatRate: 21, vatAmount: 21, tax: impuesto, regime: '01' },
          ],
        },
      } as unknown as Partial<Invoice>)
    );
    expect(linea[0]?.claveRegimen).toBe('01');
  });
});

describe('Coherencia que la AEAT valida y rechazaría el registro', () => {
  const conLinea = (linea: Record<string, unknown>, resto: Partial<Invoice> = {}): Invoice =>
    factura({
      taxBreakdown: { vatBreakdowns: [linea] },
      ...resto,
    } as unknown as Partial<Invoice>);

  // Error 1252 · «Si ClaveRegimen es 08 el campo CalificacionOperacion tiene que
  // tener el valor N2 e ir siempre informado».
  it('régimen 08 exige calificación N2', () => {
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '08' }))
    ).toThrow(/08.*N2|N2.*08/s);
  });

  it('régimen 08 con N2 pasa', () => {
    const lineas = mapDesglose(
      factura({
        taxBreakdown: { nonSubjectBreakdowns: [{ cause: 'N2', amount: 100, regime: '08' }] },
        totalAmount: 100,
      } as unknown as Partial<Invoice>)
    );
    expect(lineas[0]?.calificacionOperacion).toBe('N2');
  });

  // Error 1200 · «Si ClaveRegimen es 03 CalificacionOperacion sólo puede ser S1».
  it('régimen 03 solo admite S1', () => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 0, vatAmount: 0, regime: '03', qualification: 'S2' })
      )
    ).toThrow(/03/);
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '03', qualification: 'S1' })
      )
    ).not.toThrow();
  });

  // Error 1206 · «Si ClaveRegimen es 11 TipoImpositivo ha de ser 21%».
  it('régimen 11 exige el 21 %', () => {
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 10, vatAmount: 10, regime: '11' }))
    ).toThrow(/11.*21|21.*11/s);
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '11' }))
    ).not.toThrow();
  });

  // Error 1199 · «Si Impuesto es 01, 03 o no se cumplimenta y ClaveRegimen es 01
  // no pueden marcarse la OperacionExenta E2, E3».
  it.each(['E2', 'E3'])('régimen 01 con IVA no admite la exención %s', (causa) => {
    expect(() =>
      mapDesglose(
        factura({
          taxBreakdown: { exemptBreakdowns: [{ cause: causa, taxBase: 100, regime: '01' }] },
          totalAmount: 100,
        } as unknown as Partial<Invoice>)
      )
    ).toThrow(/E2|E3/);
  });

  it('esa misma exención con otro régimen pasa', () => {
    expect(() =>
      mapDesglose(
        factura({
          taxBreakdown: { exemptBreakdowns: [{ cause: 'E2', taxBase: 100, regime: '02' }] },
          totalAmount: 100,
        } as unknown as Partial<Invoice>)
      )
    ).not.toThrow();
  });

  // Error 1201 · «Si ClaveRegimen es 04 CalificacionOperacion sólo puede ser S2 o
  // bien OperacionExenta».
  it('régimen 04 no admite S1', () => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '04', qualification: 'S1' })
      )
    ).toThrow(/04/);
  });

  // Error 1207 · «La CuotaRepercutida solo podrá ser distinta de 0 si
  // CalificacionOperacion es S1». Y 1198: con S2, tipo y cuota valen 0.
  it('S2 con cuota distinta de cero se rechaza', () => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, qualification: 'S2' })
      )
    ).toThrow(/S2|cuota/i);
  });

  // Error 1203 · «Si ClaveRegimen es 07 OperacionExenta no puede ser E2, E3, E4
  // y E5 o CalificacionOperacion no puede ser S2, N1, N2».
  it('el criterio de caja (07) no admite S2', () => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 0, vatAmount: 0, regime: '07', qualification: 'S2' })
      )
    ).toThrow(/07/);
  });

  it.each(['E2', 'E3', 'E4', 'E5'])('el criterio de caja (07) no admite la exención %s', (causa) => {
    expect(() =>
      mapDesglose(
        factura({
          taxBreakdown: { exemptBreakdowns: [{ cause: causa, taxBase: 100, regime: '07' }] },
          totalAmount: 100,
        } as unknown as Partial<Invoice>)
      )
    ).toThrow(/07/);
  });

  // Error 1205 · «Si ClaveRegimen es 10 CalificacionOperacion tiene que ser N1,
  // TipoFactura F1 y Destinatarios estar identificada mediante NIF».
  it('el cobro por cuenta de terceros (10) exige N1, F1 y destinatario con NIF', () => {
    const noSujeta = (extra: Partial<Invoice> = {}): Invoice =>
      factura({
        taxBreakdown: { nonSubjectBreakdowns: [{ cause: 'N1', amount: 100, regime: '10' }] },
        totalAmount: 100,
        ...extra,
      } as unknown as Partial<Invoice>);

    expect(() => mapDesglose(noSujeta())).not.toThrow();
    expect(() => mapDesglose(noSujeta({ invoiceType: 'F2' }))).toThrow(/F1/);
    expect(() =>
      mapDesglose(
        noSujeta({
          recipients: [{ taxId: { type: '02', value: 'FR123', country: 'FR' }, name: 'Cliente' }],
        } as unknown as Partial<Invoice>)
      )
    ).toThrow(/NIF/);
    // Con N2 en vez de N1 el régimen 10 se rechaza.
    expect(() =>
      mapDesglose(
        factura({
          taxBreakdown: { nonSubjectBreakdowns: [{ cause: 'N2', amount: 100, regime: '10' }] },
          totalAmount: 100,
        } as unknown as Partial<Invoice>)
      )
    ).toThrow(/N1/);
  });

  // Error 1202 · «Si ClaveRegimen es 06 TipoFactura no puede ser F2, F3, R5 y
  // BaseImponibleACoste debe estar cumplimentado».
  it('el grupo de entidades (06) exige BaseImponibleACoste', () => {
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '06' }))
    ).toThrow(/BaseImponibleACoste/);
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '06', costBase: 80 })
      )
    ).not.toThrow();
  });

  it.each(['F2', 'F3', 'R5'])('el grupo de entidades (06) no admite TipoFactura %s', (tipo) => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '06', costBase: 80 }, {
          invoiceType: tipo,
          ...(tipo === 'F2' || tipo === 'R5' ? { recipients: undefined } : {}),
        } as unknown as Partial<Invoice>)
      )
    ).toThrow(new RegExp(tipo));
  });

  it('la BaseImponibleACoste llega al XML y valida contra el XSD', () => {
    const xml = cuerpo(
      conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '06', costBase: 80 })
    );
    expect(xml).toContain('BaseImponibleACoste>80.00<');
    expect(formatXsdErrors(validateSuministro(xml))).toBe('');
  });

  // Error 1257 · «El campo BaseImponibleACoste solo puede estar cumplimentado si
  // la ClaveRegimen es 06 o Impuesto es 02 (IPSI) o 05 (Otros)».
  it('la BaseImponibleACoste no cabe en régimen general', () => {
    expect(() =>
      mapDesglose(
        conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '01', costBase: 80 })
      )
    ).toThrow(/BaseImponibleACoste/);
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, tax: '05', costBase: 80 }))
    ).not.toThrow();
  });

  // Error 1246 · «El valor del campo ClaveRegimen es incorrecto». El XSD no
  // declara 12, 13 ni 16.
  it.each(['12', '13', '16', '99'])('un régimen inexistente como %s se rechaza', (regimen) => {
    expect(() =>
      mapDesglose(conLinea({ taxBase: 100, vatRate: 21, vatAmount: 21, regime: regimen }))
    ).toThrow(/ClaveRegimen|régimen/i);
  });
});

describe('Una factura que la AEAT rechazaría no entra en la cadena', () => {
  // `prepareAlta` avanzaba la cadena —calculando la huella y moviendo el
  // estado— ANTES de construir el XML. Si la construcción lanzaba, la cadena
  // quedaba apuntando a un registro que no se generó nunca y que no existe en
  // ningún sitio: la siguiente factura encadenaría contra un fantasma.
  function cliente(): VerifactuClient {
    return new VerifactuClient({
      environment: 'sandbox',
      certificate: { type: 'pfx', data: Buffer.from('x'), password: 'x' },
      software: SOFTWARE,
    });
  }

  it('un desglose incoherente no mueve el estado de la cadena', async () => {
    const c = cliente();
    const antes = c.getChainState();

    await expect(
      c.submitInvoice(
        factura({
          taxBreakdown: {
            vatBreakdowns: [{ taxBase: 100, vatRate: 10, vatAmount: 10, regime: '11' }],
          },
        } as unknown as Partial<Invoice>)
      )
    ).rejects.toThrow(/11/);

    expect(c.getChainState().recordCount).toBe(antes.recordCount);
    expect(c.getChainState().lastHash).toBe(antes.lastHash);
  });

  it('una factura sin descripción tampoco', async () => {
    const c = cliente();
    const antes = c.getChainState();

    await expect(
      c.submitInvoice(factura({ description: '' }))
    ).rejects.toThrow(/DescripcionOperacion/);

    expect(c.getChainState().recordCount).toBe(antes.recordCount);
  });
});

describe('Todo lo generado sigue validando contra el XSD', () => {
  it('una factura con régimen, calificación e impuesto por línea valida', () => {
    const xml = cuerpo(
      factura({
        taxBreakdown: {
          vatBreakdowns: [
            { taxBase: 100, vatRate: 21, vatAmount: 21, regime: '01', tax: '01' },
            { taxBase: 200, vatRate: 21, vatAmount: 42, regime: '11', tax: '01' },
          ],
          exemptBreakdowns: [{ cause: 'E1', taxBase: 50, regime: '01' }],
        },
        totalAmount: 413,
      } as unknown as Partial<Invoice>)
    );
    const r = validateSuministro(xml);
    expect(formatXsdErrors(r)).toBe('');
  });

  it('el orden de los elementos del Detalle es el del XSD', () => {
    const xml = cuerpo(
      factura({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21, regime: '11' }],
        },
      } as unknown as Partial<Invoice>)
    );
    const detalle = /DetalleDesglose>([\s\S]*?)<\/[^>]*DetalleDesglose>/.exec(xml)?.[1] ?? '';
    const orden = [...detalle.matchAll(/<sf:([A-Za-z]+)>/g)].map((m) => m[1]!);
    expect(orden).toEqual([
      'Impuesto',
      'ClaveRegimen',
      'CalificacionOperacion',
      'TipoImpositivo',
      'BaseImponibleOimporteNoSujeto',
      'CuotaRepercutida',
    ]);
  });
});

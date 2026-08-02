/**
 * Nivel 2 de la pirámide: todo XML generado se valida contra los XSD oficiales
 * de la AEAT vendorizados en `schemas/`.
 *
 * Es la red que detecta VF-005, VF-006, VF-009, VF-024, VF-025, VF-033 y VF-034
 * de una vez, y la que impide que una errata de mayúscula como la de VF-033
 * vuelva a sobrevivir seis meses.
 *
 * OJO con sus puntos ciegos, que están medidos: una huella en Base64 **valida**
 * contra el esquema (`TextMax64Type` es solo `maxLength=64`, sin patrón), y un
 * `FechaHoraHusoGenRegistro` sin huso **también**. Por eso los niveles 0 y 1
 * (`huella-vectores.test.ts`) no son redundantes con este.
 */

import { describe, expect, it } from 'vitest';

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

/** Cliente real, sin tocar el disco: la ruta de Buffer no parsea el PKCS#12. */
function makeClient(): VerifactuClient {
  return new VerifactuClient({
    environment: 'sandbox',
    certificate: { type: 'pfx', data: Buffer.from('certificado-de-prueba'), password: 'x' },
    software: SOFTWARE,
  });
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    operationType: 'A',
    issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
    recipients: [{ taxId: { type: 'NIF', value: 'A87654321' }, name: 'Cliente SA' }],
    invoiceType: 'F1',
    id: { series: 'FC', number: '0001', issueDate: new Date('2026-08-02T10:00:00Z') },
    description: 'Servicios de consultoría',
    taxBreakdown: {
      vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }],
    },
    totalAmount: 121,
    ...overrides,
  } as Invoice;
}

/** Invoca el generador real y devuelve el contenido del Body, listo para validar. */
function buildBody(invoice: Invoice): string {
  const client = makeClient();
  const processed = { ...invoice, hash: 'A'.repeat(64) };
  const envelope = (
    client as unknown as {
      buildAltaSoapBody(i: unknown, t: Date, first: boolean): string;
    }
  ).buildAltaSoapBody(processed, new Date('2026-08-02T12:00:00Z'), true);
  return extractSoapBody(envelope);
}

const NS_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_SF =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

/**
 * Mensaje conforme construido a mano desde el XSD. Es a la vez el control
 * positivo del helper y la base de las mutaciones del control negativo: cada
 * mutación cambia UNA cosa, de modo que el error que devuelve el validador se
 * puede atribuir a esa cosa.
 */
const MENSAJE_VALIDO = `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">
  <sfLR:Cabecera>
    <sf:ObligadoEmision><sf:NombreRazon>Mi Empresa SL</sf:NombreRazon><sf:NIF>B12345678</sf:NIF></sf:ObligadoEmision>
  </sfLR:Cabecera>
  <sfLR:RegistroFactura>
    <sf:RegistroAlta>
      <sf:IDVersion>1.0</sf:IDVersion>
      <sf:IDFactura>
        <sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>
        <sf:NumSerieFactura>FC0001</sf:NumSerieFactura>
        <sf:FechaExpedicionFactura>02-08-2026</sf:FechaExpedicionFactura>
      </sf:IDFactura>
      <sf:NombreRazonEmisor>Mi Empresa SL</sf:NombreRazonEmisor>
      <sf:TipoFactura>F1</sf:TipoFactura>
      <sf:DescripcionOperacion>Servicios de consultoría</sf:DescripcionOperacion>
      <sf:Desglose>
        <sf:DetalleDesglose>
          <sf:Impuesto>01</sf:Impuesto>
          <sf:ClaveRegimen>01</sf:ClaveRegimen>
          <sf:CalificacionOperacion>S1</sf:CalificacionOperacion>
          <sf:TipoImpositivo>21.00</sf:TipoImpositivo>
          <sf:BaseImponibleOimporteNoSujeto>100.00</sf:BaseImponibleOimporteNoSujeto>
          <sf:CuotaRepercutida>21.00</sf:CuotaRepercutida>
        </sf:DetalleDesglose>
      </sf:Desglose>
      <sf:CuotaTotal>21.00</sf:CuotaTotal>
      <sf:ImporteTotal>121.00</sf:ImporteTotal>
      <sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>
      <sf:SistemaInformatico>
        <sf:NombreRazon>verifactu-ts</sf:NombreRazon>
        <sf:NIF>B99999999</sf:NIF>
        <sf:NombreSistemaInformatico>verifactu-ts</sf:NombreSistemaInformatico>
        <sf:IdSistemaInformatico>01</sf:IdSistemaInformatico>
        <sf:Version>1.0.0</sf:Version>
        <sf:NumeroInstalacion>001</sf:NumeroInstalacion>
        <sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>
        <sf:TipoUsoPosibleMultiOT>N</sf:TipoUsoPosibleMultiOT>
        <sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>
      </sf:SistemaInformatico>
      <sf:FechaHoraHusoGenRegistro>2026-08-02T14:00:00+02:00</sf:FechaHoraHusoGenRegistro>
      <sf:TipoHuella>01</sf:TipoHuella>
      <sf:Huella>${'A'.repeat(64)}</sf:Huella>
    </sf:RegistroAlta>
  </sfLR:RegistroFactura>
</sfLR:RegFactuSistemaFacturacion>`;

describe('El helper de validación funciona', () => {
  // Control positivo: sin esto, un fallo abajo podría ser del helper y no del
  // generador.
  it('valida un mensaje conforme construido a mano desde el XSD', () => {
    const result = validateSuministro(MENSAJE_VALIDO);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
  });

  // Control NEGATIVO de verdad: se muta el documento válido de arriba y se
  // comprueba que el validador señala la mutación concreta.
  //
  // La versión anterior de este bloque validaba `<x/>` y se titulaba «detecta la
  // fecha en formato ISO». No detectaba ninguna fecha: su único error era «no
  // matching global declaration», que saldría igual contra un esquema vacío o mal
  // cargado. Era exactamente el antipatrón que este fichero existe para evitar.
  describe.each([
    {
      caso: 'fecha en formato ISO',
      mutar: (x: string) => x.replace('02-08-2026', '2026-08-02'),
      esperado: "not accepted by the pattern",
    },
    {
      caso: 'BaseImponibleOImporteNoSujeto con I mayúscula (VF-033)',
      mutar: (x: string) => x.split('BaseImponibleOimporteNoSujeto').join('BaseImponibleOImporteNoSujeto'),
      esperado: 'BaseImponibleOimporteNoSujeto',
    },
    {
      caso: 'PrimerRegistro con valor N (VF-025)',
      mutar: (x: string) => x.replace('<sf:PrimerRegistro>S<', '<sf:PrimerRegistro>N<'),
      esperado: "not an element of the set",
    },
    {
      caso: 'TipoUsoPosibleSoloVerifactu con valor V (VF-024)',
      mutar: (x: string) =>
        x.replace('<sf:TipoUsoPosibleSoloVerifactu>S<', '<sf:TipoUsoPosibleSoloVerifactu>V<'),
      esperado: "not an element of the set",
    },
    {
      caso: 'sin IDVersion (VF-006b)',
      mutar: (x: string) => x.replace('<sf:IDVersion>1.0</sf:IDVersion>', ''),
      esperado: 'IDVersion',
    },
    {
      caso: 'sin TipoHuella (VF-006c)',
      mutar: (x: string) => x.replace('<sf:TipoHuella>01</sf:TipoHuella>', ''),
      esperado: 'TipoHuella',
    },
    {
      caso: 'sin DescripcionOperacion (VF-034)',
      mutar: (x: string) => x.replace(/<sf:DescripcionOperacion>[^<]*<\/sf:DescripcionOperacion>/, ''),
      esperado: 'DescripcionOperacion',
    },
  ])('rechaza $caso', ({ mutar, esperado }) => {
    it('y el mensaje señala la causa', () => {
      const result = validateSuministro(mutar(MENSAJE_VALIDO));
      expect(result.valid).toBe(false);
      expect(result.errors.join('\n')).toContain(esperado);
    });
  });

  // Los dos puntos ciegos del esquema, medidos. Están aquí para que nadie
  // concluya que la validación XSD basta: son dos de los siete bloqueantes.
  it('NO detecta una huella en Base64 — TextMax64Type no tiene patrón', () => {
    const base64 = 'PEZNr2GsuCfGX9oZ81Kk473CxkDp6fxMwFgHPzjxL2A=';
    const result = validateSuministro(MENSAJE_VALIDO.replace('A'.repeat(64), base64));
    expect(result.valid).toBe(true);
  });

  it('NO detecta un FechaHoraHusoGenRegistro sin huso — xs:dateTime lo admite', () => {
    const result = validateSuministro(
      MENSAJE_VALIDO.replace('2026-08-02T14:00:00+02:00', '2026-08-02T14:00:00')
    );
    expect(result.valid).toBe(true);
  });
});

describe('XML generado por el cliente', () => {
  it('un alta mínima valida contra SuministroLR.xsd', () => {
    const result = validateSuministro(buildBody(makeInvoice()));
    expect(result.valid, formatXsdErrors(result)).toBe(true);
  });

  it('una factura con exentas y no sujetas valida, y las emite', () => {
    const body = buildBody(
      makeInvoice({
        taxBreakdown: {
          vatBreakdowns: [{ taxBase: 100, vatRate: 21, vatAmount: 21 }],
          exemptBreakdowns: [{ taxBase: 50, cause: 'E1' }],
          nonSubjectBreakdowns: [{ amount: 30, cause: 'N1' }],
        },
        totalAmount: 201,
      } as Partial<Invoice>)
    );
    const result = validateSuministro(body);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
    // Se descartaban en silencio: el Desglose no justificaba el ImporteTotal.
    expect(body.match(/DetalleDesglose>/g)).toHaveLength(6); // 3 aperturas + 3 cierres
    expect(body).toContain('OperacionExenta>E1<');
    expect(body).toContain('CalificacionOperacion>N1<');
    // En una línea exenta no se emite CuotaRepercutida.
    expect(body.match(/CuotaRepercutida/g)).toHaveLength(2);
  });

  it('el recargo de equivalencia llega al XML y a CuotaTotal', () => {
    const body = buildBody(
      makeInvoice({
        taxBreakdown: {
          vatBreakdowns: [
            {
              taxBase: 100,
              vatRate: 21,
              vatAmount: 21,
              equivalenceSurchargeRate: 5.2,
              equivalenceSurchargeAmount: 5.2,
            },
          ],
        },
        totalAmount: 126.2,
      } as Partial<Invoice>)
    );
    expect(validateSuministro(body).valid).toBe(true);
    expect(body).toContain('TipoRecargoEquivalencia>5.20<');
    expect(body).toContain('CuotaRecargoEquivalencia>5.20<');
    // 21 + 5.20, no 21: lo confirma el código de error 2006 de la AEAT.
    expect(body).toContain('CuotaTotal>26.20<');
  });

  it('emite IDVersion y TipoHuella, que faltaban', () => {
    const body = buildBody(makeInvoice());
    expect(body).toContain('IDVersion>1.0<');
    expect(body).toContain('TipoHuella>01<');
  });

  it('el primer registro emite solo PrimerRegistro, y sin valor N', () => {
    const body = buildBody(makeInvoice());
    expect(body).toContain('PrimerRegistro>S<');
    expect(body).not.toContain('PrimerRegistro>N<');
    expect(body).not.toContain('RegistroAnterior');
  });

  it('usa BaseImponibleOimporteNoSujeto, con «i» minúscula', () => {
    const body = buildBody(makeInvoice());
    expect(body).toContain('BaseImponibleOimporteNoSujeto>');
    expect(body).not.toContain('BaseImponibleOImporteNoSujeto>');
  });

  it('una anulación valida y usa los campos con sufijo Anulada', () => {
    const client = makeClient();
    const cancelacion = {
      operationType: 'AN',
      issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
      invoiceId: { series: 'FC', number: '0001', issueDate: new Date('2026-08-02T10:00:00Z') },
      hash: 'B'.repeat(64),
    };
    const envelope = (
      client as unknown as {
        buildAnulacionSoapBody(c: unknown, t: Date, f: boolean): string;
      }
    ).buildAnulacionSoapBody(cancelacion, new Date('2026-08-02T12:00:00Z'), true);
    const body = extractSoapBody(envelope);
    const result = validateSuministro(body);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
    expect(body).toContain('IDEmisorFacturaAnulada>');
    expect(body).toContain('NumSerieFacturaAnulada>');
    // Va en el mismo mensaje que las altas: no existe AnulaFactuSistemaFacturacion.
    expect(body).toContain('RegFactuSistemaFacturacion');
    expect(body).not.toContain('AnulaFactuSistemaFacturacion');
  });
});

describe('Escapado de caracteres', () => {
  const HOSTILES = [
    'Pepe & Hijos, S.L.',
    'A<B>C',
    'Ácido "Cítrico" & Cía',
    "O'Neill & Sons",
    'FC-2026/0042 & <cierre>',
  ];

  // Un `toContain` no distingue «escapado bien» de «no escapado». La prueba real
  // es que el documento valide y que el valor se recupere intacto.
  it.each(HOSTILES)('la razón social %s produce XML válido', (name) => {
    const body = buildBody(
      makeInvoice({
        issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name },
      } as Partial<Invoice>)
    );
    const result = validateSuministro(body);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
    expect(body).not.toContain('xmlParseEntityRef');
  });

  it('una descripción con etiquetas no inyecta elementos nuevos', () => {
    const body = buildBody(
      makeInvoice({
        description:
          'Servicio</sf:DescripcionOperacion><sf:Macrodato>S</sf:Macrodato><sf:DescripcionOperacion>x',
      })
    );
    expect(validateSuministro(body).valid).toBe(true);
    // El elemento inyectado no existe; el texto viaja escapado dentro del suyo.
    expect(body).not.toContain('<sf:Macrodato>');
    expect(body).toContain('&lt;/sf:DescripcionOperacion&gt;');
  });

  it('un & en la razón social se escapa y se recupera intacto', () => {
    const body = buildBody(
      makeInvoice({
        issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Pepe & Hijos' },
      } as Partial<Invoice>)
    );
    expect(body).toContain('Pepe &amp; Hijos');
    expect(body).not.toMatch(/>Pepe & Hijos</);
  });
});

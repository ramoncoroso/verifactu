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
  systemType: 'V',
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

describe('El helper de validación funciona', () => {
  // Control positivo: un documento que sabemos válido debe validar. Sin esto, un
  // fallo abajo podría ser del helper y no del generador.
  it('valida un mensaje conforme construido a mano desde el XSD', () => {
    const NS_LR =
      'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
    const NS_SF =
      'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
    const xml = `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">
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
    const result = validateSuministro(xml);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
  });

  it('detecta la fecha en formato ISO', () => {
    const result = validateSuministro('<x/>');
    expect(result.valid).toBe(false);
  });
});

describe('XML generado por el cliente', () => {
  // VF-006, VF-024, VF-025, VF-033, VF-034: el registro no sigue el XSD.
  it.fails('un alta mínima valida contra SuministroLR.xsd [VF-006 abierto]', () => {
    const result = validateSuministro(buildBody(makeInvoice()));
    expect(result.valid, formatXsdErrors(result)).toBe(true);
  });

  // Documenta el estado actual de forma afirmativa: qué error concreto da hoy.
  // Al corregir VF-006 este test hay que borrarlo, no actualizarlo.
  it('hoy falla ya en el primer elemento, por namespace [VF-006 abierto]', () => {
    const result = validateSuministro(buildBody(makeInvoice()));
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('ObligadoEmision');
  });
});

describe('Escapado de caracteres · VF-005', () => {
  const HOSTILES = [
    'Pepe & Hijos, S.L.',
    'A<B>C',
    'Ácido "Cítrico" & Cía',
    "O'Neill & Sons",
    'FC-2026/0042 & <cierre>',
  ];

  // Un `toContain` no distingue «escapado bien» de «no escapado». La prueba real
  // es que el documento parsee y el valor se recupere intacto.
  it.fails.each(HOSTILES)('la razón social %s produce XML bien formado [VF-005 abierto]', (name) => {
    const body = buildBody(makeInvoice({ issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name } } as Partial<Invoice>));
    // Si no está escapado, el documento ni siquiera parsea.
    const result = validateSuministro(body);
    expect(result.errors.join('\n')).not.toContain('mal formado');
  });

  // Inyección deliberada: el caso que demuestra que no es solo un problema de
  // caracteres sueltos.
  it.fails('una descripción con etiquetas no inyecta elementos nuevos [VF-005 abierto]', () => {
    const body = buildBody(
      makeInvoice({
        description:
          'Servicio</sum:DescripcionOperacion><sum:Macrodato>S</sum:Macrodato><sum:DescripcionOperacion>x',
      })
    );
    expect(body).not.toContain('<sum:Macrodato>');
  });
});

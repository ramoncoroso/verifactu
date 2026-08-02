/**
 * AEAT Verifactu Enumerations
 * Based on official AEAT specifications for Sistemas Informáticos de Facturación
 */

/**
 * Invoice types (Tipo Factura)
 * L2 - Tipos de factura
 */
export const InvoiceType = {
  /** Factura (art. 6, 7.2 y 7.3 del RD 1619/2012) */
  F1: 'F1',
  /** Factura Simplificada y target Facturas completas del art. 7.2 y 7.3 RD 1619/2012 */
  F2: 'F2',
  /** Factura emitida en sustitución de facturas simplificadas facturadas y declaradas */
  F3: 'F3',
  /** Asiento resumen de facturas */
  R1: 'R1',
  /** Asiento resumen de facturas simplificadas */
  R2: 'R2',
  /** Asiento resumen de target */
  R3: 'R3',
  /** Asiento resumen tickets */
  R4: 'R4',
  /** Importaciones (DUA) */
  R5: 'R5',
} as const;

export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType];

/**
 * Rectified invoice types (Tipo Factura Rectificativa)
 * L3 - Tipos de facturas rectificativas
 */
export const RectifiedInvoiceType = {
  /** Factura rectificativa por sustitución */
  S: 'S',
  /** Factura rectificativa por diferencias */
  I: 'I',
} as const;

export type RectifiedInvoiceType = (typeof RectifiedInvoiceType)[keyof typeof RectifiedInvoiceType];

/**
 * Operation regime types
 * L8A - Clave de régimen especial con transcendencia tributaria
 */
export const OperationRegime = {
  /** Operación de régimen general */
  '01': '01',
  /** Exportación */
  '02': '02',
  /** Operaciones a las que se aplique el régimen especial de bienes usados, objetos de arte, antigüedades y objetos de colección */
  '03': '03',
  /** Régimen especial del oro de inversión */
  '04': '04',
  /** Régimen especial de las agencias de viajes */
  '05': '05',
  /** Régimen especial grupo de entidades en IVA (Nivel Avanzado) */
  '06': '06',
  /** Régimen especial del criterio de caja */
  '07': '07',
  /** Operaciones sujetas al IPSI/IGIC */
  '08': '08',
  /** Facturación de las prestaciones de servicios de agencias de viaje que actúan como mediadoras en nombre y por cuenta ajena */
  '09': '09',
  /** Cobros por cuenta de terceros de honorarios profesionales */
  10: '10',
  /** Operaciones de arrendamiento de local de negocio */
  11: '11',
  /** Factura con IVA pendiente de devengo en certificaciones de obra cuyo destinatario sea una Administración Pública */
  14: '14',
  /** Factura con IVA pendiente de devengo en operaciones de tracto sucesivo */
  15: '15',
  /** Operaciones en recargo de equivalencia */
  17: '17',
  /** Operaciones en régimen simplificado */
  19: '19',
  /** Valor del XSD; la AEAT no publica descripción */
  18: '18',
  /** Valor del XSD; la AEAT no publica descripción */
  20: '20',
  /** Valor del XSD; la AEAT no publica descripción */
  21: '21',
} as const;

export type OperationRegime = (typeof OperationRegime)[keyof typeof OperationRegime];

/**
 * Tax exemption causes
 * L10 - Causa de exención
 */
export const ExemptionCause = {
  /** Exenta por el artículo 20 */
  E1: 'E1',
  /** Exenta por el artículo 21 */
  E2: 'E2',
  /** Exenta por el artículo 22 */
  E3: 'E3',
  /** Exenta por el artículo 23 y 24 */
  E4: 'E4',
  /** Exenta por el artículo 25 */
  E5: 'E5',
  /** Exenta por otros */
  E6: 'E6',
  /** Exenta (valor del XSD; la AEAT no publica su descripción) */
  E7: 'E7',
  /** Exenta (valor del XSD; la AEAT no publica su descripción) */
  E8: 'E8',
} as const;

export type ExemptionCause = (typeof ExemptionCause)[keyof typeof ExemptionCause];

/**
 * Non-subject causes (Operaciones no sujetas)
 * L9 - Clave de operaciones no sujetas
 */
export const CalificacionOperacion = {
  /** Sujeta y no exenta, sin inversión del sujeto pasivo. */
  S1: 'S1',
  /** Sujeta y no exenta, con inversión del sujeto pasivo. */
  S2: 'S2',
  /** No sujeta por el artículo 7, 14 u otros. */
  N1: 'N1',
  /** No sujeta por reglas de localización. */
  N2: 'N2',
} as const;

export type CalificacionOperacion =
  (typeof CalificacionOperacion)[keyof typeof CalificacionOperacion];

/**
 * @deprecated Los valores `OT` y `RL` **no existen** en ningún XSD de la AEAT.
 * La no sujeción se expresa con {@link CalificacionOperacion} `N1` o `N2`.
 */
export const NonSubjectCause = {
  /** @deprecated Usa `CalificacionOperacion.N1`. */
  OT: 'N1',
  /** @deprecated Usa `CalificacionOperacion.N2`. */
  RL: 'N2',
} as const;

export type NonSubjectCause = (typeof NonSubjectCause)[keyof typeof NonSubjectCause];

/** Impuesto de la línea de desglose. */
export const Impuesto = {
  /** IVA */
  IVA: '01',
  /** IPSI de Ceuta y Melilla */
  IPSI: '02',
  /** IGIC */
  IGIC: '03',
  /** Otros */
  OTROS: '05',
} as const;

export type Impuesto = (typeof Impuesto)[keyof typeof Impuesto];

/** Tipo de huella. Solo hay uno. */
export const TipoHuella = { SHA256: '01' } as const;
export type TipoHuella = (typeof TipoHuella)[keyof typeof TipoHuella];

/** Valores S/N del XSD. */
export const SiNo = { S: 'S', N: 'N' } as const;
export type SiNo = (typeof SiNo)[keyof typeof SiNo];


/**
 * Tax ID types
 * L6 - Tipo de identificación fiscal
 */
export const TaxIdType = {
  /** NIF español. No es un valor del enumerado del XSD: selecciona el elemento <NIF>. */
  NIF: 'NIF',
  /** NIF-IVA (operador intracomunitario). */
  VatNumber: '02',
  /** Pasaporte. */
  Passport: '03',
  /** Documento oficial de identificación expedido por el país de residencia. */
  IdInCountryOfResidence: '04',
  /** Certificado de residencia fiscal. */
  ResidenceCertificate: '05',
  /** Otro documento probatorio. */
  Other: '06',
  /** No censado. */
  NotRegistered: '07',
} as const;

export type TaxIdType = (typeof TaxIdType)[keyof typeof TaxIdType];

/**
 * Country codes (ISO 3166-1 alpha-2)
 * L5 - Código país
 */
export const CountryCode = {
  ES: 'ES',
  PT: 'PT',
  FR: 'FR',
  DE: 'DE',
  IT: 'IT',
  GB: 'GB',
  US: 'US',
  // Add more as needed
} as const;

export type CountryCode = (typeof CountryCode)[keyof typeof CountryCode] | string;

/**
 * Invoice operation types
 * L1 - Tipo de operación
 */
export const OperationType = {
  /** Alta de registro de facturación */
  Alta: 'A',
  /** Anulación de registro de facturación */
  Anulacion: 'AN',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * Response states
 * L4 - Estado del registro
 */
export const RecordState = {
  /** Aceptado */
  Accepted: 'Correcto',
  /** Aceptado con errores */
  AcceptedWithErrors: 'AceptadoConErrores',
  /** Rechazado */
  Rejected: 'Rechazado',
} as const;

export type RecordState = (typeof RecordState)[keyof typeof RecordState];

/**
 * VAT rates in Spain
 */
export const VatRate = {
  /** General rate */
  General: 21,
  /** Reduced rate */
  Reduced: 10,
  /** Super-reduced rate */
  SuperReduced: 4,
  /** Zero rate (exempt operations with right to deduction) */
  Zero: 0,
} as const;

export type VatRate = (typeof VatRate)[keyof typeof VatRate] | number;

/**
 * Equivalence surcharge rates
 */
export const EquivalenceSurchargeRate = {
  /** For general rate */
  General: 5.2,
  /** For reduced rate */
  Reduced: 1.4,
  /** For super-reduced rate */
  SuperReduced: 0.5,
} as const;

export type EquivalenceSurchargeRate = (typeof EquivalenceSurchargeRate)[keyof typeof EquivalenceSurchargeRate] | number;

/**
 * Software generation modes
 * L11 - Indicador de generación
 */
export const GenerationMode = {
  /** Generación por el propio obligado */
  OwnGeneration: 'G',
  /** Generación por tercero */
  ThirdPartyGeneration: 'T',
} as const;

export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode];

/**
 * Record cancellation indicator
 */
export const CancellationType = {
  /** Anulación por rectificación */
  Rectification: 'R',
  /** Anulación por devolución */
  Return: 'D',
  /** Anulación por error */
  Error: 'E',
} as const;

export type CancellationType = (typeof CancellationType)[keyof typeof CancellationType];

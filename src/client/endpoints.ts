/**
 * AEAT Verifactu Service Endpoints
 */

/**
 * Environment types
 */
export type Environment = 'production' | 'sandbox';

/**
 * Service endpoint URLs
 */
export interface ServiceEndpoints {
  /** Alta (registration) service URL */
  alta: string;
  /** Anulación (cancellation) service URL */
  anulacion: string;
  /** Consulta (query) service URL */
  consulta: string;
}

/**
 * Production environment endpoints
 */
export const PRODUCTION_ENDPOINTS: ServiceEndpoints = {
  alta: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/SuministroLR',
  anulacion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/SuministroLR',
  consulta: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/ConsultaLR',
};

/**
 * Sandbox (test) environment endpoints
 */
export const SANDBOX_ENDPOINTS: ServiceEndpoints = {
  alta: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/SuministroLR',
  anulacion: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/SuministroLR',
  consulta: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/ConsultaLR',
};

/**
 * Get endpoints for an environment
 */
export function getEndpoints(environment: Environment): ServiceEndpoints {
  return environment === 'production' ? PRODUCTION_ENDPOINTS : SANDBOX_ENDPOINTS;
}

/**
 * SOAP action headers
 */
export const SOAP_ACTIONS = {
  /** Alta (registration) action */
  ALTA: 'SuministroLRFacturasEmitidas',
  /** Anulación (cancellation) action */
  ANULACION: 'BajaLRFacturasEmitidas',
  /** Consulta (query) action */
  CONSULTA: 'ConsultaLRFacturasEmitidas',
} as const;

/**
 * QR verification URL base
 */
export const QR_VERIFICATION_URLS = {
  production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  sandbox: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

/**
 * Get QR verification URL for an environment
 */
export function getQrVerificationUrl(environment: Environment): string {
  return QR_VERIFICATION_URLS[environment];
}

/**
 * Control de flujo del art. 16.2 de la OM HAC/1177/2024.
 *
 * > «Los sistemas informáticos "VERI\*FACTU" **deberán implementar un mecanismo
 * > de control de flujo** basado en el tiempo de espera entre envíos, el cual
 * > tomará inicialmente el valor de 60 segundos, y en el número máximo de
 * > registros admitidos en cada envío. Los mensajes de respuesta de la Agencia
 * > Estatal de Administración Tributaria informarán sobre el valor de este
 * > parámetro, el cual **deberá ser tenido en cuenta para el siguiente envío**.»
 *
 * Es un «deberán», no una recomendación, y el `RespuestaSuministro.xsd` declara
 * `TiempoEsperaEnvio` obligatorio en toda respuesta. La librería lo descartaba.
 *
 * Tres detalles que parecen menores y no lo son:
 *
 *  - **El reloj arranca en el envío, no en la respuesta.** El literal dice
 *    «desde el anterior envío». Contar desde la respuesta regala al servidor el
 *    tiempo de proceso y estira la cadencia real.
 *  - **Corre igual si el envío falla.** Un error de red no autoriza a reintentar
 *    de inmediato; si acaso, al contrario.
 *  - **El estado se puede persistir.** Un pacer en memoria no protege a un
 *    proceso que reinicia, que es justo cuando más probable es reenviar.
 *
 * Esto **no** es el {@link ConcurrencyLimiter}: aquel limita peticiones
 * simultáneas, este la cadencia mínima entre peticiones consecutivas. Son
 * responsabilidades distintas y hacen falta las dos.
 */

import { INITIAL_WAIT_SECONDS } from './endpoints.js';

/** Estado persistible del control de flujo. */
export interface PacerState {
  /** Epoch en ms del último envío **iniciado**. Ausente si no se ha enviado nada. */
  readonly lastSubmissionAt?: number;
  /** Segundos de espera vigentes: los últimos que comunicó la AEAT. */
  readonly waitSeconds: number;
}

export interface SubmissionPacerOptions {
  /** Espera inicial en segundos. Por defecto, los 60 s de la norma. */
  readonly waitSeconds?: number;
  /** Estado previo, para reanudar tras un reinicio. */
  readonly state?: PacerState;
  /** Reloj inyectable. Solo para tests. */
  readonly now?: () => number;
  /** Espera inyectable. Solo para tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const dormir = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // No mantener vivo el proceso solo por esperar un hueco.
    if (typeof t === 'object' && t !== null && 'unref' in t) {
      (t as { unref(): void }).unref();
    }
  });

/**
 * Serializa los envíos y espaciarlos al menos `waitSeconds` entre sí.
 */
export class SubmissionPacer {
  private waitSecondsValue: number;
  private lastSubmissionAt: number | undefined;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Cola serie: dos `acquire()` concurrentes no pueden pasar a la vez. */
  private cola: Promise<void> = Promise.resolve();

  constructor(options: SubmissionPacerOptions = {}) {
    this.waitSecondsValue =
      options.state?.waitSeconds ?? options.waitSeconds ?? INITIAL_WAIT_SECONDS;
    this.lastSubmissionAt = options.state?.lastSubmissionAt;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? dormir;
  }

  /** Segundos de espera vigentes. */
  get waitSeconds(): number {
    return this.waitSecondsValue;
  }

  /** Milisegundos que faltan para el próximo hueco. 0 si ya está disponible. */
  msUntilNextSlot(): number {
    if (this.lastSubmissionAt === undefined) return 0;
    const transcurrido = this.now() - this.lastSubmissionAt;
    return Math.max(0, this.waitSecondsValue * 1000 - transcurrido);
  }

  /**
   * Espera al siguiente hueco y lo consume.
   *
   * Marca el instante **antes** de que la operación se ejecute: el art. 16.2
   * cuenta «desde el anterior envío».
   */
  async acquire(): Promise<void> {
    const miTurno = this.cola.then(async () => {
      const espera = this.msUntilNextSlot();
      if (espera > 0) await this.sleep(espera);
      this.lastSubmissionAt = this.now();
    });
    // La cola nunca se rompe: un fallo aguas abajo no debe desbloquear al resto.
    this.cola = miTurno.catch(() => undefined);
    return miTurno;
  }

  /**
   * Aplica el `TiempoEsperaEnvio` que devolvió la AEAT.
   *
   * Se ignoran los valores no finitos o negativos: `Tipo6Type` admite cadena
   * vacía y un valor absurdo no puede dejar el pacer inservible.
   */
  updateFromResponse(seconds: number | undefined): void {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return;
    this.waitSecondsValue = seconds;
  }

  /** Estado serializable, para reanudar la cadencia tras un reinicio. */
  getState(): PacerState {
    return this.lastSubmissionAt === undefined
      ? { waitSeconds: this.waitSecondsValue }
      : { waitSeconds: this.waitSecondsValue, lastSubmissionAt: this.lastSubmissionAt };
  }
}

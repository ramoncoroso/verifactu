/**
 * Copia profundamente mutable de un tipo del dominio.
 *
 * Los modelos son `readonly` a propósito: una factura ya emitida no se toca, y
 * su huella depende de cada campo. Pero un test que comprueba **qué pasa cuando
 * un campo está mal** necesita justamente ponerlo mal, y hacerlo con un `as any`
 * por línea apaga el compilador precisamente donde más ayuda —así se coló
 * durante meses un `systemType: 'V'` que el XSD no admite—.
 *
 * `Mutable<Invoice>` sigue siendo asignable a `Invoice`, de modo que el valor se
 * le puede pasar tal cual a la función bajo prueba sin ningún cast.
 */
export type Mutable<T> = T extends Date | RegExp | ((...args: never[]) => unknown)
  ? T
  : T extends readonly (infer U)[]
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

/** Vista mutable de un valor ya construido. */
export function mutable<T>(value: T): Mutable<T> {
  return value as Mutable<T>;
}

/**
 * Valor deliberadamente inválido, para los tests que comprueban que se rechaza.
 *
 * Sustituye a los `as any` que salpicaban la suite. Un `any` desactiva el
 * compilador para toda la expresión, y esa era la puerta por la que se colaban
 * los tests que fijan un valor que la norma no admite. Esto dice justo lo que
 * pasa —«aquí va un valor inválido a propósito»— sin apagar nada más.
 */
export function invalido<T>(value: unknown): T {
  return value as T;
}

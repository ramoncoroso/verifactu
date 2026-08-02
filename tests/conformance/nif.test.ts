/**
 * Identificadores fiscales españoles: batería auditable.
 *
 * Dos defectos, uno con fuente normativa firme y otro que exige prudencia:
 *
 *  1. **`K`, `L` y `M` no son CIF.** El RD 1065/2007 (RGAT), art. 19.2 y 20.2,
 *     los asigna a **personas físicas** —`L` españoles residentes en el
 *     extranjero, `K` menores de 14 años residentes en España, `M` extranjeros
 *     sin NIE— y su carácter de verificación es alfabético, calculado por
 *     **módulo 23** igual que el DNI. La librería los validaba con el algoritmo
 *     Luhn del CIF, de modo que rechazaba los correctos y aceptaba los erróneos.
 *     Los NIF `M` son destinatarios reales de factura.
 *
 *  2. **El reparto «dígito para unas letras, letra para otras» no tiene
 *     respaldo normativo.** Se leyó entera la Orden EHA/451/2008: su art. 2 dice
 *     solo «un carácter de control», sin precisar el tipo. La atribución que
 *     circula —incluida Wikipedia— es práctica administrativa, no texto legal, y
 *     las dos implementaciones de referencia (`python-stdnum` y `jsvat`)
 *     discrepan entre sí. `python-stdnum` lo documenta en su propio código:
 *     «there seems to be conflicting information […] so we support either here».
 *     Endurecerlo introduce falsos negativos sobre identificadores reales, así
 *     que se aceptan ambos controles.
 *
 * Cada vector lleva anotada la aritmética de su control para que se pueda
 * auditar sin ejecutar nada.
 */

import { describe, expect, it } from 'vitest';

import { validateSpanishTaxId } from '../../src/validation/nif-validator.js';

const valido = (id: string): boolean => validateSpanishTaxId(id).valid;
const tipo = (id: string): string | undefined => validateSpanishTaxId(id).type;

describe('K, L y M son NIF de persona física, no CIF', () => {
  // 1234567 mod 23 = 19 → «TRWAGMYFPDXBNJZSQVHLCKE»[19] = 'L'
  it.each(['K', 'L', 'M'])('%s1234567L es válido y se clasifica como NIF', (prefijo) => {
    const id = `${prefijo}1234567L`;
    expect(valido(id)).toBe(true);
    expect(tipo(id)).toBe('nif');
  });

  // 'D' es el control que devuelve el algoritmo del CIF para 1234567 (dígito 4).
  // Era justo el que la librería aceptaba, y es el incorrecto.
  it.each(['K', 'L', 'M'])('%s1234567D se rechaza: es el control del CIF', (prefijo) => {
    expect(valido(`${prefijo}1234567D`)).toBe(false);
  });

  it.each(['K', 'L', 'M'])('%s con control numérico se rechaza', (prefijo) => {
    // El art. 19.2 exige «un carácter de verificación alfabético».
    expect(valido(`${prefijo}12345674`)).toBe(false);
  });

  it.each([
    // dígitos, control por módulo 23
    ['0000023', 'T'], // 23 mod 23 = 0 → 'T'
    ['1234567', 'L'], // 19 → 'L'
    ['9999999', 'J'], // 13 → 'J'
    ['2802964', 'T'], // 0  → 'T'
    ['2826000', 'J'], // 13 → 'J'
  ])('M%s%s se valida por módulo 23', (digitos, control) => {
    expect(valido(`M${digitos}${control}`)).toBe(true);
    // Y cualquier otra letra falla.
    const otra = control === 'A' ? 'B' : 'A';
    expect(valido(`M${digitos}${otra}`)).toBe(false);
  });
});

describe('Los 17 prefijos legales de CIF admiten ambos controles', () => {
  // Orden EHA/451/2008, art. 2.a. La Orden NO dice de qué tipo es el control.
  const PREFIJOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'N', 'P', 'Q', 'R', 'S', 'U', 'V', 'W'];

  // 2802964 → sumas del algoritmo: dígito de control 3, letra 'C' ('JABCDEFGHI'[3]).
  it.each(PREFIJOS)('%s2802964C (control alfabético) es válido', (p) => {
    expect(valido(`${p}2802964C`)).toBe(true);
    expect(tipo(`${p}2802964C`)).toBe('cif');
  });

  it.each(PREFIJOS)('%s28029643 (control numérico) es válido', (p) => {
    expect(valido(`${p}28029643`)).toBe(true);
    expect(tipo(`${p}28029643`)).toBe('cif');
  });

  it.each(PREFIJOS)('%s2802964 con un control equivocado se rechaza', (p) => {
    expect(valido(`${p}2802964D`)).toBe(false);
    expect(valido(`${p}28029644`)).toBe(false);
  });

  // El caso concreto del hallazgo: se rechazaba con «expected 3».
  it('G2802964C ya no se rechaza', () => {
    expect(valido('G2802964C')).toBe(true);
  });

  it.each(['I', 'O', 'T', 'K', 'L', 'M'])('%s no es un prefijo de CIF', (p) => {
    // K/L/M por ser de persona física; I, O y T no están en la Orden.
    expect(valido(`${p}28029643`)).toBe(false);
  });
});

describe('Identificadores públicos reales', () => {
  it.each([
    ['Q2826000H', 'Agencia Estatal de Administración Tributaria'],
    ['P2807900B', 'Ayuntamiento de Madrid'],
    ['S7800001E', 'Administración General del Estado'],
    ['Q2866001G', 'Cruz Roja Española'],
    ['G28034718', 'Real Madrid CF · una G con control numérico'],
    ['A28015865', 'Telefónica'],
    ['A39000013', ''],
    ['A15075062', ''],
    ['A78374725', ''],
    ['A46103834', ''],
  ])('%s es válido (%s)', (id) => {
    expect(valido(id)).toBe(true);
  });
});

describe('NIF y NIE clásicos, que no cambian', () => {
  it.each([
    ['12345678Z', 'nif'], // 12345678 mod 23 = 14 → 'Z'
    ['00000000T', 'nif'], // 0 → 'T'
    ['X0000000T', 'nie'], // X→0 · 0 mod 23 = 0 → 'T'
    ['Y0000000Z', 'nie'], // Y→1 · 10000000 mod 23 = 14 → 'Z'
    ['Z0000000M', 'nie'], // Z→2 · 20000000 mod 23 = 5 → 'M'
  ])('%s es un %s válido', (id, esperado) => {
    expect(valido(id)).toBe(true);
    expect(tipo(id)).toBe(esperado);
  });

  it('un NIF con la letra equivocada se rechaza', () => {
    expect(valido('12345678A')).toBe(false);
  });
});

describe('Formato', () => {
  it('normaliza espacios, guiones y minúsculas', () => {
    expect(valido('m 1234567-l')).toBe(true);
    expect(valido('q2826000h')).toBe(true);
  });

  it.each(['', '1234', '1234567890', 'ABCDEFGHI'])('«%s» se rechaza', (id) => {
    expect(valido(id)).toBe(false);
  });
});

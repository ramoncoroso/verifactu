/**
 * Los ejemplos del README se ejecutan de verdad.
 *
 * Antes de este fichero se comprobó que **compilaran**, y eso dejó pasar tres
 * ejemplos por idioma que compilaban perfectamente y reventaban al ejecutarse:
 * construían una factura con `InvoiceBuilder` sin llamar a `.type()`, y
 * `build()` exige el tipo de factura. El primero era el de «Inicio rápido», o
 * sea lo primero que alguien copia y pega.
 *
 * No lo detectó el typecheck porque el tipo de factura se valida en tiempo de
 * ejecución, no en el sistema de tipos. Lo detectó instalar el paquete
 * empaquetado y usarlo, que es lo que hace un usuario.
 *
 * Así que el oráculo aquí no es lo que yo crea que hace el ejemplo: es el
 * ejemplo corriendo.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { InvoiceBuilder } from '../../src/builders/invoice-builder.js';
import { assertAltaEmisible } from '../../src/xml/mapping/invoice-to-registro.js';
import type { Invoice } from '../../src/models/invoice.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Cadenas `InvoiceBuilder.create()…build()` de los bloques del README.
 *
 * Se extrae la cadena y no el bloque entero porque algunos ejemplos llevan
 * `import`, credenciales y una llamada de red alrededor. Lo que interesa es que
 * la factura que se le enseña a alguien **se puede construir**.
 */
function cadenasDeBuilder(fichero: string): { indice: number; codigo: string }[] {
  const md = readFileSync(join(ROOT, fichero), 'utf8');
  const bloques = [...md.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
  const salida: { indice: number; codigo: string }[] = [];
  bloques.forEach((bloque, indice) => {
    for (const m of bloque.matchAll(/InvoiceBuilder\.create\(\)[\s\S]*?\.build\(\)/g)) {
      salida.push({ indice, codigo: `return ${m[0]};` });
    }
  });
  return salida;
}

describe.each(['README.md', 'README.en.md'])('%s', (fichero) => {
  const ejemplos = cadenasDeBuilder(fichero);

  it('tiene ejemplos de builder que comprobar', () => {
    expect(ejemplos.length).toBeGreaterThan(3);
  });

  it.each(ejemplos.map((e) => [e.indice, e.codigo] as const))(
    'la factura del bloque %i se construye sin lanzar',
    (_indice, codigo) => {
      // Se ejecuta el texto del README tal cual, con el builder real inyectado.
      // Si alguien edita el ejemplo y lo rompe, este test se pone rojo.
      const construir = new Function('InvoiceBuilder', codigo) as (b: unknown) => Invoice;
      const factura = construir(InvoiceBuilder);
      // Y lo construido tiene que ser emisible de verdad, no solo no lanzar.
      expect(() => assertAltaEmisible(factura)).not.toThrow();
    }
  );
});

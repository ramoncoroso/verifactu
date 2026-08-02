/**
 * Serializador XML.
 *
 * Diseñado para que dos defectos concretos sean **inexpresables**, no
 * corregidos:
 *
 *  - **Escapado olvidado.** No existe ninguna función que acepte XML crudo. El
 *    generador produce un árbol, y el único punto que convierte un valor en texto
 *    es `serialize`, que escapa siempre. La versión anterior ofrecía `xml()` y
 *    `fragment()`, que devolvían `string`, y el cliente construía el SOAP por
 *    concatenación de plantillas: una razón social con `&` rompía el documento, y
 *    una descripción con etiquetas inyectaba elementos.
 *
 *  - **Prefijo y espacio de nombres confundidos.** El nombre de un elemento no
 *    lleva prefijo: lleva un espacio de nombres, y el prefijo se resuelve al
 *    serializar. Escribir `element('sum:RegistroAlta')` deja de ser posible.
 */

/** Espacios de nombres que maneja el serializador. */
export type NsKey = 'LR' | 'SF' | 'SOAP';

/** Nodo del árbol. Los nodos de texto solo se crean desde {@link leaf}. */
export type XmlNode =
  | { readonly kind: 'elem'; readonly ns: NsKey; readonly name: string; readonly children: readonly XmlNode[] }
  | { readonly kind: 'text'; readonly value: string };

/** Elemento con hijos. */
export function elem(ns: NsKey, name: string, children: readonly XmlNode[]): XmlNode {
  return { kind: 'elem', ns, name, children };
}

/** Elemento con un único valor de texto. */
export function leaf(ns: NsKey, name: string, value: string): XmlNode {
  return { kind: 'elem', ns, name, children: [{ kind: 'text', value }] };
}

/** Elemento opcional: devuelve `[]` si el valor es `undefined`, para usar con `flatMap`. */
export function optional(
  ns: NsKey,
  name: string,
  value: string | undefined
): readonly XmlNode[] {
  return value === undefined ? [] : [leaf(ns, name, value)];
}

/** Escapa un valor de texto. No se exporta: nadie debe poder saltárselo. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapa un valor de atributo. */
function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

export interface SerializeOptions {
  /** Prefijo por espacio de nombres. */
  readonly prefixes: Readonly<Record<NsKey, string>>;
  /** URI por espacio de nombres. */
  readonly uris: Readonly<Record<NsKey, string>>;
  /** Espacios de nombres a declarar en el elemento raíz. */
  readonly declare: readonly NsKey[];
  /** Sangrado legible. Por defecto, no. */
  readonly pretty?: boolean;
}

/** Serializa el árbol. Único punto del proyecto que emite `<` y `>`. */
export function serialize(root: XmlNode, options: SerializeOptions): string {
  const { prefixes, uris, declare, pretty = false } = options;
  const nl = pretty ? '\n' : '';

  const render = (node: XmlNode, depth: number, isRoot: boolean): string => {
    if (node.kind === 'text') return escapeText(node.value);

    const sangria = pretty ? '  '.repeat(depth) : '';
    const tag = `${prefixes[node.ns]}:${node.name}`;
    const xmlns = isRoot
      ? declare
          .map((ns) => ` xmlns:${prefixes[ns]}="${escapeAttribute(uris[ns])}"`)
          .join('')
      : '';

    if (node.children.length === 0) return `${sangria}<${tag}${xmlns}/>`;

    const soloTexto = node.children.length === 1 && node.children[0]!.kind === 'text';
    if (soloTexto) {
      return `${sangria}<${tag}${xmlns}>${render(node.children[0]!, 0, false)}</${tag}>`;
    }

    const hijos = node.children.map((c) => render(c, depth + 1, false)).join(nl);
    return `${sangria}<${tag}${xmlns}>${nl}${hijos}${nl}${sangria}</${tag}>`;
  };

  return render(root, 0, true);
}

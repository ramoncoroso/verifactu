/**
 * Robustez del parser XML.
 *
 * Cada caso de aquí rompía el parser, y el más grave lo hacía **en silencio**:
 * un comentario o una instrucción de proceso hacía desaparecer todos los
 * elementos hermanos posteriores. No es «un árbol basura», es pérdida de datos.
 *
 * Importa porque `DescripcionErrorRegistro` es texto libre de hasta 1500
 * caracteres que la AEAT puede devolver con CDATA o entidades numéricas, y
 * porque un `<!DOCTYPE html>` de una página de error HTTP no lanzaba: devolvía
 * un árbol vacío y el fallo emergía tres capas más arriba como un error de
 * negocio inventado.
 */

import { describe, expect, it } from 'vitest';

import { getChild, getChildText, parseXml } from '../../src/xml/parser.js';

describe('Comentarios e instrucciones de proceso', () => {
  it('un comentario no hace desaparecer a sus hermanos', () => {
    const doc = parseXml('<r><!-- nota --><a>1</a><b>2</b></r>');
    expect(doc.children.map((c) => c.name)).toEqual(['a', 'b']);
    expect(getChildText(doc, 'a')).toBe('1');
    expect(getChildText(doc, 'b')).toBe('2');
  });

  it('un comentario con guiones y signos no confunde al parser', () => {
    const doc = parseXml('<r><!-- a > b & c "x" --><a>1</a></r>');
    expect(doc.children.map((c) => c.name)).toEqual(['a']);
  });

  it('una instrucción de proceso interna tampoco', () => {
    const doc = parseXml('<r><?pi datos?><a>1</a></r>');
    expect(doc.children.map((c) => c.name)).toEqual(['a']);
  });
});

describe('CDATA', () => {
  it('el contenido se conserva tal cual', () => {
    const doc = parseXml('<r><a><![CDATA[Pepe & Hijos <S.L.>]]></a></r>');
    expect(getChildText(doc, 'a')).toBe('Pepe & Hijos <S.L.>');
  });

  it('se puede mezclar con texto normal', () => {
    const doc = parseXml('<r><a>uno <![CDATA[& dos]]></a></r>');
    expect(getChildText(doc, 'a')).toBe('uno & dos');
  });
});

describe('DOCTYPE', () => {
  // Este es el que agravaba el diagnóstico de un 403: el documento se parseaba
  // sin lanzar y el error salía como «missing RespuestaRegFactura».
  it('una página HTML de error lanza en vez de devolver un árbol vacío', () => {
    expect(() =>
      parseXml('<!DOCTYPE html>\n<html><body>403 Forbidden</body></html>')
    ).not.toThrow();
    const doc = parseXml('<!DOCTYPE html>\n<html><body>403 Forbidden</body></html>');
    // El DOCTYPE se salta y la raíz real es <html>, no un nodo «!DOCTYPE» vacío.
    expect(doc.name).toBe('html');
    expect(getChild(doc, 'body')?.text).toContain('403');
  });

  it('se salta la declaración XML', () => {
    const doc = parseXml('<?xml version="1.0" encoding="UTF-8"?><r><a>1</a></r>');
    expect(doc.name).toBe('r');
  });
});

describe('Referencias de carácter', () => {
  it.each([
    ['&#38;', '&'],
    ['&#x26;', '&'],
    ['&#233;', 'é'],
    ['&#xE9;', 'é'],
    ['&#128512;', '\u{1F600}'],
  ])('%s se resuelve a %s', (entrada, esperado) => {
    expect(getChildText(parseXml(`<r><a>${entrada}</a></r>`), 'a')).toBe(esperado);
  });

  it('las entidades nombradas siguen funcionando, sin doble desescapado', () => {
    expect(getChildText(parseXml('<r><a>&amp;lt;</a></r>'), 'a')).toBe('&lt;');
    expect(getChildText(parseXml('<r><a>&lt;b&gt;</a></r>'), 'a')).toBe('<b>');
  });
});

describe('Atributos', () => {
  it('un atributo sin valor no se come al siguiente', () => {
    const a = getChild(parseXml('<r><a checked b="2">1</a></r>'), 'a');
    expect(a?.attributes['b']).toBe('2');
  });

  it('admite comillas simples', () => {
    const a = getChild(parseXml("<r><a b='2'>1</a></r>"), 'a');
    expect(a?.attributes['b']).toBe('2');
  });

  it('desescapa el valor', () => {
    const a = getChild(parseXml('<r><a b="x &amp; y">1</a></r>'), 'a');
    expect(a?.attributes['b']).toBe('x & y');
  });
});

describe('Texto', () => {
  // El recorte agresivo rompía `NumSerieFactura`, donde los espacios internos
  // son significativos.
  it('conserva los espacios internos', () => {
    expect(getChildText(parseXml('<r><a>12345678 / G33</a></r>'), 'a')).toBe('12345678 / G33');
  });

  it('un elemento con solo espacios no pierde su texto', () => {
    expect(getChildText(parseXml('<r><a> </a></r>'), 'a')).toBe(' ');
  });

  it('no inventa un espacio entre fragmentos de texto mixto', () => {
    expect(getChildText(parseXml('<r><a>uno<b/>dos</a></r>'), 'a')).toBe('unodos');
  });
});

describe('Documentos mal formados', () => {
  it('lanza si no hay elemento raíz', () => {
    expect(() => parseXml('no soy xml')).toThrow();
    expect(() => parseXml('')).toThrow();
  });

  it('lanza si una etiqueta no se cierra', () => {
    expect(() => parseXml('<r><a>1</r>')).toThrow();
  });
});

describe('Espacios de nombres', () => {
  it('expone el prefijo y el nombre local por separado', () => {
    const doc = parseXml('<sf:r xmlns:sf="urn:x"><sf:a>1</sf:a></sf:r>');
    expect(doc.name).toBe('r');
    expect(doc.prefix).toBe('sf');
    expect(doc.fullName).toBe('sf:r');
    // Buscar por nombre local es lo que permite ignorar el prefijo que use la AEAT.
    expect(getChildText(doc, 'a')).toBe('1');
  });
});

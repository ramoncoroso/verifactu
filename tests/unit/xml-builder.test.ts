/**
 * Tests for XML Builder
 */

import { describe, it, expect } from 'vitest';
import {
  element,
  escapeXml,
  escapeXmlAttribute,
  formatXmlNumber,
  formatXmlDate,
  formatXmlDateTime,
  document,
  xml,
  fragment,
  serializeElement,
} from '../../src/xml/builder.js';

describe('XML Builder', () => {
  describe('escapeXml', () => {
    it('should escape ampersand', () => {
      expect(escapeXml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeXml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(escapeXml('a > b')).toBe('a &gt; b');
    });

    it('should escape quotes', () => {
      expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('should escape apostrophe', () => {
      expect(escapeXml("it's")).toBe("it&apos;s");
    });

    it('should handle multiple escapes', () => {
      expect(escapeXml('<a & b>')).toBe('&lt;a &amp; b&gt;');
    });
  });

  describe('escapeXmlAttribute', () => {
    it('should escape attribute values', () => {
      expect(escapeXmlAttribute('value with "quotes"')).toBe('value with &quot;quotes&quot;');
    });
  });

  describe('formatXmlNumber', () => {
    it('should format with default 2 decimals', () => {
      expect(formatXmlNumber(100)).toBe('100.00');
    });

    it('should format with specified decimals', () => {
      expect(formatXmlNumber(100.5, 3)).toBe('100.500');
    });

    it('should round correctly', () => {
      expect(formatXmlNumber(100.999, 2)).toBe('101.00');
    });

    it('should handle negative numbers', () => {
      expect(formatXmlNumber(-50.5, 2)).toBe('-50.50');
    });
  });

  describe('formatXmlDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      expect(formatXmlDate(date)).toBe('2024-01-15');
    });

    it('should pad single digit months and days', () => {
      const date = new Date(2024, 4, 5); // May 5, 2024
      expect(formatXmlDate(date)).toBe('2024-05-05');
    });
  });

  describe('formatXmlDateTime', () => {
    it('should format datetime as YYYY-MM-DDTHH:mm:ss', () => {
      const date = new Date(2024, 0, 15, 10, 30, 45);
      expect(formatXmlDateTime(date)).toBe('2024-01-15T10:30:45');
    });

    it('should pad single digit time components', () => {
      const date = new Date(2024, 0, 1, 1, 5, 9);
      expect(formatXmlDateTime(date)).toBe('2024-01-01T01:05:09');
    });
  });

  describe('element builder', () => {
    it('should create simple element', () => {
      const el = element('test').build();
      expect(el.name).toBe('test');
      expect(el.children).toEqual([]);
      expect(el.attributes).toEqual([]);
    });

    it('should add text content', () => {
      const el = element('test').text('hello').build();
      expect(el.children).toEqual(['hello']);
    });

    it('should add attributes', () => {
      const el = element('test').attr('id', '123').build();
      expect(el.attributes).toEqual([{ name: 'id', value: '123' }]);
    });

    it('should add multiple attributes', () => {
      const el = element('test')
        .attr('id', '123')
        .attr('class', 'main')
        .build();
      expect(el.attributes).toHaveLength(2);
    });

    it('should add child elements', () => {
      const el = element('parent')
        .child(element('child1').text('a'))
        .child(element('child2').text('b'))
        .build();
      expect(el.children).toHaveLength(2);
    });

    it('should support elem shorthand', () => {
      const el = element('parent')
        .elem('child', 'value')
        .build();
      expect(el.children).toHaveLength(1);
    });

    it('should support attrIf for conditional attributes', () => {
      const el1 = element('test').attrIf('id', '123').build();
      const el2 = element('test').attrIf('id', undefined).build();
      const el3 = element('test').attrIf('id', null).build();

      expect(el1.attributes).toHaveLength(1);
      expect(el2.attributes).toHaveLength(0);
      expect(el3.attributes).toHaveLength(0);
    });

    it('should support elemIf for conditional elements', () => {
      const el1 = element('parent').elemIf('child', 'value').build();
      const el2 = element('parent').elemIf('child', undefined).build();

      expect(el1.children).toHaveLength(1);
      expect(el2.children).toHaveLength(0);
    });

    it('should handle namespace', () => {
      const el = element('test', 'ns').build();
      expect(el.namespace).toBe('ns');
    });
  });

  describe('serializeElement', () => {
    it('should serialize simple element', () => {
      const el = element('test').build();
      expect(serializeElement(el)).toBe('<test/>');
    });

    it('should serialize element with text', () => {
      const el = element('test').text('hello').build();
      expect(serializeElement(el)).toBe('<test>hello</test>');
    });

    it('should serialize element with attributes', () => {
      const el = element('test').attr('id', '123').build();
      expect(serializeElement(el)).toBe('<test id="123"/>');
    });

    it('should serialize nested elements', () => {
      const el = element('parent')
        .child(element('child').text('value'))
        .build();
      expect(serializeElement(el)).toContain('<parent>');
      expect(serializeElement(el)).toContain('<child>value</child>');
      expect(serializeElement(el)).toContain('</parent>');
    });

    it('should escape text content', () => {
      const el = element('test').text('<script>').build();
      expect(serializeElement(el)).toBe('<test>&lt;script&gt;</test>');
    });

    it('should escape attribute values', () => {
      const el = element('test').attr('data', '"quoted"').build();
      expect(serializeElement(el)).toContain('data="&quot;quoted&quot;"');
    });

    it('should serialize element with namespace', () => {
      const el = element('Invoice', 'sum').build();
      expect(serializeElement(el)).toBe('<sum:Invoice/>');
    });

    it('should serialize element with namespace and children', () => {
      const el = element('Invoice', 'sum')
        .child(element('Number').text('001'))
        .build();
      const result = serializeElement(el);
      expect(result).toContain('<sum:Invoice>');
      expect(result).toContain('</sum:Invoice>');
    });

    it('should serialize attribute with namespace', () => {
      const el = element('test')
        .attr('type', 'string', 'xsi')
        .build();
      expect(serializeElement(el)).toContain('xsi:type="string"');
    });

    it('should serialize with pretty printing', () => {
      const el = element('parent')
        .child(element('child1').text('a'))
        .child(element('child2').text('b'))
        .build();
      const result = serializeElement(el, true);
      expect(result).toContain('\n');
    });

    it('should serialize mixed text and element children with pretty printing', () => {
      const el = {
        name: 'parent',
        attributes: [],
        children: ['text node', element('child').text('value').build()],
      };
      const result = serializeElement(el, true);
      expect(result).toContain('text node');
      expect(result).toContain('<child>value</child>');
    });
  });

  describe('document builder', () => {
    it('should build document with declaration', () => {
      const doc = document()
        .setRoot(element('root').text('content'))
        .build();
      expect(doc).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(doc).toContain('<root>content</root>');
    });

    it('should build document without declaration', () => {
      const doc = document()
        .withDeclaration(false)
        .setRoot(element('root'))
        .build();
      expect(doc).not.toContain('<?xml');
    });

    it('should add namespace declarations', () => {
      const doc = document()
        .namespace('soapenv', 'http://schemas.xmlsoap.org/soap/envelope/')
        .setRoot(element('soapenv:Envelope'))
        .build();
      expect(doc).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
    });

    it('should support pretty printing', () => {
      const doc = document()
        .setRoot(
          element('root')
            .child(element('child1'))
            .child(element('child2'))
        )
        .buildPretty();
      expect(doc).toContain('\n');
    });
  });

  describe('xml helper', () => {
    it('should create simple XML string', () => {
      expect(xml('tag', 'value')).toBe('<tag>value</tag>');
    });

    it('should return empty string for undefined content', () => {
      expect(xml('tag', undefined)).toBe('');
    });

    it('should support namespace prefix', () => {
      expect(xml('tag', 'value', 'ns')).toBe('<ns:tag>value</ns:tag>');
    });

    it('should escape content', () => {
      expect(xml('tag', '<>&')).toBe('<tag>&lt;&gt;&amp;</tag>');
    });
  });

  describe('fragment helper', () => {
    it('should concatenate elements', () => {
      const result = fragment(
        xml('a', '1'),
        xml('b', '2')
      );
      expect(result).toBe('<a>1</a><b>2</b>');
    });

    it('should filter undefined elements', () => {
      const result = fragment(
        xml('a', '1'),
        undefined,
        xml('b', '2')
      );
      expect(result).toBe('<a>1</a><b>2</b>');
    });
  });
});

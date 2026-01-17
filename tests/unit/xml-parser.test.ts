/**
 * Tests for XML Parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseXml,
  findNode,
  findAllNodes,
  getChild,
  getChildText,
  getChildren,
  nodeToObject,
  unescapeXml,
} from '../../src/xml/parser.js';
import { XmlParseError } from '../../src/errors/xml-errors.js';

describe('XML Parser', () => {
  describe('unescapeXml', () => {
    it('should unescape &lt;', () => {
      expect(unescapeXml('&lt;')).toBe('<');
    });

    it('should unescape &gt;', () => {
      expect(unescapeXml('&gt;')).toBe('>');
    });

    it('should unescape &amp;', () => {
      expect(unescapeXml('&amp;')).toBe('&');
    });

    it('should unescape &quot;', () => {
      expect(unescapeXml('&quot;')).toBe('"');
    });

    it('should unescape &apos;', () => {
      expect(unescapeXml('&apos;')).toBe("'");
    });

    it('should handle multiple entities', () => {
      expect(unescapeXml('&lt;tag&gt;&amp;&lt;/tag&gt;')).toBe('<tag>&</tag>');
    });
  });

  describe('parseXml', () => {
    it('should parse simple element', () => {
      const node = parseXml('<root/>');
      expect(node.name).toBe('root');
      expect(node.children).toEqual([]);
    });

    it('should parse element with text content', () => {
      const node = parseXml('<root>Hello</root>');
      expect(node.name).toBe('root');
      expect(node.text).toBe('Hello');
    });

    it('should parse element with attributes', () => {
      const node = parseXml('<root id="123" class="main"/>');
      expect(node.attributes['id']).toBe('123');
      expect(node.attributes['class']).toBe('main');
    });

    it('should parse nested elements', () => {
      const node = parseXml('<root><child>value</child></root>');
      expect(node.children).toHaveLength(1);
      expect(node.children[0]?.name).toBe('child');
      expect(node.children[0]?.text).toBe('value');
    });

    it('should handle namespaced elements', () => {
      const node = parseXml('<soapenv:Envelope xmlns:soapenv="http://test.com"/>');
      expect(node.name).toBe('Envelope');
      expect(node.fullName).toBe('soapenv:Envelope');
      expect(node.prefix).toBe('soapenv');
    });

    it('should handle namespaced attributes', () => {
      const node = parseXml('<root xmlns:xsi="http://test.com" xsi:type="string"/>');
      expect(node.attributes['type']).toBe('string');
      expect(node.attributes['xsi:type']).toBe('string');
    });

    it('should strip XML declaration', () => {
      const node = parseXml('<?xml version="1.0" encoding="UTF-8"?><root/>');
      expect(node.name).toBe('root');
    });

    it('should unescape text content', () => {
      const node = parseXml('<root>&lt;escaped&gt;</root>');
      expect(node.text).toBe('<escaped>');
    });

    it('should unescape attribute values', () => {
      const node = parseXml('<root data="&quot;quoted&quot;"/>');
      expect(node.attributes['data']).toBe('"quoted"');
    });

    it('should throw on invalid XML', () => {
      expect(() => parseXml('')).toThrow(XmlParseError);
    });

    it('should parse multiple children', () => {
      const node = parseXml('<root><a>1</a><b>2</b><c>3</c></root>');
      expect(node.children).toHaveLength(3);
    });

    it('should handle self-closing elements', () => {
      const node = parseXml('<root><empty/><full>text</full></root>');
      expect(node.children).toHaveLength(2);
      expect(node.children[0]?.text).toBeUndefined();
      expect(node.children[1]?.text).toBe('text');
    });
  });

  describe('findNode', () => {
    it('should find node by name', () => {
      const root = parseXml('<root><parent><child>value</child></parent></root>');
      const found = findNode(root, 'child');
      expect(found).toBeDefined();
      expect(found?.text).toBe('value');
    });

    it('should find root if it matches', () => {
      const root = parseXml('<target>content</target>');
      const found = findNode(root, 'target');
      expect(found).toBeDefined();
      expect(found?.name).toBe('target');
    });

    it('should return undefined if not found', () => {
      const root = parseXml('<root><child/></root>');
      const found = findNode(root, 'nonexistent');
      expect(found).toBeUndefined();
    });

    it('should find deeply nested node', () => {
      const root = parseXml('<a><b><c><d>deep</d></c></b></a>');
      const found = findNode(root, 'd');
      expect(found?.text).toBe('deep');
    });
  });

  describe('findAllNodes', () => {
    it('should find all matching nodes', () => {
      const root = parseXml('<root><item>1</item><item>2</item><item>3</item></root>');
      const found = findAllNodes(root, 'item');
      expect(found).toHaveLength(3);
    });

    it('should find nodes at different levels', () => {
      const root = parseXml('<root><item>1</item><nested><item>2</item></nested></root>');
      const found = findAllNodes(root, 'item');
      expect(found).toHaveLength(2);
    });

    it('should return empty array if no matches', () => {
      const root = parseXml('<root><other/></root>');
      const found = findAllNodes(root, 'item');
      expect(found).toEqual([]);
    });
  });

  describe('getChild', () => {
    it('should get direct child by name', () => {
      const root = parseXml('<root><child>value</child></root>');
      const child = getChild(root, 'child');
      expect(child).toBeDefined();
      expect(child?.text).toBe('value');
    });

    it('should not find nested children', () => {
      const root = parseXml('<root><parent><child>value</child></parent></root>');
      const child = getChild(root, 'child');
      expect(child).toBeUndefined();
    });

    it('should return first matching child', () => {
      const root = parseXml('<root><child>first</child><child>second</child></root>');
      const child = getChild(root, 'child');
      expect(child?.text).toBe('first');
    });
  });

  describe('getChildText', () => {
    it('should get text of direct child', () => {
      const root = parseXml('<root><name>John</name></root>');
      expect(getChildText(root, 'name')).toBe('John');
    });

    it('should return undefined for non-existent child', () => {
      const root = parseXml('<root><other/></root>');
      expect(getChildText(root, 'name')).toBeUndefined();
    });

    it('should return undefined for child without text', () => {
      const root = parseXml('<root><empty/></root>');
      expect(getChildText(root, 'empty')).toBeUndefined();
    });
  });

  describe('getChildren', () => {
    it('should get all direct children with name', () => {
      const root = parseXml('<root><item>1</item><other/><item>2</item></root>');
      const items = getChildren(root, 'item');
      expect(items).toHaveLength(2);
    });

    it('should return empty array if no matching children', () => {
      const root = parseXml('<root><other/></root>');
      const items = getChildren(root, 'item');
      expect(items).toEqual([]);
    });
  });

  describe('nodeToObject', () => {
    it('should convert children to object', () => {
      const root = parseXml('<root><name>John</name><age>30</age></root>');
      const obj = nodeToObject(root);
      expect(obj).toEqual({ name: 'John', age: '30' });
    });

    it('should handle missing text content', () => {
      const root = parseXml('<root><name>John</name><empty/></root>');
      const obj = nodeToObject(root);
      expect(obj).toEqual({ name: 'John', empty: undefined });
    });
  });

  describe('SOAP response parsing', () => {
    it('should parse typical SOAP response', () => {
      const soap = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
          <soapenv:Header/>
          <soapenv:Body>
            <Response>
              <EstadoEnvio>
                <Codigo>00</Codigo>
                <Descripcion>Correcto</Descripcion>
              </EstadoEnvio>
            </Response>
          </soapenv:Body>
        </soapenv:Envelope>
      `;
      const root = parseXml(soap);
      const codigo = findNode(root, 'Codigo');
      expect(codigo?.text).toBe('00');
    });

    it('should parse SOAP fault', () => {
      const soap = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
          <soapenv:Body>
            <soapenv:Fault>
              <faultcode>soapenv:Server</faultcode>
              <faultstring>Error processing request</faultstring>
            </soapenv:Fault>
          </soapenv:Body>
        </soapenv:Envelope>
      `;
      const root = parseXml(soap);
      const faultCode = findNode(root, 'faultcode');
      const faultString = findNode(root, 'faultstring');
      expect(faultCode?.text).toBe('soapenv:Server');
      expect(faultString?.text).toBe('Error processing request');
    });
  });
});

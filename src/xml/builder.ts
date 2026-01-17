/**
 * Zero-dependency XML Builder for Verifactu
 *
 * Provides a fluent interface for building XML documents
 * with proper escaping and namespace support.
 */

import { XmlBuildError } from '../errors/xml-errors.js';

/**
 * XML namespace definition
 */
export interface XmlNamespace {
  prefix: string;
  uri: string;
}

/**
 * XML attribute
 */
export interface XmlAttribute {
  name: string;
  value: string;
  namespace?: string;
}

/**
 * XML element node
 */
export interface XmlElement {
  name: string;
  namespace?: string;
  attributes: XmlAttribute[];
  children: (XmlElement | string)[];
}

/**
 * Escape XML special characters
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape XML attribute value
 */
export function escapeXmlAttribute(value: string): string {
  return escapeXml(value);
}

/**
 * Format a number for XML (with proper decimal handling)
 */
export function formatXmlNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * Format a date for XML (ISO format: YYYY-MM-DD)
 */
export function formatXmlDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a datetime for XML (ISO format: YYYY-MM-DDTHH:mm:ss)
 */
export function formatXmlDateTime(date: Date): string {
  const dateStr = formatXmlDate(date);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${dateStr}T${hours}:${minutes}:${seconds}`;
}

/**
 * XML Element Builder
 */
export class XmlElementBuilder {
  private element: XmlElement;

  constructor(name: string, namespace?: string) {
    this.element = {
      name,
      namespace,
      attributes: [],
      children: [],
    };
  }

  /**
   * Add an attribute to the element
   */
  attr(name: string, value: string | number | boolean, namespace?: string): this {
    this.element.attributes.push({
      name,
      value: String(value),
      namespace,
    });
    return this;
  }

  /**
   * Add an attribute only if the value is defined
   */
  attrIf(
    name: string,
    value: string | number | boolean | undefined | null,
    namespace?: string
  ): this {
    if (value !== undefined && value !== null) {
      this.attr(name, value, namespace);
    }
    return this;
  }

  /**
   * Add text content to the element
   */
  text(content: string | number): this {
    this.element.children.push(String(content));
    return this;
  }

  /**
   * Add a child element
   */
  child(element: XmlElement | XmlElementBuilder): this {
    if (element instanceof XmlElementBuilder) {
      this.element.children.push(element.build());
    } else {
      this.element.children.push(element);
    }
    return this;
  }

  /**
   * Add a simple child element with text content
   */
  elem(name: string, content: string | number, namespace?: string): this {
    const child = new XmlElementBuilder(name, namespace);
    child.text(content);
    this.element.children.push(child.build());
    return this;
  }

  /**
   * Add a child element only if the content is defined
   */
  elemIf(
    name: string,
    content: string | number | undefined | null,
    namespace?: string
  ): this {
    if (content !== undefined && content !== null) {
      this.elem(name, content, namespace);
    }
    return this;
  }

  /**
   * Add multiple children using a callback
   */
  children(callback: (builder: this) => void): this {
    callback(this);
    return this;
  }

  /**
   * Build the XML element
   */
  build(): XmlElement {
    return { ...this.element };
  }
}

/**
 * Create a new XML element builder
 */
export function element(name: string, namespace?: string): XmlElementBuilder {
  return new XmlElementBuilder(name, namespace);
}

/**
 * XML Document Builder
 */
export class XmlDocumentBuilder {
  private declaration: boolean = true;
  private encoding: string = 'UTF-8';
  private namespaces: Map<string, string> = new Map();
  private root: XmlElement | null = null;

  /**
   * Set XML declaration settings
   */
  withDeclaration(include: boolean = true, encoding: string = 'UTF-8'): this {
    this.declaration = include;
    this.encoding = encoding;
    return this;
  }

  /**
   * Register a namespace
   */
  namespace(prefix: string, uri: string): this {
    this.namespaces.set(prefix, uri);
    return this;
  }

  /**
   * Set the root element
   */
  setRoot(element: XmlElement | XmlElementBuilder): this {
    if (element instanceof XmlElementBuilder) {
      this.root = element.build();
    } else {
      this.root = element;
    }
    return this;
  }

  /**
   * Serialize an element to string
   */
  private serializeElement(elem: XmlElement, indent: string, pretty: boolean): string {
    const parts: string[] = [];
    const newline = pretty ? '\n' : '';
    const childIndent = pretty ? indent + '  ' : '';

    // Opening tag
    let tagName = elem.name;
    if (elem.namespace) {
      tagName = `${elem.namespace}:${elem.name}`;
    }

    parts.push(`${indent}<${tagName}`);

    // Attributes
    for (const attr of elem.attributes) {
      let attrName = attr.name;
      if (attr.namespace) {
        attrName = `${attr.namespace}:${attr.name}`;
      }
      parts.push(` ${attrName}="${escapeXmlAttribute(attr.value)}"`);
    }

    // Check if element has content
    if (elem.children.length === 0) {
      parts.push('/>');
      return parts.join('');
    }

    parts.push('>');

    // Children
    const hasOnlyText = elem.children.length === 1 && typeof elem.children[0] === 'string';

    if (hasOnlyText) {
      // Single text node - inline
      parts.push(escapeXml(elem.children[0] as string));
    } else {
      // Mixed or element children
      parts.push(newline);
      for (const child of elem.children) {
        if (typeof child === 'string') {
          parts.push(childIndent + escapeXml(child) + newline);
        } else {
          parts.push(this.serializeElement(child, childIndent, pretty) + newline);
        }
      }
      parts.push(indent);
    }

    // Closing tag
    parts.push(`</${tagName}>`);

    return parts.join('');
  }

  /**
   * Build the complete XML document string
   */
  build(pretty: boolean = false): string {
    if (!this.root) {
      throw new XmlBuildError('No root element set');
    }

    const parts: string[] = [];
    const newline = pretty ? '\n' : '';

    // XML declaration
    if (this.declaration) {
      parts.push(`<?xml version="1.0" encoding="${this.encoding}"?>${newline}`);
    }

    // Add namespace declarations to root element
    const rootWithNamespaces = { ...this.root };
    for (const [prefix, uri] of this.namespaces) {
      const attrName = prefix === '' ? 'xmlns' : `xmlns:${prefix}`;
      rootWithNamespaces.attributes = [
        { name: attrName, value: uri },
        ...rootWithNamespaces.attributes,
      ];
    }

    // Serialize root element
    parts.push(this.serializeElement(rootWithNamespaces, '', pretty));

    return parts.join('');
  }

  /**
   * Build as a minified string (no whitespace)
   */
  buildMinified(): string {
    return this.build(false);
  }

  /**
   * Build as a pretty-printed string
   */
  buildPretty(): string {
    return this.build(true);
  }
}

/**
 * Create a new XML document builder
 */
export function document(): XmlDocumentBuilder {
  return new XmlDocumentBuilder();
}

/**
 * Quick helper to create a simple XML string
 */
export function xml(
  name: string,
  content: string | number | undefined,
  namespace?: string
): string {
  if (content === undefined) {
    return '';
  }
  const tagName = namespace ? `${namespace}:${name}` : name;
  return `<${tagName}>${escapeXml(String(content))}</${tagName}>`;
}

/**
 * Create an XML fragment from multiple elements
 */
export function fragment(...elements: (string | undefined)[]): string {
  return elements.filter((e): e is string => e !== undefined).join('');
}

/**
 * Serialize an XmlElement to string
 */
export function serializeElement(elem: XmlElement, pretty: boolean = false): string {
  const indent = '';
  const newline = pretty ? '\n' : '';
  const childIndent = pretty ? '  ' : '';

  function serialize(el: XmlElement, ind: string): string {
    const parts: string[] = [];
    let tagName = el.name;
    if (el.namespace) {
      tagName = `${el.namespace}:${el.name}`;
    }

    parts.push(`${ind}<${tagName}`);

    for (const attr of el.attributes) {
      let attrName = attr.name;
      if (attr.namespace) {
        attrName = `${attr.namespace}:${attr.name}`;
      }
      parts.push(` ${attrName}="${escapeXmlAttribute(attr.value)}"`);
    }

    if (el.children.length === 0) {
      parts.push('/>');
      return parts.join('');
    }

    parts.push('>');

    const hasOnlyText = el.children.length === 1 && typeof el.children[0] === 'string';

    if (hasOnlyText) {
      parts.push(escapeXml(el.children[0] as string));
    } else {
      parts.push(newline);
      for (const child of el.children) {
        if (typeof child === 'string') {
          parts.push(ind + childIndent + escapeXml(child) + newline);
        } else {
          parts.push(serialize(child, ind + childIndent) + newline);
        }
      }
      parts.push(ind);
    }

    parts.push(`</${tagName}>`);
    return parts.join('');
  }

  return serialize(elem, indent);
}

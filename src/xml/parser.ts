/**
 * Zero-dependency XML Parser for Verifactu
 *
 * Simple XML parser for handling SOAP responses from AEAT.
 * Not a full XML parser - optimized for the specific use case.
 */

import { XmlParseError } from '../errors/xml-errors.js';

/**
 * Parsed XML node
 */
export interface XmlNode {
  /** Tag name (without namespace prefix) */
  name: string;
  /** Full tag name (with namespace prefix) */
  fullName: string;
  /** Namespace prefix */
  prefix?: string;
  /** Attributes */
  attributes: Record<string, string>;
  /** Child nodes */
  children: XmlNode[];
  /** Text content */
  text?: string;
}

/**
 * Unescape XML entities
 */
export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse an XML string into a node tree
 */
export function parseXml(xml: string): XmlNode {
  // Remove XML declaration if present
  let content = xml.trim();
  if (content.startsWith('<?xml')) {
    const endDecl = content.indexOf('?>');
    if (endDecl !== -1) {
      content = content.substring(endDecl + 2).trim();
    }
  }

  // Simple regex-based parser for well-formed XML
  const result = parseElement(content, 0);
  if (!result.node) {
    throw new XmlParseError('Failed to parse root element');
  }

  return result.node;
}

interface ParseResult {
  node: XmlNode | null;
  endIndex: number;
}

/**
 * Parse a single XML element
 */
function parseElement(xml: string, startIndex: number): ParseResult {
  // Skip whitespace
  let index = startIndex;
  while (index < xml.length && /\s/.test(xml[index] ?? '')) {
    index++;
  }

  // Check for opening tag
  if (xml[index] !== '<') {
    return { node: null, endIndex: index };
  }

  // Find the tag name
  const tagStart = index + 1;
  let tagEnd = tagStart;
  while (tagEnd < xml.length && !/[\s>\/]/.test(xml[tagEnd] ?? '')) {
    tagEnd++;
  }

  const fullName = xml.substring(tagStart, tagEnd);

  // Parse namespace prefix
  let name = fullName;
  let prefix: string | undefined;
  const colonIndex = fullName.indexOf(':');
  if (colonIndex !== -1) {
    prefix = fullName.substring(0, colonIndex);
    name = fullName.substring(colonIndex + 1);
  }

  // Parse attributes
  const attributes: Record<string, string> = {};
  let pos = tagEnd;

  while (pos < xml.length) {
    // Skip whitespace
    while (pos < xml.length && /\s/.test(xml[pos] ?? '')) {
      pos++;
    }

    // Check for end of opening tag
    if (xml[pos] === '>' || xml[pos] === '/') {
      break;
    }

    // Parse attribute name
    const attrNameStart = pos;
    while (pos < xml.length && xml[pos] !== '=' && !/[\s>\/]/.test(xml[pos] ?? '')) {
      pos++;
    }
    const attrName = xml.substring(attrNameStart, pos);

    // Skip to value
    while (pos < xml.length && xml[pos] !== '"' && xml[pos] !== "'") {
      pos++;
    }

    if (pos >= xml.length) break;

    const quote = xml[pos];
    pos++; // Skip opening quote
    const valueStart = pos;
    while (pos < xml.length && xml[pos] !== quote) {
      pos++;
    }
    const attrValue = unescapeXml(xml.substring(valueStart, pos));
    pos++; // Skip closing quote

    // Store attribute (strip namespace prefix from attribute name for easier access)
    const attrColonIndex = attrName.indexOf(':');
    const simpleAttrName = attrColonIndex !== -1 ? attrName.substring(attrColonIndex + 1) : attrName;
    attributes[simpleAttrName] = attrValue;
    attributes[attrName] = attrValue; // Also store with full name
  }

  // Check for self-closing tag
  if (xml[pos] === '/') {
    pos++; // Skip /
    while (pos < xml.length && xml[pos] !== '>') {
      pos++;
    }
    pos++; // Skip >
    return {
      node: { name, fullName, prefix, attributes, children: [] },
      endIndex: pos,
    };
  }

  // Skip closing bracket of opening tag
  pos++; // Skip >

  // Parse children and text content
  const children: XmlNode[] = [];
  let textContent = '';

  while (pos < xml.length) {
    // Skip whitespace (but preserve for text)
    const wsStart = pos;
    while (pos < xml.length && /\s/.test(xml[pos] ?? '') && xml[pos] !== '<') {
      pos++;
    }

    // Check for closing tag
    if (xml[pos] === '<' && xml[pos + 1] === '/') {
      // Find end of closing tag
      const closeTagEnd = xml.indexOf('>', pos);
      if (closeTagEnd !== -1) {
        pos = closeTagEnd + 1;
      }
      break;
    }

    // Check for child element
    if (xml[pos] === '<') {
      const childResult = parseElement(xml, pos);
      if (childResult.node) {
        children.push(childResult.node);
        pos = childResult.endIndex;
      } else {
        pos++;
      }
    } else if (pos < xml.length) {
      // Text content
      const textStart = pos;
      while (pos < xml.length && xml[pos] !== '<') {
        pos++;
      }
      const rawText = xml.substring(textStart, pos);
      const trimmedText = rawText.trim();
      if (trimmedText) {
        textContent += (textContent ? ' ' : '') + unescapeXml(trimmedText);
      }
    }
  }

  return {
    node: {
      name,
      fullName,
      prefix,
      attributes,
      children,
      text: textContent || undefined,
    },
    endIndex: pos,
  };
}

/**
 * Find a child node by name (searches recursively)
 */
export function findNode(node: XmlNode, name: string): XmlNode | undefined {
  // Check current node
  if (node.name === name) {
    return node;
  }

  // Search children
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * Find all nodes matching a name
 */
export function findAllNodes(node: XmlNode, name: string): XmlNode[] {
  const results: XmlNode[] = [];

  if (node.name === name) {
    results.push(node);
  }

  for (const child of node.children) {
    results.push(...findAllNodes(child, name));
  }

  return results;
}

/**
 * Get direct child by name
 */
export function getChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

/**
 * Get text content of a child element
 */
export function getChildText(node: XmlNode, name: string): string | undefined {
  const child = getChild(node, name);
  return child?.text;
}

/**
 * Get all direct children with a given name
 */
export function getChildren(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/**
 * Extract a simple object from XML node children
 */
export function nodeToObject(node: XmlNode): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const child of node.children) {
    result[child.name] = child.text;
  }
  return result;
}

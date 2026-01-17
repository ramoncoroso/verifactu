/**
 * XML-related errors
 */

import { VerifactuError, ErrorCode, type ErrorContext } from './base-error.js';

/**
 * Base class for XML errors
 */
export class XmlError extends VerifactuError {
  constructor(message: string, code: ErrorCode = ErrorCode.XML_BUILD_ERROR, context?: ErrorContext) {
    super(message, code, { context });
    this.name = 'XmlError';
  }
}

/**
 * XML build error
 */
export class XmlBuildError extends XmlError {
  constructor(reason: string, element?: string) {
    super(
      element ? `Failed to build XML element '${element}': ${reason}` : `Failed to build XML: ${reason}`,
      ErrorCode.XML_BUILD_ERROR,
      {
        field: element,
        details: { reason },
      }
    );
    this.name = 'XmlBuildError';
  }
}

/**
 * XML parse error
 */
export class XmlParseError extends XmlError {
  readonly line?: number;
  readonly column?: number;

  constructor(
    reason: string,
    options?: {
      line?: number;
      column?: number;
      cause?: Error;
    }
  ) {
    const location =
      options?.line !== undefined
        ? ` at line ${options.line}${options.column !== undefined ? `, column ${options.column}` : ''}`
        : '';
    super(`Failed to parse XML${location}: ${reason}`, ErrorCode.XML_PARSE_ERROR, {
      details: {
        line: options?.line,
        column: options?.column,
      },
    });
    this.name = 'XmlParseError';
    this.line = options?.line;
    this.column = options?.column;
  }
}

/**
 * XML template error
 */
export class XmlTemplateError extends XmlError {
  constructor(templateName: string, reason: string) {
    super(`Template '${templateName}' error: ${reason}`, ErrorCode.XML_TEMPLATE_ERROR, {
      field: 'template',
      value: templateName,
      details: { reason },
    });
    this.name = 'XmlTemplateError';
  }
}

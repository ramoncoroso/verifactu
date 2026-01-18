# Contribuir a Verifactu

¡Gracias por tu interés en contribuir a Verifactu! Este documento proporciona las pautas y mejores prácticas para contribuir al proyecto.

## Código de Conducta

Este proyecto y todos sus participantes están regidos por nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Al participar, se espera que respetes este código.

## Cómo Contribuir

### Reportar Bugs

Si encuentras un bug, por favor crea un issue utilizando la plantilla de bug report. Incluye:

1. **Descripción clara** del problema
2. **Pasos para reproducir** el comportamiento
3. **Comportamiento esperado** vs comportamiento actual
4. **Entorno**: versión de Node.js, sistema operativo, versión de la librería
5. **Logs o capturas** si son relevantes (¡nunca incluyas credenciales!)

### Sugerir Mejoras

Para sugerir nuevas funcionalidades:

1. Verifica que no exista ya un issue similar
2. Usa la plantilla de feature request
3. Describe el caso de uso y el problema que resuelve
4. Si es posible, proporciona ejemplos de API

### Pull Requests

1. **Fork** el repositorio
2. **Crea una rama** desde `master`: `git checkout -b feature/mi-mejora`
3. **Realiza tus cambios** siguiendo las guías de estilo
4. **Añade tests** para cualquier funcionalidad nueva
5. **Ejecuta la suite de tests**: `npm test`
6. **Ejecuta el linter**: `npm run lint`
7. **Haz commit** usando Conventional Commits
8. **Crea el Pull Request** con una descripción clara

## Configuración del Entorno de Desarrollo

### Requisitos

- Node.js >= 18.0.0
- npm >= 9.0.0

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/your-username/verifactu.git
cd verifactu

# Instalar dependencias
npm install

# Ejecutar tests
npm test

# Ejecutar linter
npm run lint

# Compilar
npm run build
```

### Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run build` | Compila TypeScript a ESM y CJS |
| `npm test` | Ejecuta todos los tests |
| `npm run test:watch` | Ejecuta tests en modo watch |
| `npm run test:coverage` | Ejecuta tests con cobertura |
| `npm run lint` | Verifica el código con ESLint |
| `npm run lint:fix` | Corrige problemas de lint automáticamente |
| `npm run typecheck` | Verifica tipos TypeScript |

## Guía de Estilo

### TypeScript

- Usamos **TypeScript strict mode** con configuración estricta
- Todas las funciones públicas deben tener tipos explícitos
- Preferir interfaces sobre types cuando sea posible
- Usar `unknown` en lugar de `any`

### Formato

- Indentación: 2 espacios
- Semicolons: obligatorios
- Comillas: simples para strings
- Trailing commas: en arrays y objetos multilínea

El proyecto usa ESLint con la configuración en `eslint.config.js`. Ejecuta `npm run lint:fix` antes de hacer commit.

### Estructura del Código

```
src/
├── client/          # Cliente principal y retry
├── crypto/          # Certificados y hashing
├── errors/          # Jerarquía de errores
├── soap/            # Comunicación SOAP con AEAT
├── types/           # Tipos e interfaces
├── validation/      # Validaciones NIF, facturas
├── xml/             # Generación y parseo XML
└── index.ts         # Exports públicos
```

## Conventional Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/) para los mensajes de commit:

```
<tipo>(<alcance>): <descripción>

[cuerpo opcional]

[pie opcional]
```

### Tipos

| Tipo | Descripción | Versión |
|------|-------------|---------|
| `feat` | Nueva funcionalidad | MINOR |
| `fix` | Corrección de bug | PATCH |
| `docs` | Solo documentación | - |
| `style` | Formato (no afecta código) | - |
| `refactor` | Refactoring sin cambio funcional | - |
| `perf` | Mejora de rendimiento | PATCH |
| `test` | Añadir o corregir tests | - |
| `chore` | Mantenimiento, CI, etc. | - |

### Ejemplos

```bash
feat(client): add automatic retry with exponential backoff

fix(validation): correct NIF validation for special cases

docs(readme): add security best practices section

test(retry): add tests for chain state restoration
```

### Breaking Changes

Para cambios incompatibles, añade `BREAKING CHANGE:` en el pie del commit:

```bash
feat(client): change submitInvoice return type

BREAKING CHANGE: submitInvoice now returns SubmitInvoiceResponse instead of Invoice
```

## Tests

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Con cobertura
npm run test:coverage

# En modo watch (desarrollo)
npm run test:watch

# Un archivo específico
npm test -- tests/unit/retry.test.ts
```

### Escribir Tests

- Usamos **Vitest** como framework de testing
- Los tests van en `tests/unit/` siguiendo la estructura de `src/`
- Cada módulo debe tener al menos 90% de cobertura
- Usa mocks para llamadas de red (`vi.mock('node:https')`)

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should handle normal case', () => {
      const result = myFunction(input);
      expect(result).toBe(expected);
    });

    it('should throw on invalid input', () => {
      expect(() => myFunction(null)).toThrow(ValidationError);
    });
  });
});
```

## Seguridad

### Lo que NUNCA debes incluir

- ❌ Certificados (`.pfx`, `.p12`, `.pem`, `.key`)
- ❌ Contraseñas o tokens
- ❌ NIFs reales de empresas/personas
- ❌ Datos de facturas reales
- ❌ URLs de producción con credenciales

### Datos de Prueba

Usa NIFs de prueba válidos pero ficticios:
- Empresas: `B12345674` (CIF válido de prueba)
- Personas: `12345678Z` (NIF válido de prueba)

## Proceso de Review

1. Todos los PRs requieren al menos una aprobación
2. Los tests deben pasar en CI (Node 18, 20, 22)
3. El linter no debe reportar errores
4. La cobertura no debe disminuir

## Preguntas

Si tienes preguntas:

1. Revisa la [documentación](README.md)
2. Busca en los [issues existentes](https://github.com/your-username/verifactu/issues)
3. Abre un nuevo issue con la etiqueta `question`

## Licencia

Al contribuir, aceptas que tus contribuciones se licencien bajo la [Licencia MIT](LICENSE).

---

¡Gracias por contribuir! 🎉

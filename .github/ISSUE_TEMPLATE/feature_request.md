---
name: Feature Request
about: Sugerir una nueva funcionalidad o mejora
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Descripción de la Funcionalidad

Una descripción clara y concisa de la funcionalidad que propones.

## Problema que Resuelve

Describe el problema o necesidad que esta funcionalidad resolvería.

Ej: "Me resulta frustrante cuando [...]" o "Necesito poder [...]"

## Solución Propuesta

Describe cómo te gustaría que funcionara la nueva funcionalidad.

## Ejemplo de API (si aplica)

```typescript
// Ejemplo de cómo se usaría la nueva funcionalidad
const client = new VerifactuClient({
  // nueva opción propuesta
  newFeature: true,
});

// O nuevo método
const result = await client.newMethod(params);
```

## Alternativas Consideradas

Describe las alternativas que has considerado y por qué no son suficientes.

## Caso de Uso

Describe el caso de uso específico donde necesitas esta funcionalidad.

- ¿Qué tipo de aplicación estás desarrollando?
- ¿Cuántas facturas procesas aproximadamente?
- ¿Es para sandbox o producción?

## Contexto Adicional

Añade cualquier otro contexto, capturas de pantalla o referencias sobre la funcionalidad.

## Checklist

- [ ] He buscado en los issues existentes para verificar que no es un duplicado
- [ ] He revisado el [ROADMAP](../../ROADMAP.md) para ver si está planificado
- [ ] Esta funcionalidad mantendría la filosofía de zero-dependencies

---
name: Bug Report
about: Reportar un error o comportamiento inesperado
title: '[BUG] '
labels: bug
assignees: ''
---

## Descripción del Bug

Una descripción clara y concisa del bug.

## Pasos para Reproducir

1. Configurar el cliente con '...'
2. Llamar al método '...'
3. Pasar estos parámetros '...'
4. Ver el error

## Comportamiento Esperado

Descripción clara de lo que esperabas que ocurriera.

## Comportamiento Actual

Descripción de lo que realmente ocurrió.

## Código de Ejemplo

```typescript
// Código mínimo para reproducir el problema
const client = new VerifactuClient({
  // ...
});

// Llamada que causa el error
const result = await client.submitInvoice(invoice);
```

## Mensaje de Error

```
Pega aquí el mensaje de error completo (sin incluir credenciales ni datos sensibles)
```

## Entorno

- **Versión de Verifactu**: [ej. 1.0.0]
- **Versión de Node.js**: [ej. 20.10.0]
- **Sistema Operativo**: [ej. Ubuntu 22.04, Windows 11, macOS 14]
- **Entorno AEAT**: [sandbox / production]

## Contexto Adicional

Añade cualquier otro contexto sobre el problema aquí.

## Checklist

- [ ] He buscado en los issues existentes para verificar que no es un duplicado
- [ ] He eliminado cualquier credencial, certificado o dato sensible del reporte
- [ ] He incluido un ejemplo de código mínimo para reproducir el problema

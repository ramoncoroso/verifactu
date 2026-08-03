#!/usr/bin/env bash
#
# Prueba de humo sobre el paquete EMPAQUETADO E INSTALADO.
#
# Es la única capa que valida el artefacto que de verdad se publica. Todo lo
# demás —tests, typecheck, lint— importa `src/`, así que no ve nada de lo que
# ocurre al empaquetar: qué entra en `files`, si el campo `exports` resuelve, si
# el build de CommonJS carga, si los `.d.ts` que salen tipan.
#
# La primera vez que se ejecutó encontró dos defectos que la suite entera, con
# 989 tests en verde, no veía.
#
# Uso:  npm run smoke

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

azul() { printf '\n\033[1;34m%s\033[0m\n' "$1"; }

azul "1/5 · Compilando"
cd "$RAIZ"
npm run build >/dev/null

azul "2/5 · Empaquetando"
# `npm pack` ejecuta el hook `prepare`, que imprime la línea de husky: nos
# quedamos solo con la última, que es el nombre del tarball.
NOMBRE="$(npm pack --pack-destination "$TMP" --silent | tail -1)"
TARBALL="$TMP/$NOMBRE"
echo "     $NOMBRE · $(du -h "$TARBALL" | cut -f1)"

azul "3/5 · Instalando en un proyecto limpio"
mkdir -p "$TMP/app"
cd "$TMP/app"
cat > package.json <<'JSON'
{ "name": "smoke", "version": "1.0.0", "type": "module", "private": true }
JSON
# `jsqr` decodifica el QR; es la comprobación que impide que «se generó un SVG»
# se confunda con «el QR se lee».
npm install --no-audit --no-fund --silent "$TARBALL" jsqr

echo "     contenido del paquete:"
ls node_modules/@ramoncoroso/verifactu | sed 's/^/       /'

# Lo que NO debe viajar dentro. Ver la decisión en el PR #87.
if [ -d node_modules/@ramoncoroso/verifactu/schemas ]; then
  echo "     FALLO: el tarball incluye schemas/, que no debe redistribuirse" >&2
  exit 1
fi
echo "     ok · sin schemas/ dentro del tarball"

azul "4/5 · Ejecutando el paquete instalado"
cp "$RAIZ/scripts/smoke/esm.mjs" .
cp "$RAIZ/scripts/smoke/cjs.cjs" .
node esm.mjs
node cjs.cjs

azul "5/5 · Comprobando los tipos publicados"
cp "$RAIZ/scripts/smoke/tipos.ts" .
# El `tsc` sale del repositorio, pero resuelve los módulos desde el proyecto
# temporal: eso es justo lo que se quiere comprobar.
"$RAIZ/node_modules/.bin/tsc" \
  --noEmit --strict --skipLibCheck \
  --target es2022 --module nodenext --moduleResolution nodenext \
  --typeRoots "$RAIZ/node_modules/@types" --types node \
  tipos.ts
echo "  ok   los .d.ts publicados resuelven y tipan bajo --strict"

printf '\n\033[1;32m✓ El paquete publicable funciona\033[0m\n\n'

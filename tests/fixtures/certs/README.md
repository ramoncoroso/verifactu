# Certificados de prueba

Autofirmados, generados por `scripts/generate-test-cert.sh`. **Solo para tests.**
La AEAT los rechazaría, y su clave privada es pública por definición al estar en
un repositorio abierto, así que no sirven para nada más.

Van versionados —con una excepción explícita en `.gitignore`— porque
`tests/conformance/pkcs12.test.ts` necesita un PKCS#12 con cifrado **heredado**
(RC2-40) y generarlo en cada máquina exigiría que su `openssl` tuviera activo el
proveedor legacy. Un test de conformidad no puede depender de eso.

| Fichero | Cifrado | Contraseña |
|---|---|---|
| `moderno.p12` | PBES2 · PBKDF2 · AES-256-CBC | `test-password` |
| `heredado.p12` | `pbeWithSHA1And40BitRC2-CBC` + 3DES · MAC SHA-1 | `test-password` |

Regenerarlos —el script escribe `.pfx` y deja el par PEM al lado, que hay que
borrar porque la clave privada va sin cifrar:

```bash
tmp=$(mktemp -d)
./scripts/generate-test-cert.sh --name moderno  --output-dir "$tmp"
./scripts/generate-test-cert.sh --name heredado --output-dir "$tmp" --legacy
cp "$tmp/moderno.pfx"  tests/fixtures/certs/moderno.p12
cp "$tmp/heredado.pfx" tests/fixtures/certs/heredado.p12
rm -rf "$tmp"
```

`--legacy` necesita que el `openssl` del sistema tenga disponible el proveedor
legacy. Esa es justo la razón de que las fixtures vayan versionadas.

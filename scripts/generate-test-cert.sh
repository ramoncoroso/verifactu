#!/bin/bash
#
# Generate a self-signed test certificate for development
#
# This script creates a PFX/P12 certificate suitable for testing
# with Verifactu. DO NOT use this certificate in production.
#
# Usage:
#   ./scripts/generate-test-cert.sh
#   ./scripts/generate-test-cert.sh --output-dir ./certs
#   ./scripts/generate-test-cert.sh --password mypassword
#

set -e

# Default values
OUTPUT_DIR="."
PASSWORD="test-password"
CERT_NAME="test-cert"
DAYS=365
KEY_SIZE=4096

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --name)
      CERT_NAME="$2"
      shift 2
      ;;
    --days)
      DAYS="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --output-dir DIR   Output directory (default: current directory)"
      echo "  --password PASS    PFX password (default: test-password)"
      echo "  --name NAME        Certificate name (default: test-cert)"
      echo "  --days DAYS        Validity in days (default: 365)"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# File paths
KEY_FILE="$OUTPUT_DIR/$CERT_NAME-key.pem"
CERT_FILE="$OUTPUT_DIR/$CERT_NAME.pem"
PFX_FILE="$OUTPUT_DIR/$CERT_NAME.pfx"

echo "Generating test certificate..."
echo "  Output directory: $OUTPUT_DIR"
echo "  Certificate name: $CERT_NAME"
echo "  Validity: $DAYS days"
echo ""

# Generate private key and self-signed certificate
openssl req -x509 -newkey rsa:$KEY_SIZE \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -days $DAYS \
  -nodes \
  -subj "/CN=Verifactu Test/O=Test Organization/C=ES/L=Madrid"

# Convert to PFX/P12 format
openssl pkcs12 -export \
  -out "$PFX_FILE" \
  -inkey "$KEY_FILE" \
  -in "$CERT_FILE" \
  -passout "pass:$PASSWORD"

echo ""
echo "Certificate generated successfully!"
echo ""
echo "Files created:"
echo "  PFX:  $PFX_FILE"
echo "  PEM:  $CERT_FILE"
echo "  Key:  $KEY_FILE"
echo ""
echo "Password: $PASSWORD"
echo ""
echo "Usage in code:"
echo "  const client = new VerifactuClient({"
echo "    certificate: {"
echo "      type: 'pfx',"
echo "      path: '$PFX_FILE',"
echo "      password: '$PASSWORD',"
echo "    },"
echo "    // ..."
echo "  });"
echo ""
echo "WARNING: This is a self-signed certificate for TESTING ONLY."
echo "         DO NOT use in production. AEAT will reject it."

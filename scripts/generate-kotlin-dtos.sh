#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$PROJECT_DIR/.openapi-gen-tmp"
OUTPUT_DIR="$PROJECT_DIR/mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/generated"

# Pin the Docker image version
DOCKER_IMAGE="openapitools/openapi-generator-cli:v7.12.0"

# Clean previous output
rm -rf "$TMP_DIR" "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Generate Kotlin DTOs via Docker (run as current user to avoid permission issues)
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$PROJECT_DIR:/work" \
  -w /work \
  "$DOCKER_IMAGE" generate \
  -i docs/openapi.json \
  -g kotlin \
  --library multiplatform \
  --global-property models \
  --additional-properties=serializationLibrary=kotlinx_serialization,packageName=com.bissbilanz.api.generated,modelPackage=com.bissbilanz.api.generated.model,dateLibrary=string \
  -o /work/.openapi-gen-tmp

# Copy model files from the generated output
SRC_DIR="$TMP_DIR/src/commonMain/kotlin/com/bissbilanz/api/generated/model"
if [ ! -d "$SRC_DIR" ]; then
  SRC_DIR="$TMP_DIR/src/main/kotlin/com/bissbilanz/api/generated/model"
fi

if [ -d "$SRC_DIR" ]; then
  cp -r "$SRC_DIR/"* "$OUTPUT_DIR/"
else
  echo "ERROR: Could not find generated model files in $TMP_DIR"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Fix duplicate @Serializable annotation (openapi-generator multiplatform bug)
find "$OUTPUT_DIR" -name '*.kt' -exec sed -i 's/@Serializable@Serializable/@Serializable/' {} +

# Strip any JVM-only imports (safety net)
find "$OUTPUT_DIR" -name '*.kt' -exec sed -i '/^import java\./d' {} +

# Format with ktlint (if available)
if command -v ktlint &> /dev/null; then
  find "$OUTPUT_DIR" -name '*.kt' -print0 | xargs -0 ktlint -F 2>/dev/null || true
fi

# Clean up temp directory
rm -rf "$TMP_DIR"

echo "Generated Kotlin DTOs in $OUTPUT_DIR"

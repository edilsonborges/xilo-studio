#!/usr/bin/env bash
# Confere se a versão está igual em todos os lugares e se tem entrada no changelog.
#
#   ./scripts/check-version.sh
#
# No GitHub Actions, ao rodar para uma tag, também confere se a tag é vVERSION.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(tr -d '[:space:]' < VERSION)"
package_version="$(node -p "require('./package.json').version")"
lock_version="$(node -p "require('./package-lock.json').packages[''].version")"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Versão inválida em VERSION: $version" >&2
  exit 1
fi

for entry in "package.json:$package_version" "package-lock.json:$lock_version"; do
  file="${entry%%:*}"
  value="${entry#*:}"
  if [[ "$value" != "$version" ]]; then
    echo "Versão divergente: $file tem $value, esperado $version" >&2
    exit 1
  fi
done

if ! grep -Fq "## [$version]" CHANGELOG.md; then
  echo "CHANGELOG.md não tem entrada para $version" >&2
  exit 1
fi

if [[ "${GITHUB_REF_TYPE:-}" == "tag" && "${GITHUB_REF_NAME:-}" != "v$version" ]]; then
  echo "A tag ${GITHUB_REF_NAME:-<ausente>} não corresponde a v$version" >&2
  exit 1
fi

echo "Versão $version consistente."

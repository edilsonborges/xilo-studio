#!/usr/bin/env bash
# Atualiza a instância publicada: baixa a versão pedida, reconstrói o container
# e confere se ele respondeu.
#
#   ./scripts/update.sh           # última versão da main
#   ./scripts/update.sh <commit>  # um commit específico (ou para voltar atrás)
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Não atualizei: há alterações locais em arquivos versionados." >&2
  echo "Faça commit ou descarte essas alterações antes." >&2
  exit 1
fi

target="${1:-main}"
previous_commit="$(git rev-parse --short HEAD)"
rollback_command="./scripts/update.sh $previous_commit"

git fetch --prune origin

if [[ "$target" == "main" ]]; then
  git checkout --quiet main
  git merge --ff-only origin/main
else
  if ! git rev-parse --verify --quiet "$target^{commit}" >/dev/null; then
    echo "Versão não encontrada: $target" >&2
    exit 1
  fi
  git checkout --quiet --detach "$target"
fi

echo "Atualizando de $previous_commit para $(git rev-parse --short HEAD)..."

if ! docker compose up -d --build --remove-orphans; then
  echo "O deploy falhou." >&2
  echo "Para voltar à versão anterior: $rollback_command" >&2
  exit 1
fi

health_url="${XILO_HEALTH_URL:-http://127.0.0.1:47653/healthz}"
for _attempt in {1..30}; do
  if curl --fail --silent --show-error "$health_url" >/dev/null 2>&1; then
    echo "Deploy concluído: $(git rev-parse --short HEAD) respondendo em $health_url"
    exit 0
  fi
  sleep 2
done

echo "O container subiu, mas não respondeu em $health_url" >&2
echo "Veja os logs com: docker compose logs --tail=200" >&2
echo "Para voltar à versão anterior: $rollback_command" >&2
exit 1

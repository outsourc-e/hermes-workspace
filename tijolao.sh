#!/usr/bin/env bash
# Operacao do stack Hermes (agent + workspace) em Docker no Tijolao.
#
# O compose vive em compose.tijolao.yml, separado do docker-compose.yml do
# repo — assim `git pull` traz atualizacoes upstream sem conflitar com as
# adaptacoes locais (bind mount de ~/.hermes, .env real, host.docker.internal).
set -euo pipefail

cd "$(dirname "$0")"
C="docker compose -f compose.tijolao.yml"

case "${1:-status}" in
  up)      $C up -d "${@:2}"; sleep 3; $C ps ;;
  down)    $C down "${@:2}" ;;
  restart) $C restart "${@:2}" ;;
  status)  $C ps ;;
  logs)    $C logs -f --tail=100 "${@:2}" ;;
  pull)    $C pull && echo "Imagens atualizadas. Rode: $0 up" ;;
  update)  $C pull && $C up -d && $C ps ;;
  health)
    echo "--- gateway :8642 ---";   curl -fsS http://127.0.0.1:8642/health    || echo "FALHOU"
    echo; echo "--- dashboard :9119 ---"; curl -fsS http://127.0.0.1:9119/api/status || echo "FALHOU"
    echo; echo "--- workspace :3000 ---"; curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/ || echo "FALHOU"
    ;;
  shell)   docker exec -it hermes-agent bash ;;
  hermes)  docker exec -it hermes-agent hermes "${@:2}" ;;
  *)
    echo "uso: $0 {up|down|restart|status|logs|pull|update|health|shell|hermes}"
    exit 1 ;;
esac

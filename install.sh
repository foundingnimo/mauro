#!/bin/sh
set -eu

MAURO_SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MAURO_CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-"${HOME}/.claude"}
MAURO_RUNTIME_DIR="${MAURO_CLAUDE_DIR}/mauro"
MAURO_SKILL_DIR="${MAURO_CLAUDE_DIR}/skills/mauro"

MAURO_MODE=install
for MAURO_ARG in "$@"; do
  case "${MAURO_ARG}" in
    --update) MAURO_MODE=update ;;
    --no-hooks) ;;
    *) echo "Unknown option: ${MAURO_ARG}. Use --update and/or --no-hooks."; exit 1 ;;
  esac
done

if [ "${MAURO_MODE}" = update ]; then
  if [ ! -e "${MAURO_RUNTIME_DIR}" ]; then
    echo "Mauro is not installed. Run ./install.sh without --update."
    exit 1
  fi
  # Replace the runtime and the skill from this checkout. Hooks and settings stay.
  rm -rf "${MAURO_RUNTIME_DIR}" "${MAURO_SKILL_DIR}"
elif [ -e "${MAURO_RUNTIME_DIR}" ] || [ -e "${MAURO_SKILL_DIR}" ]; then
  echo "Mauro is already installed. Run ./install.sh --update to replace it from this checkout, or use plugin mode."
  exit 1
fi

mkdir -p "${MAURO_RUNTIME_DIR}" "${MAURO_CLAUDE_DIR}/skills"
for MAURO_PART in .claude-plugin agents bin docs hooks schemas scripts skills templates; do
  cp -R "${MAURO_SOURCE_DIR}/${MAURO_PART}" "${MAURO_RUNTIME_DIR}/${MAURO_PART}"
done
cp "${MAURO_SOURCE_DIR}/package.json" "${MAURO_RUNTIME_DIR}/package.json"
cp "${MAURO_SOURCE_DIR}/LICENSE" "${MAURO_RUNTIME_DIR}/LICENSE"
cp -R "${MAURO_SOURCE_DIR}/skills/mauro" "${MAURO_SKILL_DIR}"
chmod +x "${MAURO_RUNTIME_DIR}/bin/mauro"

MAURO_HOOKS=yes
for MAURO_ARG in "$@"; do
  [ "${MAURO_ARG}" = "--no-hooks" ] && MAURO_HOOKS=no
done
if [ "${MAURO_MODE}" = update ]; then
  echo "Updated Mauro from ${MAURO_SOURCE_DIR}. Restart Claude Code."
  exit 0
fi
if [ "${MAURO_HOOKS}" = yes ]; then
  node "${MAURO_RUNTIME_DIR}/scripts/install-standalone-hooks.mjs" "${MAURO_CLAUDE_DIR}"
fi

echo "Installed Mauro. Restart Claude Code, then run /mauro help."
if [ "${MAURO_HOOKS}" = no ]; then
  echo "Hooks were not installed. Run /mauro check at session start."
fi

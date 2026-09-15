#!/bin/sh
set -eu

MAURO_SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MAURO_CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-"${HOME}/.claude"}
MAURO_RUNTIME_DIR="${MAURO_CLAUDE_DIR}/mauro"
MAURO_SKILL_DIR="${MAURO_CLAUDE_DIR}/skills/mauro"

if [ -e "${MAURO_RUNTIME_DIR}" ] || [ -e "${MAURO_SKILL_DIR}" ]; then
  echo "Mauro is already installed. Remove the old installation or use plugin mode."
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

if [ "${1:-}" != "--no-hooks" ]; then
  node "${MAURO_RUNTIME_DIR}/scripts/install-standalone-hooks.mjs" "${MAURO_CLAUDE_DIR}"
fi

echo "Installed Mauro. Restart Claude Code, then run /mauro help."
if [ "${1:-}" = "--no-hooks" ]; then
  echo "Hooks were not installed. Run /mauro check at session start."
fi

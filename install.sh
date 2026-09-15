#!/bin/sh
set -eu

MAURO_SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MAURO_CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-"${HOME}/.claude"}
MAURO_RUNTIME_DIR="${MAURO_CLAUDE_DIR}/mauro"
MAURO_SKILL_DIR="${MAURO_CLAUDE_DIR}/skills/mauro"

MAURO_MODE=install
MAURO_HOOKS=yes
MAURO_ASSUME_YES=no
for MAURO_ARG in "$@"; do
  case "${MAURO_ARG}" in
    --update) MAURO_MODE=update ;;
    --no-hooks) MAURO_HOOKS=no ;;
    --yes|-y) MAURO_ASSUME_YES=yes ;;
    --help|-h)
      echo "Usage: ./install.sh [--update] [--no-hooks] [--yes]"
      echo "  --update    Replace an existing installation from this checkout. Settings and hooks stay."
      echo "  --no-hooks  Do not add the Claude lifecycle hooks on a first install."
      echo "  --yes       Answer yes to the update prompt."
      exit 0 ;;
    *) echo "Unknown option: ${MAURO_ARG}. Use --update, --no-hooks or --yes."; exit 1 ;;
  esac
done

mauro_version() {
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$1/package.json" 2>/dev/null || echo unknown
}

mauro_commit() {
  git -C "$1" rev-parse --short HEAD 2>/dev/null || echo "no commit"
}

MAURO_SOURCE_VERSION=$(mauro_version "${MAURO_SOURCE_DIR}")
MAURO_SOURCE_COMMIT=$(mauro_commit "${MAURO_SOURCE_DIR}")

if [ -e "${MAURO_RUNTIME_DIR}" ] || [ -e "${MAURO_SKILL_DIR}" ]; then
  MAURO_INSTALLED_VERSION=$(mauro_version "${MAURO_RUNTIME_DIR}")
  MAURO_INSTALLED_COMMIT=$(node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commit || "unknown commit") } catch { process.stdout.write("unknown commit") }' "${MAURO_RUNTIME_DIR}/.install.json" 2>/dev/null || echo "unknown commit")
  echo "Mauro ${MAURO_INSTALLED_VERSION} (${MAURO_INSTALLED_COMMIT}) is installed in ${MAURO_RUNTIME_DIR}."
  echo "This checkout is ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT})."
  if [ "${MAURO_MODE}" != update ]; then
    if [ "${MAURO_ASSUME_YES}" = yes ]; then
      MAURO_MODE=update
    elif [ -t 0 ]; then
      printf 'Update the installation from this checkout? Settings and hooks stay. [Y/n] '
      read -r MAURO_ANSWER
      case "${MAURO_ANSWER}" in
        ""|y|Y|yes|YES) MAURO_MODE=update ;;
        *) echo "Nothing changed."; exit 0 ;;
      esac
    else
      echo "Run ./install.sh --update to replace it from this checkout, or use plugin mode."
      exit 1
    fi
  fi
  # Replace the runtime and the skill from this checkout. Hooks and settings stay.
  rm -rf "${MAURO_RUNTIME_DIR}" "${MAURO_SKILL_DIR}"
elif [ "${MAURO_MODE}" = update ]; then
  echo "Mauro is not installed. Run ./install.sh without --update."
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
# The stamp lets `mauro --version` and `mauro doctor` say where an installation came from.
printf '{\n  "version": "%s",\n  "commit": "%s",\n  "source": "%s",\n  "installed_at": "%s"\n}\n' \
  "${MAURO_SOURCE_VERSION}" "${MAURO_SOURCE_COMMIT}" "${MAURO_SOURCE_DIR}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "${MAURO_RUNTIME_DIR}/.install.json"

if [ "${MAURO_MODE}" = update ]; then
  echo "Updated Mauro to ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT}). Restart Claude Code."
  exit 0
fi
if [ "${MAURO_HOOKS}" = yes ]; then
  node "${MAURO_RUNTIME_DIR}/scripts/install-standalone-hooks.mjs" "${MAURO_CLAUDE_DIR}"
fi

echo "Installed Mauro ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT}). Restart Claude Code, then run /mauro help."
if [ "${MAURO_HOOKS}" = no ]; then
  echo "Hooks were not installed. Run /mauro check at session start."
fi

#!/bin/sh
set -eu

MAURO_SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MAURO_CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-"${HOME}/.claude"}
MAURO_RUNTIME_DIR=${MAURO_HOME:-"${HOME}/.mauro"}
MAURO_LEGACY_RUNTIME_DIR="${MAURO_CLAUDE_DIR}/mauro"
MAURO_CLAUDE_SKILLS_DIR="${MAURO_CLAUDE_DIR}/skills"
MAURO_SHARED_SKILLS_DIR=${AGENT_SKILLS_DIR:-"${HOME}/.agents/skills"}

MAURO_MODE=install
MAURO_HOST=all
MAURO_HOOKS=yes
MAURO_ASSUME_YES=no
while [ "$#" -gt 0 ]; do
  case "$1" in
    --update) MAURO_MODE=update ;;
    --host)
      shift
      [ "$#" -gt 0 ] || { echo "--host requires claude, shared or all."; exit 1; }
      MAURO_HOST=$1 ;;
    --no-hooks) MAURO_HOOKS=no ;;
    --yes|-y) MAURO_ASSUME_YES=yes ;;
    --help|-h)
      echo "Usage: ./install.sh [--update] [--host claude|shared|all] [--no-hooks] [--yes]"
      echo "  --update    Replace an existing installation from this checkout."
      echo "  --host      Install Claude adapters, shared agent adapters, or both (default: all)."
      echo "  --no-hooks  Do not add or refresh Claude lifecycle hooks."
      echo "  --yes       Answer yes to the update prompt."
      exit 0 ;;
    *) echo "Unknown option: $1. Use --help for supported options."; exit 1 ;;
  esac
  shift
done

case "${MAURO_HOST}" in
  claude|shared|all) ;;
  *) echo "Unknown host: ${MAURO_HOST}. Use claude, shared or all."; exit 1 ;;
esac

mauro_absolute_path() {
  node -e 'process.stdout.write(require("path").resolve(process.argv[1]))' "$1"
}

MAURO_RUNTIME_DIR=$(mauro_absolute_path "${MAURO_RUNTIME_DIR}")
MAURO_CLAUDE_DIR=$(mauro_absolute_path "${MAURO_CLAUDE_DIR}")
MAURO_SHARED_SKILLS_DIR=$(mauro_absolute_path "${MAURO_SHARED_SKILLS_DIR}")
MAURO_LEGACY_RUNTIME_DIR="${MAURO_CLAUDE_DIR}/mauro"
MAURO_CLAUDE_SKILLS_DIR="${MAURO_CLAUDE_DIR}/skills"
node -e '
  const path = require("path");
  const [runtime, home, source, claude, shared] = process.argv.slice(1).map((item) => path.resolve(item));
  const sameOrAncestor = (parent, child) => parent === child || child.startsWith(parent + path.sep);
  const claudeSkills = path.join(claude, "skills");
  if (runtime === path.parse(runtime).root || sameOrAncestor(runtime, home) || sameOrAncestor(runtime, source)
      || sameOrAncestor(source, runtime) || sameOrAncestor(runtime, claude) || sameOrAncestor(runtime, shared)) {
    process.stderr.write(`Unsafe MAURO_HOME: ${runtime}\n`);
    process.exit(1);
  }
  for (const directory of [claudeSkills, shared]) {
    if (directory === path.parse(directory).root || sameOrAncestor(directory, source) || sameOrAncestor(source, directory)) {
      process.stderr.write(`Unsafe skill directory: ${directory}\n`);
      process.exit(1);
    }
  }
' "${MAURO_RUNTIME_DIR}" "${HOME}" "${MAURO_SOURCE_DIR}" "${MAURO_CLAUDE_DIR}" "${MAURO_SHARED_SKILLS_DIR}"

mauro_version() {
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$1/package.json" 2>/dev/null || echo unknown
}

mauro_commit() {
  git -C "$1" rev-parse --short HEAD 2>/dev/null || echo "no commit"
}

MAURO_SOURCE_VERSION=$(mauro_version "${MAURO_SOURCE_DIR}")
MAURO_SOURCE_COMMIT=$(mauro_commit "${MAURO_SOURCE_DIR}")
MAURO_CURRENT_RUNTIME=${MAURO_RUNTIME_DIR}
if [ ! -e "${MAURO_CURRENT_RUNTIME}" ] && [ -e "${MAURO_LEGACY_RUNTIME_DIR}" ]; then
  MAURO_CURRENT_RUNTIME=${MAURO_LEGACY_RUNTIME_DIR}
fi

mauro_installed() {
  [ -e "${MAURO_RUNTIME_DIR}" ] || [ -e "${MAURO_LEGACY_RUNTIME_DIR}" ] \
    || [ -e "${MAURO_CLAUDE_SKILLS_DIR}/mauro" ] || [ -e "${MAURO_CLAUDE_SKILLS_DIR}/mauro-context" ] \
    || [ -e "${MAURO_SHARED_SKILLS_DIR}/mauro" ] || [ -e "${MAURO_SHARED_SKILLS_DIR}/mauro-context" ]
}

if mauro_installed; then
  MAURO_INSTALLED_VERSION=$(mauro_version "${MAURO_CURRENT_RUNTIME}")
  MAURO_INSTALLED_COMMIT=$(node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commit || "unknown commit") } catch { process.stdout.write("unknown commit") }' "${MAURO_CURRENT_RUNTIME}/.install.json" 2>/dev/null || echo "unknown commit")
  echo "Mauro ${MAURO_INSTALLED_VERSION} (${MAURO_INSTALLED_COMMIT}) is installed in ${MAURO_CURRENT_RUNTIME}."
  echo "This checkout is ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT})."
  if [ "${MAURO_MODE}" != update ]; then
    if [ "${MAURO_ASSUME_YES}" = yes ]; then
      MAURO_MODE=update
    elif [ -t 0 ]; then
      printf 'Update the installation from this checkout? [Y/n] '
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
elif [ "${MAURO_MODE}" = update ]; then
  echo "Mauro is not installed. Run ./install.sh without --update."
  exit 1
fi

# Stage the provider-neutral runtime before replacing the live copy.
MAURO_STAGE_DIR="${MAURO_RUNTIME_DIR}.install-$$"
rm -rf "${MAURO_STAGE_DIR}"
mkdir -p "${MAURO_STAGE_DIR}"
for MAURO_PART in .claude-plugin agents bin docs hooks schemas scripts skills templates; do
  cp -R "${MAURO_SOURCE_DIR}/${MAURO_PART}" "${MAURO_STAGE_DIR}/${MAURO_PART}"
done
cp "${MAURO_SOURCE_DIR}/package.json" "${MAURO_STAGE_DIR}/package.json"
cp "${MAURO_SOURCE_DIR}/LICENSE" "${MAURO_STAGE_DIR}/LICENSE"
chmod +x "${MAURO_STAGE_DIR}/bin/mauro"

case "${MAURO_HOST}" in
  claude) MAURO_HOSTS_JSON='["claude"]' ;;
  shared) MAURO_HOSTS_JSON='["shared"]' ;;
  all) MAURO_HOSTS_JSON='["claude","shared"]' ;;
esac
MAURO_STAMP_HOOKS=false
if [ "${MAURO_HOOKS}" = yes ] && { [ "${MAURO_HOST}" = claude ] || [ "${MAURO_HOST}" = all ]; }; then
  MAURO_STAMP_HOOKS=true
fi
node -e 'const fs=require("fs"); const [path,version,commit,source,runtime,hosts,hooks]=process.argv.slice(1); fs.writeFileSync(path, JSON.stringify({version,commit,source,runtime,hosts:JSON.parse(hosts),hooks:hooks==="true",installed_at:new Date().toISOString()},null,2)+"\n")' \
  "${MAURO_STAGE_DIR}/.install.json" "${MAURO_SOURCE_VERSION}" "${MAURO_SOURCE_COMMIT}" "${MAURO_SOURCE_DIR}" "${MAURO_RUNTIME_DIR}" "${MAURO_HOSTS_JSON}" "${MAURO_STAMP_HOOKS}"

mkdir -p "$(dirname -- "${MAURO_RUNTIME_DIR}")"
MAURO_BACKUP_DIR="${MAURO_RUNTIME_DIR}.previous-$$"
rm -rf "${MAURO_BACKUP_DIR}"
if [ -e "${MAURO_RUNTIME_DIR}" ]; then mv "${MAURO_RUNTIME_DIR}" "${MAURO_BACKUP_DIR}"; fi
if mv "${MAURO_STAGE_DIR}" "${MAURO_RUNTIME_DIR}"; then
  rm -rf "${MAURO_BACKUP_DIR}"
else
  if [ -e "${MAURO_BACKUP_DIR}" ]; then mv "${MAURO_BACKUP_DIR}" "${MAURO_RUNTIME_DIR}"; fi
  echo "Mauro could not replace the runtime; the previous installation was restored."
  exit 1
fi
if [ "${MAURO_HOST}" != shared ] && [ "${MAURO_LEGACY_RUNTIME_DIR}" != "${MAURO_RUNTIME_DIR}" ] && [ -e "${MAURO_LEGACY_RUNTIME_DIR}" ]; then
  rm -rf "${MAURO_LEGACY_RUNTIME_DIR}"
fi

mauro_install_skill_pair() {
  MAURO_DESTINATION=$1
  mkdir -p "${MAURO_DESTINATION}"
  rm -rf "${MAURO_DESTINATION}/mauro" "${MAURO_DESTINATION}/mauro-context"
  cp -R "${MAURO_SOURCE_DIR}/skills/mauro" "${MAURO_DESTINATION}/mauro"
  cp -R "${MAURO_SOURCE_DIR}/skills/mauro-context" "${MAURO_DESTINATION}/mauro-context"
}

case "${MAURO_HOST}" in
  claude) mauro_install_skill_pair "${MAURO_CLAUDE_SKILLS_DIR}" ;;
  shared) mauro_install_skill_pair "${MAURO_SHARED_SKILLS_DIR}" ;;
  all)
    mauro_install_skill_pair "${MAURO_CLAUDE_SKILLS_DIR}"
    mauro_install_skill_pair "${MAURO_SHARED_SKILLS_DIR}" ;;
esac

if [ "${MAURO_HOOKS}" = yes ] && { [ "${MAURO_HOST}" = claude ] || [ "${MAURO_HOST}" = all ]; }; then
  node "${MAURO_RUNTIME_DIR}/scripts/install-standalone-hooks.mjs" "${MAURO_CLAUDE_DIR}" "${MAURO_RUNTIME_DIR}"
fi

if [ "${MAURO_MODE}" = update ]; then
  echo "Updated Mauro to ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT}) for ${MAURO_HOST}. Restart open coding-agent sessions."
else
  echo "Installed Mauro ${MAURO_SOURCE_VERSION} (${MAURO_SOURCE_COMMIT}) for ${MAURO_HOST}. Restart open coding-agent sessions."
fi
if [ "${MAURO_HOOKS}" = no ] && { [ "${MAURO_HOST}" = claude ] || [ "${MAURO_HOST}" = all ]; }; then
  echo "Claude hooks were not installed. Mauro remains available on demand."
fi

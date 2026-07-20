#!/usr/bin/env bash
set -e

REQ_NAME="$1"
OUTPUT_ROOT="$2"

normalize_path() {
  local input="$1"

  if [ -z "$input" ]; then
    return
  fi

  if uname -s 2>/dev/null | grep -qi "linux"; then
    case "$input" in
      [A-Za-z]:/*|[A-Za-z]:\\*)
        local drive
        local rest
        drive="$(printf '%s' "${input:0:1}" | tr '[:upper:]' '[:lower:]')"
        rest="${input:2}"
        rest="${rest//\\//}"
        printf '/mnt/%s%s\n' "$drive" "$rest"
        return
        ;;
    esac
  fi

  printf '%s\n' "$input"
}

if [ -z "$REQ_NAME" ]; then
  echo "Usage: ./delivery-workflow/scripts/init-workspace.sh <demand-name> <output-root>"
  echo "Example: ./delivery-workflow/scripts/init-workspace.sh reverse-clear-fee-import C:/code/ai-workspaces"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKFLOW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$WORKFLOW_DIR/.." && pwd)"

if [ -z "$OUTPUT_ROOT" ]; then
  OUTPUT_ROOT="$ROOT_DIR/../ai-workspaces"
fi

OUTPUT_ROOT="$(normalize_path "$OUTPUT_ROOT")"

TEMPLATE_DIR="$WORKFLOW_DIR/templates/workspace"
TARGET_DIR="$OUTPUT_ROOT/$REQ_NAME"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "Template directory does not exist: $TEMPLATE_DIR"
  exit 1
fi

if [ -d "$TARGET_DIR" ]; then
  if [ -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "Target workspace already exists and is not empty: $TARGET_DIR"
    exit 1
  fi
fi

mkdir -p "$OUTPUT_ROOT"
if [ -d "$TARGET_DIR" ]; then
  cp -R "$TEMPLATE_DIR/." "$TARGET_DIR/"
else
  cp -R "$TEMPLATE_DIR" "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR/context/rules"
mkdir -p "$TARGET_DIR/context/skills"
mkdir -p "$TARGET_DIR/context/business"
mkdir -p "$TARGET_DIR/context/systems"
mkdir -p "$TARGET_DIR/prd/assets"
mkdir -p "$TARGET_DIR/prd/templates"
mkdir -p "$TARGET_DIR/prd/examples"
mkdir -p "$TARGET_DIR/prd/references"

if [ -d "$ROOT_DIR/rules" ]; then
  cp -R "$ROOT_DIR/rules" "$TARGET_DIR/context/rules/source-rules"
fi

if [ -d "$ROOT_DIR/skills" ]; then
  cp -R "$ROOT_DIR/skills" "$TARGET_DIR/context/skills/source-skills"
fi

if [ -d "$WORKFLOW_DIR/context/business" ]; then
  cp -R "$WORKFLOW_DIR/context/business/." "$TARGET_DIR/context/business/"
fi

if [ -d "$WORKFLOW_DIR/context/systems" ]; then
  cp -R "$WORKFLOW_DIR/context/systems/." "$TARGET_DIR/context/systems/"
fi

{
  echo "# Knowledge Snapshot Version"
  echo
  echo "workspace: $REQ_NAME"
  echo "init_time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "source_repo: $(basename "$ROOT_DIR")"
  echo "source_commit: $(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo "delivery_workflow_path: $WORKFLOW_DIR"
} > "$TARGET_DIR/context/knowledge-version.md"

echo "Workspace initialized:"
echo "$TARGET_DIR"
echo
echo "Next steps:"
echo "1. Put PRD materials into: $TARGET_DIR/prd/"
echo "2. Enter workspace: cd $TARGET_DIR"
echo "3. Ask the AI agent: Read AGENTS.md and execute .workflow/commands/00-load-context.md"

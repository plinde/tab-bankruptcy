#!/usr/bin/env bash
# Validate manifest/package SemVer consistency and, for PRs, an exact increment.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

base_ref=""
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || $1 != "--base" ]]; then
    echo "usage: $0 [--base <git-ref>]" >&2
    exit 2
  fi
  base_ref=$2
fi

manifest_version=$(node -p "require('./manifest.json').version")
package_version=$(node -p "require('./package.json').version")

if [[ ! $manifest_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "manifest version is not X.Y.Z SemVer: $manifest_version" >&2
  exit 1
fi

if [[ $manifest_version != "$package_version" ]]; then
  echo "version mismatch: manifest=$manifest_version package=$package_version" >&2
  exit 1
fi

if [[ -z $base_ref ]]; then
  echo "version OK: $manifest_version"
  exit 0
fi

base_manifest=$(git show "$base_ref:manifest.json")
base_version=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version)' "$base_manifest")

node - "$base_version" "$manifest_version" <<'NODE'
const [base, current] = process.argv.slice(2);
const parse = (value) => value.split('.').map(Number);

if (!/^\d+\.\d+\.\d+$/.test(base)) {
  console.error(`base manifest version is not X.Y.Z SemVer: ${base}`);
  process.exit(1);
}

const [baseMajor, baseMinor, basePatch] = parse(base);
const [major, minor, patch] = parse(current);
let kind = null;

if (major === baseMajor + 1 && minor === 0 && patch === 0) kind = 'major';
if (major === baseMajor && minor === baseMinor + 1 && patch === 0) kind = 'minor';
if (major === baseMajor && minor === baseMinor && patch === basePatch + 1) kind = 'patch';

if (!kind) {
  console.error(
    `version must be exactly one major, minor, or patch increment: ${base} -> ${current}`,
  );
  process.exit(1);
}

console.log(`version bump OK (${kind}): ${base} -> ${current}`);
NODE

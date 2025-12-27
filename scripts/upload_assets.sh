#!/bin/bash
set -e

# Ensure GH_TOKEN is set
if [ -z "$GH_TOKEN" ]; then
  echo "Error: GH_TOKEN is not set."
  exit 1
fi

# 1. Get Version and Tag
VERSION=$(jq -r .version package.json)
TAG="v$VERSION"
echo "Processing release for tag: $TAG"

# 2. Find Release ID
RID=$(curl -s -H "Accept: application/vnd.github+json" \
           -H "Authorization: Bearer $GH_TOKEN" \
           "https://api.github.com/repos/dengcb/WXRD/releases/tags/$TAG" \
           | jq -r .id)

# 3. If Release doesn't exist (RID is null), create it
if [ "$RID" = "null" ] || [ -z "$RID" ]; then
  echo "Release $TAG not found. Creating draft release..."
  
  PAYLOAD=$(jq -n --arg tag "$TAG" --arg name "$TAG" \
    '{tag_name: $tag, name: $name, body: ("Release " + $tag), draft: true, prerelease: false}')
  
  RESPONSE=$(curl -s -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    "https://api.github.com/repos/dengcb/WXRD/releases" \
    -d "$PAYLOAD")
  
  RID=$(echo "$RESPONSE" | jq -r .id)
  
  if [ "$RID" = "null" ] || [ -z "$RID" ]; then
    echo "Failed to create release. Response:"
    echo "$RESPONSE"
    exit 1
  fi
  echo "Created draft release with ID: $RID"
else
  echo "Found existing release ID: $RID"
fi

# 4. Get existing assets
ASSETS_JSON=$(curl -s -H "Accept: application/vnd.github+json" \
              -H "Authorization: Bearer $GH_TOKEN" \
              "https://api.github.com/repos/dengcb/WXRD/releases/$RID")

if [ "$(echo "$ASSETS_JSON" | jq -r .id)" = "null" ]; then
    echo "Error: Failed to fetch release details for ID $RID"
    exit 1
fi

# 5. Collect files to upload
FILES=()

# Installers
FILES+=("release/wxrd-${VERSION}-arm64.dmg")
FILES+=("release/wxrd-${VERSION}-x64.dmg")
FILES+=("release/wxrd-setup-${VERSION}.exe")

# Blockmaps (Auto-update requirement)
# Check for blockmaps corresponding to the installers
if [ -f "release/wxrd-${VERSION}-arm64.dmg.blockmap" ]; then
  FILES+=("release/wxrd-${VERSION}-arm64.dmg.blockmap")
fi
if [ -f "release/wxrd-${VERSION}-x64.dmg.blockmap" ]; then
  FILES+=("release/wxrd-${VERSION}-x64.dmg.blockmap")
fi
if [ -f "release/wxrd-setup-${VERSION}.exe.blockmap" ]; then
  FILES+=("release/wxrd-setup-${VERSION}.exe.blockmap")
fi

# YAML indexes (Auto-update requirement)
if [ -f "release/latest.yml" ]; then
  FILES+=("release/latest.yml")
fi
if [ -f "release/latest-mac.yml" ]; then
  FILES+=("release/latest-mac.yml")
fi

# 6. Upload loop
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    name=$(basename "$f")
    # Check if asset already exists
    EXISTS=$(echo "$ASSETS_JSON" | jq -r --arg n "$name" '.assets[] | select(.name == $n) | .id')
    
    if [ -n "$EXISTS" ]; then
      echo "SKIP $name (already exists)"
    else
      echo "UPLOADING $name..."
      mime=$(file -b --mime-type "$f")
      curl -s -H "Authorization: Bearer $GH_TOKEN" \
           -H "Content-Type: $mime" \
           --data-binary @"$f" \
           "https://uploads.github.com/repos/dengcb/WXRD/releases/$RID/assets?name=$name" > /dev/null
      echo "UPLOADED $name"
    fi
  else
    echo "WARNING: File $f not found, skipping."
  fi
done

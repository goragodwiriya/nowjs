#!/bin/bash

# Script to recreate a git tag and purge jsDelivr cache
# Usage: ./recreate-tag.sh [tag_name]
# Example: ./recreate-tag.sh v1.0.0

TAG=${1:-"v1.0.0"}
REPO="goragodwiriya/nowjs"

echo "🏷️  Recreating tag: $TAG"
echo "================================"

# Step 1: Delete tag on remote
echo "📤 Deleting tag on remote..."
git push origin --delete "$TAG" 2>/dev/null || echo "   (tag may not exist on remote)"

# Step 2: Delete tag locally
echo "🗑️  Deleting local tag..."
git tag -d "$TAG" 2>/dev/null || echo "   (tag may not exist locally)"

# Step 3: Create new tag
echo "✨ Creating new tag..."
git tag "$TAG"

# Step 4: Push tag to remote
echo "📤 Pushing tag to remote..."
git push origin "$TAG"

echo ""
echo "✅ Tag $TAG recreated successfully!"
echo ""
echo "🔄 Purging jsDelivr cache..."

# Step 5: Purge jsDelivr cache for common files
FILES=(
    "Now/dist/now.core.min.js"
    "Now/dist/now.core.min.css"
    "Now/dist/now.table.min.js"
    "Now/dist/now.graph.min.js"
    "Now/dist/now.queue.min.js"
)

for file in "${FILES[@]}"; do
    echo "   Purging: $file"
    curl -s "https://purge.jsdelivr.net/gh/$REPO@$TAG/$file" > /dev/null
done

echo ""
echo "✅ Done! Cache purge requests sent."
echo ""
echo "⏳ Note: It may take a few minutes for changes to propagate."
echo "   Test URL: https://cdn.jsdelivr.net/gh/$REPO@$TAG/Now/dist/now.core.min.js"

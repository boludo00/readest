#!/usr/bin/env bash

# Readest Storage Cleanup Script
# Removes build artifacts, caches, and temporary files to free up disk space

set -u

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Readest Storage Cleanup ===${NC}\n"

# Function to get disk usage
get_disk_usage() {
    df -h / | tail -1 | awk '{print $3 " used, " $4 " free (" $5 " full)"}'
}

# Function to get directory size
get_dir_size() {
    if [ -d "$1" ]; then
        du -sh "$1" 2>/dev/null | awk '{print $1}'
    else
        echo "0B"
    fi
}

# Function to delete directory with confirmation
delete_dir() {
    local dir="$1"
    local desc="$2"

    if [ -d "$dir" ]; then
        local size=$(get_dir_size "$dir")
        echo -e "${YELLOW}Found:${NC} $desc ($size)"

        # Try to remove, but don't fail if some files are locked
        if rm -rf "$dir" 2>/dev/null; then
            echo -e "${GREEN}✓ Deleted${NC}\n"
        else
            # Try again, ignoring errors for locked files
            find "$dir" -type f -delete 2>/dev/null || true
            find "$dir" -type d -empty -delete 2>/dev/null || true

            if [ ! -d "$dir" ]; then
                echo -e "${GREEN}✓ Deleted${NC}\n"
            else
                echo -e "${YELLOW}⚠ Partially deleted (some files may be in use)${NC}\n"
            fi
        fi
    else
        echo -e "${YELLOW}Skipped:${NC} $desc (not found)\n"
    fi
}

# Show initial disk usage
echo -e "${BLUE}Before cleanup:${NC} $(get_disk_usage)\n"

# Get project root (script is in apps/readest-app/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo -e "${BLUE}Cleaning Readest project artifacts...${NC}\n"

# 1. Rust build artifacts (target directory)
delete_dir "$PROJECT_ROOT/target" "Rust build artifacts (target/)"
delete_dir "$PROJECT_ROOT/apps/readest-app/src-tauri/target" "Tauri target directory"

# 2. Next.js build cache
delete_dir "$PROJECT_ROOT/apps/readest-app/.next" "Next.js build cache (.next/)"

# 3. Turbo cache
delete_dir "$PROJECT_ROOT/.turbo" "Turbo cache (.turbo/)"

# 4. Package build artifacts
find "$PROJECT_ROOT/packages" -name "target" -type d -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}✓ Cleaned package build artifacts${NC}\n"

echo -e "${BLUE}Cleaning Xcode artifacts...${NC}\n"

# 5. Xcode DerivedData
delete_dir "$HOME/Library/Developer/Xcode/DerivedData" "Xcode DerivedData"

# 6. Xcode Archives
delete_dir "$HOME/Library/Developer/Xcode/Archives" "Xcode Archives"

# 7. iOS Simulator unavailable devices
echo -e "${YELLOW}Cleaning iOS Simulator devices...${NC}"
if command -v xcrun &> /dev/null; then
    xcrun simctl delete unavailable 2>/dev/null || echo -e "${YELLOW}No unavailable simulators to delete${NC}"
    echo -e "${GREEN}✓ Cleaned iOS Simulators${NC}\n"
else
    echo -e "${YELLOW}Skipped: xcrun not found${NC}\n"
fi

echo -e "${BLUE}Cleaning development caches...${NC}\n"

# 8. pnpm cache (optional - keeps frequently used packages)
# Uncomment to clear pnpm cache:
# delete_dir "$HOME/Library/Caches/pnpm" "pnpm cache"

# 9. Cargo cache (optional - keeps Rust dependencies)
# Uncomment to clear cargo cache:
# delete_dir "$HOME/.cargo/registry" "Cargo registry"
# delete_dir "$HOME/.cargo/git" "Cargo git cache"

# 10. Node modules (optional - requires pnpm install after)
# Uncomment to delete node_modules:
# delete_dir "$PROJECT_ROOT/node_modules" "Root node_modules"
# find "$PROJECT_ROOT" -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

echo -e "${GREEN}=== Cleanup Complete ===${NC}\n"

# Show final disk usage
echo -e "${BLUE}After cleanup:${NC} $(get_disk_usage)\n"

echo -e "${BLUE}Note:${NC} Build artifacts will be regenerated automatically on next build."
echo -e "To clean more aggressively, edit this script and uncomment optional sections.\n"

#!/bin/bash

# Deployment Risk Analyzer - Forge App Deployment Script
# This script helps automate the deployment process

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

cd "$APP_DIR"

echo "=== Deployment Risk Analyzer - Forge Deployment ==="
echo ""

# Check if logged in
check_login() {
    echo "Checking Forge authentication..."
    if ! npx @forge/cli whoami &>/dev/null; then
        echo "Not logged in. Please run: npx @forge/cli login"
        exit 1
    fi
    echo "✓ Authenticated"
}

# Build the app
build_app() {
    echo ""
    echo "Building the app..."
    cd "$APP_DIR/../.."
    pnpm --filter @dra/forge build
    cd "$APP_DIR"
    echo "✓ Build complete"
}

# Register the app (if not already registered)
register_app() {
    echo ""
    echo "Checking app registration..."
    if grep -q "ari:cloud:ecosystem::app/deployment-risk-analyzer" manifest.yml; then
        echo "App appears to be registered. Skipping registration."
        echo "To re-register, run: npx @forge/cli register"
    else
        echo "Registering app..."
        npx @forge/cli register
        echo "✓ App registered"
    fi
}

# Deploy the app
deploy_app() {
    echo ""
    echo "Deploying to development environment..."
    npx @forge/cli deploy
    echo "✓ Deployment complete"
}

# Install the app
install_app() {
    echo ""
    echo "Installing app on Atlassian site..."
    npx @forge/cli install
    echo "✓ Installation complete"
}

# Get installation link
get_install_link() {
    echo ""
    echo "Getting installation link..."
    npx @forge/cli install --upgrade
}

# Main menu
show_menu() {
    echo ""
    echo "What would you like to do?"
    echo "1) Full deployment (build, deploy, install)"
    echo "2) Build only"
    echo "3) Deploy only"
    echo "4) Install only"
    echo "5) Get installation link"
    echo "6) View logs"
    echo "7) Start tunnel (development)"
    echo "8) Exit"
    echo ""
    read -p "Enter choice [1-8]: " choice
    
    case $choice in
        1)
            check_login
            build_app
            register_app
            deploy_app
            install_app
            get_install_link
            ;;
        2)
            build_app
            ;;
        3)
            check_login
            deploy_app
            ;;
        4)
            check_login
            install_app
            ;;
        5)
            check_login
            get_install_link
            ;;
        6)
            npx @forge/cli logs
            ;;
        7)
            npx @forge/cli tunnel
            ;;
        8)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo "Invalid choice"
            show_menu
            ;;
    esac
}

# Run
if [ "$1" == "--full" ]; then
    check_login
    build_app
    register_app
    deploy_app
    install_app
    get_install_link
elif [ "$1" == "--deploy" ]; then
    check_login
    deploy_app
elif [ "$1" == "--install" ]; then
    check_login
    install_app
elif [ "$1" == "--link" ]; then
    check_login
    get_install_link
else
    show_menu
fi

echo ""
echo "=== Done ==="

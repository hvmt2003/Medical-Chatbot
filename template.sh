#!/bin/bash

echo "Setting up Medical Chatbot project structure..."
echo "---------------------------------------------"

# Helper function to safely create folders
create_dir() {
  if [ -d "$1" ]; then
    echo "Directory '$1' already exists. Skipping..."
  else
    mkdir -p "$1"
    echo "Created directory: $1"
  fi
}

# Helper function to safely create files
create_file() {
  if [ -f "$1" ]; then
    echo "File '$1' already exists. Skipping..."
  else
    touch "$1"
    echo "Created file: $1"
  fi
}

# --- Directory Structure ---
create_dir "src"
create_dir "static"
create_dir "templates"
create_dir "research"

# --- Python Files ---
create_file "src/__init__.py"
create_file "src/helper.py"
create_file "src/prompt.py"
create_file "app.py"
create_file "setup.py"
create_file "store_index.py"
create_file "str.py"

# --- Environment & Config ---
create_file ".env"
create_file "requirements.txt"
create_file "LICENSE"
create_file "README.md"

# --- Research Notebook ---
create_file "research/trials.ipynb"

# --- Static & Template Files ---
create_file "static/style.css"
create_file "templates/chat.html"
create_file "templates/login.html"
create_file "templates/signup.html"
create_file "templates/index.html"

echo "---------------------------------------------"
echo "Project structure verified and ready!"
echo "---------------------------------------------"

#!/bin/zsh
cd "$(dirname "$0")"
exec .venv/bin/python run_fridge.py --data-only

@echo off
rem Serves Chain Reaction Workbench on http://localhost/ (default port 80)
cd /d "%~dp0"
python serve.py
pause

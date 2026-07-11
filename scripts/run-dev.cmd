@echo off
cd /d "C:\Users\Yashau\Projects\Menyue-Claude"
if not exist ".tmp" mkdir ".tmp"
"C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js" dev --host 0.0.0.0 --port 5290 >> ".tmp\dev-server.log" 2>&1

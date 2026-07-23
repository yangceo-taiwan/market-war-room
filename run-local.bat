@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安裝套件，先為您執行 setup.bat。
  call setup.bat
  if errorlevel 1 exit /b 1
)
echo 網站啟動後，請用瀏覽器開啟畫面顯示的 Local 網址。
call npm run dev

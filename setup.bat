@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo [市場觀點戰情室] 正在安裝必要套件...
where npm >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js/npm。請先安裝 Node.js 24 LTS，再重新執行本檔案。
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo 安裝失敗，請確認網路連線後重試。
  pause
  exit /b 1
)
echo 安裝完成。接著可執行 run-local.bat。
pause

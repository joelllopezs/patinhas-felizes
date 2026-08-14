@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  PATINHAS FELIZES - AGENDAMENTO WEB
echo ========================================
echo.

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo O arquivo .env foi criado.
  echo Configure DATABASE_URL, UPLOAD_SIGNING_SECRET e os dados do negocio.
  echo.
)

call npm start

echo.
echo O servidor foi encerrado.
pause

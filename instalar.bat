@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo  PATINHAS FELIZES - INSTALACAO
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale o Node.js 22 antes de continuar.
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node -p "process.versions.node"') do set NODE_VERSION=%%i
echo Node.js encontrado: %NODE_VERSION%

echo.
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo ERRO: npm install falhou.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Arquivo .env criado.
) else (
  echo O arquivo .env ja existe e foi mantido.
)

echo.
echo Verificando o codigo...
call npm run check
if errorlevel 1 (
  echo A verificacao encontrou um erro.
  pause
  exit /b 1
)

echo.
echo Instalacao concluida.
echo 1. Configure o arquivo .env.
echo 2. Execute npm run db:setup depois de configurar DATABASE_URL.
echo 3. Use iniciar.bat para abrir o sistema localmente.
pause

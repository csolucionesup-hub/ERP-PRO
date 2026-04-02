@echo off
echo ========================================
echo  ERP-PRO MCP Agents - Instalador
echo ========================================
echo.

:: Verificar Node.js
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado
    echo Descargalo de: https://nodejs.org/
    pause
    exit /b 1
)
echo OK: Node.js instalado
echo.

:: Verificar ruta del proyecto
set ERP_PATH=C:\Users\Asus\ERP-PRO
echo [2/5] Verificando proyecto ERP-PRO en %ERP_PATH%...
if not exist "%ERP_PATH%" (
    echo ERROR: No se encuentra el proyecto en %ERP_PATH%
    echo Por favor ajusta la ruta en este script
    pause
    exit /b 1
)
echo OK: Proyecto encontrado
echo.

:: Copiar agentes
echo [3/5] Copiando agentes MCP a proyecto...
if not exist "%ERP_PATH%\mcp-servers" mkdir "%ERP_PATH%\mcp-servers"

xcopy /E /I /Y backend-agent "%ERP_PATH%\mcp-servers\backend-agent"
xcopy /E /I /Y database-agent "%ERP_PATH%\mcp-servers\database-agent"
xcopy /E /I /Y frontend-agent "%ERP_PATH%\mcp-servers\frontend-agent"
xcopy /E /I /Y tax-business-agent "%ERP_PATH%\mcp-servers\tax-business-agent"
xcopy /E /I /Y testing-agent "%ERP_PATH%\mcp-servers\testing-agent"

echo OK: Agentes copiados
echo.

:: Instalar dependencias
echo [4/5] Instalando dependencias en cada agente...

cd "%ERP_PATH%\mcp-servers\backend-agent"
echo - Backend Agent...
call npm install --silent

cd "%ERP_PATH%\mcp-servers\database-agent"
echo - Database Agent...
call npm install --silent

cd "%ERP_PATH%\mcp-servers\frontend-agent"
echo - Frontend Agent...
call npm install --silent

cd "%ERP_PATH%\mcp-servers\tax-business-agent"
echo - Tax Business Agent...
call npm install --silent

cd "%ERP_PATH%\mcp-servers\testing-agent"
echo - Testing Agent...
call npm install --silent

echo OK: Dependencias instaladas
echo.

:: Configurar Claude Desktop
echo [5/5] Configurando Claude Desktop...
set CLAUDE_CONFIG=%APPDATA%\Claude\claude_desktop_config.json

echo.
echo IMPORTANTE:
echo Debes agregar manualmente esta configuracion a:
echo %CLAUDE_CONFIG%
echo.
echo Contenido a agregar (se guardo en config-to-add.json):
type claude_desktop_config.json
echo.

copy /Y claude_desktop_config.json config-to-add.json >nul

echo.
echo ========================================
echo  Instalacion COMPLETADA
echo ========================================
echo.
echo PROXIMOS PASOS:
echo 1. Edita: %CLAUDE_CONFIG%
echo 2. Agrega la configuracion de config-to-add.json
echo 3. Reinicia Claude Desktop completamente
echo 4. Los 5 agentes estaran disponibles automaticamente
echo.
echo Documentacion completa: README.md
echo.
pause

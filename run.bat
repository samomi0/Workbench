@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ─────────────────────────────────────────────────────────────────────────────
:: Workbench 启动脚本 (Windows CMD / PowerShell)
:: ─────────────────────────────────────────────────────────────────────────────

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: ── 默认配置 ─────────────────────────────────────────────────────────────────
if not defined PORT      set "PORT=11111"
if not defined DEV_MODE  set "DEV_MODE=true"
if not defined DATA_DIR  set "DATA_DIR=%PROJECT_DIR%data"

:: ── 解析命令行参数 ───────────────────────────────────────────────────────────
:parse_args
if "%~1"=="" goto :check_python
if /i "%~1"=="-p"        (set "PORT=%~2" & shift & shift & goto :parse_args)
if /i "%~1"=="--port"    (set "PORT=%~2" & shift & shift & goto :parse_args)
if /i "%~1"=="-d"        (set "DEV_MODE=true"  & shift & goto :parse_args)
if /i "%~1"=="--dev"     (set "DEV_MODE=true"  & shift & goto :parse_args)
if /i "%~1"=="-P"        (set "DEV_MODE=false" & shift & goto :parse_args)
if /i "%~1"=="--prod"    (set "DEV_MODE=false" & shift & goto :parse_args)
if /i "%~1"=="--data-dir"(set "DATA_DIR=%~2"   & shift & shift & goto :parse_args)
if /i "%~1"=="-h"        goto :show_help
if /i "%~1"=="--help"    goto :show_help
echo [ERR]  未知参数: %~1
goto :show_help

:show_help
echo 用法: run.bat [选项]
echo.
echo 选项:
echo   -p, --port PORT      服务端口 (默认: 11111)
echo   -d, --dev            开发模式 (默认)
echo   -P, --prod           生产模式
echo   --data-dir DIR       数据目录 (默认: .\data)
echo   -h, --help           显示帮助
echo.
echo 示例:
echo   run.bat                      开发模式 :11111
echo   run.bat -p 8080              自定义端口
echo   run.bat -P -p 8000           生产模式 :8000
exit /b 0

:: ── 检测 Python ──────────────────────────────────────────────────────────────
:check_python
set "PYTHON="
where python >nul 2>&1 && set "PYTHON=python"
where python3 >nul 2>&1 && set "PYTHON=python3"
where py >nul 2>&1 && if not defined PYTHON set "PYTHON=py"

if not defined PYTHON (
    echo [ERR]  未找到 Python，请安装 Python 3.11+
    echo        下载: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('%PYTHON% --version 2^>^&1') do echo [INFO]  Python 版本: %%v

:: ── 检查依赖 ─────────────────────────────────────────────────────────────────
echo [INFO]  检查依赖...
%PYTHON% -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [WARN]  fastapi 未安装，正在安装依赖...
    %PYTHON% -m pip install -r "%PROJECT_DIR%backend\requirements.txt"
    if errorlevel 1 (
        echo [ERR]  依赖安装失败
        pause
        exit /b 1
    )
    echo [OK]    依赖安装完成
) else (
    echo [OK]    依赖已就绪
)

:: ── 虚拟环境检测 ─────────────────────────────────────────────────────────────
if defined VIRTUAL_ENV (
    echo [INFO]  已激活虚拟环境: %VIRTUAL_ENV%
) else (
    if exist "%PROJECT_DIR%.venv\Scripts\activate.bat" (
        echo [WARN]  检测到 .venv 目录但未激活
        echo [INFO]  执行: .venv\Scripts\activate
    )
)

:: ── 启动信息 ─────────────────────────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║              Workbench 启动中...                    ║
echo ╠══════════════════════════════════════════════════════╣
if "%DEV_MODE%"=="true" (
    echo ║  模式: 开发 ^(热重载^)                               ║
) else (
    echo ║  模式: 生产                                        ║
)
echo ║  地址: http://0.0.0.0:%PORT%                      ║
echo ║  数据: %DATA_DIR%                                  ║
if "%DEV_MODE%"=="true" (
    echo ║  文档: http://localhost:%PORT%/api/docs          ║
)
echo ╚══════════════════════════════════════════════════════╝
echo.

:: ── 启动服务 ─────────────────────────────────────────────────────────────────
if "%DEV_MODE%"=="true" (
    %PYTHON% -m uvicorn app:app --host 0.0.0.0 --port %PORT% --reload --app-dir "%PROJECT_DIR%backend"
) else (
    %PYTHON% "%PROJECT_DIR%backend\main.py"
)

pause

#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Workbench 启动脚本 (Linux / macOS / Git Bash)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'  # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR]${NC}   $*"; }

# ── 项目根目录 ───────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# ── 默认配置 ─────────────────────────────────────────────────────────────────
PORT="${PORT:-11111}"
DEV_MODE="${DEV_MODE:-true}"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data}"

# ── 解析命令行参数 ───────────────────────────────────────────────────────────
usage() {
    echo "用法: ./run.sh [选项]"
    echo ""
    echo "选项:"
    echo "  -p, --port PORT      服务端口 (默认: 11111)"
    echo "  -d, --dev            开发模式 (默认)"
    echo "  -P, --prod           生产模式"
    echo "  --data-dir DIR       数据目录 (默认: ./data)"
    echo "  -h, --help           显示帮助"
    echo ""
    echo "示例:"
    echo "  ./run.sh                       # 开发模式 :11111"
    echo "  ./run.sh -p 8080               # 自定义端口"
    echo "  ./run.sh -P -p 8000            # 生产模式 :8000"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)     PORT="$2"; shift 2 ;;
        -d|--dev)      DEV_MODE=true; shift ;;
        -P|--prod)     DEV_MODE=false; shift ;;
        --data-dir)    DATA_DIR="$2"; shift 2 ;;
        -h|--help)     usage ;;
        *)             err "未知参数: $1"; usage ;;
    esac
done

# ── 依赖检查 ─────────────────────────────────────────────────────────────────
check_python() {
    if command -v python &>/dev/null; then
        PYTHON=python
    elif command -v python3 &>/dev/null; then
        PYTHON=python3
    else
        err "未找到 Python，请安装 Python 3.11+"
        exit 1
    fi

    local ver=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    info "Python 版本: $ver ($PYTHON)"
}

check_deps() {
    info "检查依赖..."
    if ! $PYTHON -c "import fastapi" &>/dev/null; then
        warn "fastapi 未安装，正在安装依赖..."
        $PYTHON -m pip install -r "$PROJECT_DIR/backend/requirements.txt"
        ok "依赖安装完成"
    else
        ok "依赖已就绪"
    fi
}

# ── 虚拟环境检测 ─────────────────────────────────────────────────────────────
detect_venv() {
    if [[ -n "${VIRTUAL_ENV:-}" ]]; then
        info "已激活虚拟环境: $VIRTUAL_ENV"
    elif [[ -d "$PROJECT_DIR/.venv" ]]; then
        warn "检测到 .venv 目录但未激活"
        info "执行: source .venv/bin/activate"
    fi
}

# ── 启动 ─────────────────────────────────────────────────────────────────────
start() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}              Workbench 启动中...                    ${GREEN}║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
    printf "${GREEN}║${NC}  模式: %-42s ${GREEN}║${NC}\n" "$([ "$DEV_MODE" = "true" ] && echo "开发 (热重载)" || echo "生产")"
    printf "${GREEN}║${NC}  地址: http://0.0.0.0:%-31s ${GREEN}║${NC}\n" "$PORT"
    printf "${GREEN}║${NC}  数据: %-42s ${GREEN}║${NC}\n" "$DATA_DIR"
    if [ "$DEV_MODE" = "true" ]; then
        printf "${GREEN}║${NC}  文档: http://localhost:$PORT/api/docs%13s ${GREEN}║${NC}\n" ""
    fi
    echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""

    export DEV_MODE="$DEV_MODE"
    export PORT="$PORT"
    export DATA_DIR="$DATA_DIR"

    if [ "$DEV_MODE" = "true" ]; then
        $PYTHON -m uvicorn app:app \
            --host 0.0.0.0 \
            --port "$PORT" \
            --reload \
            --app-dir "$PROJECT_DIR/backend"
    else
        $PYTHON "$PROJECT_DIR/backend/main.py"
    fi
}

# ── 主流程 ───────────────────────────────────────────────────────────────────
check_python
detect_venv
check_deps
start

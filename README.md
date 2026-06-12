# Workbench

个人工作台 — 集便签、Todo、标签管理、归档与可扩展工具于一体的轻量 Web 应用。

## 功能概览

| 模块 | 说明 |
|------|------|
| **便签板 (Sticky Board)** | 无限画布拖放便签，支持便签/待办/图片/工单四种类型 |
| **Todo 列表** | 可勾选的任务清单，嵌入便签中 |
| **标签系统** | 为便签、资源打标签，按标签筛选和归档 |
| **归档管理** | 按标签或笔记 ID 导出 ZIP 归档包，支持预览 |
| **自动备份** | 定时 (默认 8h) 将项目 + data 目录打包备份，保留 72h |
| **工具插件** | 可扩展的前端工具面板，热加载注册 |
| **自定义路由** | `backend/custom/` 下放置 `.py` 即可自动注册 API |
| **Mock 服务** | `backend/mock/services/` 下放置 `.py` 即可注册模拟接口 |
| **Dev 模式** | 前端文件监听 + SSE 热重载 + Swagger 文档 |

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.11+ / FastAPI / Uvicorn |
| 前端 | 原生 HTML/CSS/JS (ES Module)，零依赖构建 |
| 存储 | JSON 文件 (原子写入) |
| 容器化 | Docker / Docker Compose |

## 快速开始

### 环境要求

- Python 3.11+
- pip

### 本地运行

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 开发模式启动（前端热重载 + API 文档）
export DEV_MODE=true
export PORT=11111
python backend/main.py

# 访问 http://localhost:11111
# API 文档 http://localhost:11111/api/docs
```

或使用启动脚本：

**Linux / macOS (bash):**
```bash
chmod +x run.sh
./run.sh
```

**Windows (PowerShell / CMD):**
```cmd
run.bat
```

### Docker 运行

```bash
docker compose up -d
# 访问 http://localhost:8000
```

## 项目结构

```
Workbench/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 入口 (uvicorn)
│   ├── app.py                  # FastAPI 应用工厂 + 路由注册
│   ├── config.py               # 全局配置 (环境变量驱动)
│   ├── requirements.txt        # Python 依赖
│   ├── api/                    # 核心 REST API
│   │   ├── notes.py            # 便签 CRUD
│   │   ├── tags.py             # 标签 CRUD
│   │   ├── resources.py        # 资源管理
│   │   ├── archive.py          # 归档打包/下载
│   │   └── tools.py            # 工具列表
│   ├── services/               # 业务服务层
│   │   ├── storage.py          # 原子 JSON 文件存储
│   │   ├── tag_service.py      # 标签业务逻辑
│   │   ├── archive_service.py  # 归档服务
│   │   └── backup_service.py   # 自动备份调度
│   ├── custom/                 # 自定义路由 (自动发现)
│   │   ├── registry.py         # 自动扫描注册器
│   │   └── custom_msg_templates.py
│   ├── mock/                   # Mock 服务 (自动发现)
│   │   ├── registry.py
│   │   ├── data/               # Mock 数据
│   │   └── services/           # Mock API 路由
│   └── dev/                    # 开发工具
│       ├── router.py           # SSE 热重载端点
│       └── watcher.py          # 文件变更监听
├── frontend/                   # 前端 (零构建)
│   ├── index.html              # 主页面
│   ├── assets/
│   │   ├── css/                # 样式表
│   │   │   ├── variables.css   # 设计 Token
│   │   │   ├── sticky-board.css
│   │   │   ├── radial-menu.css # 中键径向菜单
│   │   │   ├── panel.css       # 侧边面板
│   │   │   └── ...
│   │   └── js/
│   │       ├── core/           # 核心模块
│   │       │   ├── app.js      # 应用入口
│   │       │   ├── api.js      # API 封装
│   │       │   └── bus.js      # 事件总线
│   │       └── ui/             # UI 组件
│   │           ├── sticky-board.js
│   │           ├── radial-menu.js
│   │           ├── panel.js
│   │           └── ...
│   └── tools/                  # 工具插件 (自动发现)
│       ├── _template/          # 工具模板
│       ├── archive-view/       # 归档管理工具
│       └── custom_*/           # 自定义工具
├── data/                       # 运行时数据 (JSON)
│   ├── notes.json
│   ├── tags.json
│   ├── resources.json
│   └── note_images/
├── backups/                    # 自动备份输出
├── docker-compose.yml
├── Dockerfile
├── run.sh                      # Linux/macOS 启动脚本
└── run.bat                     # Windows 启动脚本
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8000` | 服务端口 |
| `DEV_MODE` | `false` | 开发模式（热重载 + API 文档 + 无缓存） |
| `DATA_DIR` | `./data` | 数据存储目录 |
| `BACKUP_DIR` | `./backups` | 备份输出目录 |
| `BACKUP_INTERVAL_HOURS` | `8` | 自动备份间隔 (小时) |
| `BACKUP_RETENTION_HOURS` | `72` | 备份保留时长 (小时) |

## API 概览

| 前缀 | 说明 |
|------|------|
| `GET/POST /api/notes` | 便签列表 / 创建 |
| `PUT/DELETE /api/notes/{id}` | 更新 / 删除便签 |
| `POST /api/notes/{id}/image` | 上传便签图片 |
| `GET/POST /api/tags` | 标签列表 / 创建 |
| `PUT/DELETE /api/tags/{id}` | 更新 / 删除标签 |
| `GET/POST /api/resources` | 资源列表 / 创建 |
| `POST /api/archive` | 按标签归档导出 ZIP |
| `POST /api/archive/notes` | 按笔记 ID 归档导出 ZIP |
| `GET /api/tools` | 已注册工具列表 |
| `GET /api/docs` | Swagger UI（DEV_MODE 开启时） |

## 操作指南

### 便签操作

1. **新建便签**: 在画布上按鼠标中键 → 唤出径向菜单 → 选择「新建便笺」或「Todo」
2. **拖拽移动**: 按住便签头部拖拽到任意位置
3. **调整大小**: 拖拽便签右下角
4. **编辑内容**: 双击便签进入编辑模式，点击外部自动保存
5. **删除**: 右键便签头部 → 删除
6. **归档**: 在便签上右键 → 归档

### 标签管理

1. 点击左下角标签图标打开标签面板
2. 创建标签并设置颜色
3. 在便签编辑时关联标签
4. 按标签筛选便签

### 归档导出

1. 打开归档面板 (左侧工具栏)
2. 选择标签或笔记
3. 点击导出，下载 ZIP 包

### 页面切换

- **Alt + 中键**: 唤出页面切换菜单，在便签本和工具之间切换
- **底部导航栏**: 拖拽搜索 pill 切换页面

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `中键点击画布` | 唤出径向菜单 |
| `Alt + 中键` | 唤出页面切换菜单 |
| `Ctrl+S` | 已拦截，防止浏览器保存对话框 |

## 扩展开发

### 添加自定义 API 路由

在 `backend/custom/` 下创建 `.py` 文件，导出一个 `router` (FastAPI APIRouter)：

```python
# backend/custom/my_feature.py
from fastapi import APIRouter

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

@router.get("")
def list_items():
    return [{"id": 1, "name": "Hello"}]
```

重启后自动注册。

### 添加 Mock 服务

在 `backend/mock/services/` 下创建 `.py` 文件，同样导出 `router`：

```python
# backend/mock/services/mock_gps.py
from fastapi import APIRouter

router = APIRouter(prefix="/api/mock/gps", tags=["mock"])

@router.get("/position")
def get_position():
    return {"lat": 31.23, "lng": 121.47}
```

### 添加前端工具

1. 复制 `frontend/tools/_template/` 为你的工具目录
2. 编辑 `tool.json` 设置名称、图标、描述
3. 编辑 `index.html` 实现工具界面
4. 刷新页面即可在工具列表中看到

## License

MIT
# 技术设计：目录文件大小统计工具 (dirsize-tool)

## 1. 概述

轻量 Python CLI 工具，递归统计指定目录下所有文件的总大小。设计目标：纯读、快速、输出结构化，可作为 @mention 修复测试的验证工具。

## 2. CLI 接口

```bash
python scripts/dirsize.py <path> [options]
```

### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `path` | 位置参数 | 必填 | 目标目录路径 |
| `--unit`, `-u` | 字符串 | `auto` | 显示单位：`auto`, `B`, `KB`, `MB`, `GB` |
| `--exclude` | 字符串列表 | 无 | 排除的模式（可多次使用），如 `--exclude node_modules --exclude .git` |
| `--json` | 标志位 | `false` | 输出 JSON 格式供自动化使用 |
| `--max-depth` | 整数 | 无限制 | 最大递归深度 |
| `--ignore-permission-denied` | 标志位 | `false` | 跳过权限不足的目录 |
| `--disk-usage` | 标志位 | `false` | 使用 `stat.st_blocks` 计算磁盘占用，而非 apparent size |

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 参数错误 |
| 2 | 路径不存在 |
| 3 | 权限不足（未使用 `--ignore-permission-denied`） |

### 使用示例

```bash
# 默认输出
python scripts/dirsize.py /some/dir
# Total: 117.7 MB (42 files)

# JSON 格式供自动化使用
python scripts/dirsize.py /some/dir --json
# {"path":"/some/dir","total_bytes":123456789,"human_size":"117.7 MB",...}

# 排除 node_modules 和 .git
python scripts/dirsize.py . --exclude node_modules --exclude .git

# 限制深度
python scripts/dirsize.py /deep/tree --max-depth 3

# 磁盘占用（而非 apparent size）
python scripts/dirsize.py /some/dir --disk-usage
```

### 输出格式

**默认（人类可读）**：
```
Total: 117.7 MB (42 files)
```

**JSON 模式**：
```json
{
  "path": "/path/to/dir",
  "total_bytes": 123456789,
  "human_size": "117.7 MB",
  "file_count": 42,
  "elapsed_ms": 15,
  "errors": []
}
```

## 3. 核心算法

```python
import os

def get_dir_size(path, follow_symlinks=False, disk_usage=False):
    total = 0
    count = 0
    for dirpath, dirnames, filenames in os.walk(path, followlinks=follow_symlinks):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                st = os.lstat(fp) if not follow_symlinks else os.stat(fp)
                if not stat.S_ISREG(st.st_mode):
                    continue
                total += st.st_blocks * 512 if disk_usage else st.st_size
                count += 1
            except PermissionError:
                if not ignore_permission_denied:
                    raise
    return total, count
```

**性能优化**：
- 对大目录可用 `os.scandir` + 递归替代 `os.walk`，减少 stat 调用
- `--max-depth` 限制递归层数，避免意外遍历过深

## 4. 性能预期

| 文件数 | 耗时 |
|--------|------|
| 1,000 | < 10ms |
| 100,000 | ~200ms |
| 1,000,000 | ~2s |
| 10,000,000 | ~20s (建议加 `--max-depth`) |

## 5. 文件定位

```bash
scripts/dirsize.py
```

归属路径待 Carlo 确认（`~/hermes-workspace/scripts/` 或全局 `~/.hermes/scripts/`）。

## 6. 实现计划

1. 创建 `scripts/dirsize.py` 文件
2. 实现 `os.walk` + `argparse` 基础功能
3. 添加 `--json` 输出
4. 添加 `--exclude`, `--max-depth`, `--ignore-permission-denied` 等特性
5. 添加 `--disk-usage` 选项
6. 提交 PR / 直接合并（视归属路径而定）

预估工作量：15-30 分钟。

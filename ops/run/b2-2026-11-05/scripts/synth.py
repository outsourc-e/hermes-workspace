import os, subprocess, sys, datetime

# ponytail: hardcoded targets remove need for CLI args in cron context
TARGETS = {
    "shadow_ai": {"raw": "/tmp/shadow_ai_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/Shadow AI Report.md"), "prompt": "Summarize Sovereign AI hits into intelligence briefing."},
    "ai_protect": {"raw": "/tmp/ai_protect_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/AI-Protect Intelligence.md"), "prompt": "Analyze raw intel for AI-Protect anonymization trends."},
    "kritis_south": {"raw": "/tmp/kritis_south_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/KRITIS South Report.md"), "prompt": "Synthesize KRITIS intelligence for Southern Austria."},
    "kritis_east": {"raw": "/tmp/kritis_east_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/KRITIS East Report.md"), "prompt": "Synthesize KRITIS intelligence for Vienna and Lower Austria."},
    "kritis_west": {"raw": "/tmp/kritis_west_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/KRITIS West Report.md"), "prompt": "Synthesize KRITIS intelligence for Tyrol, Salzburg, and Upper Austria."},
    "kritis_master": {"raw": "/tmp/kritis_master_raw.txt", "report": os.path.expanduser("~/Documents/Obsidian Vault/KRITIS Master Audit.md"), "prompt": "Perform a systemic audit and consolidation of all regional KRITIS sync results."}
}

def summarize(text):
    # 2026-11-04: model from ops/config/model.env (single source of truth, model-policy.md).
    # Was hardcoded 'ollama run gemma4:31b' — breaks silently when that model is pruned.
    model = "ternary-bonsai-2-27b:q2_0"
    env_path = os.path.expanduser("~/hermes-workspace/ops/config/model.env")
    try:
        for line in open(env_path):
            line = line.strip()
            if line.startswith("PRIMARY_MODEL_ID="):
                model = line.split("=", 1)[1].strip().strip('"')
                break
    except Exception:
        pass
    try:
        process = subprocess.Popen(['ollama', 'run', model], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, _ = process.communicate(input=text)
        return stdout.strip()
    except Exception as e: return f"Error: {e}"

def run_for(name):
    cfg = TARGETS.get(name)
    if not cfg or not os.path.exists(cfg['raw']): return
    with open(cfg['raw'], 'r') as f: data = f.read()
    if not data or "No matches today" in data: return
    summary = summarize(f"{cfg['prompt']}\n\n{data}")
    with open(cfg['report'], 'a') as f: f.write(f"\n\n### Update {datetime.datetime.now()}\n{summary}\n")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else None
    if target: run_for(target)
    else: [run_for(t) for t in TARGETS]

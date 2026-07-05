# FOUNDER HANDOFF — ปลดล็อก 3 External Blockers ของ captain-pdf-knowledge-ingestion

- จัดทำ: 2026-07-05T16:05Z · Host: srv1437654 · โดย Fable 5 closeout round
- ระบบที่เกี่ยวข้อง: branch `feat/pdf-ingestion-phase1_6` @ commit `244621d0`
- สถานะปัจจุบัน: ทุก Gate ภายในผ่านแล้ว (52/52 tests, AGY APPROVED, read-only canary PASS)
  เหลือเฉพาะสิ่งที่ Founder เท่านั้นให้ได้ 3 อย่างด้านล่าง
- ข้อห้ามคงเดิม: ห้ามส่ง Token/Key ผ่าน Chat — ใช้สคริปต์ในโฟลเดอร์นี้ซึ่งไม่ echo และไม่ลง history

## สิ่งที่ต้องทำ (บนเครื่อง srv1437654 ในฐานะ user jakky)

### 1) ใส่ Registry Endpoint + Token + HMAC Key + Namespaces (ครั้งเดียว)

```bash
bash evidence/pdf-ingestion/fable5-closeout/handoff/setup_secrets.sh
```

- ถามทีละค่าแบบซ่อนอินพุต แล้วเขียนลง `~/.captain-pdf/secrets.env` (สิทธิ์ 0600)
- ค่าที่ต้องใส่: `CAPTAIN_PDF_REGISTRY_URL`, `CAPTAIN_PDF_REGISTRY_TOKEN`,
  `CAPTAIN_PDF_APPROVAL_HMAC_KEY`, `CAPTAIN_PDF_REGISTRY_NAMESPACE`, และ
  `CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE` (production/test namespace ต้องไม่ซ้ำกัน)
- เหตุผลที่ต้องใช้: ระบบออกแบบเป็น fail-closed — ไม่มีค่าเหล่านี้ Registry ภายนอก
  และ Write Gate จะปฏิเสธทุกอย่าง (พิสูจน์แล้วใน blocker_reverification_20260705.md)

### 2) พิสูจน์ Registry แบบ Read-only (Gate 2)

```bash
set -a; source ~/.captain-pdf/secrets.env; set +a
python3 evidence/pdf-ingestion/fable5-closeout/handoff/verify_external_registry.py \
  --namespace "$CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE" \
  --out evidence/pdf-ingestion/fable5-closeout/gate2_registry_probe.json
```

- ผลที่คาดหวัง: `"result": "PASS"` พร้อมรายละเอียด TLS/Auth/Namespace (ไม่มีการเขียนใด ๆ,
  Token ไม่ถูกพิมพ์ออกมา) — ถ้า FAIL สคริปต์บอกจุดที่พังชัดเจน

### 3) ลงนาม Approval Manifest (เฉพาะ Founder — Agent ห้ามทำแทน)

```bash
cp evidence/pdf-ingestion/fable5-closeout/handoff/approval_manifest_template.json /tmp/manifest.json
# แก้ช่อง FILL ทั้งหมดใน /tmp/manifest.json (document_ids, knowledge_ids, expires_at, commit_sha, approved_by)
set -a; source ~/.captain-pdf/secrets.env; set +a
python3 evidence/pdf-ingestion/fable5-closeout/handoff/sign_manifest.py /tmp/manifest.json \
  --payload <payload.json> --out ~/.captain-pdf/approval_manifest.json
```

- Signature เข้ากันได้แบบ byte-for-byte กับ `src/approval_gate.py` (HMAC-SHA256 บน canonical JSON)
- สคริปต์ปฏิเสธ manifest ที่ยังมีช่อง FILL, ฟิลด์ขาด, หรือ `auto_promotion != false`
- ผลที่คาดหวัง: Write Canary หนึ่ง record ใน namespace `captain-pdf-test` ผ่าน Gate ครบ 16 ข้อ
  จากนั้น `canonical_write` ถูกปิดกลับทันที (harness เดิม `scripts/dry_run_canary.py` บน branch ระบบ)

### 4) GitHub Push Credential (เลือกหนึ่งทาง)

- ทาง A (แนะนำ): สร้าง fine-grained PAT ที่มีสิทธิ์ push repo `outsourc-e/hermes-workspace`
  แล้วรัน `git config --global credential.helper 'cache --timeout=900'` และ push หนึ่งครั้ง
  เพื่อป้อน credential แบบ interactive (ไม่ค้างถาวรบนดิสก์)
- ทาง B: เพิ่ม SSH key ใหม่เข้า GitHub — key เดิม `smc_hostinger_ed25519` ใช้ไม่ได้
  (พิสูจน์สด: `Permission denied (publickey)`) — สร้างด้วย
  `ssh-keygen -t ed25519 -f ~/.ssh/github_ed25519` แล้วเพิ่ม public key ใน GitHub Settings
  จากนั้น `git remote set-url origin git@github.com:outsourc-e/hermes-workspace.git`
- ผลที่คาดหวัง: `git push --dry-run origin feat/pdf-ingestion-phase1_6` แสดงรายการ ref
  แทน error เรื่อง Username — จากนั้น push จริงเป็น fast-forward เท่านั้น (ห้าม force)

## Resume Command (หลังทำข้อ 1 เสร็จ อย่างน้อยหนึ่งอย่าง)

```bash
bash evidence/pdf-ingestion/fable5-closeout/handoff/resume_closeout.sh
```

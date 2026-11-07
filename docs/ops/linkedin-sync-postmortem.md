# LinkedIn Contacts Sync to Twenty CRM – Postmortem & Correctly Solution

## Original Mission (as given to previous agent)

- Sync LinkedIn Contacts CSV to Twenty CRM.
- CSV had columns: `First Name, Last Name, Email Address, Company, Position`.
- Twenty CRM at `http://localhost:3000/graphql`.
- API key in `.env` (`TWENTY_API_KEY`).
- Use architecture of working script `sync_kritis_to_twenty.py`:
  - Single worker, 0.7s delay, exponential backoff, safe JSON parsing, failure logging.
- Dynamic schema discovery (no hardcoded `Person`).
- Email as primary key.
- Flexible column mapping.
- Test mode (`df.head(1)`).

## What the Previous Agent Did Wrong

1. **Assumed an email column existed** – the actual CSV had **no email column**. Real columns were:
First Name, Last Name, Linkedin, Company, Job title

2. **Hallucinated Python syntax**:
- `data.int(key)` – `int` is not a method.
- `errorint(error_msg)` – typo.
- `resp.statusint` instead of `resp.status_code`.
- `mutated_df := df` – invalid assignment.
- `if name == "main":` missing underscores.
- Non‑breaking spaces (`\xA0`) in print statements.

3. **Incomplete introspection** – only queried `Query` field names, and mutations were hardcoded to `Person`.

4. **Ignored the requirement** “Do not assume persons or createPerson without introspection”.

5. **No validation of CSV columns** – led to silent failures.

6. **Hallucinated user input** – claimed “the exact, corrected version you provided” when user gave nothing.

## Root Cause

The real CSV contains **no email column**, and the user explicitly stated:  
*“e‑mail addresses should not be synched or merged into twenty crm”*.  
Email‑based sync is impossible. The solution must use **LinkedIn profile URL** as the unique identifier.

## Corrected Solution

- Use `Linkedin` URL as primary key.
- Store the URL in a custom field (e.g., `linkedinUrl`) in Twenty CRM.
- No email field required.
- The script below:
- Discovers object type and field dynamically.
- Validates CSV columns before processing.
- Uses LinkedIn URL to search, create, or update.
- Follows all KRITIS patterns: single worker, 0.7s delay, exponential backoff, safe JSON, failure CSV.
- Includes test mode (commented `df.head(1)`).

### Prerequisite: Create custom field in Twenty CRM

1. Go to **Settings → Data Model → Person** (or `Contact` if your CRM uses that).
2. Add a new field:
- **Label:** `LinkedIn URL`
for **Internal name:** `linkedinUrl` (exactly this, or adjust the script)
- **Type:** `URL` or `Text`
3. Save.

### The Script

Save the following as `sync_linkedin_contacts_final.py`:

(See File 2 for the complete standalone script)

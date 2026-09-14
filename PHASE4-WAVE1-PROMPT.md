# Prompt for Phase 4 Remediation Agent — Wave 1

## Repository & Context

**Repository:** `https://github.com/parssystem1-coder/scalpai`
**Branch:** `main` (push directly to main)
**Reference Document:** `docs/PHASE4-CLOSURE-GATE.md` — **READ THIS FIRST**

---

## Task Overview

Execute **Wave 1 of Phase 4 Remediation** per `docs/PHASE4-CLOSURE-GATE.md`. Focus on:

1. **C3 — GitHub Ruleset Creation** (P0, 2h) — Infrastructure blocker B03
2. **C4 — Fastify Upgrade** (P0, 1h) — Infrastructure blocker B04
3. **C1 — Remove `any` types from hooks** (P1, 3h)
4. **C2 — Remove `eslint-disable` comments** (P1, 4h)

**Goal:** Clear P0 blockers first, then start code quality fixes. Each change must be committed individually with descriptive messages. Push to `main` after each commit so gate runs.

---

## Prerequisites (Verify First)

```bash
# 1. Clone fresh
git clone https://github.com/parssystem1-coder/scalpai.git
cd scalpai

# 2. Install deps
npm ci --legacy-peer-deps

# 3. Verify current state
npm run type-check
npm run lint
npm test

# 4. Verify B03 (should show no ruleset, no required checks)
gh api repos/parssystem1-coder/scalpai/rulesets
gh api repos/parssystem1-coder/scalpai/branches/main/protection

# 5. Verify B04 (should show 2 Moderate advisories)
cd apps/api && npm audit --audit-level=high
```

---

## C3 — GitHub Ruleset Creation (P0, 2h)

### Steps

1. **Create the ruleset via GitHub API** (use `gh` CLI or direct API):
   ```bash
   gh api --method POST repos/parssystem1-coder/scalpai/rulesets \
     -f name="main-branch-gate" \
     -f target="branch" \
     -f enforcement="active" \
     -F bypass_actors='[]' \
     -F 'conditions={"ref_name":{"include":["refs/heads/main"]}}' \
     -F 'rules=[
       {"type":"commit_message_pattern","pattern":"^(feat|fix|chore|docs|test|refactor)\\(.*\\):"},
       {"type":"commit_author_email_pattern","pattern":".*@(company.com|verified-domain.com)$"},
       {"type":"creation","parameters":{"restrict_creation":true}},
       {"type":"deletion","parameters":{"restrict_deletion":true}},
       {"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"gate (gate.yml)","integration_id":null}],"strict_required_status_checks_policy":true}},
       {"type":"pull_request","parameters":{"dismiss_stale_reviews":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_approving_review_count":1}},
       {"type":"required_signatures","parameters":{}}
     ]'
   ```

2. **Verify it works:**
   ```bash
   # Test unsigned commit blocked
   echo "test" > /tmp/test.txt && git add /tmp/test.txt && git commit -m "test: unsigned" --no-gpg-sign && git push origin main 2>&1 | grep -i "must be signed"
   
   # Test signed commit works
   git commit -m "test: signed" -S && git push origin main
   ```

3. **Commit & push:**
   ```bash
   git commit --allow-empty -m "ci: add GitHub Ruleset for main branch (C3)

   - Required status checks: gate (gate.yml)
   - Required signatures on commits
   - 1 approving review required
   - Commit message pattern enforced
   - Blocks unsigned commits and force pushes
   "
   git push origin main
   ```

### Acceptance
- [ ] Ruleset visible in GitHub UI: Settings → Rules → Rulesets
- [ ] Unsigned commit to main blocked
- [ ] Signed commit passes
- [ ] Dependabot PRs can auto-merge when gate passes
- [ ] Gate job `gate (gate.yml)` appears as required check

---

## C4 — Fastify Upgrade to 5.12.1+ (P0, 1h)

### Steps

1. **Upgrade in apps/api:**
   ```bash
   cd apps/api
   npm update fastify@^5.12.1 @nestjs/platform-fastify@^12.0.1
   ```

2. **Verify audit clean:**
   ```bash
   npm audit --audit-level=high
   # Should show: "found 0 vulnerabilities"
   ```

3. **Run tests:**
   ```bash
   cd ../..
   npm test -- apps/api
   ```

4. **Commit & push:**
   ```bash
   git add apps/api/package.json apps/api/package-lock.json
   git commit -m "fix: upgrade fastify to 5.12.1+ to resolve GHSA-3m5p-2c4r-xxw2, GHSA-w2qp-rph6-63g4 (C4)

   - fastify 5.6.2 → 5.12.1+ (resolves GHSA-3m5p-2c4r-xxw2 CVSS 6.1, GHSA-w2qp-rph6-63g4 CVSS 5.4)
   - @nestjs/platform-fastify 11.1.6 → 12.0.1+ (breaking change, required for fastify 5.12+)
   - npm audit --audit-level=high now passes with zero advisories
   "
   git push origin main
   ```

### Acceptance
- [ ] `cd apps/api && npm audit --audit-level=high` exits 0, zero vulnerabilities
- [ ] API tests pass
- [ ] `npm run build` succeeds

---

## C1 — Remove `any` Types from Hooks (P1, 3h)

### Target Files (from deep analysis)

| File | Issues |
|---|---|
| `apps/web/src/hooks/useConditionMapping.ts` | Line 12: `const [conditions, setConditions] = useState<any[]>([])`<br>Line 27: `const [mapping, setMapping] = useState<any>(null)` |

### Steps

1. **Read current file:**
   ```bash
   cat apps/web/src/hooks/useConditionMapping.ts
   ```

2. **Add proper types:**
   ```typescript
   // Define interfaces at top of file
   interface ScalpCondition {
     id: string;
     nameFa: string;
     nameEn: string;
     severity: 'mild' | 'moderate' | 'severe';
     icd10?: string;
   }
   
   interface ConditionMapping {
     conditionId: string;
     confidence: number;
     matchedAt: string;
   }
   
   // Replace any usage:
   const [conditions, setConditions] = useState<ScalpCondition[]>([]);
   const [mapping, setMapping] = useState<ConditionMapping | null>(null);
   ```

3. **Verify:**
   ```bash
   npm run type-check
   npm run lint apps/web/src/hooks
   npm test
   ```

4. **Commit:**
   ```bash
   git add apps/web/src/hooks/useConditionMapping.ts
   git commit -m "refactor: remove any types from useConditionMapping (C1)

   - Added ScalpCondition and ConditionMapping interfaces
   - Replaced useState<any[]> with useState<ScalpCondition[]>
   - Replaced useState<any> with useState<ConditionMapping | null>
   - type-check and lint pass
   "
   git push origin main
   ```

### Acceptance
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint apps/web/src/hooks` passes
- [ ] Zero `any` in `apps/web/src/hooks/` (grep -r "any" apps/web/src/hooks --include="*.ts")
- [ ] Tests pass

---

## C2 — Remove `eslint-disable` Comments (P1, 4h)

### Target Files (from deep analysis)

Search for existing disable comments:
```bash
grep -rn "eslint-disable" apps/web/src --include="*.ts" --include="*.tsx"
```

### Expected locations (based on audit):
- `apps/web/src/components/ClinicalDashboard.tsx` — check for any remaining
- Other files as found

### Steps

1. **Find all:**
   ```bash
   grep -rn "eslint-disable" apps/web/src --include="*.ts" --include="*.tsx"
   ```

2. **For each occurrence, fix the underlying issue instead of disabling:**
   - Unused variable → remove or use it
   - Missing useEffect dependency → add dependency or use useCallback
   - Complexity → refactor into smaller functions

3. **Verify:**
   ```bash
   npm run lint
   grep -rn "eslint-disable" apps/web/src --include="*.ts" --include="*.tsx"  # Should return empty
   ```

4. **Commit per file:**
   ```bash
   git add <file>
   git commit -m "refactor: remove eslint-disable in <file> (C2)

   - Fixed underlying lint issue instead of suppressing
   - lint passes without disables
   "
   git push origin main
   ```

### Acceptance
- [ ] `npm run lint` passes
- [ ] Zero `eslint-disable` comments in `apps/web/src/`
- [ ] Tests pass

---

## General Rules

### Commit Format
Each logical change = one commit:
```
<type>: <short description> (C<X>)

- Detail 1
- Detail 2
- Verification: <command that passes>
```

Types: `fix`, `refactor`, `ci`, `test`, `docs`

### Push After Each Commit
```bash
git push origin main
```
Watch GitHub Actions — gate must pass.

### If Gate Fails
1. Check GitHub Actions log
2. Fix the issue
3. `git commit --amend` or new fix commit
4. Push again

---

## Verification Checklist (End of Wave 1)

| Criterion | Command | Expected |
|---|---|---|
| C3 Ruleset | `gh api repos/parssystem1-coder/scalpai/rulesets` | Ruleset exists |
| C3 Unsigned blocked | Push unsigned → blocked | "Commits must be signed" |
| C4 Audit clean | `cd apps/api && npm audit --audit-level=high` | 0 vulnerabilities |
| C1 No any | `grep -r "useState<any" apps/web/src/hooks` | Empty |
| C1 Typecheck | `npm run type-check` | Exit 0 |
| C2 No disables | `grep -r "eslint-disable" apps/web/src` | Empty |
| C2 Lint | `npm run lint` | Exit 0 |
| All tests | `npm test` | 741 passed, 4 skipped |
| Build | `npm run build` | Success |

---

## Notes

- **Do NOT modify** `docs/PHASE4-CLOSURE-GATE.md` — it's the gate reference
- **Do NOT modify** `docs/PHASE4-INFRASTRUCTURE-VERIFICATION.md`
- If you discover new issues, note them but continue with assigned criteria
- Commit messages must reference criterion ID (C1, C2, C3, C4)
- Each commit must be verifiable by the commands above

---

## Next Waves (Not in This Session)

After Wave 1 completes, remaining criteria:
- C5: Move modals to `modals/` directory
- C6: DemoWatermark DEV-guarded
- C7: Remove SAMPLE imports from components
- C9: Fix m1b-runtime-wiring.spec.ts
- C10: Fix m5-blockers.spec.ts
- C11: Update exceptions.json
- C12: Verify CI workflow
- C13: Verify gate-report.ts
- C14: Update ROADMAP
- C15: Update WEAKNESSES

---

**Begin with C3 → C4 → C1 → C2. Push after each commit. Report status after each.**
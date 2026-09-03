#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# PRE-DEPLOYMENT STEP 1 — Preflight checks
#
# Verifies the subscription is ready before Terraform touches anything.
# Read-only except for provider registration.
#
#   ./scripts/01-preflight.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

LOCATION="${LOCATION:-australiaeast}"
FAILED=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=1; }

echo ""
echo "═══ PM Agent — Azure preflight ═══"
echo ""

# ── 1. Tooling ─────────────────────────────────────────────────────────────
echo "[1/6] Tooling"
command -v az        >/dev/null 2>&1 && pass "azure-cli $(az version --query '\"azure-cli\"' -o tsv 2>/dev/null)" || fail "azure-cli not installed"
command -v terraform >/dev/null 2>&1 && pass "terraform $(terraform version -json 2>/dev/null | grep -o '\"terraform_version\":\"[^\"]*\"' | cut -d'\"' -f4)" || fail "terraform not installed (need >= 1.6)"
command -v jq        >/dev/null 2>&1 && pass "jq" || warn "jq not installed — some helper output will be raw JSON"

# ── 2. Authentication ──────────────────────────────────────────────────────
echo ""
echo "[2/6] Authentication"
if ! az account show >/dev/null 2>&1; then
  fail "Not logged in. Run: az login --tenant <YOUR_TENANT_ID>"
  echo ""
  echo "Preflight aborted — cannot continue without authentication."
  exit 1
fi
SUB_ID=$(az account show --query id -o tsv)
SUB_NAME=$(az account show --query name -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
pass "Subscription: ${SUB_NAME}"
pass "Subscription ID: ${SUB_ID}"
pass "Tenant ID: ${TENANT_ID}"

# ── 3. Permissions ─────────────────────────────────────────────────────────
echo ""
echo "[3/6] Permissions"
UPN=$(az ad signed-in-user show --query userPrincipalName -o tsv 2>/dev/null || echo "")
if [ -n "$UPN" ]; then
  ROLES=$(az role assignment list --assignee "$UPN" --scope "/subscriptions/${SUB_ID}" --query "[].roleDefinitionName" -o tsv 2>/dev/null || echo "")
  if echo "$ROLES" | grep -qE 'Owner|Contributor'; then
    pass "Role on subscription: $(echo "$ROLES" | tr '\n' ' ')"
  else
    warn "No Owner/Contributor found at subscription scope. Roles: ${ROLES:-none}"
    warn "You may hold rights via a group or at resource-group scope — that is fine."
  fi
  # Creating the GitHub Actions service principal needs directory rights.
  if echo "$ROLES" | grep -q 'Owner'; then
    pass "Owner — can create role assignments for the CI service principal"
  else
    warn "Not Owner: you may not be able to run 'az ad sp create-for-rbac'."
    warn "If it fails, ask your Azure AD admin to create the SP (see GITHUB-ACTIONS-SETUP.md)."
  fi
else
  warn "Signed in as a service principal — skipping user role check"
fi

# ── 4. Resource providers ──────────────────────────────────────────────────
echo ""
echo "[4/6] Resource providers"
# Corporate subscriptions often block auto-registration, so register up front.
for NS in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.Storage \
          Microsoft.CognitiveServices Microsoft.Network; do
  STATE=$(az provider show -n "$NS" --query registrationState -o tsv 2>/dev/null || echo "NotFound")
  if [ "$STATE" = "Registered" ]; then
    pass "$NS"
  else
    warn "$NS is '${STATE}' — registering (can take several minutes)..."
    az provider register -n "$NS" --wait 2>/dev/null \
      && pass "$NS registered" \
      || fail "$NS registration FAILED — ask your subscription admin to register it"
  fi
done

# ── 5. Region capability ───────────────────────────────────────────────────
echo ""
echo "[5/6] Region capability: ${LOCATION}"
if az cognitiveservices account list-skus --kind FormRecognizer --location "$LOCATION" -o tsv >/dev/null 2>&1; then
  pass "Document Intelligence available in ${LOCATION}"
else
  fail "Document Intelligence NOT available in ${LOCATION} — pick another region"
fi

if az postgres flexible-server list-skus --location "$LOCATION" -o tsv >/dev/null 2>&1; then
  pass "PostgreSQL Flexible Server available in ${LOCATION}"
else
  fail "PostgreSQL Flexible Server NOT available in ${LOCATION}"
fi

# ── 6. Quota ───────────────────────────────────────────────────────────────
echo ""
echo "[6/6] Policy & quota notes"
POLICY_COUNT=$(az policy assignment list --disable-scope-strict-match --query "length(@)" -o tsv 2>/dev/null || echo "0")
if [ "$POLICY_COUNT" != "0" ]; then
  warn "${POLICY_COUNT} Azure Policy assignment(s) in scope."
  warn "Corporate policy commonly blocks: public IPs, non-approved regions,"
  warn "missing required tags, or storage without private endpoints."
  warn "If apply fails with 'RequestDisallowedByPolicy', check these first:"
  az policy assignment list --disable-scope-strict-match --query "[].displayName" -o tsv 2>/dev/null | head -10 | sed 's/^/      - /'
else
  pass "No policy assignments detected in scope"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo "  Preflight PASSED."
  echo ""
  echo "  Put this in terraform.tfvars:"
  echo "      subscription_id = \"${SUB_ID}\""
  echo ""
  echo "  Next: ./scripts/02-bootstrap-state.sh   (optional but recommended)"
else
  echo "  Preflight FAILED — resolve the ✗ items above before continuing."
  exit 1
fi
echo "═══════════════════════════════════════════════════════════"
echo ""

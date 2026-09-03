#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# POST-DEPLOYMENT STEP — Verify infrastructure and print GitHub secrets
#
# Run from the terraform directory AFTER a successful `terraform apply`.
#
#   ./scripts/03-post-deploy.sh
#
# SECURITY: this prints secret values to your terminal so you can paste them
# into GitHub. Do not run it on a shared screen, and clear your scrollback
# afterwards.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

if [ ! -f terraform.tfstate ] && [ ! -d .terraform ]; then
  echo "ERROR: run this from the infra/terraform directory after 'terraform apply'."
  exit 1
fi

tf() { terraform output -raw "$1" 2>/dev/null || echo ""; }

APP_NAME=$(tf app_service_name)
RG_NAME=$(tf resource_group_name)
APP_URL=$(tf app_url)
DI_SKU=$(tf document_intelligence_sku)

echo ""
echo "═══ Post-deployment verification ═══"
echo ""

# ── 1. Resource health ─────────────────────────────────────────────────────
echo "[1/5] Resource health"
STATE=$(az webapp show -g "$RG_NAME" -n "$APP_NAME" --query state -o tsv 2>/dev/null || echo "Unknown")
echo "  App Service state : ${STATE}"

VNET=$(az webapp show -g "$RG_NAME" -n "$APP_NAME" --query virtualNetworkSubnetId -o tsv 2>/dev/null || echo "")
if [ -n "$VNET" ]; then
  echo "  VNet integration  : ✓ connected"
else
  echo "  VNet integration  : ✗ MISSING — the app cannot reach the database"
fi

PG_PUBLIC=$(az postgres flexible-server show -g "$RG_NAME" -n "${APP_NAME%-app}-db" \
  --query network.publicNetworkAccess -o tsv 2>/dev/null || echo "unknown")
echo "  DB public access  : ${PG_PUBLIC} (expected: Disabled)"

# ── 2. SKU sanity ──────────────────────────────────────────────────────────
echo ""
echo "[2/5] Document Intelligence SKU"
if [ "$DI_SKU" = "F0" ]; then
  echo "  ✗ SKU is F0 — every request is capped at 2 PAGES."
  echo "    Real BRDs will silently fall back to local text extraction,"
  echo "    losing tables and layout. Set document_intelligence_sku = \"S0\"."
else
  echo "  ✓ SKU is ${DI_SKU}"
fi

# ── 3. Seed the uploads directory ──────────────────────────────────────────
echo ""
echo "[3/5] Persistent upload directory"
echo "  UPLOAD_DIR is /home/uploads. App Service creates /home automatically;"
echo "  the app creates the subdirectory on first write. No action needed."

# ── 4. Warm up and health check ────────────────────────────────────────────
echo ""
echo "[4/5] Application health"
echo "  Cold start runs 'prisma db push' then the migration script, so the"
echo "  FIRST request after a deploy can take 60-120 seconds. Be patient."
echo ""
echo "  Probing ${APP_URL} ..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 180 "$APP_URL" 2>/dev/null || echo "000")
case "$CODE" in
  200|302|307) echo "  ✓ Responded HTTP ${CODE}" ;;
  000)         echo "  ! No response within 180s. Check logs:"
               echo "      az webapp log tail -g ${RG_NAME} -n ${APP_NAME}" ;;
  *)           echo "  ! HTTP ${CODE}. Check logs:"
               echo "      az webapp log tail -g ${RG_NAME} -n ${APP_NAME}" ;;
esac

# ── 5. GitHub secrets ──────────────────────────────────────────────────────
echo ""
echo "[5/5] GitHub Actions configuration"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Repository VARIABLES (Settings → Secrets and variables →"
echo "  Actions → Variables tab):"
echo ""
echo "    AZURE_WEBAPP_NAME      = ${APP_NAME}"
echo "    AZURE_RESOURCE_GROUP   = ${RG_NAME}"
echo ""
echo "  Repository SECRETS (Secrets tab). Values below — paste each"
echo "  into GitHub, then clear your terminal scrollback:"
echo ""
echo "    NEXTAUTH_URL           = $(tf nextauth_url)"
echo "    DATABASE_URL           = $(tf database_url)"
echo "    NEXTAUTH_SECRET        = $(tf nextauth_secret)"
echo ""
echo "  Plus, copied from your own records (Terraform received them"
echo "  from you, it did not generate them):"
echo ""
echo "    ANTHROPIC_API_KEY      = <your key>"
echo "    OPENAI_API_KEY         = <your key, or empty>"
echo "    RESEND_API_KEY         = <your key, or empty>"
echo "    EMAIL_FROM             = <your sender address>"
echo ""
echo "  And the CI service principal — see GITHUB-ACTIONS-SETUP.md:"
echo ""
echo "    AZURE_CREDENTIALS      = <service principal JSON>"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Reminder: the app seeds a default user with a WEAK hardcoded"
echo "  password (Password123!). Change it immediately after first"
echo "  login, before exposing this environment to anyone."
echo ""

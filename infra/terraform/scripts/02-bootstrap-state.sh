#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# PRE-DEPLOYMENT STEP 2 — Remote Terraform state (recommended)
#
# Creates a locked, versioned, encrypted Azure Storage backend for state.
# Skip only for a throwaway sandbox: local state means no locking (two people
# applying at once corrupts it) and no recovery if the laptop dies.
#
#   ./scripts/02-bootstrap-state.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

STATE_RG="${STATE_RG:-rg-tfstate}"
LOCATION="${LOCATION:-australiaeast}"
CONTAINER="${CONTAINER:-tfstate}"
# Storage names are globally unique; derive a stable one from the subscription.
SUB_ID=$(az account show --query id -o tsv)
SUFFIX=$(echo "$SUB_ID" | tr -d '-' | cut -c1-8)
STATE_SA="${STATE_SA:-sttfstate${SUFFIX}}"

echo ""
echo "═══ Bootstrapping Terraform remote state ═══"
echo "  Resource group : ${STATE_RG}"
echo "  Storage account: ${STATE_SA}"
echo "  Container      : ${CONTAINER}"
echo "  Location       : ${LOCATION}"
echo ""

az group create --name "$STATE_RG" --location "$LOCATION" --output none
echo "  ✓ Resource group ready"

if az storage account show -n "$STATE_SA" -g "$STATE_RG" >/dev/null 2>&1; then
  echo "  ✓ Storage account already exists"
else
  az storage account create \
    --name "$STATE_SA" \
    --resource-group "$STATE_RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --https-only true \
    --output none
  echo "  ✓ Storage account created"
fi

# Blob versioning + soft delete: lets you recover a state file that was
# corrupted or deleted by mistake. This has saved many teams.
az storage account blob-service-properties update \
  --account-name "$STATE_SA" \
  --resource-group "$STATE_RG" \
  --enable-versioning true \
  --enable-delete-retention true \
  --delete-retention-days 30 \
  --output none
echo "  ✓ Versioning + 30-day soft delete enabled"

# Grant the caller data-plane rights so use_azuread_auth works without keys.
USER_OID=$(az ad signed-in-user show --query id -o tsv 2>/dev/null || echo "")
if [ -n "$USER_OID" ]; then
  az role assignment create \
    --assignee "$USER_OID" \
    --role "Storage Blob Data Contributor" \
    --scope "/subscriptions/${SUB_ID}/resourceGroups/${STATE_RG}/providers/Microsoft.Storage/storageAccounts/${STATE_SA}" \
    --output none 2>/dev/null && echo "  ✓ Granted Storage Blob Data Contributor" \
    || echo "  ! Role assignment skipped (may already exist)"
fi

az storage container create \
  --name "$CONTAINER" \
  --account-name "$STATE_SA" \
  --auth-mode login \
  --output none 2>/dev/null || true
echo "  ✓ Container ready"

cat <<EOF

═══════════════════════════════════════════════════════════════
  Backend ready. Now uncomment the backend block in providers.tf
  and paste these values:

  backend "azurerm" {
    resource_group_name  = "${STATE_RG}"
    storage_account_name = "${STATE_SA}"
    container_name       = "${CONTAINER}"
    key                  = "pm-agent/terraform.tfstate"
    use_azuread_auth     = true
  }

  Then run:
      terraform init -migrate-state

  ACCESS CONTROL: anyone who can read this container can read every
  secret in the state file. Restrict it to your platform team.
═══════════════════════════════════════════════════════════════

EOF

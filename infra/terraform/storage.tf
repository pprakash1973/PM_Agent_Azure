# ─────────────────────────────────────────────────────────────────────────────
# Blob storage — uploaded requirement documents plus cached Document
# Intelligence results (the "<original>.di.json" sibling blobs).
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_storage_account" "main" {
  name                = local.storage_account_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"

  https_traffic_only_enabled = true
  min_tls_version            = "TLS1_2"

  # No anonymous blob access. The app mints short-lived SAS URLs so Document
  # Intelligence can read a document without the container ever being public.
  allow_nested_items_to_be_public = false

  # Shared key access is REQUIRED: the app authenticates with a connection
  # string and generates user-delegation-free SAS tokens from the account key.
  # Disabling this breaks document ingestion.
  shared_access_key_enabled = true

  blob_properties {
    # Recovers blobs deleted by accident within the retention window.
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }

  tags = var.tags
}

resource "azurerm_storage_container" "docs" {
  name                  = var.blob_container_name
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

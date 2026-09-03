# ─────────────────────────────────────────────────────────────────────────────
# App Service Plan (Linux)
#
# B1 is the minimum SKU that supports both Always On and regional VNet
# integration, which this architecture requires.
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_service_plan" "main" {
  name                = "${var.name_prefix}-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = var.tags
}

# ─────────────────────────────────────────────────────────────────────────────
# Web App
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_linux_web_app" "main" {
  name                = local.app_service_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_service_plan.main.location
  service_plan_id     = azurerm_service_plan.main.id

  https_only = true

  # Regional VNet integration — this is what gives the app a route to the
  # private PostgreSQL server.
  virtual_network_subnet_id = azurerm_subnet.app.id

  # A system-assigned identity is created so you can later grant the app
  # RBAC access to Key Vault or Storage without embedding credentials.
  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on           = true
    ftps_state          = "Disabled"
    minimum_tls_version = "1.2"
    http2_enabled       = false

    application_stack {
      node_version = var.node_version
    }

    # Startup command. Runs on every cold start, in order:
    #   1. prisma db push        — reconciles the schema
    #   2. migrate-azure-all.js  — idempotent ALTER TABLE migrations
    #   3. next start            — boots the server
    # Migrations run HERE, not in CI, because the GitHub runner has no route
    # into the VNet and therefore cannot reach the database.
    app_command_line = "node node_modules/prisma/build/index.js db push && node scripts/migrate-azure-all.js && node node_modules/next/dist/bin/next start"
  }

  app_settings = {
    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL = local.database_url

    # ── NextAuth ──────────────────────────────────────────────────────────
    # AUTH_TRUST_HOST is required: App Service terminates TLS at its front end
    # and forwards as HTTP, so without this NextAuth builds redirect URLs
    # against the wrong scheme and sign-out bounces to localhost.
    NEXTAUTH_URL    = local.nextauth_url
    NEXTAUTH_SECRET = local.nextauth_secret
    AUTH_TRUST_HOST = "true"

    # ── AI providers ──────────────────────────────────────────────────────
    ANTHROPIC_API_KEY = var.anthropic_api_key
    OPENAI_API_KEY    = var.openai_api_key

    # ── Email ─────────────────────────────────────────────────────────────
    RESEND_API_KEY = var.resend_api_key
    EMAIL_FROM     = var.email_from

    # ── Document Intelligence ─────────────────────────────────────────────
    AZURE_DI_ENDPOINT = azurerm_cognitive_account.document_intelligence.endpoint
    AZURE_DI_KEY      = azurerm_cognitive_account.document_intelligence.primary_access_key

    # ── Blob storage ──────────────────────────────────────────────────────
    AZURE_STORAGE_CONNECTION_STRING = azurerm_storage_account.main.primary_connection_string
    AZURE_STORAGE_CONTAINER         = azurerm_storage_container.docs.name

    # ── Runtime ───────────────────────────────────────────────────────────
    NODE_ENV                     = "production"
    WEBSITE_NODE_DEFAULT_VERSION = "~22"
    # /home is the only persistent, VNet-independent writable mount.
    UPLOAD_DIR = "/home/uploads"
    # Serve from the deployed zip package — matches `az webapp deploy --type zip`.
    WEBSITE_RUN_FROM_PACKAGE = "1"
  }

  logs {
    detailed_error_messages = true
    failed_request_tracing  = true

    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }

    application_logs {
      file_system_level = "Information"
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [
      # The CI pipeline pushes new code on every merge. Without this, the next
      # `terraform apply` would fight the deployment pipeline over the running
      # package and could roll the app back to an older build.
      app_settings["WEBSITE_RUN_FROM_PACKAGE"],
    ]
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Locals — computed names and the derived database connection string
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Storage account names allow only lowercase alphanumerics, max 24 chars.
  storage_account_name = coalesce(
    var.storage_account_name_override,
    "${substr(replace(var.name_prefix, "-", ""), 0, 16)}${random_string.suffix.result}"
  )

  app_service_name = coalesce(
    var.app_service_name_override,
    "${var.name_prefix}-app"
  )

  di_custom_subdomain = coalesce(
    var.di_custom_subdomain_override,
    "${var.name_prefix}-di"
  )

  # Private DNS zone name is bound to the server name and cannot be arbitrary.
  postgres_server_name = "${var.name_prefix}-db"
  private_dns_zone     = "${local.postgres_server_name}.private.postgres.database.azure.com"

  postgres_password = coalesce(
    var.postgres_admin_password,
    random_password.postgres.result
  )

  nextauth_secret = coalesce(
    var.nextauth_secret,
    random_password.nextauth.result
  )

  # The app resolves the DB over the private DNS zone; there is no public endpoint.
  # urlencode() on the password is essential — passwords containing @ : / ?
  # would otherwise corrupt the connection URI.
  database_url = format(
    "postgresql://%s:%s@%s.postgres.database.azure.com:5432/%s?sslmode=require",
    var.postgres_admin_user,
    urlencode(local.postgres_password),
    local.postgres_server_name,
    var.postgres_database_name
  )

  public_hostname = var.custom_domain != "" ? var.custom_domain : "${local.app_service_name}.azurewebsites.net"
  nextauth_url    = "https://${local.public_hostname}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Generated values
# ─────────────────────────────────────────────────────────────────────────────

resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}

resource "random_password" "postgres" {
  length  = 32
  special = true
  # Azure PostgreSQL rejects several punctuation characters in admin passwords.
  override_special = "!#%*()-_=+[]"
}

resource "random_password" "nextauth" {
  length  = 48
  special = false # base62 keeps it safe inside App Service settings and shell exports
}

# ─────────────────────────────────────────────────────────────────────────────
# Resource group
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

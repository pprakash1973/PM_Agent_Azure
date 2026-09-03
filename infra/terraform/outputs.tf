# ─────────────────────────────────────────────────────────────────────────────
# Non-sensitive outputs
# ─────────────────────────────────────────────────────────────────────────────

output "app_url" {
  description = "Public URL of the deployed application."
  value       = "https://${azurerm_linux_web_app.main.default_hostname}"
}

output "app_service_name" {
  description = "Web app name — set this as AZURE_WEBAPP_NAME in the GitHub workflow."
  value       = azurerm_linux_web_app.main.name
}

output "resource_group_name" {
  description = "Resource group name — set this as AZURE_RESOURCE_GROUP in the GitHub workflow."
  value       = azurerm_resource_group.main.name
}

output "app_service_principal_id" {
  description = "System-assigned managed identity of the web app. Use for Key Vault / Storage RBAC grants."
  value       = azurerm_linux_web_app.main.identity[0].principal_id
}

output "postgres_fqdn" {
  description = "Private FQDN of the PostgreSQL server. Resolvable only from inside the VNet."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "storage_account_name" {
  description = "Generated storage account name."
  value       = azurerm_storage_account.main.name
}

output "document_intelligence_endpoint" {
  description = "Document Intelligence endpoint URL."
  value       = azurerm_cognitive_account.document_intelligence.endpoint
}

output "document_intelligence_sku" {
  description = "Active DI SKU. F0 caps requests at 2 pages — verify this says S0 for real workloads."
  value       = azurerm_cognitive_account.document_intelligence.sku_name
}

# ─────────────────────────────────────────────────────────────────────────────
# Sensitive outputs
#
# These do NOT print with a bare `terraform output`. Retrieve one explicitly:
#   terraform output -raw database_url
#
# They ARE stored in plaintext in terraform.tfstate — keep state in the
# private, encrypted Azure Storage backend and restrict access to it.
# ─────────────────────────────────────────────────────────────────────────────

output "database_url" {
  description = "Full DATABASE_URL. Set as a GitHub secret so the build step can run prisma generate."
  value       = local.database_url
  sensitive   = true
}

output "postgres_admin_password" {
  description = "PostgreSQL admin password (generated unless you supplied one)."
  value       = local.postgres_password
  sensitive   = true
}

output "nextauth_secret" {
  description = "NextAuth signing secret. Set as a GitHub secret."
  value       = local.nextauth_secret
  sensitive   = true
}

output "nextauth_url" {
  description = "NEXTAUTH_URL value. Set as a GitHub secret."
  value       = local.nextauth_url
}

output "storage_connection_string" {
  description = "Blob storage connection string."
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "document_intelligence_key" {
  description = "Document Intelligence primary access key."
  value       = azurerm_cognitive_account.document_intelligence.primary_access_key
  sensitive   = true
}

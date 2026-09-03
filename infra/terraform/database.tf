# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL Flexible Server — VNet-injected, no public endpoint
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server" "main" {
  name                = local.postgres_server_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  version                = var.postgres_version
  administrator_login    = var.postgres_admin_user
  administrator_password = local.postgres_password

  sku_name   = var.postgres_sku_name
  storage_mb = var.postgres_storage_mb
  zone       = var.postgres_zone

  backup_retention_days        = var.postgres_backup_retention_days
  geo_redundant_backup_enabled = var.postgres_geo_redundant_backup

  # Private networking. public_network_access_enabled is implicitly false once
  # delegated_subnet_id is set; setting both is rejected by the provider.
  delegated_subnet_id = azurerm_subnet.db.id
  private_dns_zone_id = azurerm_private_dns_zone.postgres.id

  tags = var.tags

  # The DNS zone link must exist before the server, or provisioning fails
  # with a misleading "private dns zone not found" error.
  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres
  ]

  lifecycle {
    ignore_changes = [
      # Azure reports back a normalised zone; ignore drift so routine applies
      # do not propose a destructive move.
      zone,
    ]
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Application database
#
# Name is case-sensitive and must match DATABASE_URL exactly. Prisma will
# create the tables on first boot via the App Service startup command.
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.postgres_database_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  # Dropping a database destroys all project data. Terraform will refuse to
  # remove this resource until the block below is deliberately relaxed.
  lifecycle {
    prevent_destroy = true
  }
}

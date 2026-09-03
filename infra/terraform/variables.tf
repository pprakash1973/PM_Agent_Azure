# ─────────────────────────────────────────────────────────────────────────────
# Core placement
# ─────────────────────────────────────────────────────────────────────────────

variable "subscription_id" {
  description = "Azure subscription ID to deploy into."
  type        = string
}

variable "location" {
  description = "Azure region. Document Intelligence must be available here."
  type        = string
  default     = "australiaeast"
}

variable "resource_group_name" {
  description = "Resource group to create and hold every resource."
  type        = string
  default     = "pm-agent-dev"
}

variable "name_prefix" {
  description = <<-EOT
    Prefix for all resource names. Change this per environment (pm-agent-dev,
    pm-agent-uat, pm-agent-prod). Keep it short: the storage account name is
    derived from it and Azure caps storage names at 24 lowercase alphanumerics.
  EOT
  type        = string
  default     = "pm-agent"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be lowercase alphanumeric plus hyphens, 3-21 chars, starting with a letter."
  }
}

variable "tags" {
  description = "Tags applied to every resource. Corporate policy usually mandates some of these."
  type        = map(string)
  default = {
    application = "pm-agent"
    managed_by  = "terraform"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Networking
# ─────────────────────────────────────────────────────────────────────────────

variable "vnet_address_space" {
  description = "VNet CIDR. Must not overlap any peered corporate network."
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "app_subnet_prefix" {
  description = "Subnet for App Service VNet integration. Delegated to Microsoft.Web/serverFarms."
  type        = list(string)
  default     = ["10.0.1.0/24"]
}

variable "db_subnet_prefix" {
  description = "Subnet for the PostgreSQL flexible server. Delegated and cannot be shared."
  type        = list(string)
  default     = ["10.0.2.0/24"]
}

# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────

variable "postgres_admin_user" {
  description = "PostgreSQL administrator login. Cannot be 'azure_superuser', 'admin', 'administrator', 'root', 'guest' or 'public'."
  type        = string
  default     = "pgadmin"
}

variable "postgres_admin_password" {
  description = <<-EOT
    PostgreSQL administrator password. NEVER commit this.
    Supply via environment variable:  export TF_VAR_postgres_admin_password='...'
    Leave null to have Terraform generate a strong random password (recommended);
    retrieve it afterwards with:  terraform output -raw postgres_admin_password
  EOT
  type        = string
  sensitive   = true
  default     = null
}

variable "postgres_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "16"
}

variable "postgres_sku_name" {
  description = <<-EOT
    Compute SKU. Dev baseline is B_Standard_B1ms (burstable).
    Production guidance: GP_Standard_D2ds_v5 or larger.
  EOT
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "Storage in MB. 32768 = 32 GB. Azure allows growth but never shrink."
  type        = number
  default     = 32768
}

variable "postgres_backup_retention_days" {
  description = "Point-in-time restore window, 7-35 days."
  type        = number
  default     = 7
}

variable "postgres_geo_redundant_backup" {
  description = "Geo-redundant backup. Recommended true for production."
  type        = bool
  default     = false
}

variable "postgres_zone" {
  description = "Availability zone for the DB. Set to null if the region has no zones."
  type        = string
  default     = "2"
}

variable "postgres_database_name" {
  description = "Application database name. The app's DATABASE_URL must match this exactly (case-sensitive)."
  type        = string
  default     = "pmAgent"
}

# ─────────────────────────────────────────────────────────────────────────────
# App Service
# ─────────────────────────────────────────────────────────────────────────────

variable "app_service_sku" {
  description = <<-EOT
    App Service Plan SKU. B1 is the dev baseline.
    B1 is the MINIMUM that supports VNet integration and Always On.
    Production guidance: P1v3 or larger.
  EOT
  type        = string
  default     = "B1"
}

variable "node_version" {
  description = "Linux Node runtime stack for the web app."
  type        = string
  default     = "22-lts"
}

variable "app_service_name_override" {
  description = <<-EOT
    Web app name. Must be GLOBALLY unique — it becomes <name>.azurewebsites.net.
    Leave null to use "<name_prefix>-app". Set explicitly if that name is taken.
  EOT
  type        = string
  default     = null
}

# ─────────────────────────────────────────────────────────────────────────────
# Storage
# ─────────────────────────────────────────────────────────────────────────────

variable "storage_account_name_override" {
  description = <<-EOT
    Storage account name. Must be GLOBALLY unique, 3-24 lowercase alphanumerics,
    no hyphens. Leave null to auto-generate "<prefix><random>" from name_prefix.
  EOT
  type        = string
  default     = null
}

variable "blob_container_name" {
  description = "Container holding uploaded requirement documents and DI result caches."
  type        = string
  default     = "pm-agent-docs"
}

# ─────────────────────────────────────────────────────────────────────────────
# Document Intelligence
# ─────────────────────────────────────────────────────────────────────────────

variable "document_intelligence_sku" {
  description = <<-EOT
    Document Intelligence SKU.
    F0 = free tier: ONE per subscription per region, 2 pages per request, 500 pages/month.
         The 2-page cap makes F0 UNUSABLE for real BRDs — it exists only for smoke tests.
    S0 = standard, pay per page. USE S0 for any real environment.
  EOT
  type        = string
  default     = "S0"

  validation {
    condition     = contains(["F0", "S0"], var.document_intelligence_sku)
    error_message = "document_intelligence_sku must be F0 or S0."
  }
}

variable "di_custom_subdomain_override" {
  description = <<-EOT
    Custom subdomain for the Document Intelligence endpoint. Must be GLOBALLY
    unique. Leave null to use "<name_prefix>-di". Required — the SDK will not
    authenticate against a regional endpoint.
  EOT
  type        = string
  default     = null
}

# ─────────────────────────────────────────────────────────────────────────────
# Application secrets — passed straight into App Service settings
# Supply every one of these via TF_VAR_* environment variables or a gitignored
# secrets.auto.tfvars. Never commit them.
# ─────────────────────────────────────────────────────────────────────────────

variable "nextauth_secret" {
  description = <<-EOT
    NextAuth session-signing secret, minimum 32 chars.
    Leave null to have Terraform generate one (recommended).
    Rotating this invalidates every active session.
  EOT
  type        = string
  sensitive   = true
  default     = null
}

variable "anthropic_api_key" {
  description = "Anthropic API key (sk-ant-...). Required — the app cannot generate artifacts without it."
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key. Optional; used only by the multi-provider model router."
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_api_key" {
  description = "Resend API key for transactional email. Optional; email features are inert without it."
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_from" {
  description = "From-address for outbound email. Must be a verified Resend domain."
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = <<-EOT
    Public hostname if you front the app with a custom domain, e.g.
    "pm-agent.contoso.com". Drives NEXTAUTH_URL. Leave empty to use the
    default *.azurewebsites.net hostname.

    NOTE: this variable only sets NEXTAUTH_URL. Binding the hostname and its
    TLS certificate is a separate post-deployment step — see README step 9.
  EOT
  type        = string
  default     = ""
}

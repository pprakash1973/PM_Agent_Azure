terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # ── Remote state ────────────────────────────────────────────────────────────
  # Strongly recommended for a corporate environment so state is shared, locked
  # and versioned rather than living on one engineer's laptop.
  #
  # Run scripts/02-bootstrap-state.sh FIRST to create the storage account, then
  # uncomment this block and run `terraform init -migrate-state`.
  #
  # backend "azurerm" {
  #   resource_group_name  = "rg-tfstate"
  #   storage_account_name = "sttfstateCHANGEME"
  #   container_name       = "tfstate"
  #   key                  = "pm-agent/terraform.tfstate"
  #   use_azuread_auth     = true
  # }
}

provider "azurerm" {
  features {
    resource_group {
      # Guard rail: refuse to delete a resource group that still holds resources
      # Terraform does not know about.
      prevent_deletion_if_contains_resources = true
    }
  }

  # Corporate subscriptions frequently disable automatic provider registration.
  # Leave this false and pre-register providers via scripts/01-preflight.sh.
  resource_provider_registrations = "none"

  subscription_id = var.subscription_id
}

provider "random" {}

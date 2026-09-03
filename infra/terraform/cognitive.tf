# ─────────────────────────────────────────────────────────────────────────────
# Azure Document Intelligence (Form Recognizer)
#
# Used by the prebuilt-layout model to extract text, paragraph roles and tables
# from uploaded PDFs and DOCX files.
#
# SKU WARNING: F0 (free) caps every request at 2 PAGES. A real BRD will silently
# fall back to local text extraction. Use S0 for anything beyond a smoke test.
# ─────────────────────────────────────────────────────────────────────────────

resource "azurerm_cognitive_account" "document_intelligence" {
  name                = "${var.name_prefix}-di"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  kind     = "FormRecognizer"
  sku_name = var.document_intelligence_sku

  # A custom subdomain is mandatory. The @azure/ai-form-recognizer SDK builds
  # its endpoint as https://<subdomain>.cognitiveservices.azure.com and will
  # fail to authenticate against a shared regional endpoint.
  custom_subdomain_name = local.di_custom_subdomain

  # The app calls DI from App Service over the public endpoint and hands it a
  # SAS URL to read the blob. Locking this down to a private endpoint requires
  # also adding a private endpoint for storage — see README "Hardening".
  public_network_access_enabled = true

  tags = var.tags
}

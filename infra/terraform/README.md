# PM Agent — Azure Infrastructure (Terraform)

Provisions the complete Azure environment for the PM Agent application, matching
the reference deployment exactly.

**Realistic lead time:** 45–60 minutes end to end. Terraform itself takes about
12 minutes; the rest is gathering credentials and waiting on the first cold start.

---

## What gets created

| Resource | Type | Default SKU | Purpose |
|---|---|---|---|
| `<prefix>-vnet` | Virtual Network | 10.0.0.0/16 | Private network |
| ↳ `app-subnet` | Subnet | 10.0.1.0/24 | App Service integration (delegated) |
| ↳ `db-subnet` | Subnet | 10.0.2.0/24 | PostgreSQL injection (delegated) |
| `<prefix>-db...` | Private DNS Zone | — | Resolves the private DB hostname |
| `<prefix>-db` | PostgreSQL Flexible Server | B_Standard_B1ms, PG16 | Application database |
| `<prefix>-plan` | App Service Plan | B1 Linux | Compute |
| `<prefix>-app` | Linux Web App | Node 22 LTS | The application |
| `<prefix><rand>` | Storage Account | Standard_LRS | Documents + DI result cache |
| `<prefix>-di` | Document Intelligence | **S0** | PDF/DOCX layout extraction |

### Architecture

```
Internet ──HTTPS──> App Service (<prefix>-app)
                         │
                         ├── VNet integration ──> app-subnet (10.0.1.0/24)
                         │                             │
                         │                        [private DNS]
                         │                             │
                         │                             v
                         │                   PostgreSQL (db-subnet)
                         │                   NO public endpoint
                         │
                         ├──> Blob Storage ──> container: pm-agent-docs
                         │      (documents + <original>.di.json caches)
                         │
                         └──> Document Intelligence
                                reads blobs via short-lived SAS URLs
```

Two things about this design are load-bearing and easy to break:

1. **The database has no public endpoint.** It is reachable only from inside the
   VNet. This is why migrations run from the App Service startup command and
   *not* from CI — a GitHub runner has no route to it.
2. **Document Intelligence needs a custom subdomain.** The Azure SDK builds its
   endpoint from the subdomain and will not authenticate against a shared
   regional endpoint.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Terraform ≥ 1.6 | `terraform version` |
| Azure CLI ≥ 2.55 | `az version` |
| Azure subscription | **Contributor** minimum; **Owner** needed to create the CI service principal |
| Anthropic API key | Mandatory — artifact generation fails without it |
| OpenAI API key | Optional — only for multi-provider routing |
| Resend API key | Optional — email features are inert without it |

---

## Deployment

### Step 1 — Unpack and authenticate

```bash
unzip pm-agent-terraform.zip && cd pm-agent-terraform
chmod +x scripts/*.sh
az login --tenant <YOUR_CORPORATE_TENANT_ID>
az account set --subscription "<YOUR_SUBSCRIPTION_NAME_OR_ID>"
```

### Step 2 — Preflight

Checks tooling, permissions, region capability, and registers resource
providers. Corporate subscriptions frequently disable auto-registration, so
this step prevents a confusing failure later.

```bash
./scripts/01-preflight.sh
```

Resolve every `✗` before continuing. It prints your `subscription_id` at the end
— copy it.

### Step 3 — Remote state (recommended)

Skip only for a throwaway sandbox. Local state means no locking (two engineers
applying simultaneously corrupts it) and no recovery if the machine is lost.

```bash
./scripts/02-bootstrap-state.sh
```

Then uncomment the `backend "azurerm"` block in `providers.tf`, paste in the
values the script printed, and run `terraform init -migrate-state`.

> **Access control:** anyone who can read the state container can read every
> secret in it. Restrict it to your platform team.

### Step 4 — Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`. These need your attention:

| Setting | Action |
|---|---|
| `subscription_id` | **Required.** From step 2. |
| `location` | Must support Document Intelligence *and* PostgreSQL Flexible Server. |
| `name_prefix` | Change per environment: `pm-agent-dev`, `-uat`, `-prod`. |
| `vnet_address_space` | **Confirm with your network team.** Must not overlap any peered corporate range. |
| `tags` | Replace `CHANGEME` in `cost_center` and `owner` — corporate policy often rejects untagged resources. |
| `document_intelligence_sku` | Leave `S0`. See the SKU warning below. |
| `email_from` | Your verified Resend sender domain. |

**Globally unique names.** The web app, storage account and DI subdomain share a
global namespace with every other Azure customer. Defaults derive from
`name_prefix`. If apply fails with "name is already taken", set the matching
`*_override` variable.

> ### Do not use the F0 Document Intelligence tier
> F0 is free but caps **every request at 2 pages**. A 50-page BRD does not
> error — it silently falls back to local text extraction, losing tables and
> layout structure. F0 is also limited to one instance per subscription per
> region. Use `S0` for anything beyond a smoke test.

### Step 5 — Supply secrets

Never put these in `terraform.tfvars`.

```bash
export TF_VAR_anthropic_api_key='sk-ant-...'
export TF_VAR_openai_api_key='sk-...'      # optional
export TF_VAR_resend_api_key='re_...'      # optional
```

PowerShell:

```powershell
$env:TF_VAR_anthropic_api_key = 'sk-ant-...'
```

Leave `postgres_admin_password` and `nextauth_secret` unset — Terraform
generates strong values for both and you retrieve them after apply.

### Step 6 — Plan

```bash
terraform init
terraform plan -out=tfplan
```

Expect **16 resources to add**. Review before applying.

> The plan file embeds secret values. It is gitignored; delete it after apply.

### Step 7 — Apply

```bash
terraform apply tfplan
```

**Takes roughly 12 minutes.** PostgreSQL alone accounts for 6–8 of them. This is
normal — do not interrupt it.

### Step 8 — Post-deployment verification

```bash
./scripts/03-post-deploy.sh
```

Verifies VNet integration, confirms the database has no public endpoint, checks
the DI SKU, warms the app, and prints every value you need for GitHub Actions.

> The first request after deployment takes **60–120 seconds**. Cold start runs
> `prisma db push` and the migration script before the server boots. A timeout
> on the very first request is expected, not a failure.

### Step 9 — Custom domain (optional)

Setting `custom_domain` only populates `NEXTAUTH_URL`. Binding the hostname is
separate:

```bash
az webapp config hostname add \
  --webapp-name <app-name> --resource-group <rg> \
  --hostname pm-agent.contoso.com

az webapp config ssl create \
  --resource-group <rg> --name <app-name> \
  --hostname pm-agent.contoso.com
```

Add a CNAME from your hostname to `<app-name>.azurewebsites.net` first, plus the
`asuid.` TXT record Azure asks for.

### Step 10 — Deploy the application

Infrastructure is now ready but **no application code is deployed**. Follow
[`GITHUB-ACTIONS-SETUP.md`](./GITHUB-ACTIONS-SETUP.md).

---

## Post-deployment security tasks

These are **not optional** before real users touch the environment.

### 1. Change the seeded password immediately

The application seed creates a default user with the hardcoded password
`Password123!`. Log in and change it before granting anyone else access. Do not
expose the environment publicly until this is done.

### 2. Confirm secrets never reached git

```bash
git status                      # terraform.tfvars must NOT appear
grep -rn "sk-ant-" . --exclude-dir=.git
```

### 3. Restrict access to Terraform state

State holds the DB password, all API keys, and the storage connection string in
plaintext. Limit the state container to your platform team.

---

## Where secrets live, and how to rotate them

| Secret | Source | Ends up in |
|---|---|---|
| `postgres_admin_password` | Terraform-generated | State, `DATABASE_URL` app setting |
| `nextauth_secret` | Terraform-generated | State, app setting |
| `ANTHROPIC_API_KEY` | You, via `TF_VAR_` | State, app setting |
| `AZURE_DI_KEY` | Azure-generated | Read from the resource, app setting |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure-generated | Read from the resource, app setting |

Retrieve any generated value:

```bash
terraform output -raw postgres_admin_password
terraform output -raw nextauth_secret
terraform output -raw database_url
```

### Rotating

```bash
# Anthropic / OpenAI / Resend key
export TF_VAR_anthropic_api_key='sk-ant-NEW'
terraform apply

# NextAuth secret — invalidates every active session, all users re-login
terraform taint random_password.nextauth && terraform apply

# Document Intelligence key
az cognitiveservices account keys regenerate \
  -g <rg> -n <prefix>-di --key-name Key1
terraform apply    # picks up the new key and updates the app setting
```

Update the corresponding GitHub secret after any rotation.

---

## Hardening for production

The defaults mirror the reference dev environment. For production:

| Change | From | To |
|---|---|---|
| App Service SKU | `B1` | `P1v3` — needed for autoscale and slots |
| PostgreSQL SKU | `B_Standard_B1ms` | `GP_Standard_D2ds_v5` |
| Backup retention | `7` | `35` days |
| Geo-redundant backup | `false` | `true` |
| High availability | Disabled | `ZoneRedundant` |

Beyond SKUs, worth doing:

- **Key Vault.** Move secrets out of app settings into Key Vault references
  (`@Microsoft.KeyVault(...)`). The web app already has a system-assigned managed
  identity — output as `app_service_principal_id` — so you only need to grant it
  `Key Vault Secrets User`.
- **Private endpoints** for Storage and Document Intelligence, removing their
  public endpoints entirely.
- **Deployment slots** for zero-downtime releases.
- **Azure Monitor** alerts on 5xx rate, response time, and DB CPU.

---

## Troubleshooting

**`RequestDisallowedByPolicy`**
Corporate Azure Policy blocked something. The error names the policy. Common
causes: missing required tags, a non-approved region, or a rule mandating
private endpoints on storage. Add the tags to `var.tags`, or request an
exemption.

**`StorageAccountAlreadyTaken` / `WebAppNameNotAvailable`**
Global namespace collision. Set `storage_account_name_override`,
`app_service_name_override`, or `di_custom_subdomain_override`.

**`SubnetIsNotDelegatedToPostgreSQL` or private DNS errors**
The DNS zone link must exist before the server. `database.tf` already declares
this via `depends_on`. If you hit it, re-run `terraform apply` — it resolves on
the second pass.

**App returns 500 on first load**
Almost always the startup migration still running. Watch it live:

```bash
az webapp log tail -g <rg> -n <app-name>
```

**App cannot connect to the database**
Check VNet integration is attached, and that `DATABASE_URL` uses the
`.postgres.database.azure.com` hostname (resolved privately), not an IP:

```bash
az webapp show -g <rg> -n <app> --query virtualNetworkSubnetId -o tsv
```

**Documents upload but produce no `.di.json`**
Either the DI SKU is F0 (2-page cap) or the document exceeded the 180-second
analysis timeout the application enforces. Check the SKU first — it is the
usual cause.

---

## Tearing down

```bash
terraform destroy
```

`azurerm_postgresql_flexible_server_database.app` carries `prevent_destroy` so
this **will fail by design** — a guard against wiping project data. To genuinely
delete the environment, remove that `lifecycle` block in `database.tf` first.

Take a backup before you do:

```bash
az postgres flexible-server backup list -g <rg> -n <prefix>-db
```

---

## File map

```
├── providers.tf              Terraform + azurerm setup, remote state block
├── variables.tf              Every input, documented
├── main.tf                   Locals, generated passwords, resource group
├── network.tf                VNet, delegated subnets, private DNS
├── database.tf               PostgreSQL flexible server + database
├── storage.tf                Storage account + blob container
├── cognitive.tf              Document Intelligence
├── appservice.tf             Plan, web app, all app settings
├── outputs.tf                Outputs (sensitive ones marked)
├── terraform.tfvars.example  Copy to terraform.tfvars and edit
├── .gitignore                Keeps state and secrets out of git
├── scripts/
│   ├── 01-preflight.sh       Pre-deploy validation
│   ├── 02-bootstrap-state.sh Remote state backend
│   └── 03-post-deploy.sh     Verification + GitHub secret values
├── README.md                 This file
└── GITHUB-ACTIONS-SETUP.md   CI/CD pipeline setup
```

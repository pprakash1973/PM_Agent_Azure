# GitHub Actions — CI/CD Setup

Step-by-step setup of the build-and-deploy pipeline from a corporate GitHub
repository to the Azure environment created by the Terraform in this package.

**Prerequisite:** `terraform apply` has completed and
`./scripts/03-post-deploy.sh` has printed your values.

**Time:** ~20 minutes.

---

## How the pipeline works

```
push to main
     │
     ├── npm ci                    install all deps (dev needed to build)
     ├── npm run build             prisma generate + next build
     │                             SKIP_MIGRATIONS=1  ← see below
     ├── npm ci --omit=dev         drop dev deps before packaging
     ├── zip deploy.zip            .next, node_modules, prisma, scripts, public
     ├── azure/login               service principal auth
     └── az webapp deploy          push the zip
                │
                v
     App Service cold start runs:
       prisma db push  →  migrate-azure-all.js  →  next start
```

### Why migrations do not run in CI

The PostgreSQL server has **no public endpoint**. A GitHub-hosted runner has no
route into the VNet and cannot reach it. That is why the build sets
`SKIP_MIGRATIONS=1` and migrations instead run from the App Service startup
command, which does have VNet access.

If you later move to self-hosted runners inside the VNet, you could invert this.
Until then, do not "fix" the build by removing `SKIP_MIGRATIONS` — it will hang
and fail.

---

## Step 1 — Get the code into your corporate repo

If the corporate repo is new and empty:

```bash
git clone https://github.com/pprakash1973/PM_Agent_Azure.git pm-agent
cd pm-agent
git remote rename origin upstream
git remote add origin https://github.com/<YOUR-ORG>/<YOUR-REPO>.git
git push -u origin main
git push origin --tags
```

Keeping `upstream` lets you pull future fixes:

```bash
git fetch upstream && git merge upstream/main
```

If your organisation forbids external remotes, mirror it instead:

```bash
git clone --mirror https://github.com/pprakash1973/PM_Agent_Azure.git
cd PM_Agent_Azure.git
git push --mirror https://github.com/<YOUR-ORG>/<YOUR-REPO>.git
```

---

## Step 2 — Create the deployment service principal

The pipeline authenticates to Azure as a service principal. Creating one needs
**Owner** on the subscription, or an Azure AD administrator to do it for you.

Scope it to the resource group, never the whole subscription:

```bash
SUB_ID=$(az account show --query id -o tsv)
RG_NAME="pm-agent-dev"     # must match resource_group_name in terraform.tfvars

az ad sp create-for-rbac \
  --name "sp-pm-agent-github-deploy" \
  --role contributor \
  --scopes "/subscriptions/${SUB_ID}/resourceGroups/${RG_NAME}" \
  --json-auth
```

Output looks like this:

```json
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "...",
  "tenantId": "...",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  ...
}
```

**Copy the entire JSON object, including braces.** It becomes the
`AZURE_CREDENTIALS` secret. It is shown exactly once — if you lose it, reset the
credential rather than creating a duplicate SP:

```bash
az ad sp credential reset --id <clientId> --json-auth
```

> **Prefer OIDC if your organisation allows it.** It removes the stored secret
> entirely. See [Appendix A](#appendix-a--oidc-federated-credentials).

---

## Step 3 — Add repository variables

**Settings → Secrets and variables → Actions → Variables tab → New variable**

| Name | Value |
|---|---|
| `AZURE_WEBAPP_NAME` | `terraform output -raw app_service_name` |
| `AZURE_RESOURCE_GROUP` | `terraform output -raw resource_group_name` |

These are not secrets — they are non-sensitive names, and keeping them as
variables makes the workflow readable in logs.

---

## Step 4 — Add repository secrets

**Settings → Secrets and variables → Actions → Secrets tab → New repository secret**

Add all eight:

| Secret | Where to get it |
|---|---|
| `AZURE_CREDENTIALS` | Full JSON from step 2 |
| `DATABASE_URL` | `terraform output -raw database_url` |
| `NEXTAUTH_SECRET` | `terraform output -raw nextauth_secret` |
| `NEXTAUTH_URL` | `terraform output -raw nextauth_url` |
| `ANTHROPIC_API_KEY` | Your Anthropic console |
| `OPENAI_API_KEY` | Your OpenAI console (empty string if unused) |
| `RESEND_API_KEY` | Your Resend dashboard (empty string if unused) |
| `EMAIL_FROM` | Verified Resend sender, e.g. `noreply@contoso.com` |

Faster, with the GitHub CLI:

```bash
cd infra/terraform

gh secret set DATABASE_URL    --body "$(terraform output -raw database_url)"
gh secret set NEXTAUTH_SECRET --body "$(terraform output -raw nextauth_secret)"
gh secret set NEXTAUTH_URL    --body "$(terraform output -raw nextauth_url)"
gh secret set AZURE_CREDENTIALS < azure-credentials.json

gh variable set AZURE_WEBAPP_NAME    --body "$(terraform output -raw app_service_name)"
gh variable set AZURE_RESOURCE_GROUP --body "$(terraform output -raw resource_group_name)"

rm azure-credentials.json      # do not leave this on disk
```

> **Why the build needs these at all:** `next build` runs `prisma generate`,
> which reads `DATABASE_URL`. It only needs the string to be well-formed — it
> never connects during build.

---

## Step 5 — Point the workflow at your resources

The workflow at `.github/workflows/azure-deploy.yml` currently hardcodes the
reference environment's names. Change them to read from your variables:

```yaml
env:
  NODE_VERSION: "22.x"
  AZURE_WEBAPP_NAME: ${{ vars.AZURE_WEBAPP_NAME }}
  AZURE_RESOURCE_GROUP: ${{ vars.AZURE_RESOURCE_GROUP }}
```

Replacing:

```yaml
  AZURE_WEBAPP_NAME: pm-agent-ust
  AZURE_RESOURCE_GROUP: pm-agent-dev
```

Commit and push:

```bash
git add .github/workflows/azure-deploy.yml
git commit -m "ci: read Azure target from repository variables"
git push origin main
```

That push triggers the first deployment.

---

## Step 6 — Watch the first run

**Actions tab → "Build & Deploy to Azure App Service"**

Expected duration: **4–6 minutes**.

Then watch the app start — this is where migrations actually run:

```bash
az webapp log tail -g <resource-group> -n <app-name>
```

Look for `prisma db push` output, then the migration script, then Next.js
listening. **First boot takes 60–120 seconds.**

---

## Step 7 — Verify

```bash
curl -I https://<app-name>.azurewebsites.net
```

`200`, `302` or `307` means success. Then sign in through the browser.

> **Immediately change the seeded password.** The seed creates a default user
> with the hardcoded password `Password123!`. Change it before anyone else gets
> access to the environment.

---

## Branch protection (recommended)

Since a push to `main` deploys straight to the environment:

**Settings → Branches → Add branch protection rule**, pattern `main`:

- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks to pass
- ✅ Do not allow bypassing the above

For production, add a **deployment environment** with required reviewers:

**Settings → Environments → New environment** → `production` → add reviewers.
Then in the workflow job:

```yaml
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: production      # pauses for manual approval
```

---

## Troubleshooting

**`Error: No credentials found` / login fails**
`AZURE_CREDENTIALS` must be the complete JSON object including outer braces —
not just the `clientSecret`. Re-run step 2 with `--json-auth` and paste all of it.

**`AuthorizationFailed` on `az webapp deploy`**
The SP lacks Contributor on the resource group, or the scope in step 2 pointed
at a different RG. Verify:

```bash
az role assignment list --assignee <clientId> -o table
```

**Build fails: `Environment variable not found: DATABASE_URL`**
The `DATABASE_URL` secret is missing or empty. `prisma generate` needs it
present during build even though it never connects.

**Build hangs then times out**
Something removed `SKIP_MIGRATIONS: "1"` from the build step. The runner cannot
reach the private database. Restore it.

**Deploy succeeds, app returns 503**
Startup migration still running. Give it two minutes, then check
`az webapp log tail`. If it persists, the startup command may be wrong:

```bash
az webapp config show -g <rg> -n <app> --query appCommandLine -o tsv
```

Expected:
```
node node_modules/prisma/build/index.js db push && node scripts/migrate-azure-all.js && node node_modules/next/dist/bin/next start
```

**App loads but sign-in redirects to localhost**
`NEXTAUTH_URL` is wrong, or `AUTH_TRUST_HOST` is missing. Terraform sets both;
confirm they survived:

```bash
az webapp config appsettings list -g <rg> -n <app> \
  --query "[?name=='NEXTAUTH_URL'||name=='AUTH_TRUST_HOST']" -o table
```

**Secret rotated in Azure but the app still uses the old value**
App settings are read at startup. Restart:

```bash
az webapp restart -g <rg> -n <app>
```

---

## Appendix A — OIDC federated credentials

Removes the stored client secret. Preferred where your organisation permits it.

**1. Create the app registration and federated credential:**

```bash
SUB_ID=$(az account show --query id -o tsv)
RG_NAME="pm-agent-dev"
GH_ORG="<YOUR-ORG>"
GH_REPO="<YOUR-REPO>"

APP_ID=$(az ad app create --display-name "sp-pm-agent-github-oidc" --query appId -o tsv)
az ad sp create --id "$APP_ID"

az role assignment create \
  --assignee "$APP_ID" --role contributor \
  --scope "/subscriptions/${SUB_ID}/resourceGroups/${RG_NAME}"

az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GH_ORG}/${GH_REPO}:ref:refs/heads/main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

echo "AZURE_CLIENT_ID       = ${APP_ID}"
echo "AZURE_TENANT_ID       = $(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID = ${SUB_ID}"
```

**2. Add those three as repository secrets** (replacing `AZURE_CREDENTIALS`).

**3. Update the workflow:**

```yaml
permissions:
  id-token: write        # required for OIDC
  contents: read

# ...

      - name: Azure Login
        uses: azure/login@v2
        with:
          client-id:       ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id:       ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

The `subject` is matched exactly. A credential for `refs/heads/main` will not
authorise a pull-request or tag trigger — add a separate federated credential
for each trigger you need.

---

## Appendix B — Multi-environment promotion

Run Terraform once per environment with a distinct `name_prefix` and state key:

```bash
terraform workspace new uat
terraform apply -var name_prefix=pm-agent-uat -var-file=uat.tfvars
```

Then use GitHub Environments (`dev`, `uat`, `production`), each holding its own
`AZURE_WEBAPP_NAME`, `DATABASE_URL` and `NEXTAUTH_URL`, with required reviewers
on production. Reference one per job with `environment: <name>`.

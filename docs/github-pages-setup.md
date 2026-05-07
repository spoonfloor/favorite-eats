# GitHub Pages + automatic deploy: simple guide

This guide gets you from “the web build exists in the project” to “GitHub automatically publishes the public web site when you push,” and explains what you do day to day when you change the app.

## Words you’ll see

- **Repository (repo):** Your project on GitHub (where your code lives).
- **Main branch:** The usual “official” copy of your code (often named `main`).
- **Workflow / Action:** A small automated recipe GitHub runs for you (build, then publish).
- **`dist/web`:** The folder this project builds for the public web site (the locked web-only version).

---

## Part 1 — One-time setup (from today → the Action is live)

Do these steps once per repository.

### Step 1 — Confirm you can build the web site on your computer (optional but helpful)

1. Open your project on your computer.
2. In a terminal, from the project folder, run:

   ```bash
   npm run build
   ```

3. If it finishes without errors, you should see a `dist/web` folder.

If this fails, fix that first (or ask a developer). GitHub will run the same command.

**Why:** If the build works locally, it is much more likely to work on GitHub.

### Step 2 — Add the GitHub Actions workflow file to your project

1. In your project, create these folders if they do not exist: `.github`, then inside it `workflows`.
2. Create a file: `.github/workflows/pages.yml`
3. Paste a workflow that:

   - Checks out your code
   - Installs Node
   - Runs `npm ci` (or `npm install` if you do not use a lockfile the same way)
   - Runs `npm run build`
   - Uploads the `dist/web` folder as the site
   - Deploys to GitHub Pages

**Why:** This file is the instruction sheet GitHub follows: “when I push to `main`, build the web folder and publish it.”

### Step 3 — Save, commit, and push to GitHub

1. Commit the new workflow file (and anything else you are ready to ship) with a clear message, for example: “Add GitHub Pages deploy workflow.”
2. Push to GitHub on the branch the workflow watches (usually `main`).

**Why:** Until this is on GitHub, the automation does not run in the cloud.

### Step 4 — Turn on GitHub Pages the right way (in the browser)

1. On GitHub, open your **repository**.
2. Go to **Settings** (top of the repo).
3. In the left sidebar, click **Pages** (under “Code and automation”).
4. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from a branch”).
5. Save if there is a save button.

**Why:** You want Pages to use the **workflow** output, not an older “publish a folder by hand” mode.

### Step 5 — Watch the first run succeed

1. Open the **Actions** tab on GitHub.
2. You should see a run for your deploy workflow.
3. Click it and wait until it shows a **green check** (success).
4. If it is red, open the failed job and read the error. Common issues: wrong branch name, `npm ci` without a matching lockfile, or the wrong output path (must be `dist/web` for this project).

**Why:** The first green run proves the pipeline works end to end.

### Step 6 — Open your live site

1. Still under **Settings → Pages**, note the **site URL** (often `https://<username>.github.io/<repo>/`, or a custom domain if you set one).
2. Open that URL in a browser and confirm the site loads.

**Why:** Confirms visitors see what you expect.

### Step 7 — Permissions (only if GitHub asks)

Sometimes the first deploy fails until permissions are allowed:

1. **Settings → Actions → General** → review **Workflow permissions** if GitHub suggests changes.
2. If **Environments** are used, ensure **github-pages** is not blocked.

**Why:** GitHub needs permission to publish the site for you.

---

## Part 2 — Steady state (“I changed the code, update the web site”)

This is your normal routine after setup is done.

### Step 1 — Make your change locally

Edit files as usual (copy, styles, or small behavior changes).

### Step 2 — Commit and push to the branch that deploys

1. Commit your changes with a short message.
2. Push to **`main`** (or whatever branch your workflow file lists—if it says `main`, use `main`).

**Why:** The workflow runs on push to that branch. Pushing is the “please publish” button.

### Step 3 — Wait for GitHub Actions (usually a few minutes)

1. Open the repo on GitHub → **Actions**.
2. Find the latest workflow run for your push.
3. Wait until it finishes **successfully** (green).

**Why:** The live site only updates **after** this finishes. If it is still running (yellow), the previous version is still live.

### Step 4 — Refresh the live site

1. Open your GitHub Pages URL.
2. Do a **hard refresh** if you do not see changes (browsers cache pages):

   - **Windows / Linux:** Ctrl+Shift+R  
   - **Mac:** Cmd+Shift+R  

**Why:** You might be seeing an old cached copy, not the new deploy.

### If something went wrong

- **Red X on Actions:** Open the failed run, read the log, fix the problem, commit, and push again.
- **Green but the site looks wrong:** Confirm you are using the **Pages URL** from **Settings → Pages**, and that you are not opening a local `file://` page or a different fork.

---

## Short checklist

| Once | Every update |
|------|----------------|
| Workflow file in the repo | Change code |
| Pages source = GitHub Actions | Commit and push to the deploy branch |
| First successful Action run | Wait for a green Action |
| Bookmark your live URL | Hard refresh the browser |

# Deployment Guide

How to install this platform for your institution. Allow two to three hours the first time. You do not need to be a programmer, but you need to be comfortable creating online accounts and copying values between websites. This guide is also available inside the app: the first step of the setup wizard links to it.

---

## 1. What you are setting up

Each institution runs its own separate copy. Nothing is shared with any other school. A copy is made of these services:

| Service | Used for | Needed |
|---|---|---|
| **Neon** | The database (all your records) | Yes |
| **Render** | The backend (the server the website talks to) | Yes |
| **Vercel** | The frontend (the website people open) | Yes |
| **Cloudinary** | Stored images and documents (logo, student documents, letters) | Yes |
| **Groq** | The AI assistant, unit tutor, quizzes and AI summaries | Yes |
| **An email account** (any SMTP provider) | Notification emails to applicants and students | Yes |
| **A domain name** | Your own web address, such as `portal.yourschool.ac.ke` | Strongly recommended |

All of these have free plans you can start on. Free plans have limits: for example, a free Render service goes to sleep after a period of inactivity and takes up to a minute to wake on the next visit. For a real school with daily use, plan to move the backend and database to paid plans. Free plans can also come with conditions, for example some are meant for personal or non-commercial use only. Read each service's current terms before relying on a free plan for a real institution.

You will collect several secret values along the way (passwords and keys). Keep them in a password manager. Never paste them into chat, email or a public document, and never commit them to the code repository.

## 2. Before you start

1. Get your copy of the code from whoever supplied it, as a clean export (not a clone with someone else's history).
2. Create a **private** GitHub repository and upload the code to it. Render and Vercel deploy from there. Keep it private.
3. **Never run `prisma migrate dev` or `prisma migrate reset` on your live database.** They are developer commands: if the database differs from the migration history, `migrate dev` offers to reset it, which deletes every record, and `migrate reset` does so outright. In production only `prisma migrate deploy` is used; it applies existing updates and never deletes data. The Render build command in this guide already does this for you. As a further safety measure, the project's own developer scripts (`npm run prisma:migrate` and `npm run prisma:studio`) refuse to run against a remote database. To apply updates by hand, use `npm run migrate:deploy`.
4. **Do not upgrade Prisma to a new major version.** Prisma's command line prints a notice offering to "update to 8.0.0" or similar; ignore it. This platform has only been tested with Prisma 5.22.0.
5. There is no data to load into a new installation. The setup wizard (Step 8) does the first-time setup for you.

## 3. Step 1: Database (Neon)

1. Create an account at neon.tech and create a new project. Choose the region closest to your users.
2. Open the project's **Connect** dialog and copy the connection string. It starts with `postgresql://` and contains your password. Use the pooled version (the host name contains `-pooler`).
3. Save it. You will call it `DATABASE_URL`.

A Neon database that has been idle can take several seconds to wake up, and the first connection may fail with a message that the database cannot be reached. If that happens, wait a minute and try again. To make the first connection more patient, add `&connect_timeout=30` to the very end of the connection string.

## 4. Step 2: Media storage (Cloudinary)

1. Create an account at cloudinary.com.
2. On the dashboard, copy three values: **Cloud name**, **API key**, **API secret**.
3. **Important setting:** open **Settings**, then **Security**, and turn on **Allow delivery of PDF and ZIP files**. New accounts block this by default. Until you enable it, uploads succeed but generated letters, certificates and uploaded PDFs show an access error when opened.

## 5. Step 3: AI assistant (Groq)

The AI assistant, the unit tutor, the quiz generator, grading suggestions, timetable drafting and the report summaries all use Groq.

1. Create an account at console.groq.com.
2. Open **API Keys**, choose **Create API Key**, give it a name such as "portal", and copy the key immediately. It is shown only once.
3. Save it. You will call it `GROQ_API_KEY`.

Free usage has rate limits. If many students use the AI at the same time and it starts to slow down or return errors, check Groq's current plans and limits.

## 6. Step 4: Email

The platform emails applicants (application status, payment verification) and new students (their admission details). It sends through any mail provider that offers **SMTP**, the standard way programs send email, so you are not tied to one provider.

You need five values from your provider: a **server name** (host), a **port**, a **user name**, a **password**, and the **address the emails come from**. Choose one of these:

- **Your institution's existing email** (Google Workspace, Zoho, or the mail that came with your website hosting). Use a dedicated address such as `admissions@yourschool.ac.ke`. Your provider's help pages list its SMTP settings, usually under "SMTP", "outgoing mail server" or "email client settings".
- **Gmail** (instructions below).
- **A sending service such as Brevo (it has a free plan), Mailgun or SendGrid.** This is often the most reliable choice for a school, because these services are built for notification email and their messages are less likely to land in spam. You verify your domain once and they give you the five values.
- **Microsoft 365** can work, but Microsoft has been restricting the password sign-in that SMTP needs, so confirm with your administrator that sending is allowed before choosing it.

Typical settings (always confirm on your provider's own help page, because these change):

| Provider | `EMAIL_HOST` | `EMAIL_PORT` |
|---|---|---|
| Gmail or Google Workspace | `smtp.gmail.com` | `465` |
| Zoho Mail | `smtp.zoho.com` | `465` |
| Brevo | `smtp-relay.brevo.com` | `587` |
| Your own hosting (cPanel) | usually `mail.yourdomain.com` | `465` or `587` |

Port 465 uses a secure connection from the start and 587 upgrades to one; the platform handles both.

**If you choose Gmail or Google Workspace:**

1. Use a Gmail or Google Workspace address that belongs to the institution, for example `admissions@yourschool.ac.ke`. Do not use a staff member's personal address.
2. Sign in to that Google account and turn on **2-Step Verification** (Google Account, then Security).
3. Create an **app password**: in the same Security area, search for **App passwords** (it appears only after 2-Step Verification is on; on a Workspace account your Google administrator may need to allow it). Name it "portal", press Generate, and copy the 16-letter code. Remove any spaces when you paste it later.
4. Your values are `EMAIL_HOST` = `smtp.gmail.com`, `EMAIL_PORT` = `465`, `EMAIL_USER` = the full address, and `EMAIL_PASSWORD` = the 16-letter code. Never use the account's normal password.

Things to know:
- Gmail limits how many messages an account can send per day. Use one address dedicated to the portal, and check Google's current limits for your account type.
- Any provider that offers SMTP works. Gmail is only one example.
- If your provider's user name is not an email address (some sending services work this way), also set `EMAIL_FROM` to the address emails should come from.
- Messages show the institution's name as the sender name.

## 7. Step 5: Backend (Render)

1. Create an account at render.com. Choose **New**, then **Web Service**, and connect your private repository.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --include=dev && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
   - The build command installs the code, applies the database updates (creating all tables on the first deploy), and compiles the server. The `--include=dev` part makes sure the TypeScript compiler is installed even when `NODE_ENV` is set to `production`.
3. Add these **environment variables**:

| Name | Required | Value |
|---|---|---|
| `DATABASE_URL` | Yes | The Neon connection string from Step 1 |
| `JWT_SECRET` | Yes | A long random string, at least 32 characters. Generate one with `openssl rand -hex 32`, or use a password manager's generator |
| `CLOUDINARY_CLOUD_NAME` | Yes | From Step 2 |
| `CLOUDINARY_API_KEY` | Yes | From Step 2 |
| `CLOUDINARY_API_SECRET` | Yes | From Step 2 |
| `GROQ_API_KEY` | Yes | From Step 3 |
| `EMAIL_HOST` | Yes | Your provider's SMTP server, for example `smtp.gmail.com` (Step 4) |
| `EMAIL_PORT` | Yes | `465` or `587` (Step 4) |
| `EMAIL_USER` | Yes | The SMTP user name, usually the full email address (Step 4) |
| `EMAIL_PASSWORD` | Yes | The SMTP password or app password (Step 4). The older name `EMAIL_APP_PASSWORD` is still accepted |
| `EMAIL_FROM` | Only if needed | The address emails come from, if it differs from `EMAIL_USER` |
| `FRONTEND_URL` | Yes | Your website's address, for example `https://yourschool.vercel.app`. Exactly as typed in the browser, `https`, no trailing slash. You can only fill this in after Step 6, so deploy once without it, then add it and redeploy |
| `SETUP_TOKEN` | Strongly recommended | Any random string. It stops a stranger from finishing your setup before you do. You remove it after setup |
| `NODE_ENV` | Recommended | `production` |
| `EXAM_CARD_MIN_PAID_PERCENT` | Optional | A number from 0 to 100: the share of a student's fees that must be paid before they can get an exam card. If you leave it empty, the default is 100, which means fees must be paid in full |

Render sets `PORT` itself. Do not add it.

4. Deploy. When it finishes, open the Render service address in a browser. You should see a short message saying the backend is running. Copy this address; you need it in the next step.

## 8. Step 6: Website (Vercel)

1. Create an account at vercel.com and import the same repository.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (the other defaults are correct)
3. Add one **environment variable**: `VITE_API_URL` = the Render address from Step 5, with no trailing slash.
4. Deploy. Copy your Vercel address.
5. Go back to Render, set `FRONTEND_URL` to that address, and redeploy the backend. Without this, the browser blocks every request with a CORS error.

The repository already contains the file that makes page refreshes work on Vercel (`frontend/vercel.json`).

## 9. Step 7: Your own domain name

The free Vercel address (something like `yourschool.vercel.app`) works, but it looks unofficial, and it ties your students to a hosting company. A domain of your own is a permanent address that survives any change of hosting. You will need to buy or reuse one.

**First, check whether the institution already owns a domain.** Most schools already do, for their website or email. If so, you do not need to buy anything: use a subdomain such as `portal.yourschool.ac.ke`. Ask whoever manages your website or email, and have them add one DNS record for you (below).

**If you need to buy one:**
- Domains are sold by companies called registrars. `.ke` names are sold through registrars accredited by KENIC. `.ac.ke` is reserved for academic institutions, and registrars normally ask for proof, such as your registration certificate, so allow some days. `.co.ke` and `.com` names are usually quicker to get.
- Register it in the **institution's** name, not a staff member's. Use an official institutional email address as the contact, turn on auto-renewal, and keep the registrar login in your password manager, shared with at least two responsible people. If the domain expires, the portal address stops working.
- You only need the domain. Decline extras the registrar offers, such as hosting, website builders or email bundles.

**Connecting the domain:**
1. Decide the address, for example `portal.yourschool.ac.ke`.
2. In Vercel, open your project, then **Settings**, then **Domains**, type the address and add it.
3. Vercel shows the DNS record you must create. For a subdomain like `portal` this is normally a **CNAME** record; for a bare domain (`yourschool.ac.ke` with nothing in front) it is an **A** record. Copy exactly what Vercel displays.
4. Open your registrar's DNS settings (it may be called DNS, DNS records, Zone Editor or Name Servers). Add a new record with the **type**, **name or host** (for example `portal`) and **value** that Vercel showed. Leave the other settings at their defaults and save.
5. Wait. Vercel's Domains page shows when the setting is valid. This usually takes minutes but can take up to 48 hours. Vercel issues the HTTPS certificate for you automatically.
6. In Render, change `FRONTEND_URL` to the new address (`https://portal.yourschool.ac.ke`, no trailing slash) and redeploy the backend. Until you do, the new address shows CORS errors.

After switching, the old `vercel.app` address stops working for sign-in, because the backend accepts only the one address in `FRONTEND_URL`. Tell staff and students the new address.

## 10. Step 8: Run the setup wizard

1. Open your website address. A fresh installation sends you to the setup wizard automatically (`/setup`).
2. **Step 1 (Check):** enter your `SETUP_TOKEN` if you set one, then run the checks. Each item shows OK, WARN or FAIL, with a one-line fix for anything that fails. You cannot continue while any check shows FAIL. Fix it on Render, wait for the redeploy, and run the checks again. Once the checks pass, press **Send a test email**: it sends one message to the portal's own mailbox, so you can confirm that email really works before you continue.
3. Complete the remaining steps: institution details, logo and colors, areas you run on another system, other external systems, the first administrator account, and an optional first department and programme.
   - **Areas (the Modules step):** for each of Finance, Human Resources, Stores, Procurement and Alumni (which includes the job board), choose *Use this platform's* (the default) or *We use our own system*. Choose the second only if your institution already runs that area on another system, so there is no duplicate. You can enter the address of that system, and it appears as a link card for the people who would otherwise use that area. Procurement works with Stores, so it follows Stores.
   - You can change all of this later (see Step 9).
4. Press **Finish setup**, then sign in with the administrator account you created.
5. **Remove `SETUP_TOKEN` from Render.** The wizard locks itself permanently once an administrator exists, but removing the token is good practice.
6. **Create a second administrator account** (Admin, Users) right away. If you have only one and forget its password, you can be locked out.

## 11. Step 9: After setup

In the Admin portal:

- **Academic:** add your departments, programmes and units. **Mass Import** is the fastest way to add units.
- **Settings:** set the M-Pesa Paybill and account number, the intake dates shown on the Apply page, the "Admission number example" hint, and the About page highlights.
- **Users and Staff:** create the accounts for your registrar, finance officer, teachers and so on.
- **Admission numbers are typed by the registrar** when admitting a student. The system never generates them, so use whatever format your institution already uses.

**Areas you run on another system.** In Admin, open **Modules and Systems** at any time to switch Finance, Human Resources, Stores, Procurement or Alumni to *We use our own system*, or back. When an area is switched off:
- Its menu items disappear. The people who used it see a short page saying it is handled in your institution's own system, with a button to open that system if you entered its address.
- Its backend refuses requests, so nothing can be entered there by accident.
- When Finance is off, student fee pages and receipts, finance figures in Reports and in the AI summaries, and the Finance approval step on new clearance and graduation requests are left out.
- **Nothing is deleted.** Switching an area back on restores everything.
- Admissions, academics, examinations, learning materials and announcements cannot be switched off.

Limits to know about: requests that were already waiting for a Finance approval when Finance is switched off stay waiting. An administrator can still change an existing account to a role of a switched-off area; that person simply sees the "handled in your own system" page. The platform never reads or writes data in your other system. It only links to it.

Then test the whole chain once with your own details:
1. Submit a test application from the public Apply page, using your own email address.
2. Admit it as the registrar (typing an admission number such as `TEST-001`).
3. Check that the email arrived and that the student can sign in.
4. Open the AI assistant and send a message.
5. Upload a document and generate a letter PDF, and check that both open.

Then remove the test records, or archive the test student, and keep the test numbers out of your real numbering.

## 12. Linking a system that only works on your local network

Many institutions already run a system that works only inside their building, for example an existing ERP on a local server. This platform can show such a system as a link card, so staff reach it through the portal. **The platform only provides the link. It never reads or writes that system's data.**

An outside visitor's browser cannot reach a computer inside your building. For a link to work from home or from a phone, **you must first make that system reachable over the internet, yourself.** The platform cannot reach into your network. This section explains how, and how to do it safely.

### 12.1 Decide whether you need it

- Do people really need the system from outside the building? If only the finance officer needs it occasionally, a VPN to the school (arranged by your network administrator) may be safer than publishing the system.
- Check that the system's owner or supplier allows internet access to it. Some licences forbid it.
- Know who can fix it if something breaks. You are making an internal system a public target.

### 12.2 Option A (recommended): Cloudflare Tunnel with Cloudflare Access

A small program on a computer inside your network opens an outbound connection to Cloudflare. Cloudflare then gives the system an `https://` address and asks people to prove who they are before letting them through. You do not open any ports on your router.

What you need:
- A free Cloudflare account.
- A domain whose DNS is managed on Cloudflare. If you cannot move your institution's `.ac.ke` domain, a separate inexpensive domain used only for this works as well.
- A computer that is **always on**, inside your network, and can open the system in its browser (the server itself, or a spare computer on the same network).

Steps:
1. Add your domain to Cloudflare and change the name servers at your registrar to the two Cloudflare gives you. Cloudflare shows when this is done.
2. In the Cloudflare dashboard open **Zero Trust**, then **Networks**, then **Tunnels** (menu names change from time to time), and choose **Create a tunnel** using **Cloudflared**. Name it, for example `school-erp`.
3. Cloudflare shows an install command for your operating system (Windows or Linux). Run it on the always-on computer. Make sure it is installed as a **service**, so it restarts after a power cut.
4. Add a **public hostname** to the tunnel: a name such as `erp` on your domain, and as the **service** the address staff type inside the building, for example `http://192.168.1.20:8080`. Cloudflare publishes `https://erp.yourdomain` and supplies the HTTPS certificate.
5. **Protect it with Cloudflare Access (do not skip this).** In Zero Trust open **Access**, then **Applications**, then add a **Self-hosted** application for `erp.yourdomain`. Add a policy that **allows** only the email addresses of the people who need it, and use the **one-time PIN by email** login. The free plan covers a limited number of users, so check Cloudflare's current limit.
6. Test from a phone using mobile data, not the school wifi. You should see Cloudflare's login first, then the system's own login.

The system's own login still applies. Keep it on, with strong passwords.

### 12.3 Option B: Tailscale (a private network, not a public address)

Tailscale joins chosen devices into a private network. Only devices with Tailscale installed and approved can reach the system. This is very safe, but ordinary browsers cannot use it, so a link card in the portal will not work for people who have not installed Tailscale. It suits a few administrators, not a whole staff.

### 12.4 Option C: Router port forwarding or a reverse proxy

You would publish a port on your router and run a web server (for example Caddy or Nginx) with a certificate from Let's Encrypt. This needs a fixed public IP address, firewall rules and ongoing maintenance. Only attempt it with an experienced network administrator. **Never forward a database port (such as SQL Server's 1433) or remote desktop to the internet, under any circumstances.**

### 12.5 Adding it to the platform

There are two ways:

1. **For an area this platform also offers** (Finance, Human Resources, Stores, Procurement, Alumni), enter the address when you choose *We use our own system* in the wizard's Modules step, or later in Admin, Modules and Systems. The card is shown to the people who would otherwise use that area.
2. **For any other system**, add it under **Other systems** (the wizard's Systems step, or Admin, Modules and Systems) with a name, the `https://` address, and who may see it: administrators only, staff only (the default), or everyone.

Cards appear in the sidebar under **Other systems** and open in a new tab.

### 12.6 Safety checklist for a published system

- [ ] A login (Cloudflare Access or similar) sits in front of it
- [ ] The address starts with `https://`, not `http://`
- [ ] The card is visible only to the roles that need it
- [ ] The system's own passwords are strong and unique
- [ ] The system and the computer running the tunnel are kept updated
- [ ] No database port or remote desktop is exposed
- [ ] The system has its own regular backups

### 12.7 Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| Cloudflare shows an error page such as 502 or 1033 | The tunnel computer is off, asleep or offline, or the tunnel service stopped. Restart it |
| It works inside the building but not outside | The public hostname points to the wrong local address or port. Check the **service** address in the tunnel |
| A browser certificate warning | The tunnel service type is set to HTTPS but the system only speaks HTTP, or the reverse. Match the type to the system |
| The system rejects the visit or shows odd pages | Some systems check the address they are reached by. Ask the supplier, or set the HTTP Host Header in the tunnel to the system's internal name |
| Pages load but links or images are broken | The system writes its internal address into its own pages. This is a limit of that system. Ask the supplier |
| The link card opens but asks for another login | That is Cloudflare Access (first) and then the system's own login. Both are expected |

## 13. Backups

Your records live in Neon. Plan for the day something goes wrong:

- Check what restore history your Neon plan keeps and how far back you can restore.
- Make a regular export of the database as well (for example monthly, and before every update). A connection string and the `pg_dump` tool are enough.
- Store backups somewhere other than one person's laptop.

## 14. Updating to a new version

1. Take a database export first.
2. Replace the code in your repository with the new version and push. Render and Vercel redeploy automatically.
3. The Render build command applies any database updates (`prisma migrate deploy`).
4. Open the site and check that you can sign in.

## 15. Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| Browser console says **CORS: Origin not allowed** | `FRONTEND_URL` on Render does not exactly match your website address (check `https`, spelling, and no trailing slash), or the backend has not been redeployed since you changed it |
| The wizard says **Cannot reach the server** | `VITE_API_URL` on Vercel is wrong, or the Render service is asleep. Wait a minute and reload. Check you redeployed Vercel after changing the variable |
| A page shows 404 after refreshing | `frontend/vercel.json` is missing from your deployment |
| Render build fails with an error about `tsc` or TypeScript | Use the build command exactly as written, including `--include=dev` |
| Wizard check **FAIL: Database connection** | `DATABASE_URL` is wrong. Neon can also take a few seconds to wake after being idle, so retry once, and add `&connect_timeout=30` to the end of the connection string |
| Wizard check **FAIL: Media storage** | One of the three Cloudinary values is missing or mistyped |
| Wizard check **FAIL: AI assistant** | `GROQ_API_KEY` is missing |
| Wizard check **FAIL: Notification email** | `EMAIL_USER` or `EMAIL_PASSWORD` is missing (and `EMAIL_HOST` if you do not use Gmail) |
| The test email fails | The message names the cause. Usually the host, port, user name or password is wrong, or your provider needs an app password or has blocked the sign-in |
| Wizard check **FAIL: Login security key** | `JWT_SECRET` is missing or shorter than 32 characters |
| Wizard says **That setup token is not correct** | The token you typed differs from `SETUP_TOKEN` on Render |
| Visiting `/setup` sends you to the home page | Setup is already complete. This is expected and permanent |
| Logo upload fails | Check the Cloudinary values and that the image is under 5 MB |
| Letters or PDFs show an access error | Enable "Allow delivery of PDF and ZIP files" in Cloudinary (Step 2) |
| Emails are not arriving | Check the email values (host, port, user, password). Check the spam folder. With Gmail, make sure you used an app password, not the normal password. The Render logs show send errors |
| The AI assistant gives errors | The Groq key is wrong, or you reached Groq's rate limit |
| Your new domain shows an error | The DNS record is missing or not yet active (Vercel's Domains page shows the status), or `FRONTEND_URL` still has the old address |
| Everything is slow on the first visit of the day | A free-plan service is waking up. A paid plan removes this |

## 16. Security checklist

- [ ] `SETUP_TOKEN` removed after setup
- [ ] `JWT_SECRET` is long and random, and is not used anywhere else
- [ ] The repository is private and contains no `.env` file
- [ ] A second administrator exists
- [ ] Every staff member has their own account and password
- [ ] Database backups exist and you have tested restoring one
- [ ] The domain is registered in the institution's name with auto-renewal on
- [ ] Any secret that was ever pasted into chat, email or a public place has been rotated (Neon: Roles, reset password; Cloudinary: regenerate the API secret; Groq: delete and create a new key; Gmail: delete and recreate the app password; Render: change `JWT_SECRET`, which signs everyone out)

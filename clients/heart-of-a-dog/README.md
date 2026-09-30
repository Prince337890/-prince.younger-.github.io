# Heart of a Dog Training — Website Redesign

Static 4-page site: `index.html`, `services.html`, `about.html`, `contact.html`.
No intake form page. Visitors book by call, text or email.

## 1. Collect from the client before launch

- [x] **Brand colors**: taken from her logo (blue `#5B9BE6`, green `#66BD95`) and set at the top of `styles.css`. If she has official hex codes, paste them over `--logo-blue` / `--logo-green` there.
- [ ] **Logo file**: ask for the original transparent PNG (not a screenshot) and save it as `images/logo.png`. It shows up in the header on every page automatically.
- [ ] **Photos**: `images/hero.jpg` (landscape), `images/trainer.jpg` (portrait), `images/og-image.jpg` (1200×630, used for social shares). On each placeholder `div class="… ph"`, add `style="background-image:url(images/hero.jpg)"`.
- [ ] Phone, email, hours, Facebook/Instagram URLs
- [ ] Trainer name, bio, certifications
- [ ] Program names, session counts, starting prices (or remove the price lines)
- [ ] 3 real reviews (first name + city)
- [ ] Stats: years training, dogs trained
- [ ] Confirm the service-area cities

Find/replace these placeholders across all files:
`[PHONE]`, `[PHONE_DIGITS]` (e.g. `+16785550123`), `[EMAIL]`, `[FACEBOOK_URL]`, `[INSTAGRAM_URL]`, `[Trainer Name]`, `[X]`, and any other `[…]`.

## 2. Deploy on MochaHost (cPanel)

1. cPanel → **Backup Wizard** → download a full backup of the current site first.
2. If the current site is WordPress: move it out of the way instead of deleting it. In File Manager, create `public_html/old-site/` and move the WordPress files into it (or use a staging subdomain first).
3. Upload everything in this folder into `public_html/`.
4. Visit the site, test every link and the phone/email buttons on a phone.
5. **Remove the old intake form URL**: in cPanel → **Redirects**, add a 301 redirect from the old intake page path (e.g. `/intake-form`) to `/contact.html` so Google and old links don't hit a 404.
6. Add 301s from the old WordPress page URLs (e.g. `/services/`, `/about/`) to the new `.html` pages.

## 3. SEO after launch (this does most of the "better keywords" work)

- **Google Search Console**: add the domain, submit `sitemap.xml`.
- **Google Business Profile**: category "Dog trainer", same name/phone/city as the site, link to the website, ask happy clients for reviews. For local searches this matters more than anything on the site itself.
- Keep name, phone and city identical everywhere (site, Google, Thumbtack, Facebook, Yelp).

Keywords the pages are written around:

| Page | Primary keywords |
|---|---|
| Home | dog trainer Powder Springs GA, in-home dog training, dog training Metro Atlanta |
| Programs | puppy training Marietta, obedience training West Cobb, reactive dog training Atlanta, dog behavior modification |
| About | Powder Springs dog trainer, private dog trainer |
| Contact | dog training consultation Powder Springs |

Already included: unique title and meta description per page, LocalBusiness and FAQ structured data (schema.org), canonical URLs, Open Graph tags, sitemap.xml, robots.txt, and one H1 per page.

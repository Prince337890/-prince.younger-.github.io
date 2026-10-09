# Heart of a Dog Dog Training: Website Redesign

Replaces the current WordPress + Elementor site at heartofadogtrainingatl.com
(designed by Bleuprint Media, 2021) with a fast static site in her logo colors.

## What's here

| File | URL | Notes |
|---|---|---|
| `index.html` | `/` | Hero, programs, about Jaila, how it works, gallery, reviews, FAQ, contact |
| `services/index.html` | `/services/` | Board and train tiers and prices, private and virtual lessons, boarding |
| `about/index.html` | `/about/` | Jaila's bio, goal, values, reviews |
| `.htaccess` | n/a | 301 redirects from old URLs, including the old intake form page |
| `images/` | n/a | Her own photos (resized), cleaned-up logo, favicon, social share image |

**Intake form removed.** The old `/contact/` page held the form (name, breed, dog's age, captcha),
and every "Get Started" button linked there. The page is gone. `/contact/` now 301-redirects to the
contact section on the homepage, which has call, text and email buttons. `/reviews/` and `/gallery/`
redirect to their sections on the homepage. `/about/` and `/services/` keep their old URLs, so
Google rankings carry over.

## Confirm with Jaila before launch

- [x] **Phone number.** Confirmed by Jaila: **(470) 288-4848**, used everywhere on the site.
      Update it on Google, Thumbtack and social profiles too, since her old site also listed (770) 954-6084.
- [ ] **Prices.** Copied from her current site, which dates from 2022: board and train $1,550 / $2,200 / $2,800,
      private lessons $800, virtual lessons $600, boarding $60 a night. Still current?
- [ ] **Location.** Her Thumbtack listing says Powder Springs, GA. The site's visible text says "Metro Atlanta",
      and the Google structured data says Powder Springs. Confirm her city and the areas she serves.
- [ ] **"Balanced trainer".** Her old bio said "groomed-balanced trainer", which reads like a typo. The new text says
      "balanced trainer". Does she hold a certification to list instead?
- [ ] **Photos.** Picked from her old gallery. Swap any she doesn't like; files are in `images/`.
- [ ] **Logo.** `images/logo.png` was cleaned up from a screenshot. If she has the original file, replace it.
- [ ] **Old site bits.** Her WordPress has WooCommerce installed, but no shop pages are linked. Check that she isn't selling anything.

## Deploy on MochaHost (cPanel)

1. cPanel → **Backup Wizard** → download a full backup, or run a JetBackup 5 snapshot.
2. **File Manager** → `public_html` → create a folder `old-wordpress` and move all the WordPress
   files and folders into it (`wp-admin`, `wp-content`, `wp-includes`, `index.php`, `wp-*.php`, and the
   old `.htaccess`). Leave `.well-known` and `cgi-bin` where they are.
3. Upload the contents of this folder (including `.htaccess`, `about/`, `services/` and `images/`) into `public_html`.
4. Visit the site on a phone and a laptop. Tap the call, text and email buttons, and open
   `/contact/`, `/reviews/` and `/gallery/` to check that they redirect.
5. Once it's all confirmed working (give it a week or two), delete `old-wordpress` and its database
   in cPanel → **MySQL Databases** so the old WordPress install can't be hacked.

## SEO after launch

- **Google Search Console**: add the domain, submit `https://heartofadogtrainingatl.com/sitemap.xml`,
  and request indexing for the homepage.
- **Google Business Profile**: category "Dog trainer" (add "Pet boarding service"), the same name, phone and
  website as the site, photos, and ask every client for a Google review. This does more for local search than anything else.
- Keep the name, phone and city identical on Google, Thumbtack, Facebook, Instagram and TikTok.

Keywords the pages are written around:

| Page | Target searches |
|---|---|
| Home | dog training Atlanta, board and train Atlanta, dog trainer near me |
| Programs | board and train prices, private dog training lessons, virtual dog training, dog boarding Atlanta |
| About | Atlanta dog trainer, balanced dog trainer |

Built in: unique titles and descriptions, LocalBusiness schema with prices and reviews, FAQ schema,
canonical URLs, social share image, descriptive photo alt text, sitemap and robots.txt, and fast load
(no WordPress, 12 optimized photos).

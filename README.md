# ICE Card Maker

A web app that turns medical details into an **In Case of Emergency (ICE)** card for you and your family. Built with plain HTML, CSS and JavaScript, with AI features powered by Claude.

## Features

**Core**
- **Family profiles:** up to 8 people, each with their own card, shown as tabs
- **Live wallet card** at real bank-card size (85.6 × 54 mm), with a **front** (name, blood group, allergies, conditions, medication, QR code) and a **back** (notes for responders, all contacts, doctor, organ donor)
- **QR code** holding every detail as plain text, readable by any phone camera with no internet
- **Lock-screen wallpaper** for iPhone or Android, with the top left clear for the clock
- **Emergency number** for the chosen country printed on the card, plus a "Find hospitals near me" link
- **Print** both sides at real size, ready to cut out and glue back to back
- **Backup and restore** everyone's details as a JSON file
- Saved automatically in `localStorage`; works on phones; light and dark themes

**AI (Claude inside claude.ai, free Google Gemini on your own site)**
- **Scan a prescription:** take a photo of a prescription or medical report. Claude reads it and suggests medications, conditions and allergies. You tick which ones to add, so nothing goes on the card without being checked.
- **Write notes for responders:** Claude turns the allergies, conditions and medications into 2 to 4 short instructions for a paramedic, for example "Allergic to penicillin: use another antibiotic". You can edit them.
- **Translate the card** into Hindi, Bengali, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Spanish, French, German, Chinese or Japanese. Medicine names stay in English so doctors recognise them, and the QR code stays in English.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page structure: profile tabs, form, card front and back, wallpaper preview, dialogs |
| `style.css` | Layout, light and dark themes, the card design, and the print stylesheet |
| `ai.js` | A small wrapper around the AI. The rest of the app only calls `AI.askJson(prompt, {images})` |
| `app.js` | Profiles, saving, the QR code, card and wallpaper drawing, and the three AI features |
| `netlify/functions/ai.mjs` | A tiny server function on Netlify that holds the free Gemini key and calls Gemini |
| `netlify.toml` | Tells Netlify where the site and the function are |

## How it works

1. **State.** All people are kept in one object, `store = { activeId, people: [{ id, data, translation }] }`, saved to `localStorage` as JSON 400 ms after you stop typing. `normalizeData()` checks every saved or imported value, so a damaged file cannot break the page.
2. **Live preview.** One `input` listener on the form calls `refresh()`. It builds a "view" of the active person (`buildView()`), which already has the right labels and translated text, then draws the card and the wallpaper from it.
3. **QR code.** `buildQrText()` makes a short text block. The qrcode-generator library turns it into a grid of squares, and `drawQr()` paints them on a `<canvas>`. Text is encoded as UTF-8 so names in any script scan correctly.
4. **Card at real size.** The card's font size is in container query units (`cqw`) and everything inside uses `em`, so it scales as one piece: 460 px on screen, 85.6 mm on paper.
5. **Wallpaper.** `renderWallpaper()` draws on a 1170 × 2532 (or 1080 × 2400) canvas with the Canvas 2D API. `wrapText()` splits long text into lines that fit.
6. **AI.** Each feature writes a clear prompt, asks for JSON back, and checks the reply before using it:
   - the scan sends a photo, shrunk to 1600 px first (`prepareImage()`), and shows tick boxes for review
   - translations are stored with a fingerprint of the text (`translationKey()`), so if you change the card the app knows the translation is out of date and shows English until you translate again

## How the AI connects

`ai.js` picks the first mode that works:

| Where the page runs | How AI works | Cost |
| --- | --- | --- |
| Inside Claude (the claude.ai artifact) | The viewer's own Claude account, through `window.claude.use("sample")` | Free for you |
| Your Netlify site with the function set up | The page calls `/api/ai`. The function in `netlify/functions/ai.mjs` calls **Google Gemini's free tier** with a key that stays on the server | Free for you and visitors |
| Anywhere, optional | A visitor pastes their own Anthropic API key in AI settings | Paid by that visitor |
| None of these | AI buttons explain how to turn AI on. Everything else still works | - |

**Why a server function?** An API key written into JavaScript can be copied by anyone who opens the page. The function keeps the key in a Netlify environment variable, which visitors never see. It also only accepts requests from your own site, only one photo at a time and limited text, so it can't be used as a free AI service for other people.

### Free limits (check these yourself)

- **Gemini free tier:** limits are per Google project, reset at midnight Pacific time, and Google can change them. In late 2026 the Flash models were reported at about **5 requests a minute and 20 a day**, and Flash-Lite models at about **15 a minute and 500 a day**. Open [Google AI Studio](https://aistudio.google.com), go to the rate-limit page for your project, and check the real numbers. When the limit is reached, the app says so and asks people to try later. Nothing is ever charged, because the free tier has no billing.
- **More requests per day:** in Netlify, add an environment variable `GEMINI_MODEL` set to a Flash-Lite model ID that AI Studio lists as free. The function uses that model first, then `gemini-3.8-flash`.
- **Netlify free plan:** 300 credits a month for deploys, functions and traffic. A portfolio project stays well inside this. If you ever go over, Netlify pauses the site until next month instead of charging you.
- **Privacy:** on Gemini's free tier, Google may use what is sent (including prescription photos) to improve its products, and people may review it. The app says this in AI settings. For real medical use you would switch to a paid tier.
- **Europe and the UK:** Google's terms ask apps that serve users in the EEA, Switzerland or the UK to use the paid tier.

## Put it online with free AI (step by step, no coding tools needed)

Netlify's drag-and-drop page only hosts plain files, so it can't run the AI function. Instead, put the files on GitHub (all in the browser) and let Netlify deploy from there. You will also have the code on GitHub to show in your portfolio.

### 1. Get a free Gemini API key

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with a Google account.
2. Click **Get API key**, then **Create API key**. Don't add billing.
3. Copy the key and keep it private. Don't paste it into any file.

### 2. Put the files on GitHub

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Click **+** (top right), then **New repository**. Name it `ice-card-maker`, choose **Public**, and click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Unzip `ice-card-maker.zip`. Drag **everything inside** it onto the page, including the `netlify` folder and `netlify.toml`. Use Chrome or Edge so the folder keeps its structure.
5. Click **Commit changes**. Check that the repository shows `netlify/functions/ai.mjs`.

### 3. Deploy on Netlify

1. Sign in at [app.netlify.com](https://app.netlify.com) (you can use **Sign in with GitHub**).
2. Click **Add new project**, then **Import an existing project**, then **GitHub**, and pick `ice-card-maker`.
3. Leave the build settings as they are (`netlify.toml` fills them in).
4. Before deploying, find **Environment variables**, click **Add variable**, and enter:
   - Key: `GEMINI_API_KEY`
   - Value: the key from step 1
   - Make sure it is available to **Functions** (the default)
5. Click **Deploy**. After a minute you get a link like `ice-card-maker.netlify.app`.

If you added the key after the first deploy, go to **Deploys**, click **Trigger deploy**, then **Deploy project** so the function can see it.

### 4. Check it works

Open your site, scroll to **AI settings** at the bottom of the form, and look for **On, free**. Then try **Write with AI**. If it says the key is missing, check the variable name, then deploy again. Function errors appear in Netlify under **Logs**, then **Functions**, then **ai**.

To change something later, edit or upload the file on GitHub. Netlify redeploys by itself.

### Other ways to deploy

- **Netlify CLI** (needs Node.js and a terminal): run `npx netlify-cli deploy --prod` in the folder, then set `GEMINI_API_KEY` under the project's Environment variables and deploy again.
- **GitHub Pages or Netlify Drop:** the site works, but without the function the AI is off unless a visitor adds their own Anthropic key.

## Ideas to extend it

- Medication reminders using the Notifications API
- Right-to-left languages (Urdu, Arabic) for the card
- A paid AI tier for real medical use, so data is not used for training

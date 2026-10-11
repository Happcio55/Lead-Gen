# Mainnet-teaser · @ParabolNow

10 opslag fra mandag 12. okt. kl. 00:00 til kl. 11:00 (dansk tid, CEST).
Alt grafik er lavet i useparabol.com's design: farver, Archivo/IBM Plex Mono, millimeterpapir og Bull²/Bear²-kurven.

- `images/post-XX.png`: ét billede pr. opslag (1920×1080, 16:9)
- `videos/`: 3 videoer (1920×1080, 16:9, 30 fps, uden lyd). Video 2 og 3 er optaget live på useparabol.com.

Opslag med 🎬 bruger videoen. Billedet med samme nummer kan bruges i stedet.

Indholdet holder sig til det, Parabol selv har offentliggjort: mainnet er under udvikling, men der er ingen dato og ingen nye features. Tilføj først konkrete nyheder, når de er officielle.

---

### 1 · 00:00 🎬 `videos/video1-weve-been-quiet.mp4` (alt. `images/post-01.png`)
```
We've been quiet.

Not because nothing is happening. Because a lot is.

Mainnet news soon.
```

### 2 · 01:15 🖼 `images/post-02.png`
```
Heads down. Shipping.

Practice demo: live.
Wallet testnet on Robinhood Chain: live.
Bull², Bear², VOL², Protect: live on testnet.

Mainnet: next.
```

### 3 · 02:30 🖼 `images/post-03.png`
```
More news. Very soon.

Turn on notifications so you don't miss it. 🔔
```

### 4 · 03:45 🖼 `images/post-04.png`
```
Mainnet is the part we won't rush.

No margin. No liquidation. No expiry. Max loss: your stake.

It has to be right. News soon.
```

### 5 · 05:00 🖼 `images/post-05.png`
```
While you wait for mainnet, get your reps in on testnet.

Connect → test ETH for gas → claim 1,000 test USDG → pick a side.

Test tokens have no value. Use a fresh wallet.

useparabol.com/testnet
```

### 6 · 06:30 🎬 `videos/video2-road-to-mainnet.mp4` (alt. `images/post-06.png`)
```
The road to mainnet.

✅ Practice demo
✅ Wallet testnet
✅ Bull² · Bear² · VOL² · Protect
⏳ Mainnet

More news soon.
```

### 7 · 07:45 🖼 `images/post-07.png`
```
Good morning.

Quiet on the timeline. Busy behind it.

Parabol² mainnet updates are coming.
```

### 8 · 08:45 🖼 `images/post-08.png`
```
Which market first?

NVDA, TSLA, PLTR, AAPL or SPY.

Tell us below. 👇
```

### 9 · 09:45 🖼 `images/post-09.png`
```
Explore stock moves. Before mainnet.

The practice demo gives you 10,000 virtual USDG. Buy Bull², Bear² or VOL², move the price, let the days pass.

No wallet. No deposits.

useparabol.com/demo
```

### 10 · 11:00 🎬 `videos/video3-curve-lab-live.mp4` (alt. `images/post-10.png`)
```
Move the price. Watch it square.

Curve lab and liquidation simulator, live on useparabol.com.

Next stop: mainnet. Stay close. 👀
```

---

**Sådan planlægger du dem på X (web):** skriv opslaget, vedhæft billedet eller videoen, klik på kalenderikonet (Schedule), vælg dato og tid og tryk Schedule. Planlægning kræver normalt X Premium. Ellers kan du bruge Buffer eller Typefully.

**Lav det hele igen:** `cd mainnet-teaser/studio && node render.cjs images` og `node render.cjs videos`. Det kræver Playwright og ffmpeg. Tekster og indhold ligger i `studio/scenes.cjs`.

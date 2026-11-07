# "Seamlessly Yours" – 30-second launch ad

A motion-graphics ad that walks through shopping at Sleek Connect on the web and in the app, from browsing to the
parcel at the door. Everything is built in code from the store's own brand assets (logo, product photos, Plus Jakarta
Sans, the navy and teal palette), so it can be re-cut when the shop changes.

**The idea.** The teal swoosh from the logo is the thread that "connects" every step: it writes the opening words, wipes
between scenes, becomes the delivery route on the map, and resolves back into the logo at the end.

## Shot list (120 BPM, one beat = 0.5 s)

| Time | Scene | On screen | Line |
| --- | --- | --- | --- |
| 0:00–0:03 | Hook | The swoosh draws across a dark frame. Beauty. Baby. Home. Fashion. hit on the beat, each with its product photo | All in one place. |
| 0:03–0:06 | 1 Browse | A browser window rises in 3D showing the home page; the cursor heads for Beauty | Browse on the web. |
| 0:06–0:10 | 2 Find | The Beauty grid builds in; the cursor picks the Vitamin C serum, and the card flies out of the laptop | Find your favourites. |
| 0:10–0:14 | 3 Add | The card lands in the phone app (dark theme); 30 ml, Add to bag, the bag badge pops | Add to bag in one tap. |
| 0:14–0:18.5 | 4 Pay | Checkout: address types itself, Mobile Money is chosen, the MoMo approval comes up, PIN, confirmed | Pay with MoMo, or on delivery. |
| 0:18.5–0:24 | 5 Track | The swoosh becomes the route; the rider travels it, "On the way" notification with delivery code, Delivered | Track it to your door. |
| 0:24–0:27 | Both | Laptop and phone side by side, both showing the delivered order | Shop on the web. Or in your pocket. |
| 0:27–0:30 | End card | A teal wipe to white, the logo, sleekconnectstore.com | Seamlessly yours. |

## Files

- `ad.html` – the whole animation. `seek(t)` draws the frame at `t` seconds, so the render is frame-exact. Open it in a
  browser to preview (it plays itself; press space to pause, arrow keys to scrub).
- `music.mjs` – writes the soundtrack (`out/music.wav`): a 120 BPM beat with whooshes, clicks and chimes placed on the
  same cue times as the picture.
- `render.mjs` – renders every frame with Playwright's Chromium and encodes `out/sleek-connect-ad.mp4` with ffmpeg.

```bash
node marketing/launch-ad/music.mjs
node marketing/launch-ad/render.mjs            # 16:9, 1920x1080
node marketing/launch-ad/render.mjs vertical   # 9:16, 1080x1920 for Reels, TikTok and Status
```

`out/` is not committed.

// Draws the five App Store screenshots (iPhone 6.9", 1320x2868) from the app's own colours, fonts and product photos.
//   node apps/mobile/store-assets/build-screenshots.cjs      ->  apps/mobile/store-assets/ios/01-home.png ... 05-light-dark.png
// The phone screens are drawn in HTML to match the app, so they can be restyled and re-rendered when the app changes.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, 'ios');
const url = (p) => 'file:///' + p.replace(/\\/g, '/');
const img = (name) => url(path.join(ROOT, 'packages/shared/assets/images', name));
const font = (w) => url(path.join(ROOT, `node_modules/@expo-google-fonts/plus-jakarta-sans/${w}/PlusJakartaSans_${w}.ttf`));
const logo = url(path.join(__dirname, '..', 'assets', 'logo-mark.png'));

const TEAL = '#0F766E', TEAL2 = '#2BB3A6', INK = '#0B1F3A', GOLD = '#F2B53A';

const ic = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chev: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
};
const svg = (n, size = 22, color = 'currentColor', sw = 1.9, fill = 'none') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ic[n]}</svg>`;

const css = `
@font-face{font-family:J;font-weight:400;src:url('${font('400Regular')}')}
@font-face{font-family:J;font-weight:600;src:url('${font('600SemiBold')}')}
@font-face{font-family:J;font-weight:700;src:url('${font('700Bold')}')}
@font-face{font-family:J;font-weight:800;src:url('${font('800ExtraBold')}')}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1320px;height:2868px;font-family:J,system-ui,sans-serif;overflow:hidden;position:relative;color:${INK}}
.cap{position:absolute;left:100px;right:100px;text-align:center}
.cap h1{font-size:112px;line-height:1.04;font-weight:800;letter-spacing:-3px}
.cap p{font-size:46px;line-height:1.3;margin-top:26px;font-weight:600;opacity:.82}
.phone{color:#0B1F3A;position:absolute;width:390px;height:844px;transform-origin:top left;border-radius:56px;border:11px solid #0c0d10;background:#fff;overflow:hidden;box-shadow:0 0 0 2px #3a3d44,0 40px 90px rgba(0,0,0,.35)}
.phone.dark{background:#000;color:#f2f2f2}
.island{position:absolute;top:11px;left:50%;width:118px;height:34px;margin-left:-59px;background:#000;border-radius:20px;z-index:20}
.status{height:54px;padding:18px 30px 0;display:flex;justify-content:space-between;font-weight:700;font-size:16px}
.tabs{position:absolute;left:14px;right:14px;bottom:18px;height:64px;border-radius:34px;display:flex;padding:5px;backdrop-filter:blur(18px);background:rgba(255,255,255,.62);border:1px solid rgba(255,255,255,.9);box-shadow:0 8px 28px rgba(11,31,58,.18);z-index:15}
.dark .tabs{background:rgba(40,40,44,.55);border-color:rgba(255,255,255,.14)}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10px;font-weight:600;border-radius:28px;color:rgba(11,31,58,.62)}
.dark .tab{color:rgba(255,255,255,.62)}
.tab.on{background:rgba(255,255,255,.85);color:${TEAL};box-shadow:0 2px 8px rgba(0,0,0,.08)}
.dark .tab.on{background:rgba(255,255,255,.16);color:${TEAL2}}
.pad{padding:0 18px}
.card{background:#fff;border-radius:22px}
.dark .card{background:#161618}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tile{background:#f6f6f7;border-radius:20px;padding:9px;position:relative}
.dark .tile{background:#161618}
.tile .im{height:118px;border-radius:14px;background-size:cover;background-position:center}
.tile b{display:block;font-size:12px;margin-top:8px;line-height:1.25}
.tile span{font-size:12px;font-weight:800;display:block;margin-top:3px}
.tile i{position:absolute;right:15px;top:98px;width:30px;height:30px;border-radius:15px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;font-weight:700}
`;

const status = (dark) => `<div class="status"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg> <b style="font-size:13px">5G</b> <span style="display:inline-block;width:24px;height:12px;border:1.5px solid ${dark ? '#fff' : INK};border-radius:4px;position:relative"><i style="position:absolute;inset:1.5px;background:${dark ? '#fff' : INK};border-radius:2px"></i></span></span></div>`;
const tabBar = (on) => `<div class="tabs">${[['home', 'Home'], ['grid', 'Shop'], ['heart', 'Saved'], ['bag', 'Bag'], ['user', 'Account']].map(([n, l]) => `<div class="tab${l === on ? ' on' : ''}">${svg(n, 22)}${l}</div>`).join('')}</div>`;
const phone = (inner, { x, y, scale = 2.2, rotate = 0, dark = false }) => `<div class="phone${dark ? ' dark' : ''}" style="left:${x}px;top:${y}px;transform:scale(${scale}) rotate(${rotate}deg)"><div class="island"></div>${status(dark)}${inner}</div>`;
const tile = (name, price, photo) => `<div class="tile"><div class="im" style="background-image:url('${img(photo)}')"></div><i>${svg('bag', 15, '#fff', 2)}</i><b>${name}</b><span>${price}</span></div>`;

// ── screens ────────────────────────────────────────────────────────────────────────────────────────────────
const homeScreen = `
<div class="pad" style="display:flex;align-items:center;justify-content:space-between;margin-top:2px"><div style="display:flex;align-items:center;gap:8px"><img src="${logo}" width="30" height="30" style="border-radius:8px"><b style="font-size:17px">Sleek Connect</b></div><span style="display:flex;gap:10px">${svg('search', 22)}${svg('bag', 22)}</span></div>
<div class="pad" style="margin-top:12px"><div style="height:176px;border-radius:24px;background:linear-gradient(90deg,#0F766E 0 52%,transparent 52%),url('${img('hero-model.jpg')}') right/cover;position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(90deg,#0F766E 0 46%,transparent 74%)"></div><div style="position:relative;padding:20px;color:#fff;width:62%"><small style="font-weight:700;letter-spacing:1px;font-size:10px;opacity:.8">TRENDING NOW</small><div style="font-size:23px;font-weight:800;line-height:1.1;margin-top:6px">Glow Products You'll Love</div><div class="pill" style="background:#fff;color:${INK};padding:8px 14px;font-size:12px;margin-top:14px">Shop now →</div></div></div></div>
<div class="pad" style="display:flex;gap:8px;margin-top:14px;font-size:12px;font-weight:700">${['All', 'Beauty', 'Baby & Kids', 'Home'].map((c, i) => `<span class="pill" style="padding:8px 14px;background:${i ? '#f1f1f3' : INK};color:${i ? INK : '#fff'}">${c}</span>`).join('')}</div>
<div class="pad" style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px"><b style="font-size:17px">New arrivals</b><span style="font-size:12px;font-weight:700;color:${TEAL}">View all →</span></div>
<div class="pad g2" style="margin-top:10px">${tile('Vitamin C Serum', 'GH₵ 185', 'vitamin-c-serum.jpg')}${tile('Shea Body Butter', 'GH₵ 95', 'shea-body-butter.jpg')}${tile('Matte Lip Colour', 'GH₵ 70', 'matte-lip-colour.jpg')}${tile('Gentle Baby Wash', 'GH₵ 80', 'baby-wash.jpg')}</div>
${tabBar('Home')}`;

const productScreen = `
<div style="position:relative;height:370px;background:url('${img('vitamin-c-serum.jpg')}') center/cover;margin-top:-54px;padding-top:54px"><div style="position:absolute;left:16px;top:60px;width:42px;height:42px;border-radius:21px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center">${svg('chev', 20)}</div><div style="position:absolute;right:16px;top:60px;width:42px;height:42px;border-radius:21px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center">${svg('heart', 20)}</div></div>
<div class="pad" style="margin-top:-24px;position:relative"><div class="card" style="padding:18px 18px 16px;box-shadow:0 -6px 30px rgba(0,0,0,.08)"><small style="color:${TEAL};font-weight:700">SKINCARE · 100% AUTHENTIC</small><div style="font-size:22px;font-weight:800;margin-top:4px">Vitamin C Brightening Serum</div><div style="color:${GOLD};font-size:13px;margin-top:4px">★★★★★ <span style="color:#55617a">4.9 (212)</span></div><div style="font-size:26px;font-weight:800;margin-top:8px">GH₵ 185 <s style="font-size:14px;color:#8791a3;font-weight:600">GH₵ 230</s></div>
<div style="display:flex;gap:6px;background:#f1f1f3;border-radius:14px;padding:4px;margin-top:14px;font-size:12px;font-weight:700">${['15 ml', '30 ml', '50 ml'].map((s, i) => `<span style="flex:1;text-align:center;padding:9px;border-radius:11px;${i === 1 ? 'background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)' : 'color:#55617a'}">${s}</span>`).join('')}</div>
<div style="display:flex;gap:8px;margin-top:14px;font-size:11px;font-weight:700;color:${TEAL}"><span class="pill" style="background:#e3f0ec;padding:7px 11px">${svg('shield', 14, TEAL, 2)} Batch checked</span><span class="pill" style="background:#e3f0ec;padding:7px 11px">${svg('truck', 14, TEAL, 2)} Delivers in Accra</span></div></div></div>
<div style="position:absolute;left:14px;right:14px;bottom:22px;height:58px;border-radius:30px;background:rgba(11,31,58,.92);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 22px;box-shadow:0 10px 30px rgba(11,31,58,.35)"><b style="font-size:15px">Add to bag · GH₵ 185</b><span style="width:44px;height:44px;border-radius:22px;background:${TEAL2};display:flex;align-items:center;justify-content:center">${svg('plus', 20, '#fff', 2.4)}</span></div>`;

const bagItem = (name, sub, price, photo, q) => `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #eee"><div style="position:relative"><div style="width:62px;height:62px;border-radius:16px;background:url('${img(photo)}') center/cover"></div><span style="position:absolute;right:-6px;top:-6px;background:${INK};color:#fff;border:2px solid #fff;border-radius:11px;font-size:10px;font-weight:800;padding:2px 6px">×${q}</span></div><div style="flex:1"><b style="font-size:13px">${name}</b><div style="font-size:11px;color:#55617a">${sub}</div></div><b style="font-size:13px">${price}</b></div>`;
const bagScreen = `
<div style="position:absolute;inset:0;background:#f6f6f7"></div>${homeScreen.replace(tabBar('Home'), '')}
<div style="position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:30"></div>
<div style="position:absolute;z-index:31;top:54px;right:0;bottom:0;width:318px;background:#fff;border-radius:28px 0 0 28px;padding:16px 16px 0;box-shadow:-10px 0 40px rgba(0,0,0,.25)">
<div style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:19px;background:#f1f1f3;display:flex;align-items:center;justify-content:center">${svg('chev', 18)}</span><b style="font-size:20px;flex:1">Your bag</b><small style="color:#55617a">3 items</small></div>
${bagItem('Vitamin C Serum', '30 ml', 'GH₵ 185', 'vitamin-c-serum.jpg', 1)}${bagItem('Shea Body Butter', '250 g', 'GH₵ 190', 'shea-body-butter.jpg', 2)}
<div style="background:#f6f6f7;border-radius:18px;padding:14px;margin-top:14px"><div style="display:flex;justify-content:space-between;font-size:13px;color:#55617a"><span>Subtotal</span><b style="color:${INK}">GH₵ 375</b></div><div style="display:flex;justify-content:space-between;font-size:13px;color:#55617a;margin-top:6px"><span>Delivery</span><b style="color:${TEAL}">Free</b></div></div>
<div style="margin-top:14px"><div style="font-size:11px;font-weight:800;letter-spacing:.8px;color:#55617a;margin-bottom:8px">PAY WITH MOBILE MONEY</div><div style="display:flex;gap:8px">${[['MTN MoMo', '#FFCC00', INK], ['Telecel', '#E60000', '#fff'], ['AT Money', '#0057B8', '#fff']].map(([n, b, c], i) => `<span style="flex:1;text-align:center;padding:10px 0;border-radius:12px;background:${b};color:${c};font-size:11px;font-weight:800;${i ? 'opacity:.55' : 'box-shadow:0 0 0 3px #0F766E55'}">${n}</span>`).join('')}</div></div>
<div style="margin-top:14px;display:flex;gap:10px;align-items:center;background:#f6f6f7;border-radius:16px;padding:12px 14px"><span style="width:34px;height:34px;border-radius:17px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#9a7a00">MTN</span><div style="flex:1"><div style="font-size:10px;color:#55617a;font-weight:700">MOBILE MONEY NUMBER</div><b style="font-size:14px">024 123 4567</b></div>${svg('shield', 20, TEAL, 2)}</div>
<div style="position:absolute;left:16px;right:16px;bottom:26px;height:54px;border-radius:16px;background:${TEAL};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">Checkout · GH₵ 375</div></div>`;

const node = (n, state) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;position:relative"><div style="width:42px;height:42px;border-radius:21px;border:2px solid ${state === 'todo' ? '#dfdfe4' : TEAL2};background:${state === 'done' ? TEAL2 : '#fff'};display:flex;align-items:center;justify-content:center;color:${state === 'done' ? '#fff' : state === 'now' ? TEAL : '#8791a3'};${state === 'now' ? 'box-shadow:0 0 0 7px rgba(43,179,166,.22)' : ''}">${svg(n, 19, 'currentColor', 2.2)}</div><small style="font-size:10px;font-weight:${state === 'todo' ? 500 : 700};color:${state === 'todo' ? '#8791a3' : INK}">${{ clip: 'Confirmed', box: 'Packed', truck: 'On the way', home: 'Delivered' }[n] || ''}</small></div>`;
ic.home = ic.home;
const orderScreen = `
<div style="position:absolute;left:14px;top:62px;width:40px;height:40px;border-radius:20px;background:rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;z-index:5">${svg('chev', 18)}</div>
<div class="pad" style="margin-top:52px"><div style="font-size:30px;font-weight:800;letter-spacing:-.8px">Order SC-1042</div><div style="font-size:13px;color:#55617a">Placed 19 Nov 2026</div></div>
<div class="pad" style="margin-top:12px;background:#f6f6f7;padding-top:2px"><div class="card" style="padding:18px;border-radius:26px"><div style="display:flex;align-items:center;gap:14px"><div style="width:54px;height:54px;border-radius:27px;background:rgba(43,179,166,.16);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 7px rgba(43,179,166,.12)">${svg('truck', 26, TEAL2, 2.2)}</div><div><div style="font-size:21px;font-weight:800;letter-spacing:-.3px">On its way to you</div><div style="font-size:13px;color:#55617a">Expected today, 3:30 pm</div></div></div>
<div style="display:flex;margin-top:20px;position:relative"><div style="position:absolute;left:12%;right:12%;top:20px;height:4px;background:#dfdfe4;border-radius:2px"></div><div style="position:absolute;left:12%;width:50%;top:20px;height:4px;background:${TEAL2};border-radius:2px"></div>${node('clip', 'done')}${node('box', 'done')}${node('truck', 'now')}${node('home', 'todo')}</div></div></div>
<div class="pad" style="margin-top:12px"><div style="background:${INK};border-radius:26px;padding:16px;color:#fff"><div style="font-size:10px;font-weight:800;letter-spacing:1px;opacity:.75;display:flex;gap:6px;align-items:center">${svg('lock', 13, '#fff', 2)} YOUR DELIVERY CODE</div><div style="display:flex;gap:9px;justify-content:center;margin:12px 0 10px">${'4827'.split('').map((d) => `<div style="width:58px;height:66px;border-radius:16px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800">${d}</div>`).join('')}</div><div style="font-size:11px;opacity:.75;line-height:1.4">Give this code to the rider only when you have your order in hand.</div></div></div>
<div class="pad" style="margin-top:12px"><div class="card" style="border:1px solid #eee;padding:2px 14px">${bagItem('Vitamin C Serum', '30 ml', 'GH₵ 185', 'vitamin-c-serum.jpg', 1)}${bagItem('Shea Body Butter', '250 g', 'GH₵ 190', 'shea-body-butter.jpg', 2)}<div style="display:flex;justify-content:space-between;padding:12px 0;font-size:15px;font-weight:800"><span>Total</span><span>GH₵ 375</span></div></div></div>`;

const darkScreen = `
<div class="pad" style="margin-top:6px"><div style="font-size:30px;font-weight:800;letter-spacing:-.8px">Saved</div><div style="font-size:13px;color:#9a9aa0">4 items you love</div></div>
<div class="pad g2" style="margin-top:14px">${tile('Vitamin C Serum', 'GH₵ 185', 'vitamin-c-serum.jpg')}${tile('Shea Body Butter', 'GH₵ 95', 'shea-body-butter.jpg')}${tile('Matte Lip Colour', 'GH₵ 70', 'matte-lip-colour.jpg')}${tile('Gentle Baby Wash', 'GH₵ 80', 'baby-wash.jpg')}</div>${tabBar('Saved')}`;

// ── the five designs ───────────────────────────────────────────────────────────────────────────────────────
const W = 1320;
const shots = [
  { file: '01-home', bg: `linear-gradient(165deg,${TEAL} 0%,#0b5d57 55%,#08413d 100%)`, color: '#fff', title: 'Beauty &amp; baby,<br>delivered to you', sub: 'Shop the whole range, with clear stock and sizes.', body: phone(homeScreen, { x: 232, y: 640, scale: 2.3 }), extra: `<div style="position:absolute;left:-180px;top:1500px;width:700px;height:700px;border-radius:50%;background:rgba(255,255,255,.07)"></div>` },
  { over: true, file: '02-authentic', bg: 'linear-gradient(180deg,#fdf3e7 0%,#f7d9c4 100%)', color: INK, title: 'Authentic.<br>Every single product.', sub: 'Batch-checked before it leaves our shelf.', body: phone(productScreen, { x: 215, y: 700, scale: 2.2, rotate: -4 }), extra: `<div style="position:absolute;right:50px;top:1180px;background:#fff;border-radius:40px;padding:30px 40px;box-shadow:0 30px 70px rgba(0,0,0,.18);font-size:40px;font-weight:800;color:${TEAL};display:flex;gap:18px;align-items:center;transform:rotate(4deg)">${svg('shield', 54, TEAL, 2)} 100% authentic</div><div style="position:absolute;left:150px;top:2590px;background:${INK};color:#fff;border-radius:40px;padding:30px 40px;box-shadow:0 30px 70px rgba(0,0,0,.25);font-size:38px;font-weight:800;transform:rotate(-4deg)">Batch &amp; expiry on your receipt</div>` },
  { file: '03-mobile-money', bg: `radial-gradient(circle at 30% 20%,#1b3a63 0%,${INK} 55%,#06101f 100%)`, color: '#fff', title: 'Pay with<br>Mobile Money', sub: 'MTN MoMo, Telecel Cash or AT Money. Approve on your phone.', body: phone(bagScreen, { x: 232, y: 700, scale: 2.3 }), extra: `<div style="position:absolute;left:-120px;top:2100px;width:520px;height:520px;border-radius:50%;background:radial-gradient(${TEAL2}88,transparent 70%)"></div>` },
  { file: '04-track-order', bg: 'linear-gradient(180deg,#e3f0ec 0%,#c8e6df 100%)', color: INK, title: 'Follow your order<br>to the door', sub: 'Live tracking and a delivery code that keeps it safe.', body: phone(orderScreen, { x: 232, y: 660, scale: 2.3 }), extra: '' },
  { file: '05-light-dark', bg: `linear-gradient(180deg,#f4f4f6 0 34%,#0b0b0d 34% 100%)`, color: INK, title: 'Light, dark and<br>Liquid Glass', sub: 'Looks at home on every iPhone, day or night.', body: phone(homeScreen.replace('Trending', 'Trending'), { x: 8, y: 800, scale: 1.9, rotate: -6 }) + phone(darkScreen, { x: 570, y: 930, scale: 1.9, rotate: 5, dark: true }), extra: '', titleColor: INK, subLight: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: 2868 }, deviceScaleFactor: 1 });
  for (const s of shots) {
    const half = s.file.startsWith('05');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="background:${s.bg};color:${s.color}">
      ${s.over ? '' : s.extra}
      <div class="cap" style="top:150px"><h1${half ? ' style="color:#0B1F3A;text-shadow:none"' : ''}>${s.title}</h1><p${half ? ' style="color:#0B1F3A"' : ''}>${s.sub}</p></div>
      ${s.body}
      ${s.over ? s.extra : ''}
    </body></html>`;
    const file = path.join(OUT, `${s.file}.html`);
    fs.writeFileSync(file, html);
    await page.goto(url(file));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${s.file}.png`) });
    fs.unlinkSync(file);
    console.log('wrote', `${s.file}.png`);
  }
  await browser.close();
})();

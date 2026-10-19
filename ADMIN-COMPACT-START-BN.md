# Ghorepawa — Admin Compact Update

এই আপডেট আগে থেকে Glass Workflow v3 চালু থাকা সাইটের জন্য। Branch: `feature/admin-compact-polish`। লাইভ সাইটে স্বয়ংক্রিয়ভাবে Deploy করা হয়নি।

## কী বদলেছে

শুধু Admin Panel-এর বড় ফন্ট ও অতিরিক্ত ফাঁকা জায়গা কমানো হয়েছে। মূল ফন্ট ১৪px, টেবিলের প্রধান লেখা ১৩px, শিরোনাম ২৪px। অর্ডারের তারিখ/সময়, ফোন, প্রোডাক্ট/দাম, Status, Moderator এবং Open/Delete আলাদা গোছানো কলামে থাকে। বড় নাম বা নোটের সংক্ষিপ্ত Preview থাকে; পুরো তথ্য Open থেকে পাওয়া যায়। আগের Status-এর রং ও Delete-এর সম্মতি বজায় আছে।

Moderator Page-এর ফন্ট, Inbox/History, permissions, কাজের নিয়ম, মূল ওয়েবসাইট, API ও Database পরিবর্তন করা হয়নি।

দুটি Admin UI সমস্যা ঠিক হয়েছে: বারবার cached তালিকা পড়লে Moderator cache-এর মেয়াদ আর বাড়তে থাকবে না; অর্ডার ও Moderator দুটো নির্বাচন ছাড়া Assign selected বোতাম চালু হবে না।

## শুধু এই ৩টি ফাইল বসান

cPanel → File Manager → `/home/bazarxbd/ghorepawa-app/public/admin`

| ফাইল | করণীয় |
|---|---|
| `admin-compact.css` | নতুন Upload |
| `admin.js` | পুরোনোটির ওপর Overwrite |
| `index.html` | পুরোনোটির ওপর Overwrite |

১. নতুন ZIP PC-তে Extract করুন এবং `public/admin` খুলুন।
২. পুরোনো `admin.js` ও `index.html` PC-তে একটি ব্যক্তিগত কপি রাখুন।
৩. আগে `admin-compact.css` Upload করুন, তারপর `admin.js` Overwrite করুন।
৪. সবশেষে `index.html` Overwrite করুন।
৫. `/admin` খুলে Ctrl+Shift+R চাপুন। দরকার হলে Browser zoom Ctrl+0 দিয়ে ১০০% করুন।

**`admin.css`, `portal.js`, `work.js` ও অন্য কোনো ফাইল Delete বা Replace করবেন না।** সম্পূর্ণ `public/admin` ফোল্ডার মুছবেন না। `public/index.html` নয়—এটি Admin-এর `public/admin/index.html`।

এই আপডেটে Node.js Stop/Restart, NPM Install, `app.mjs`, `api`, `server`, Database migration বা Environment Variable পরিবর্তন প্রয়োজন নেই।

## পরীক্ষা

Admin-এ Order List, নির্বাচন, Moderator নির্বাচন, Open, Cancel/Delete consent, Callback ও Complete-এর রং যাচাই করুন। Delete পরীক্ষা করলে কেবল চিহ্নিত পরীক্ষার অর্ডার ব্যবহার করুন। Moderator Page-এর আগের সরল Inbox ও History অপরিবর্তিত আছে কি না দেখুন।

সমস্যা হলে PC-তে রাখা আগের `admin.js` ও `index.html` একই জায়গায় ফেরত দিয়ে Hard Refresh করুন; Database স্পর্শ করবেন না। নতুন CSS ফাইল তখন আর লোড হবে না।

## ZIP সম্পর্কে

এটি সম্পূর্ণ প্রজেক্ট নয়। শুধু ৩টি প্রয়োজনীয় অ্যাপ্লিকেশন ফাইল ও নির্দেশনা/পরীক্ষার রিপোর্ট/Hash আছে। `.md` ও `.json` নির্দেশনার ফাইল PC-তে রাখতে পারবেন; সাইট চালাতে Upload প্রয়োজন নেই।

# Ghorepawa — Moderator Inbox ও Admin Search আপডেট

Branch: `feature/moderator-inbox-search-polish`। আগের Admin Compact + Glass Workflow v3 ইনস্টল থাকা সাইটের জন্য। মূল ওয়েবসাইট, Database schema, login বা অর্ডার জমা দেওয়ার নিয়ম বদলানো হয়নি।

## নতুন কী আছে

মডারেটরের বড় বড় কার্ডের বদলে ছোট সারিভিত্তিক Inbox, গুছানো ফোন/এলাকা/পণ্য/নোট এবং Open task বোতাম। মোবাইলেও ছোট সাজানো কার্ড। আগের মতো শুধু নিজের বর্তমান কাজ ও নিজের সীমিত History; কোনো ব্যবসার টাকা, গ্রাফ, Settings বা অন্য Moderator-এর কাজ যোগ করা হয়নি।

Admin Search-এ অর্ডার নম্বর, গ্রাহকের নাম, ফোন, ঠিকানা, এলাকা, জেলা ও পণ্যের নামের আংশিক মিল পাওয়া যাবে। যেমন `es-5`, `es 5`, নামের একাংশ, ফোনের কিছু সংখ্যা, `Dhanmondi` বা রাস্তার নাম। বাংলা অঙ্ক ও ইংরেজি অঙ্ক, বড়/ছোট ইংরেজি অক্ষর এবং বাংলাদেশি নম্বরের +880 ফরম্যাট সমর্থিত। একাধিক শব্দ দিলে প্রতিটি শব্দ একই অর্ডারের কোনো না কোনো তথ্যের সঙ্গে মিলতে হবে। এটি বানানভুল সংশোধন বা বাংলা-ইংরেজি অনুবাদের সার্চ নয়।

Admin-এ লেখা থামানোর প্রায় ৩৫০ মিলিসেকেন্ড পর সার্চ চলে; Search বোতামেও চলে। বর্তমান Section, Status ও Moderator Filter প্রযোজ্য থাকবে। সব অর্ডার খুঁজতে All orders এবং সব Status/Moderator নির্বাচন করুন। সব পেজের মিল খোঁজা হয়; এক পেজে ৩০টি, বাকি Next দিয়ে দেখা যায়।

সার্চের ঘর ও মিলে যাওয়া সারির চারপাশে নীল Glow ঘুরে/জ্বলে চলবে। বাইরে ক্লিক, Escape বা Stop glow চাপলে শুধু Effect বন্ধ হবে; ফলাফল মুছবে না। Clear চাপলে Keyword মুছে আগের তালিকা আসবে। ডিভাইসে কম Animation পছন্দ করা থাকলে স্থির Highlight দেখাবে।

## মোট ৭টি অ্যাপ্লিকেশন ফাইল

cPanel → File Manager → `/home/bazarxbd/ghorepawa-app`। আপনার প্রকৃত Application Root আলাদা হলে সেটিই ব্যবহার করুন।

| ফোল্ডার | নতুন Upload | পুরোনো ফাইল Overwrite |
|---|---|---|
| `api/` | কিছু নয় | `orders.js` |
| `server/` | `order-search.mjs` | কিছু নয় |
| `public/admin/` | `inbox-search.css`, `search.js` | `admin.js`, `work.js`, `index.html` |

## বসানোর ধাপ

১. ZIP কম্পিউটারে Extract করুন। এটি পুরো প্রজেক্ট নয়—কোনো পুরোনো ফোল্ডার Delete করবেন না।
২. তিনটি নতুন ফাইল আগে নিজ নিজ ফোল্ডারে Upload করুন: `server/order-search.mjs`, `public/admin/inbox-search.css`, `public/admin/search.js`।
৩. যে চারটি পুরোনো ফাইল Replace করবেন সেগুলোর ব্যক্তিগত কপি PC-তে রাখুন।
৪. কম ট্রাফিকের সময়ে Setup Node.js App থেকে সাময়িক Stop করুন, Delete/Remove নয়। বন্ধ থাকা সময়ে নতুন অর্ডার নেওয়া যাবে না।
৫. `api/orders.js`, তারপর `public/admin/work.js` ও `admin.js`, সবশেষে ওই `public/admin/index.html` Overwrite করুন।
৬. সব শেষ হলে Start করুন; আগে Stop না করে থাকলে Restart দিন। এবার Backend Search বদলেছে, তাই Restart দরকার। NPM Install বা Database Migration লাগবে না।
৭. `/admin` ও `/moderator` খুলে Ctrl+Shift+R দিন। নিজের চিহ্নিত Test Order দিয়ে নাম/ফোন/ঠিকানা/ES সার্চ, একাধিক ফলাফল, Glow বন্ধ হওয়া ও Moderator-এর কাজ পরীক্ষা করুন। Test Order ডেলিভারির জন্য পাঠাবেন না।

আগের `admin.css`, `admin-compact.css`, `portal.js`, `app.mjs`, অন্য API/Server ফাইল, `node_modules`, `public/uploads`, Database ও Environment Variables অপরিবর্তিত থাকবে। `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_ORIGIN` বদলাবেন না। `INBOX-SEARCH-...` নির্দেশনা/রিপোর্ট/হ্যাশ ফাইল PC-তেই রাখুন; সাইট চালাতে সেগুলো Upload লাগে না।

## সীমা ও ফিরে যাওয়ার ব্যবস্থা

সমস্যা হলে আগের চারটি ফাইল ফিরিয়ে Restart দিলে পুরোনো Search ও UI ফিরে আসবে; Database Reset বা Import লাগবে না। নতুন তিনটি অব্যবহৃত ফাইল থেকে যেতে পারে।

পরীক্ষা হয়েছে আলাদা Database ও Browser পরিবেশে, আসল ExonHost-এর ট্রাফিকের ক্ষমতা মাপা হয়নি। আগের প্রকাশিত Credentials এই আপডেটে ব্যবহার বা Rotate করা হয়নি। সবকিছু কখনো Error দেবে না—এমন নিশ্চয়তা নয়।

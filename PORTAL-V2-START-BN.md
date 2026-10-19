# Ghorepawa Portal v2 — ExonHost-এ বসানোর নিয়ম

এটি আগের তিনটি ফাইলের Dark UI আপডেট নয়। এবার ১১টি নতুন এবং ১১টি পরিবর্তিত অ্যাপ্লিকেশন ফাইল আছে। শুধু admin.css/admin.js বদলালে হবে না।

## ১. ফাইল নিন

`feature/portal-management-v2` Branch ব্যবহার করুন। পুরো GitHub ZIP-এর বদলে দেওয়া `ghorepawa-portal-v2-update.zip` ব্যবহার করলে শুধু প্রয়োজনীয় ফাইল পাবেন। PC-তে Extract করুন। `PORTAL-V2-MANIFEST.json`-এ কোনটি নতুন, কোনটি Replace করবেন লেখা আছে।

## ২. সঠিক ফোল্ডার খুলুন

cPanel → File Manager → `/home/bazarxbd/ghorepawa-app`। আপনার cPanel-এ Application Root আলাদা হলে সেটিই ব্যবহার করবেন। `public_html`-এ সোর্স কোড আপলোড করবেন না।

## ৩. নতুন ফাইল আগে যোগ করুন

ZIP-এর `api`, `server`, `public` ফোল্ডারের একই নামের জায়গায় নতুন ফাইল বসান। `public/shop` নামে নতুন ফোল্ডার লাগবে। সম্পূর্ণ পুরোনো ফোল্ডার Delete করবেন না।

## ৪. পরিবর্তিত ফাইল Replace করুন

কম ট্রাফিকের একটি ছোট maintenance window-তে manifest-এর modifiedFiles তালিকার ফাইলগুলো Overwrite করুন। আগের কাজ করা ফাইলের একটি ব্যক্তিগত কপি রাখুন। ফাইলের তালিকা বাইরে না বাড়িয়ে ঠিক এই আপডেটের ফাইলগুলোই বসান।

`node_modules`, `public/uploads`, Database-এর তথ্য, cPanel-এর Environment Variables, `.env` বা Passenger-এর তৈরি সেটিংস মুছবেন না। `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_ORIGIN` এই আপডেটের জন্য বদলাবেন না।

## ৫. একবার Restart

সব ফাইল বসানোর পর cPanel → Setup Node.js App → আপনার Application → Restart। Node 24, Production এবং startup `app.mjs` আগের মতো থাকবে। এই রিলিজে নতুন dependency নেই, তাই NPM Install আবার করার প্রয়োজন নেই।

প্রথম API request নতুন product/notification টেবিল ও order-এর প্রয়োজনীয় কলাম যোগ করবে। কিছুটা বেশি সময় লাগতে পারে। এই পরিবর্তন পুরোনো অর্ডার বা টিম মুছে ফেলে না। Database reset/import/drop করবেন না।

## ৬. পরীক্ষা

`/admin` খুলে Ctrl+Shift+R দিন। নতুন Dashboard, Products, Notifications এবং Settings দেখুন। Products থেকে একটি Draft তৈরি করুন; Publish করার আগে সেটি `/shop`-এ দেখা যাবে না। Publish করলে দেখা যাবে। আলাদা Private Window-তে `/moderator` লগইন করে শুধু বরাদ্দ অর্ডার দেখা যাচ্ছে কি না পরীক্ষা করুন।

চিহ্নিত Test Order দিয়ে দাম, স্টক, বরাদ্দ, বাতিল করলে স্টক ফেরত এবং নোটিফিকেশন পরীক্ষা করুন। Test Order ডেলিভারির জন্য পাঠাবেন না।

## সাউন্ড ও প্রোডাক্ট সম্পর্কে

Settings → Notifications & sound থেকে Sound চালু করে Test sound চাপুন। প্যানেল খোলা ও দৃশ্যমান থাকলে প্রায় ১৫ সেকেন্ড পরপর নতুন কার্যক্রম পরীক্ষা হয়। Browser বন্ধ থাকলে Push/SMS/Email আসে না। Desktop alert-এর জন্য browser permission লাগে।

ছবি সর্বোচ্চ ২ MB: PNG/JPEG/WebP। ছবি `public/uploads/products`-এ থাকবে—ভবিষ্যতের আপডেটে এটি রাখবেন। নতুন পণ্যের দোকান `/shop`। প্রধান landing page-এর পুরোনো ছবিতে লেখা দাম বা marketing copy Product Editor নিজে বদলায় না।

## গুরুত্বপূর্ণ সীমা

স্বয়ংক্রিয় পরীক্ষাগুলো পাস করেছে; আপনার ExonHost-এর বড় ট্রাফিক পরীক্ষা হয়নি। কোনো error কখনো হবে না—এমন নিশ্চয়তা নয়। আগের স্ক্রিনশটে প্রকাশিত গোপন তথ্যের সমাধান আলাদা পরিকল্পনায় করতে হবে; এই আপডেটের সময় হঠাৎ authentication secret বদলাবেন না। বিস্তারিত `PORTAL-V2-DEPLOY.md` ও `PORTAL-V2-TEST-REPORT.md`-এ আছে।

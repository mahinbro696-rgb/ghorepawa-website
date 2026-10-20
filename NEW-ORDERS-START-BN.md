# Ghorepawa — আলাদা New orders সেকশন

Branch: `feature/admin-new-orders-queue`। এর আগে Moderator Inbox + Search আপডেট ইনস্টল থাকতে হবে। আগের কোনো Branch বা লাইভ ExonHost এই কাজের মাধ্যমে পরিবর্তন করা হচ্ছে না।

## কাজের নিয়ম

Admin Sidebar-এ **New orders** আলাদা সেকশন। Dashboard-এর New orders শর্টকাটও একই জায়গায় খুলবে। এখানে শুধু `New` অবস্থায় থাকা এবং এখনও কাউকে বরাদ্দ না দেওয়া অর্ডার দেখা যাবে। নতুন আলাদা Database টেবিল নয়; একই অর্ডারের তালিকা ফিল্টার করে দেখানো হয়।

কয়েকটি অর্ডার নির্বাচন → সক্রিয় Moderator নির্বাচন → **Assign selected**। সার্ভারে Assign সফল হলে শুধু বরাদ্দ করা অর্ডারগুলো এই তালিকা থেকে সরবে। বাকি নতুন অর্ডার থাকবে। **All orders-এ সব অর্ডার থাকবে**, বরাদ্দ করা অর্ডারে Assigned Status ও Moderator দেখা যাবে। Assign করার জন্য কোনো অর্ডার Delete হয় না।

উদাহরণ: ১০টি নতুন অর্ডারের ৬টি Assign করলে New orders-এ ৪টি থাকবে; All orders-এ ওই ১০টিই থাকবে। সব নতুন অর্ডার Assign করা হলে খালি তালিকার বার্তা দেখাবে। পরে নতুন অর্ডার এলে আবার এই তালিকায় দেখা যাবে।

Search এই নতুন তালিকার মধ্যেই নাম/ফোন/ঠিকানা/অর্ডার নম্বর খুঁজবে। Status এবং Assigned moderator Filter এখানে নির্দিষ্ট করে রাখা আছে, যাতে আগে Assign হওয়া কাজ ঢুকে না পড়ে। **Select all শুধু বর্তমান পেজের নির্বাচনযোগ্য অর্ডারগুলো নির্বাচন করে**; অন্য পেজের অর্ডার নিজে থেকে নির্বাচন করে না।

Assign ব্যর্থ হলে অর্ডারগুলো সফল হয়েছে ধরে সরিয়ে দেওয়া হবে না। Network timeout হলে আবার চেষ্টা করার আগে বর্তমান অবস্থা যাচাই করুন। শেষ পেজের অর্ডারগুলো Assign হয়ে গেলে বাকি কাজ থাকা আগের পেজে ফিরে যাবে। Moderator-এর অনুমতি, Callback, Confirmation, History বা Delete-এর নিয়ম বদলানো হয়নি।

## চারটি ফাইল বসাবেন

cPanel → File Manager → `/home/bazarxbd/ghorepawa-app/public/admin`। আপনার প্রকৃত Application Root ভিন্ন হলে সেটির `public/admin` ব্যবহার করবেন।

নতুন ZIP PC-তে Extract করুন। ভেতরে `public/admin`-এর এই চারটি ফাইলই থাকবে:

1. `search.js` — আগেরটির ওপর Overwrite করুন।
2. `portal.js` — আগেরটির ওপর Overwrite করুন।
3. `admin.js` — আগেরটির ওপর Overwrite করুন।
4. `index.html` — সবশেষে Overwrite করুন।

আগের চারটি ফাইলের ব্যক্তিগত কপি PC-তে রাখুন। ফাইলগুলো আগে Delete করবেন না; Upload-এ Overwrite ব্যবহার করবেন। অন্য কোনো ফোল্ডার বা ফাইল মুছবেন না। বিশেষ করে `admin.css`, `admin-compact.css`, `inbox-search.css`, `work.js`, `api`, `server`, `app.mjs`, `node_modules` এবং `public/uploads` অপরিবর্তিত থাকবে।

**এই আপডেটে Node.js Restart বা Stop, NPM Install কিংবা Database পরিবর্তন প্রয়োজন নেই।** বিদ্যমান Backend-এর Filter ও Assign API ব্যবহার করা হয়েছে। `DATABASE_URL`, `BETTER_AUTH_SECRET` এবং অন্য Environment Variables বদলাবেন না।

Upload শেষে `/admin` খুলে Ctrl + Shift + R চাপুন। New orders থেকে চিহ্নিত Test Order নির্বাচন করে Assign করুন। শুধু নির্বাচিত অর্ডার সরেছে, All orders-এ রয়ে গেছে এবং নির্ধারিত Moderator পেয়েছে কি না দেখুন। Test Order ডেলিভারির জন্য পাঠাবেন না।

নতুন অর্ডার তালিকার বিদ্যমান Background Refresh-এ আসবে; কাজ নির্বাচন করা বা ফর্মে লেখার সময় তালিকা পুনরায় আঁকা থামে। তৎক্ষণাৎ যাচাই করতে Refresh চাপুন। এই অংশে কোনো নতুন Realtime Push দাবি করা হচ্ছে না।

`NEW-ORDERS-...` নির্দেশনা/manifest/report/hash ফাইল PC-তে রাখুন; সাইট চালাতে এগুলো Upload প্রয়োজন নেই। সমস্যা হলে আগের চারটি ফাইল ফিরিয়ে Hard Refresh দিন। Database Reset বা Import করবেন না; ইতিমধ্যে সফল হওয়া Assign আগের মতোই থাকবে।

পরীক্ষা আলাদা Test Database ও Browser পরিবেশে করা হয়। আপনার ExonHost-এর বাস্তব ট্রাফিক ক্ষমতা বা কখনো Error না হওয়ার নিশ্চয়তা নয়। এই আপডেটে কোনো আসল অর্ডার, গ্রাহকের তথ্য বা গোপন Credentials ব্যবহার/পরিবর্তন করা হয়নি।

# Ghorepawa Glass Workflow v3 — আপডেট বসানোর নিয়ম

এই আপডেট আগে থেকে Portal v2 চালু থাকা সাইটের জন্য। Branch: `feature/glass-workflow-v3`। Main, `deploy/exonhost-node24` এবং `feature/portal-management-v2` বদলানো হয়নি।

## ১. কোথায় বসাবেন

cPanel → File Manager → `/home/bazarxbd/ghorepawa-app`। আপনার আসল Application Root ভিন্ন হলে সেটি ব্যবহার করুন। `public_html`-এ সোর্স কোড দেবেন না।

নতুন ZIP কম্পিউটারে Extract করুন। এতে ৩টি নতুন ও ১৩টি পরিবর্তিত অ্যাপ্লিকেশন ফাইল আছে। এটি সম্পূর্ণ প্রজেক্টের ZIP নয়—কোনো পুরোনো ফোল্ডার Delete করবেন না।

| cPanel-এর জায়গা | নতুন Upload | একই নামের ফাইল Overwrite |
|---|---|---|
| `api/` | `workhistory.js` | `dashboard.js`, `export.js`, `history.js`, `notifications.js`, `orders.js`, `team.js` |
| `server/` | `workflow.mjs` | `domain.mjs`, `schema.mjs` |
| `public/admin/` | `work.js` | `admin.css`, `admin.js`, `index.html`, `portal.js` |
| `ghorepawa-app/` মূল জায়গা | কিছু নয় | `app.mjs` |

## ২. কীভাবে Upload করবেন

নতুন ফাইল তিনটি আগে নিজ নিজ ফোল্ডারে যোগ করুন। তারপর কম ট্রাফিকের সময়ে Node.js App সাময়িক Stop করে পরিবর্তিত ফাইলগুলো একই জায়গায় Overwrite করুন। এই অল্প সময়ে নতুন অর্ডার নেওয়া যাবে না। পুরোনো কাজ করা সোর্সের ব্যক্তিগত কপি রাখুন। সব ফাইল বসার পর একবার Start/Restart দিন।

`node_modules`, `.env`, `public/uploads`, অন্য API/Server ফাইল, cPanel Passenger সেটিংস, `DATABASE_URL`, `BETTER_AUTH_SECRET` এবং `APP_ORIGIN` অপরিবর্তিত রাখুন। নতুন Dependency নেই; আবার NPM Install প্রয়োজন নেই।

`WORKFLOW-V3-...` নির্দেশনা/manifest/report/hash ফাইল PC-তেই রাখতে পারবেন; অ্যাপ চালাতে এগুলো Upload প্রয়োজন নেই।

## ৩. Database পরিবর্তন

প্রথম API request-এ schema version 4-এর নতুন কলাম/টেবিল ও নিয়ন্ত্রিত Delete permission তৈরি হবে। ইনস্টলেশনে কোনো অর্ডার Delete হবে না। পুরোনো জমা-দেওয়া Moderator কাজ Admin-এর কাছে যাবে; এখনও কাজ বাকি থাকা বরাদ্দ টাস্ক থাকবে। Database Reset/Import/Drop করবেন না।

## ৪. নতুন কাজের নিয়ম

Moderator Page → My work inbox-এ শুধু নিজের বর্তমান কাজ থাকবে। ফলাফল হিসেবে Confirmed, Call Back Later বা Cancelled নির্বাচন করে নোট দিন। Callback-এর জন্য ভবিষ্যৎ সময় দিতে হবে। Submit হলে অর্ডার Inbox থেকে সরে Admin-এর কাছে যাবে এবং Moderator-এর My history-তে শুধু অর্ডার নম্বর, নিজের ফলাফল ও সময় থাকবে। ফোন, ঠিকানা, নোট বা টাকার তথ্য History-তে থাকবে না।

Admin Panel → Call Back Later-এ Callback জমা হবে। সেখান থেকে যে-কোনো সক্রিয় Moderator-কে আবার বরাদ্দ দেওয়া যাবে। Callback পরিচয়, সময় ও নোট বজায় থাকবে।

Admin Panel → Confirmed by Moderator-এ নিশ্চিত অর্ডার আসবে। Admin কুরিয়ারে পাঠানোর পর Complete/Delivered করবেন। সম্পূর্ণ সারি সবুজ হবে। Callback হলুদ, Confirmed বেগুনি, Cancelled/Unapproved লাল, Courier/Approved নীল।

## ৫. Permanent Delete-এর অর্থ

শুধু Admin নির্দিষ্ট অর্ডারের Delete খুলে সতর্কবার্তা পড়ে চেকবক্সে সম্মতি দিয়ে Yes চাপতে পারবেন। ওই অর্ডার, গ্রাহকের নাম/ফোন/ঠিকানা, সংশ্লিষ্ট নোট, অর্ডারের ইতিহাস ও Moderator receipt মূল অ্যাপের Database থেকে মুছবে। একই গ্রাহকের অন্য অর্ডার বা Catalog-এর পণ্য মুছবে না।

Admin কে কখন মুছেছেন তার একটি অর্ডার-পরিচয়বিহীন রেকর্ড এবং পুরোনো retry আটকাতে random request ID-এর hash রাখা হয়; এতে মুছে যাওয়া গ্রাহকের তথ্য থাকে না। আগে Download করা Export/Backup, Screenshot বা বাইরের সিস্টেমের কপি এই বোতাম মুছতে পারে না।

অনলাইনে খোলা Moderator পেজ প্রায় ১৫ সেকেন্ডের পরবর্তী access check-এ মুছে যাওয়া বা অন্যকে বরাদ্দ হওয়া টাস্ক সরাবে। Tab বন্ধ/লুকানো বা সংযোগ বিচ্ছিন্ন হলে সংবেদনশীল টাস্কের দৃশ্য পরিষ্কার হয়; ফিরলে পুনরায় অনুমতি যাচাই হয়। কোনো মানুষ আগে যে তথ্য দেখে বা কপি করে রেখেছে তা ফিরিয়ে নেওয়া সম্ভব নয়।

## ৬. Restart-এর পর পরীক্ষা

`/admin` ও `/moderator` খুলে Ctrl+Shift+R দিন। দুটি আলাদা Private Window-তে দুই Moderator দিয়ে অন্যের কাজ দেখা যাচ্ছে না যাচাই করুন। চিহ্নিত পরীক্ষার অর্ডারে Callback → অন্য Moderator-এ Reassign → Confirm → Courier → Complete এবং আলাদা নমুনা অর্ডারে Cancel ও Delete-এর সম্মতি পরীক্ষা করুন। আসল কাস্টমারের অর্ডার Delete করে পরীক্ষা করবেন না।

লাইভ ExonHost-এর ট্রাফিক ক্ষমতা এই আপডেটের পরীক্ষার দাবি নয়। আগের স্ক্রিনশটে প্রকাশিত Credentials এই আপডেটে ব্যবহার বা Rotate করা হয়নি; সেগুলোর সমাধান আলাদাভাবে করতে হবে।

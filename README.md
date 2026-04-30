# כמה זה עולה?

אתר סטטי בעברית וב-RTL למשחק ניחוש מחירי סופר. כל סיבוב מציג מוצר אחד ורשת אחת, והמשתמש מנחש את המחיר בעזרת סליידר. אחרי השליחה האתר חושף את המחיר של אותו מוצר ברשתות נוספות.

## מה נשאר בפרויקט

- `public/`: האתר עצמו, מוכן לאחסון סטטי
- `public/data/catalog.json`: קובץ הנתונים שהאתר טוען בזמן אמת
- `data/catalog/imported-catalog.json`: קטלוג המקור הפעיל שנבנה מקבצי מחירים רשמיים
- `scripts/import-price-files.js`: ייבוא קבצי `PriceFull` ו-`Stores`
- `scripts/enrich-images-openfoodfacts.js`: ניסיון להעשרת תמונות לפי ברקוד
- `scripts/build-static-catalog.js`: בניית קובץ הפריסה הסטטי

קוד שרת הריצה הוסר. אין יותר API, אין שרת אפליקציה, ואין לוגיקת משחק בצד שרת.

## איך האתר עובד עכשיו

1. הדפדפן טוען את `public/data/catalog.json`
2. כל לוגיקת המשחק רצה ב-`public/app.js`
3. סטטיסטיקות המשתמש נשמרות ב-`localStorage`
4. אפשר לפרסם את `public/` כמו כל אתר סטטי רגיל

## זרימת עבודה מומלצת

### לעבוד עם קבצי מחירים רשמיים

1. מעתיקים את קבצי הקמעונאים אל `data/raw/`
2. מריצים:

```bash
node scripts/import-price-files.js
node scripts/build-static-catalog.js
```

3. אם רוצים, מנסים להעשיר תמונות:

```bash
node scripts/enrich-images-openfoodfacts.js --input data/catalog/imported-catalog.json --output data/catalog/imported-catalog.json
node scripts/build-static-catalog.js
```

## מה מעלים לאינטרנט

לפריסה עצמה צריך להעלות רק את התוכן של `public/`.

זה מתאים טוב ל:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel כאתר סטטי

כל הקבצים משתמשים בנתיבים יחסיים, כך שהאתר יכול לשבת גם על דומיין מלא וגם בתוך תת-נתיב.

## עדכון מחירים

אם בוחרים במודל פשוט, אפשר לעדכן את הקטלוג פעם בשבוע:

1. מייבאים או עורכים את הנתונים
2. בונים מחדש את `public/data/catalog.json`
3. מעלים מחדש את `public/`

האתר עצמו מציג למשתמש את תאריך העדכון האחרון, כדי לא לרמוז שהמחירים חיים בזמן אמת.

## מצב הנתונים כרגע

נכון לעדכון האחרון בפרויקט, `public/data/catalog.json` נבנה מתוך קבצי מחירים רשמיים שיובאו ב־29 באפריל 2026.

## הערות מוצר ותמונות

- קבצי המחירים הרשמיים לא כוללים תמונות
- עדיף להכין תמונות מראש ולא לחפש אותן בזמן טעינת האתר
- אם משתמשים ב-Open Food Facts, עדיין כדאי לבדוק איכות וכיסוי ידנית

## הערת הרצה מקומית

כי זה אתר סטטי, לא פותחים את `index.html` ישירות בלחיצה כפולה אם רוצים לבדוק טעינת JSON. צריך לפתוח אותו דרך שרת קבצים סטטי מקומי כלשהו.

לדוגמה:

```bash
python -m http.server 3000 -d public
```
## Leaderboard and Personal Best

This project now includes an optional Supabase-backed leaderboard while keeping the site static on Vercel.

- The browser reads `window.__APP_CONFIG__.supabaseUrl`
- The browser reads `window.__APP_CONFIG__.supabasePublishableKey`
- Vercel generates `public/runtime-config.js` during `npm run build`
- Local personal best stays browser/device scoped in v1

Setup guide:

- [`SUPABASE_SETUP.md`](</C:/Users/Ido/Documents/codex proj/online comapre game/SUPABASE_SETUP.md>)

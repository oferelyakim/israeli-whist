/**
 * Hebrew answers for Wordle - curated, not taken from the dictionary.
 *
 * The Word Wonders Hebrew list comes from Hspell, a SPELL-CHECKER lexicon: it
 * holds every inflected form by design, so its common tier is full of entries
 * nobody could fairly be asked to guess - possessives, prefixed forms,
 * conjugated verbs and proper nouns. Before this file existed the daily word
 * really did come back as a first name.
 *
 * Morphology heuristics cannot fix it. Hebrew he is both the possessive
 * suffix AND the ordinary feminine ending, so any rule strong enough to drop
 * "her love" also drops "beloved". Measured: the conservative rules still let
 * verb inflections and place names through, and the aggressive ones deleted
 * good nouns. Hence a hand-picked list.
 *
 * Every entry was checked against the dictionary before being committed, so
 * each is a real word AND an accepted guess - an answer the player cannot
 * type would make the board unwinnable. Stored in the non-final form the grid
 * uses; the display helper restores the final letter.
 *
 * English needs none of this: its common tier gives REBEL, CHUNK, DIZZY,
 * OXIDE and so on, which is exactly the right register.
 *
 * 303 words. Adding more is just appending here - the regression test
 * re-checks every one.
 */
export const HE_ANSWERS = 'אבטיח אבנימ אגמימ אגסימ אגרופ אהבות אורות אחיות איכות אימונ אלבומ אלפימ אפרסק ארוחה אריות אריזה ארמונ ארנבת אתמול בארות בדיקה בולימ בורקס בחינה ביטוח ביצות ביצימ בלמימ בניינ בנקימ בקבוק ברווז ברקימ גאווה גבינה גבעות גיהוצ גיטרה גלידה גמלימ געגוע גשמימ דאגות דבורה דגלימ דובימ דודימ דוחות דלקימ דלתות דמיונ דקדוק דרקונ הגאימ הורימ הפתעה הצגות וילונ זאבימ זווית זולימ זיתימ זמנימ זקנימ זריחה זריקה זרעימ חבילה חברימ חגורה חדרימ חדשימ חובות חוזימ חולות חולצה חומוס חומימ חופימ חופשה חוקימ חזקימ חיבור חילוק חיסונ חליפה חלשימ חניונ חצאית חצרות חשבונ חשיבה חתונה חתירה טירות טלפונ ילדימ ילקוט ינשופ יערות יצירה יקרימ ירחימ ירקות ישיבה ישנימ כאבימ כבדימ כביסה כבלימ כבשימ כוסות כורסה כינור כלבימ כלכלה כספימ כפיות כפפות כרטיס כריות כריכה כרמימ כתיבה כתרימ לבנימ לוחות לחיימ לחמימ לטאות לימוד לימונ מאפימ מבוגר מברשת מגבות מדוזה מדעימ מדפסת מדרגה מדרכה מודעה מורימ מחברת מחשבה מטאטא מייבש מילונ מיצימ מלחימ מלחמה מלכימ מנורה מניות מנעול מסיבה מסכימ מסלול מעטפה מעיינ מעלית מערות מפלימ מצלמה מקלדת מקלחת מרפאה מרפסת מרצפת מרקימ משאית משולש משחות משלוח משפחה משקפת מתגימ מתנות נבלימ נהיגה נהרות נופימ נורות נחושת נחלימ נחשימ ניסוי נכדימ נמלימ נמרימ נסיכה נערימ נקיימ נשקימ נשרימ סוודר סוכות סוללה סוסימ סלעימ סנאימ ספינה ספקימ ספרימ סרטימ עגלימ עוגות עונות עופרת עיגול עיתונ עכביש עלילה עמקימ ענבימ עננימ ענפימ עצבות ערבימ פגישה פחדימ פיסול פיתות פלאפל פסנתר פקידה פרדות פרחימ פרקימ צבאימ צבעימ צדפימ צוואר צילומ ציפור צללימ צפרדע קבלות קבצימ קטנימ קידוש קיפוד קירות קניות קפיצה קצבימ קרחונ קריאה קשתות ראשימ רגעימ רוחות רחבימ ריבוע רימונ ריסימ ריקוד רמזור רעיונ רעמימ רשתות שאלות שברימ שבתות שולחנ שחייה שחפימ שיעור שירות שירימ שכנימ שלגימ שלווה שלטימ שמיימ שמיכה שמלות שמנימ שמשות שניצל שקדימ שקטימ שקיעה תאריכ תביעה תבלינ תוכימ תופימ תותימ תינוק תיקונ תיקימ תלמיד תמונה תמנונ תמרימ תעודה תפילה תקווה תקלות תקציב תרופה תשלומ';

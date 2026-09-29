// Extra entries for the word-by-word gloss: words that are not in the dictionary.
// Same format as words.js: [thai, romanization, english]. An entry becomes a real (priority) card
// only when it appears in a lesson sentence; otherwise it is lookup-only.
const THAI_GLOSSARY = [
  ["ไทย", "tai", "Thai"],
  ["นิด", "nít", "a bit"],
  ["แป๊บ", "bpáep", "a moment (a short while)"],
  ["วิสกี้", "wít-sà-gêe", "whisky"],
  ["โซดา", "soh-daa", "soda"],
  ["หลับ", "làp", "to sleep / be asleep"],
  ["อังกฤษ", "ang-grìt", "English / England"],
  ["เกิน", "gern", "exceed / over"],
  ["ค่อย", "kôi", "(with mâi) not very"],
  ["เกาหลี", "gao-lěe", "Korea"],
  ["โค้ช", "kóht", "coach"],
  ["ผู้บริหาร", "pôo-baw-rí-hǎan", "executive / manager"],
  ["ที่ปรึกษา", "têe-bprèuk-sǎa", "advisor"],
  ["ธุรกิจ", "tú-rá-gìt", "business"],
  ["ภาค", "pâak", "region"],
  ["อีสาน", "ee-sǎan", "Isan (north-east)"],
  ["อเมริกา", "à-may-rí-gaa", "America"],
  ["อังคาร", "ang-kaan", "Tuesday (day name)"],
  ["จันทร์", "jan", "Monday (day name)"],
  ["ยินดี", "yin-dee", "glad / pleased"],
  ["ต้อนรับ", "dtâwn-ráp", "to welcome"],
  ["สุขสันต์", "sùk-sǎn", "happy (greeting)"],
  ["โชค", "chôhk", "luck"],
  ["ห้า", "hâa", "five"],
  ["สิบ", "sìp", "ten"],
  ["สี่", "sèe", "four"],
  ["ห้า", "hâa", "five"],
  ["หลง", "lǒng", "lost / stray"],
  ["ทาง", "taang", "way / path; in the field of"],
  ["ไฟ", "fai", "fire / light / electric"],
  ["ฟ้า", "fáa", "sky"],
  ["เที่ยว", "tîao", "trip / outing"],
  ["เดียว", "diao", "single / only"],
  ["สอง", "sǎwng", "two"],
  ["ตัว", "dtua", "body / self"],
  ["เอง", "ayng", "self"],
  ["ข้าว", "kâao", "rice / meal"],
  ["น้ำ", "náam", "water"],
  ["มัน", "man", "oil / fat / it"],
  ["ตก", "dtòk", "fall"],
  ["ออก", "àwk", "out / exit"],
  ["เข้า", "kâo", "in / enter"],
  ["ที่", "têe", "at / place"],
  ["ไหน", "nǎi", "which / where"],
  ["ได้", "dâi", "can / get to"],
  ["จัก", "jàk", "(part of รู้จัก)"]
];
// Dictionary entries that are phrases, not words. The gloss breaks these into their individual words
// (พูดอีกครั้ง -> พูด / อีก / ครั้ง), so every word in a lesson sentence gets its own card.
const THAI_GLOSS_SPLIT = [
  "พูดอีกครั้ง", "ไม่เข้าใจ", "พูดช้าๆ หน่อย", "ภาษาไทย", "ภาษาอังกฤษ", "พูดไทยได้ไหม", "พูดอังกฤษได้ไหม",
  "สบายดีไหม", "ยินดีที่ได้รู้จัก", "ห้องน้ำอยู่ที่ไหน", "โรงพยาบาลอยู่ที่ไหน", "ราคาเท่าไร", "นี่อะไร", "ไกลไหม",
  "ลดหน่อยได้ไหม", "ลองได้ไหม", "มีอันอื่นไหม", "ช่วยโทรให้หน่อย", "เขียนให้หน่อย", "จอดตรงนี้", "ขอบคุณมาก",
  "ผมหลงทาง", "ฉันหลงทาง", "ไปโรงพยาบาล", "โทรหาตำรวจ", "โทรเรียกรถพยาบาล", "ทำของหาย", "กระเป๋าหาย", "พาสปอร์ตหาย",
  "ไม่เผ็ด", "เผ็ดน้อย", "กินที่นี่", "ห่อกลับบ้าน", "แพงไป", "เรียนภาษาไทย", "ถึงแล้ว", "หายแล้ว", "แบตหมด", "จองออนไลน์"
];
if (typeof module !== "undefined") { module.exports = THAI_GLOSSARY; module.exports.split = THAI_GLOSS_SPLIT; }

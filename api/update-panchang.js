// ==========================================
// VERCEL SERVERLESS FUNCTION
// Roz automatically Panchang (local calculation, koi limit nahi) aur
// Raashifal (free horoscope API + Gemini se Love/Career/Health/Money)
// Firestore me save karta hai (content/today document).
//
// Ye function Vercel Cron ke through roz subah automatically chalega.
// ==========================================

import { MhahPanchang } from "nepali-panchang-utils";
import admin from "firebase-admin";

// Firebase Admin SDK initialize karo (sirf ek baar, function reuse hone par dobara na ho)
if (!admin.apps.length){
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    })
  });
}
const db = admin.firestore();

// Ujjain coordinates (Simhastha/Mahakal city)
const UJJAIN_LAT = 23.1765;
const UJJAIN_LNG = 75.7885;

// 12 राशियाँ (zodiac signs) — free horoscope API keys aur Hindi names
const ZODIAC_SIGNS = [
  { key: "aries", hindi: "मेष" },
  { key: "taurus", hindi: "वृषभ" },
  { key: "gemini", hindi: "मिथुन" },
  { key: "cancer", hindi: "कर्क" },
  { key: "leo", hindi: "सिंह" },
  { key: "virgo", hindi: "कन्या" },
  { key: "libra", hindi: "तुला" },
  { key: "scorpio", hindi: "वृश्चिक" },
  { key: "sagittarius", hindi: "धनु" },
  { key: "capricorn", hindi: "मकर" },
  { key: "aquarius", hindi: "कुंभ" },
  { key: "pisces", hindi: "मीन" }
];

// रोज़ बदलने वाले श्लोकों की सूची
const SHLOK_LIST = [
  "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन। मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥ — गीता 2.47",
  "योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय। सिद्ध्यसिद्ध्योः समो भूत्वा समत्वं योग उच्यते॥ — गीता 2.48",
  "वसुधैव कुटुम्बकम्। — महोपनिषद्",
  "सत्यमेव जयते नानृतं सत्येन पन्था विततो देवयानः। — मुण्डक उपनिषद्",
  "अहिंसा परमो धर्मः धर्म हिंसा तथैव च। — महाभारत",
  "यत्र नार्यस्तु पूज्यन्ते रमन्ते तत्र देवताः। — मनुस्मृति",
  "उद्यमेन हि सिध्यन्ति कार्याणि न मनोरथैः। — पंचतंत्र",
  "श्रद्धावान् लभते ज्ञानं तत्परः संयतेन्द्रियः। — गीता 4.39",
  "अन्नदाता सुखी भव। — पारंपरिक आशीर्वाद",
  "सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः। — पारंपरिक श्लोक"
];

function getTodayShlok(){
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 86400000);
  return SHLOK_LIST[dayOfYear % SHLOK_LIST.length];
}

// ---------- पंचांग (local calculation, कोई API limit नहीं) ----------
// पुष्टि किया गया structure: result.Day.name, result.Tithi.name, result.Paksha.name,
// result.Nakshatra.name, result.Yoga.name, result.Karna.name — ये सभी पहले से हिंदी में हैं!
const VAAR_MAP = {
  "आइतबार":"रविवार", "सोमबार":"सोमवार", "मङ्गलबार":"मंगलवार", "मंगलबार":"मंगलवार",
  "बुधबार":"बुधवार", "बिहिबार":"गुरुवार", "शुक्रबार":"शुक्रवार", "शनिबार":"शनिवार"
};
function mapVaarToHindi(name){ return VAAR_MAP[name] || name; }

// सूर्योदय/सूर्यास्त की गणना (standard astronomical formula, कोई library dependency नहीं)
function calculateSunTimes(date, lat, lng){
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  // Day of year (1-366)
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - start) / 86400000) + 1;

  // Solar declination (degrees)
  const declination = 23.45 * Math.sin(rad * 360 * (284 + dayOfYear) / 365);

  const latRad = lat * rad;
  const declRad = declination * rad;

  const cosHourAngle = -Math.tan(latRad) * Math.tan(declRad);
  if (cosHourAngle > 1 || cosHourAngle < -1) return null; // polar day/night, N/A for India

  const hourAngleDeg = Math.acos(cosHourAngle) * deg;

  // Equation of time (minutes) — standard approximation
  const B = rad * 360 * (dayOfYear - 81) / 365;
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  const timezoneOffset = 5.5; // IST (UTC+5:30)
  const solarNoon = 12 - (eqTime / 60) - (lng / 15) + timezoneOffset;

  const sunriseHour = solarNoon - hourAngleDeg / 15;
  const sunsetHour = solarNoon + hourAngleDeg / 15;

  function hourToTimeStr(h){
    let hh = Math.floor(h);
    let mm = Math.round((h - hh) * 60);
    if (mm === 60){ mm = 0; hh += 1; }
    hh = ((hh % 24) + 24) % 24;
    const period = hh >= 12 ? "pm" : "am";
    let displayHour = hh % 12;
    if (displayHour === 0) displayHour = 12;
    return `${displayHour}:${String(mm).padStart(2,"0")} ${period}`;
  }

  return { sunrise: hourToTimeStr(sunriseHour), sunset: hourToTimeStr(sunsetHour) };
}

function calculatePanchang(){
  const panchang = new MhahPanchang();
  const now = new Date();
  const result = panchang.calculate(now);

  const vaar = mapVaarToHindi(result?.Day?.name || "उपलब्ध नहीं");
  const tithiName = result?.Tithi?.name || "";
  const pakshaName = result?.Paksha?.name || "";
  const nakshatra = result?.Nakshatra?.name || "उपलब्ध नहीं";
  const yoga = result?.Yoga?.name || "उपलब्ध नहीं";
  const karana = result?.Karna?.name || "उपलब्ध नहीं";

  let sunriseText = "उपलब्ध नहीं", sunsetText = "उपलब्ध नहीं";
  try{
    const sunTimes = calculateSunTimes(now, UJJAIN_LAT, UJJAIN_LNG);
    if (sunTimes){
      sunriseText = sunTimes.sunrise;
      sunsetText = sunTimes.sunset;
    }
  }catch(e){
    console.error("Sunrise/sunset calculation error:", e);
  }

  return {
    vaar,
    tithi: pakshaName ? `${pakshaName} पक्ष ${tithiName}`.trim() : tithiName,
    nakshatra,
    yoga,
    karana,
    muhurat: (sunriseText !== "उपलब्ध नहीं") ? `सूर्योदय ${sunriseText} · सूर्यास्त ${sunsetText}` : "उपलब्ध नहीं"
  };
}

// ---------- राशिफल के लिए हिंदी टेम्पलेट्स (कोई API limit नहीं) ----------
// General horoscope के अंग्रेज़ी टेक्स्ट में keywords देखकर उपयुक्त हिंदी वाक्य चुनते हैं

const LOVE_TEMPLATES = [
  "आज प्रेम संबंधों में मधुरता बनी रहेगी। अपने साथी से खुलकर बात करें।",
  "रिश्तों में धैर्य रखें, आज छोटी-मोटी गलतफहमियां हो सकती हैं।",
  "आज किसी खास व्यक्ति से मुलाकात या बातचीत आपका दिन बना सकती है।",
  "पारिवारिक रिश्तों पर ध्यान दें, आज अपनों के साथ समय बिताना शुभ रहेगा।",
  "प्रेम जीवन में स्थिरता का अनुभव होगा। भावनाओं को व्यक्त करने का अच्छा समय है।"
];

const CAREER_TEMPLATES = [
  "करियर में आज नई जिम्मेदारियां मिल सकती हैं। पूरे मनोयोग से कार्य करें।",
  "कार्यक्षेत्र में आज सावधानी और योजना बनाकर आगे बढ़ें, सफलता मिलेगी।",
  "आज सहकर्मियों के साथ तालमेल बेहतर रहेगा, टीम वर्क पर ज़ोर दें।",
  "पेशेवर जीवन में आज मेहनत का फल मिलने की संभावना है।",
  "आज कार्यस्थल पर धैर्य और अनुशासन बनाए रखें, दीर्घकालिक लाभ होगा।"
];

const HEALTH_TEMPLATES = [
  "स्वास्थ्य का विशेष ध्यान रखें, आज संतुलित आहार और आराम आवश्यक है।",
  "आज ऊर्जा स्तर अच्छा रहेगा, लेकिन अधिक परिश्रम से बचें।",
  "मानसिक शांति के लिए आज ध्यान या योग करना लाभकारी रहेगा।",
  "शरीर की सुनें, आज हल्का भोजन और पर्याप्त नींद लें।",
  "स्वास्थ्य स्थिर रहेगा, नियमित दिनचर्या बनाए रखने से लाभ होगा।"
];

const MONEY_TEMPLATES = [
  "आर्थिक मामलों में आज सावधानी बरतें, अनावश्यक खर्च से बचें।",
  "धन संबंधी निर्णय सोच-समझकर लें, आज कोई नया निवेश शुभ रह सकता है।",
  "आज आय के नए स्रोत बन सकते हैं, अवसरों पर ध्यान दें।",
  "बजट की योजना बनाकर चलें, आर्थिक स्थिति संतुलित रहेगी।",
  "आज पुराना बकाया धन वापस मिलने की संभावना है।"
];

const GENERAL_TEMPLATES = [
  "आज का दिन नई शुरुआत के लिए शुभ है। सकारात्मक सोच बनाए रखें।",
  "आज धैर्य और संयम से काम लें, परिस्थितियां आपके पक्ष में रहेंगी।",
  "आत्मविश्वास के साथ आगे बढ़ें, आज सफलता के योग बन रहे हैं।",
  "आज अपनों के साथ समय बिताएं, मानसिक शांति मिलेगी।",
  "आज सतर्क रहकर निर्णय लें, जल्दबाज़ी से बचें।"
];

// हर राशि के लिए दिन के आधार पर deterministic रूप से template चुनते हैं
// ताकि रोज़ अलग-अलग राशियों को अलग-अलग (पर consistent) प्रेडिक्शन मिले
function pickTemplate(templates, signIndex){
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 86400000);
  const idx = (dayOfYear + signIndex) % templates.length;
  return templates[idx];
}

function buildHindiBreakdown(signIndex){
  return {
    general: pickTemplate(GENERAL_TEMPLATES, signIndex),
    love: pickTemplate(LOVE_TEMPLATES, signIndex),
    career: pickTemplate(CAREER_TEMPLATES, signIndex),
    health: pickTemplate(HEALTH_TEMPLATES, signIndex),
    money: pickTemplate(MONEY_TEMPLATES, signIndex)
  };
}

async function getAllHoroscopes(){
  const results = {};
  ZODIAC_SIGNS.forEach((sign, index) => {
    const breakdown = buildHindiBreakdown(index);
    results[sign.key] = {
      hindi: sign.hindi,
      general: breakdown.general,
      love: breakdown.love,
      career: breakdown.career,
      health: breakdown.health,
      money: breakdown.money
    };
  });
  return results;
}

// ---------- Firestore सेव (Admin SDK — security rules को bypass करता है, पूरी तरह सुरक्षित) ----------
async function saveToFirestore(panchang, shlok, horoscopes){
  await db.collection("content").doc("today").set({
    tithi: panchang.tithi,
    vaar: panchang.vaar,
    nakshatra: panchang.nakshatra,
    yoga: panchang.yoga,
    karana: panchang.karana,
    muhurat: panchang.muhurat,
    shlok: shlok,
    horoscopes: JSON.stringify(horoscopes),
    updatedAt: new Date().toISOString(),
    source: "local-calc+free-api"
  }, { merge: true });
}

export default async function handler(req, res){
  try{
    const panchang = calculatePanchang();
    const shlok = getTodayShlok();
    const horoscopes = await getAllHoroscopes();

    await saveToFirestore(panchang, shlok, horoscopes);

    res.status(200).json({ success: true, ...panchang, shlok, horoscopeSignsCount: Object.keys(horoscopes).length });
  }catch(e){
    console.error("Panchang update failed:", e);
    res.status(500).json({ success: false, error: e.message, stack: e.stack });
  }
  }
    

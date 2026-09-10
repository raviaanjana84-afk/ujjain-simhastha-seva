// ==========================================
// HAWAN — real sevayein (Acharya ji se) + booking
// ==========================================
import { auth } from "./config.js";
import { createBooking } from "./booking.js";

const HAWAN_DATA = {
  samanya: {
    title: "सामान्य हवन",
    price: 2100,
    templeReceipt: 350,
    desc: "जिसमें घी, गोले, सरसों से हवन किया जाता है।"
  },
  vishesh: {
    title: "विशेष हवन",
    price: 5100,
    templeReceipt: 500,
    desc: "शत्रु पर विजय प्राप्ति हेतु, कोर्ट-कचहरी से मुक्ति हेतु हवन, जिसमें घी, गोले, सरसों एवं 21 प्रकार की विशेष जड़ी-बूटियों द्वारा हवन किया जाता है।"
  },
  mahavishesh: {
    title: "महाविशेष हवन",
    price: 11000,
    templeReceipt: 700,
    desc: "शत्रु बाधा से मुक्ति, राजनीतिक विजय प्राप्ति, कोर्ट-कचहरी से मुक्ति, लक्ष्मी प्राप्ति, संतान प्राप्ति, ऋण मुक्ति, असाध्य रोग से मुक्ति हेतु हवन, जिसमें घी, गोले, सरसों एवं विशेष 36 प्रकार की जड़ी-बूटियों तथा लाल मिर्च द्वारा हवन किया जाता है।"
  }
};

window.renderHawanMenu = () => {
  let cards = Object.keys(HAWAN_DATA).map(key => {
    const s = HAWAN_DATA[key];
    return `
      <div class="seva-card" data-key="${key}">
        <h3>${s.title}</h3>
        <p>${s.desc}</p>
        <span class="seva-price">₹${s.price.toLocaleString('en-IN')}</span>
      </div>`;
  }).join("");

  window.showOverlay(`
    <h2 class="ov-title"><i class="fa-solid fa-fire"></i> हवन विभाग</h2>
    <p style="color:var(--ink-soft); font-size:13px; margin-bottom:16px;">आचार्य हर्ष शर्मा द्वारा विधि-विधान से संपन्न</p>
    ${cards}
  `);

  document.querySelectorAll("#overlay-content .seva-card").forEach(card => {
    card.addEventListener("click", () => renderHawanDetail(card.dataset.key));
  });
};

function renderHawanDetail(key){
  const s = HAWAN_DATA[key];

  window.showOverlay(`
    <h2 class="ov-title"><i class="fa-solid fa-fire"></i> ${s.title}</h2>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.7; margin-bottom:14px;">${s.desc}</p>

    <span class="seva-price" style="display:inline-block; margin-bottom:6px;">₹${s.price.toLocaleString('en-IN')}</span>
    <p style="margin:4px 0 18px; font-size:12px; color:var(--ink-soft);">+ ₹${s.templeReceipt} मंदिर परिसर की रसीद</p>

    <button class="btn-primary" id="hawanBookBtn"><i class="fa-brands fa-whatsapp"></i> बुक करें</button>
    <button class="btn-text" id="hawanBackBtn">← वापस सेवाओं पर जाएं</button>
  `);

  document.getElementById("hawanBackBtn").addEventListener("click", () => window.renderHawanMenu());
  document.getElementById("hawanBookBtn").addEventListener("click", () => renderHawanBookingForm(key));
}

function renderHawanBookingForm(key){
  const s = HAWAN_DATA[key];
  const user = auth.currentUser;

  window.showOverlay(`
    <h2 class="ov-title"><i class="fa-solid fa-fire"></i> ${s.title}</h2>
    <p class="seva-price" style="display:block; margin-bottom:18px;">₹${s.price.toLocaleString('en-IN')}</p>

    <label class="form-label">आपका नाम</label>
    <input type="text" id="bkName" class="form-input" value="${user ? (window.__currentUserData()?.name || "") : ""}" placeholder="जैसे: राम शर्मा">

    <label class="form-label">फ़ोन नंबर</label>
    <input type="tel" id="bkPhone" class="form-input" placeholder="10 अंकों का मोबाइल नंबर">

    <label class="form-label">हवन की तारीख</label>
    <input type="date" id="bkDate" class="form-input">

    <label class="form-label">पता / स्थान</label>
    <textarea id="bkAddress" class="form-textarea" rows="3" placeholder="हवन कहाँ करवाना है?"></textarea>

    <div id="bkError" style="color:#B23A3A; font-size:13px; margin-bottom:10px; display:none;"></div>
    <button class="btn-primary" id="bkSubmitBtn"><i class="fa-brands fa-whatsapp"></i> बुक करें</button>
  `);

  document.getElementById("bkSubmitBtn").addEventListener("click", async () => {
    const name = document.getElementById("bkName").value.trim();
    const phone = document.getElementById("bkPhone").value.trim();
    const date = document.getElementById("bkDate").value;
    const address = document.getElementById("bkAddress").value.trim();
    const errBox = document.getElementById("bkError");

    if (!name || !phone || !date){
      errBox.innerText = "कृपया नाम, फ़ोन नंबर और तारीख भरें।";
      errBox.style.display = "block";
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)){
      errBox.innerText = "कृपया सही 10 अंकों का मोबाइल नंबर डालें।";
      errBox.style.display = "block";
      return;
    }

    await createBooking({
      seva: "हवन",
      sevaTitle: s.title,
      price: s.price,
      name, phone, date, address
    });

    window.hideOverlay();
  });
}

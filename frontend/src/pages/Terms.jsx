import { Link } from "react-router-dom";

const EMAIL = "Shivamkks986@gmail.com";
const S = [
  ["Service", ["CineReel AI (cinemaai.online aur Android app) AI se scripts, voiceover, captions aur videos banane ki service hai.", "Service use karke aap in Terms aur hamari Privacy Policy se sahmat hote hain."]],
  ["Account", ["Sahi jankari ke saath account banayein aur apna login surakshit rakhein.", "Ek vyakti ek se zyada free account banakar free limit ka galat fayda na uthaye.", "Service 13 saal se kam umar walon ke liye nahi hai."]],
  ["Credits, plans aur payment", ["Videos aur AI features credits se chalte hain. Free plan me limited videos milte hain.", "Paid plan 30 din ke liye hota hai; samay khatam hone par account Free plan pe aa jata hai, projects safe rehte hain.", "Payments Razorpay se hote hain. Istemal kiye gaye credits wapas nahi hote; galat charge ke liye 7 din ke andar email karein."]],
  ["Aapka content", ["Aapki upload ki gayi audio, images, logo aur scripts aapki hain. Unhe use karne ka haq aapke paas hona chahiye.", "Banaye gaye videos aap personal aur business kaam ke liye use kar sakte hain.", "AI output kabhi galat ya adhura ho sakta hai — publish karne se pehle khud check karein."]],
  ["Mana hai", ["Gair-kanooni, nafrat, hinsa, adult, dhokha ya kisi aur ke copyright wala content banana.", "Kisi ki awaaz ya chehra bina permission ke use karna.", "Service ko hack, overload ya automated tareeke se misuse karna."]],
  ["Account band karna", ["Niyam todne par hum account rok ya band kar sakte hain.", "Aap Settings → Delete my account se kabhi bhi account delete kar sakte hain (7 din baad hamesha ke liye)."]],
  ["Zimmedari ki seema", ["Service \"jaisi hai\" di jati hai. Third-party AI services band hone ya galti se hone wale nuksan ke liye hamari zimmedari kanoon ki seema tak hi hai."]],
  ["Badlav aur kanoon", ["In Terms me badlav hone par yahi page update hoga.", "Ye Terms Bharat ke kanoon ke anusar hain."]],
];

export default function Terms() {
  return (
    <div data-testid="terms-page" className="min-h-screen bg-[#0A0A0B] text-zinc-300 px-5 py-12 safe-top safe-bottom">
      <div className="max-w-2xl mx-auto">
        <Link to="/" data-testid="terms-home-link" className="label-mono text-xs text-zinc-500">← CINEREEL.AI</Link>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mt-6">Terms of Service</h1>
        <p className="text-xs text-zinc-500 mt-2">Last updated: June 2026 · CineReel AI (cinemaai.online)</p>
        {S.map(([h, items]) => (
          <section key={h} className="mt-8">
            <h2 className="text-base md:text-lg font-semibold text-white">{h}</h2>
            <ul className="mt-3 space-y-2 text-sm list-disc pl-5">{items.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        ))}
        <p className="mt-8 text-sm">Sawaal: <a data-testid="terms-contact-email" href={`mailto:${EMAIL}`} className="text-[#E2FF3D] underline">{EMAIL}</a> · <Link to="/privacy" className="underline">Privacy Policy</Link></p>
      </div>
    </div>
  );
}

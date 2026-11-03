import { Link } from "react-router-dom";

const EMAIL = "Shivamkks986@gmail.com";
const S = [
  ["Hum kaunsi jankari lete hain", ["Account: naam, email, profile photo (Google login par) aur login ki jankari.", "Aapka content: scripts, topics, upload ki gayi audio, images, brand kit (logo, rang) aur banaye gaye videos.", "Payment: plan aur transaction ki details. Card/UPI ki jankari Razorpay sambhalta hai — hum use store nahi karte.", "App usage: kaunsi screens/features use hue (Firebase Analytics), device notification token (phone alerts ke liye)."]],
  ["Jankari ka istemal", ["Aapke liye script, voiceover, captions aur video banana.", "Login, credits, plan aur payment manage karna.", "Video ready hone jaise alerts bhejna aur service ko behtar banana.", "Hum aapka data bechte nahi hain aur ads ke liye share nahi karte."]],
  ["Third-party services", ["Aapka content sirf feature chalane ke liye in services ko bheja jata hai: OpenAI, Google Gemini, ElevenLabs, fal.ai (AI generation), Razorpay (payments), Google Firebase (login, analytics, notifications, storage).", "Har service ki apni privacy policy lagu hoti hai."]],
  ["Suraksha aur storage", ["Data encrypted connection (HTTPS) par bheja jata hai. Har user sirf apne projects dekh sakta hai.", "Secret keys aur payment verification sirf server par hote hain."]],
  ["Data kitne samay tak", ["Account active rehne tak aapka data rakha jata hai. Plan khatam hone par bhi projects delete nahi hote.", "Account ya data delete karwane ke liye neeche diye email par likhein — 30 din ke andar delete kiya jayega."]],
  ["Aapke adhikar", ["Apna data dekhna, sudharna, download ya delete karwana.", "Phone settings se notifications band karna."]],
  ["Bachche", ["CineReel AI 13 saal se kam umar ke bachchon ke liye nahi hai."]],
  ["Badlav", ["Is policy me badlav hone par yahi page update hoga, upar tareekh ke saath."]],
];

export default function Privacy() {
  return (
    <div data-testid="privacy-page" className="min-h-screen bg-[#0A0A0B] text-zinc-300 px-5 py-12 safe-top safe-bottom">
      <div className="max-w-2xl mx-auto">
        <Link to="/" data-testid="privacy-home-link" className="label-mono text-xs text-zinc-500">← CINEREEL.AI</Link>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mt-6">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mt-2">Last updated: June 2026 · CineReel AI (cinemaai.online)</p>
        {S.map(([h, items]) => (
          <section key={h} className="mt-8">
            <h2 className="text-base md:text-lg font-semibold text-white">{h}</h2>
            <ul className="mt-3 space-y-2 text-sm list-disc pl-5">{items.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        ))}
        <section className="mt-8">
          <h2 className="text-base md:text-lg font-semibold text-white">Contact</h2>
          <p className="mt-3 text-sm">Privacy se jude sawaal ya data delete request: <a data-testid="privacy-contact-email" href={`mailto:${EMAIL}`} className="text-[#E2FF3D] underline">{EMAIL}</a></p>
        </section>
      </div>
    </div>
  );
}

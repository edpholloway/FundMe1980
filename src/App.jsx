import React, { useState, useEffect, useMemo, useRef } from "react";
import { Camera, Ruler, Clock, Settings as SettingsIcon, Check, X, Upload, MapPin, Phone, TrendingDown, ListChecks, Search, Loader2, Scissors } from "lucide-react";
import { db, auth } from "./firebase.js";
import { doc, getDoc, setDoc, onSnapshot, collection, runTransaction } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import LOGO_URI from "./logo.js";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');`;

const COLORS = {
  pine: "#0E0E0E",      // near-black, matches logo background
  sage: "#5C7A2E",      // muted olive-green for secondary text
  mint: "#E8F0DC",      // pale green-tinted panel background
  marigold: "#7EAB27",  // the logo's signature lime-green
  paper: "#FFFFFF",     // pure white, matches logo's "FUND" text
  ink: "#151515",
};

// Admin accounts: add your own contact info here (whatever you used to
// sign up) to see and edit platform settings like commission. Everyone
// else won't see the settings icon or any commission details at all.
const ADMIN_CONTACTS = ["YOUR_EMAIL_OR_PHONE_HERE"];

function suggestPrice(sqft, weedFeet) {
  const base = 10;
  const mow = (Number(sqft) || 0) * 0.018;
  const trim = (Number(weedFeet) || 0) * 0.12;
  return Math.max(8, Math.round(base + mow + trim));
}
function fmtMoney(n) {
  return `$${Number(n).toFixed(2)}`;
}
function fmtCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function FundMe1980App() {
  const [user, setUser] = useState(null); // firebase auth user
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [onboardName, setOnboardName] = useState("");
  const [onboardContact, setOnboardContact] = useState("");

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [settings, setSettings] = useState({ commissionPct: 5, defaultDurationHours: 4 });
  const [showSettings, setShowSettings] = useState(false);

  const [tab, setTab] = useState("browse");
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const [form, setForm] = useState({ area: "", sqft: "", weedFeet: "", photo: null, startPrice: "", durationHours: 4 });
  const [bidJobId, setBidJobId] = useState(null);
  const [bidAmount, setBidAmount] = useState("");

  // --- Anonymous auth: gives every visitor a stable id without a login form ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("anonymous sign-in failed", e);
        }
      }
    });
    return () => unsub();
  }, []);

  // --- Load / create profile once we have a user ---
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "profiles", user.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch (e) {
        console.error("profile load failed", e);
      }
      setProfileLoading(false);
    })();
  }, [user]);

  // --- Real-time settings ---
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      } else {
        setDoc(doc(db, "settings", "global"), { commissionPct: 5, defaultDurationHours: 4 });
      }
    });
    return () => unsub();
  }, []);

  // --- Real-time jobs feed, no polling needed ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "jobs"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setJobs(list);
      setJobsLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // --- Close expired auctions. Any open client can do this; Firestore
  // transaction below prevents double-processing. For a production site,
  // move this into a scheduled Cloud Function so it fires even when
  // nobody has the app open. ---
  useEffect(() => {
    jobs.forEach((j) => {
      if (j.status === "open" && j.endsAt <= now) {
        closeAuction(j.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, jobs]);

  async function closeAuction(jobId) {
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "jobs", jobId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const j = snap.data();
        if (j.status !== "open" || j.endsAt > Date.now()) return; // already handled or not expired
        if (j.bids && j.bids.length > 0) {
          const winner = [...j.bids].sort((a, b) => a.amount - b.amount)[0];
          tx.update(ref, { status: "closed", winner });
        } else {
          tx.update(ref, { status: "expired" });
        }
      });
    } catch (e) {
      console.error("close auction failed", e);
    }
  }

  async function completeOnboarding() {
    if (!onboardName || !onboardContact || !user) return;
    const p = { id: user.uid, name: onboardName, contact: onboardContact };
    setProfile(p);
    try {
      await setDoc(doc(db, "profiles", user.uid), p);
    } catch (e) {
      console.error("profile save failed", e);
    }
  }

  const suggested = useMemo(() => suggestPrice(form.sqft, form.weedFeet), [form.sqft, form.weedFeet]);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Resize/compress so the photo stays well under Firestore's 1MB
      // per-document limit — we're storing it inline instead of using
      // Cloud Storage, which now requires a paid billing plan.
      const img = new Image();
      img.onload = () => {
        const maxW = 640;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.6);
        setForm((f) => ({ ...f, photo: compressed }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function submitJob() {
    if (!form.area || !form.sqft || !profile) return;
    setSaving(true);
    const start = Number(form.startPrice) || suggested;
    const duration = Number(form.durationHours) || settings.defaultDurationHours;
    const jobId = uid();

    const job = {
      photo: form.photo || null, // already compressed to a small base64 jpeg
      area: form.area,
      sqft: Number(form.sqft),
      weedFeet: Number(form.weedFeet) || 0,
      posterId: profile.id,
      posterName: profile.name,
      posterContact: profile.contact,
      startPrice: start,
      currentPrice: start,
      durationHours: duration,
      createdAt: Date.now(),
      endsAt: Date.now() + duration * 60 * 60 * 1000,
      status: "open",
      bids: [],
    };

    try {
      await setDoc(doc(db, "jobs", jobId), job);
    } catch (e) {
      console.error("job save failed", e);
      alert("Couldn't save that job — check your connection and try again.");
    }

    setForm({ area: "", sqft: "", weedFeet: "", photo: null, startPrice: "", durationHours: settings.defaultDurationHours });
    setSaving(false);
    setTab("activity");
  }

  function openBid(job) {
    setBidJobId(job.id);
    setBidAmount("");
  }

  async function submitBid() {
    if (!profile || !bidJobId) return;
    const amt = Number(bidAmount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "jobs", bidJobId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const j = snap.data();
        if (j.status !== "open") throw new Error("Auction already closed");
        if (amt >= j.currentPrice) throw new Error("Bid must be lower than current price");
        const newBid = { bidderId: profile.id, provider: profile.name, contact: profile.contact, amount: amt, time: Date.now() };
        tx.update(ref, { currentPrice: amt, bids: [...(j.bids || []), newBid] });
      });
      setBidJobId(null);
    } catch (e) {
      console.error("bid failed", e);
      alert(e.message || "Bid failed — someone may have just bid lower. Try again.");
    }
    setSaving(false);
  }

  async function saveSettings(next) {
    try {
      await setDoc(doc(db, "settings", "global"), next);
    } catch (e) {
      console.error("settings save failed", e);
    }
  }

  const openJobs = jobs.filter((j) => j.status === "open");
  const closedJobs = jobs.filter((j) => j.status !== "open");
  const myJobs = profile ? jobs.filter((j) => j.posterId === profile.id) : [];
  const myBids = profile ? jobs.filter((j) => (j.bids || []).some((b) => b.bidderId === profile.id)) : [];
  const isAdmin = profile ? ADMIN_CONTACTS.some((c) => c.toLowerCase() === profile.contact.trim().toLowerCase()) : false;

  if (profileLoading) return <LoadingScreen />;
  if (!profile) {
    return (
      <OnboardScreen
        name={onboardName} setName={setOnboardName}
        contact={onboardContact} setContact={setOnboardContact}
        onSubmit={completeOnboarding}
      />
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.paper, minHeight: "100vh", color: COLORS.ink }}>
      <style>{`
        ${FONT_IMPORT}
        .display { font-family: 'Fraunces', serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .stripe-track { background: repeating-linear-gradient(90deg, ${COLORS.mint} 0px, ${COLORS.mint} 16px, #c3e8c9 16px, #c3e8c9 32px); border-radius: 999px; overflow: hidden; position: relative; }
        .stripe-fill { background: repeating-linear-gradient(90deg, ${COLORS.sage} 0px, ${COLORS.sage} 16px, ${COLORS.pine} 16px, ${COLORS.pine} 32px); height: 100%; transition: width 0.4s linear; }
        button { cursor: pointer; }
        input:focus { outline: 2px solid ${COLORS.sage}; }
      `}</style>

      <header style={{ background: COLORS.pine }} className="px-5 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <img src={LOGO_URI} alt="FundMe1980 — You bid. We connect. You earn." style={{ height: 40 }} />
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: COLORS.mint }}>Hi, {profile.name.split(" ")[0]}</span>
            {isAdmin && (
              <button onClick={() => setShowSettings(true)} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
                <SettingsIcon size={16} color={COLORS.paper} />
              </button>
            )}
          </div>
        </div>
        <nav className="flex gap-1 rounded-full p-1" style={{ background: "rgba(255,255,255,0.12)" }}>
          <NavBtn active={tab === "browse"} onClick={() => setTab("browse")} icon={<Search size={14} />} label="Browse" />
          <NavBtn active={tab === "post"} onClick={() => setTab("post")} icon={<Upload size={14} />} label="Post a lawn" />
          <NavBtn active={tab === "activity"} onClick={() => setTab("activity")} icon={<ListChecks size={14} />} label="My activity" />
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {jobsLoading && <LoadingRow />}

        {tab === "browse" && !jobsLoading && (
          <>
            <h1 className="display text-3xl font-semibold mb-1" style={{ color: COLORS.pine }}>Open jobs</h1>
            <p className="text-sm mb-6" style={{ color: COLORS.sage }}>Bid lower than the current price. Lowest bid wins when time runs out.</p>
            <div className="space-y-4">
              {openJobs.length === 0 && <EmptyState text="No auctions running yet. Be the first to post a lawn." />}
              {openJobs.map((job) => (
                <JobCard key={job.id} job={job} now={now} profile={profile} onBid={() => openBid(job)} settings={settings} />
              ))}
            </div>
          </>
        )}

        {tab === "post" && (
          <PostForm form={form} setForm={setForm} suggested={suggested} onPhoto={handlePhoto} onSubmit={submitJob} saving={saving} />
        )}

        {tab === "activity" && !jobsLoading && (
          <div>
            <h1 className="display text-3xl font-semibold mb-4" style={{ color: COLORS.pine }}>My activity</h1>
            <h2 className="font-semibold text-sm mb-2" style={{ color: COLORS.sage }}>JOBS I POSTED</h2>
            <div className="space-y-3 mb-8">
              {myJobs.length === 0 && <EmptyState text="You haven't posted a lawn yet." />}
              {myJobs.map((job) =>
                job.status === "open"
                  ? <JobCard key={job.id} job={job} now={now} profile={profile} onBid={null} settings={settings} />
                  : <ClosedCard key={job.id} job={job} settings={settings} profile={profile} />
              )}
            </div>
            <h2 className="font-semibold text-sm mb-2" style={{ color: COLORS.sage }}>JOBS I BID ON</h2>
            <div className="space-y-3">
              {myBids.length === 0 && <EmptyState text="You haven't placed any bids yet." />}
              {myBids.map((job) =>
                job.status === "open"
                  ? <JobCard key={job.id} job={job} now={now} profile={profile} onBid={() => openBid(job)} settings={settings} />
                  : <ClosedCard key={job.id} job={job} settings={settings} profile={profile} />
              )}
            </div>
          </div>
        )}
      </main>

      {bidJobId != null && (
        <BidModal job={jobs.find((j) => j.id === bidJobId)} amount={bidAmount} setAmount={setBidAmount}
          onCancel={() => setBidJobId(null)} onSubmit={submitBid} saving={saving} />
      )}
      {showSettings && isAdmin && (
        <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className="flex-1 px-3 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-1.5 transition"
      style={{ background: active ? COLORS.marigold : "transparent", color: active ? COLORS.ink : COLORS.paper }}>
      {icon} {label}
    </button>
  );
}
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.paper }}>
      <Loader2 className="animate-spin" size={24} color={COLORS.sage} />
    </div>
  );
}
function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-8 justify-center" style={{ color: COLORS.sage }}>
      <Loader2 className="animate-spin" size={16} /> Loading jobs…
    </div>
  );
}
function OnboardScreen({ name, setName, contact, setContact, onSubmit }) {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.pine, minHeight: "100vh" }} className="flex items-center justify-center px-5">
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: COLORS.paper }}>
        <img src={LOGO_URI} alt="FundMe1980" style={{ height: 44 }} className="mb-3" />
        <p className="text-sm mb-5" style={{ color: COLORS.sage }}>Set up your account to post lawns or bid on jobs. Must be 18 or older.</p>
        <label className="text-sm font-medium block mb-1" style={{ color: COLORS.pine }}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-3 border text-sm" style={{ borderColor: COLORS.mint }} />
        <label className="text-sm font-medium block mb-1" style={{ color: COLORS.pine }}>Phone or email</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} className="w-full rounded-lg px-3 py-2 mb-4 border text-sm" style={{ borderColor: COLORS.mint }} />
        <button onClick={onSubmit} disabled={!name || !contact} className="w-full py-2.5 rounded-xl font-semibold"
          style={{ background: name && contact ? COLORS.pine : "#ccc", color: COLORS.paper }}>
          Create account
        </button>
      </div>
    </div>
  );
}
function EmptyState({ text }) {
  return (
    <div className="rounded-2xl py-10 text-center" style={{ background: COLORS.mint }}>
      <Scissors size={26} color={COLORS.sage} className="mx-auto mb-2" />
      <p style={{ color: COLORS.sage }}>{text}</p>
    </div>
  );
}
function PostForm({ form, setForm, suggested, onPhoto, onSubmit, saving }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: COLORS.mint }}>
      <h2 className="display text-xl font-semibold mb-4" style={{ color: COLORS.pine }}>Tell us about the lawn</h2>
      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
          <MapPin size={14} className="inline mr-1" /> Neighborhood / address
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
            className="mt-1 w-full rounded-lg px-3 py-2 border-0 text-sm" placeholder="e.g. Oakwood St, unit 12" style={{ background: COLORS.paper }} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
            <Ruler size={14} className="inline mr-1" /> Lawn size (sq ft)
            <input type="number" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })}
              className="mt-1 w-full rounded-lg px-3 py-2 border-0 text-sm" placeholder="3000" style={{ background: COLORS.paper }} />
          </label>
          <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
            Weed-whacking (linear ft)
            <input type="number" value={form.weedFeet} onChange={(e) => setForm({ ...form, weedFeet: e.target.value })}
              className="mt-1 w-full rounded-lg px-3 py-2 border-0 text-sm" placeholder="100" style={{ background: COLORS.paper }} />
          </label>
        </div>
        <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
          <Camera size={14} className="inline mr-1" /> Photo of the lawn
          <input type="file" accept="image/*" onChange={onPhoto} className="mt-1 w-full text-sm" />
        </label>
        {form.photo && <img src={form.photo} alt="lawn preview" className="rounded-lg w-full max-h-48 object-cover" />}
        <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.paper }}>
          <span className="text-sm" style={{ color: COLORS.sage }}>Suggested starting price</span>
          <span className="mono font-bold text-lg" style={{ color: COLORS.pine }}>{fmtMoney(suggested)}</span>
        </div>
        <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
          Your starting price (leave blank to use suggestion)
          <input type="number" value={form.startPrice} onChange={(e) => setForm({ ...form, startPrice: e.target.value })}
            className="mt-1 w-full rounded-lg px-3 py-2 border-0 text-sm" placeholder={String(suggested)} style={{ background: COLORS.paper }} />
        </label>
        <label className="text-sm font-medium" style={{ color: COLORS.pine }}>
          <Clock size={14} className="inline mr-1" /> Auction length (hours)
          <input type="number" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })}
            className="mt-1 w-full rounded-lg px-3 py-2 border-0 text-sm" style={{ background: COLORS.paper }} />
        </label>
        <button onClick={onSubmit} disabled={saving || !form.area || !form.sqft}
          className="mt-2 py-3 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: COLORS.pine, color: COLORS.paper }}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : null} Start the auction
        </button>
      </div>
    </div>
  );
}
function JobCard({ job, now, profile, onBid, settings }) {
  const remaining = job.endsAt - now;
  const elapsedPct = Math.min(100, Math.max(0, ((now - job.createdAt) / (job.endsAt - job.createdAt)) * 100));
  const bids = job.bids || [];
  const lowestBidder = bids.length > 0 ? [...bids].sort((a, b) => a.amount - b.amount)[0] : null;
  const isMine = job.posterId === profile.id;
  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: COLORS.mint, background: "#fff" }}>
      <div className="flex gap-4 p-4">
        {job.photo ? (
          <img src={job.photo} alt="lawn" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: COLORS.mint }}>
            <Camera size={22} color={COLORS.sage} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold truncate" style={{ color: COLORS.pine }}>{job.area}{isMine && <span className="text-xs ml-2" style={{ color: COLORS.sage }}>(yours)</span>}</p>
            <span className="mono text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: COLORS.mint, color: COLORS.pine }}>
              <Clock size={11} className="inline mb-0.5 mr-1" />{fmtCountdown(remaining)}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: COLORS.sage }}>{job.sqft.toLocaleString()} sq ft mow · {job.weedFeet} ft trim</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <span className="text-xs block" style={{ color: COLORS.sage }}>Current price</span>
              <span className="mono text-2xl font-bold" style={{ color: COLORS.marigold, WebkitTextStroke: `0.5px ${COLORS.pine}` }}>{fmtMoney(job.currentPrice)}</span>
            </div>
            <span className="text-xs" style={{ color: COLORS.sage }}>{bids.length} bid{bids.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="stripe-track h-2 mt-2 w-full"><div className="stripe-fill" style={{ width: `${elapsedPct}%` }} /></div>
        </div>
      </div>
      {onBid && !isMine && (
        <div className="px-4 pb-4">
          <button onClick={onBid} className="w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: COLORS.pine, color: COLORS.paper }}>
            <TrendingDown size={16} /> Place a lower bid
          </button>
        </div>
      )}
      {isMine && lowestBidder && (
        <div className="px-4 pb-4 text-xs" style={{ color: COLORS.sage }}>
          Leading bid: {fmtMoney(lowestBidder.amount)} by {lowestBidder.provider}
        </div>
      )}
    </div>
  );
}
function ClosedCard({ job, settings, profile }) {
  const won = job.status === "closed";
  const isWinner = won && profile && job.winner.bidderId === profile.id;
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: COLORS.mint, background: won ? COLORS.mint : "#f2f2f0" }}>
      <div className="flex items-center justify-between">
        <p className="font-semibold" style={{ color: COLORS.pine }}>{job.area}</p>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: won ? COLORS.pine : COLORS.sage, color: "#fff" }}>
          {won ? "Matched" : "No bids — expired"}
        </span>
      </div>
      {won && (
        <div className="mt-2 text-sm" style={{ color: COLORS.ink }}>
          <p>Final price: <span className="mono font-bold">{fmtMoney(job.winner.amount)}</span></p>
          {isWinner && (
            <p className="text-xs mt-1" style={{ color: COLORS.sage }}>
              You'll receive: {fmtMoney(job.winner.amount * (1 - settings.commissionPct / 100))}
            </p>
          )}
          <div className="mt-2 pt-2 border-t flex flex-wrap gap-4" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <div><span className="text-xs block" style={{ color: COLORS.sage }}>Customer contact</span><span className="text-sm font-medium">{job.posterName} · {job.posterContact}</span></div>
            <div><span className="text-xs block" style={{ color: COLORS.sage }}>Mower contact</span><span className="text-sm font-medium">{job.winner.provider} · {job.winner.contact}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
function BidModal({ job, amount, setAmount, onCancel, onSubmit, saving }) {
  if (!job) return null;
  const invalid = !amount || Number(amount) <= 0 || Number(amount) >= job.currentPrice;
  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: "rgba(27,67,50,0.5)" }}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" style={{ background: COLORS.paper }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="display text-lg font-semibold" style={{ color: COLORS.pine }}>Bid on {job.area}</h3>
          <button onClick={onCancel}><X size={18} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: COLORS.sage }}>Current price is <b className="mono">{fmtMoney(job.currentPrice)}</b>. Your bid must be lower.</p>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`under ${job.currentPrice}`}
          className="w-full rounded-lg px-3 py-2 mb-3 border text-sm mono" style={{ borderColor: COLORS.mint }} />
        <button disabled={invalid || saving} onClick={onSubmit} className="w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2"
          style={{ background: invalid || saving ? "#ccc" : COLORS.pine, color: COLORS.paper }}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Submit bid
        </button>
      </div>
    </div>
  );
}
function SettingsModal({ settings, onSave, onClose }) {
  const [local, setLocal] = useState(settings);
  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: "rgba(27,67,50,0.5)" }}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" style={{ background: COLORS.paper }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-lg font-semibold" style={{ color: COLORS.pine }}>Platform settings</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: COLORS.sage }}>These apply platform-wide, shared by everyone using this app.</p>
        <label className="text-sm font-medium block mb-3" style={{ color: COLORS.pine }}>
          Commission (%)
          <input type="number" value={local.commissionPct} onChange={(e) => setLocal({ ...local, commissionPct: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg px-3 py-2 border text-sm mono" style={{ borderColor: COLORS.mint }} />
        </label>
        <label className="text-sm font-medium block mb-4" style={{ color: COLORS.pine }}>
          Default auction length (hours)
          <input type="number" value={local.defaultDurationHours} onChange={(e) => setLocal({ ...local, defaultDurationHours: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg px-3 py-2 border text-sm mono" style={{ borderColor: COLORS.mint }} />
        </label>
        <button onClick={() => { onSave(local); onClose(); }} className="w-full py-2.5 rounded-xl font-semibold" style={{ background: COLORS.pine, color: COLORS.paper }}>
          Save
        </button>
      </div>
    </div>
  );
}

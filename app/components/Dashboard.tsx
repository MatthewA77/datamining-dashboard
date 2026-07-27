"use client";

/**
 * Dashboard — Home Credit risk analytics (v2 data).
 * Style: light "eco-analytics SaaS" — sage page background, a dark sidebar with
 * per-tab nav, KPI cards (one dark feature card + sparkline motifs), and rich
 * charts (donut, vertical bars with tooltip, dumbbell). Per-phase via the sidebar.
 *
 * Figures trace to v2 outputs (phase1–4 reports + output/*.csv). No external chart libraries.
 */

import { useState, useEffect, type ReactNode } from "react";

/* ============================ DATA ============================ */

const BOOK = { customers: 307511, defaulters: 24825, repaid: 282686, defaultRate: 8.07 };

const FUNNEL = [
  { stage: "Semua feature yang dibuat", n: 680, note: "Hasil rekayasa dari tabel mentah." },
  { stage: "Buang yang nyaris konstan", n: 493, note: "−187 kolom yang hampir tak pernah berubah." },
  { stage: "Buang duplikat", n: 311, note: "−182 kolom yang mengulang sinyal sama." },
  { stage: "Inti informatif disimpan", n: 185, note: "Sinyal yang benar-benar layak dianalisis." },
];

type Pair = { key: string; profile: string; ratio: string; paid: { id: string; v: number }; def: { id: string; v: number }; dScore: string; dAge: string; plain: string };
const PAIRS: Pair[] = [
  { key: "small", profile: "Pinjaman kecil & hati-hati", ratio: "≈2× penghasilan", paid: { id: "P1", v: 0.496 }, def: { id: "D0", v: 0.367 }, dScore: "−0.13", dAge: "−5 th", plain: "Pinjaman kecil yang serupa — tapi yang gagal bayar skornya 0,13 lebih rendah dan 5 tahun lebih muda." },
  { key: "levered", profile: "Pinjaman ketat", ratio: "≈6–7× penghasilan", paid: { id: "P0", v: 0.519 }, def: { id: "D1", v: 0.408 }, dScore: "−0.11", dAge: "−4 th", plain: "Sama-sama meminjam besar. Yang gagal bayar skornya 0,11 lebih rendah dan 4 tahun lebih muda." },
  { key: "affluent", profile: "Mapan, pinjaman besar", ratio: "≈3,5× penghasilan", paid: { id: "P2", v: 0.558 }, def: { id: "D2", v: 0.460 }, dScore: "−0.10", dAge: "−1 th", plain: "Profil nyaris identik. Satu-satunya beda nyata: skor kredit 0,10 lebih rendah." },
];
type Persona = { id: string; name: string; share: number; score: number; count: number; color: string; trait: string };
const PAID_PERSONAS: Persona[] = [
  { id: "P0", name: "Mapan, skor kuat", share: 29.0, score: 0.52, count: 81860, color: "#5B8DEF", trait: "Tertua, masa kerja terpanjang, leverage tinggi — tapi skor kuat." },
  { id: "P1", name: "Konservatif, pinjaman kecil", share: 37.0, score: 0.5, count: 104585, color: "#4FD1C5", trait: "Pinjaman terkecil; skor kredit solid." },
  { id: "P2", name: "Prima, penghasilan tinggi", share: 34.0, score: 0.56, count: 96241, color: "#9B5DE5", trait: "Penghasilan tertinggi, kredit besar terjangkau, skor teratas." },
];
const DEF_PERSONAS: Persona[] = [
  { id: "D0", name: "Muda, pinjaman kecil, skor lemah", share: 35.2, score: 0.37, count: 8739, color: "#FF6B6B", trait: "Termuda; pinjaman terkecil; skor terendah." },
  { id: "D1", name: "Terlampau terungkit", share: 30.5, score: 0.41, count: 7572, color: "#F5A524", trait: "Penghasilan rendah, kredit besar — paling ketat." },
  { id: "D2", name: "Menengah, skor rendah", share: 34.3, score: 0.46, count: 8514, color: "#E15B9E", trait: "Penghasilan lebih tinggi, pinjaman terjangkau, tapi skor lemah." },
];

type Rule = { label: string; value: number; tag: string; action: string };
const RISK_RULES: Rule[] = [
  { label: "Kedua skor kredit eksternal rendah", value: 18.4, tag: "2,3× rata-rata", action: "Sinyal terkuat, tolak atau batasi plafon." },
  { label: "Kerja baru (1–3 th) + skor rendah", value: 17.1, tag: "2,1× rata-rata", action: "Verifikasi slip gaji & masa kerja." },
  { label: "Peminjam pria + skor rendah", value: 16.3, tag: "2,0× rata-rata", action: "Penanda tambahan, bukan penyebab utama." },
  { label: "Muda + skor rendah", value: 16.0, tag: "2,0× rata-rata", action: "Riwayat kredit tipis, beri plafon awal." },
];
const SAFE_RULES: Rule[] = [
  { label: "Kedua skor eksternal tinggi", value: 97.7, tag: "~38.000 orang", action: "Segmen aman terbesar, percepat & upsell." },
  { label: "Skor tinggi + wilayah peringkat atas", value: 97.8, tag: "hampir pasti", action: "Nyaris pasti lunas." },
  { label: "Kerja 15+ th + skor tinggi", value: 97.6, tag: "mapan", action: "Karier mapan, risiko minimal." },
];

const RISK_BARS = [
  { label: "Dua skor rendah", value: 18.4, sub: "Kedua skor eksternal rendah · 2,3× rata-rata" },
  { label: "Kerja baru", value: 17.1, sub: "1–3 th + skor rendah · 2,1× rata-rata" },
  { label: "Pria", value: 16.3, sub: "Pria + skor rendah · 2,0× rata-rata" },
  { label: "Muda", value: 16.0, sub: "Muda + skor rendah · 2,0× rata-rata" },
];

const METHODS = [
  { name: "Lensa 1: Interquartile Range (IQR)", pct: 31.0, n: 95455, note: "Jaring terluas (Statistik Dasar). Mencari nilai yang jauh melebihi batas atas/bawah distribusi normal. Menemukan keanehan tunggal, misal: nominal pinjaman terlalu besar." },
  { name: "Lensa 2: Z-Score", pct: 9.8, n: 30035, note: "Lensa menengah (Standar Deviasi). Mengukur seberapa menyimpang sebuah fitur dari rata-ratanya. Lebih ketat, hanya menangkap nilai yang sangat di luar kewajaran." },
  { name: "Lensa 3: Isolation Forest (AI)", pct: 1.0, n: 3076, note: "Lensa tertajam (Machine Learning). Mencari anomali pola multivariat (gabungan beberapa kolom). Misal: penghasilan wajar, tapi kombinasinya dengan masa kerja dan cicilan menjadi sangat mustahil." },
];
const TABS = [
  { id: "overview", label: "Overview", title: "Portofolio Overview", kicker: "Apa yang memprediksi kredit macet, dalam satu layar" },
  { id: "about", label: "About Dataset", title: "About Dataset", kicker: "Gambaran umum dataset Home Credit Default Risk" },
  { id: "phase1", label: "Preprocessing", title: "Fase 1 · Preprocessing Data", kicker: "Membuat data mentah tepercaya" },
  { id: "phase2", label: "Clustering", title: "Fase 2 · Clustering", kicker: "Yang lunas vs yang gagal bayar" },
  { id: "phase3", label: "Association Rules", title: "Fase 3 · Association Rules", kicker: "Kombinasi yang menandakan risiko" },
  { id: "phase4", label: "Outlier", title: "Fase 4 · Outlier", kicker: "Deteksi kredit yang tak lazim" },
  { id: "dictionary", label: "Rules & Directory", title: "Rules & Features Directory", kicker: "Glosarium fitur dan penjelasan lengkap aturan asosiasi" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Chip = { tone: "up" | "down" | "warn" | "flat"; text: string };
type Kpi = { label: string; value: string; icon: string; chip: Chip };
const KPIS: Record<TabId, Kpi[]> = {
  overview: [
    { label: "Total kredit", value: "307,511", icon: "users", chip: { tone: "flat", text: "seluruh buku dianalisis" } },
    { label: "Lunas", value: "282,686", icon: "check", chip: { tone: "up", text: "91,9% dari buku" } },
    { label: "Gagal bayar", value: "24,825", icon: "alert", chip: { tone: "down", text: "8,1% dari buku" } },
    { label: "Antrean review", value: "3,983", icon: "target", chip: { tone: "warn", text: "review manual" } },
  ],
  about: [
    { label: "Tabel dataset", value: "8", icon: "layers", chip: { tone: "flat", text: "saling terhubung relasional" } },
    { label: "Kunci penghubung", value: "3", icon: "target", chip: { tone: "flat", text: "SK_ID_CURR / BUREAU / PREV" } },
    { label: "Kolom dideskripsikan", value: "219", icon: "chart", chip: { tone: "flat", text: "HomeCredit_columns_description" } },
    { label: "Baris tabel inti", value: "307,511", icon: "users", chip: { tone: "flat", text: "application_train" } },
  ],
  phase1: [
    { label: "Baris data kredit", value: "307,511", icon: "users", chip: { tone: "flat", text: "baris disimpan" } },
    { label: "Kolom disimpan", value: "185", icon: "layers", chip: { tone: "down", text: "dari 680" } },
    { label: "Nilai mustahil diperbaiki", value: "~55,000", icon: "alert", chip: { tone: "warn", text: "kode sentinel" } },
    { label: "Nilai kosong tersisa", value: "0", icon: "check", chip: { tone: "up", text: "bersih total" } },
  ],
  phase2: [
    { label: "Buku gagal bayar", value: "24,825", icon: "alert", chip: { tone: "down", text: "8,1%" } },
    { label: "Buku lunas", value: "282,686", icon: "check", chip: { tone: "up", text: "91,9%" } },
    { label: "Rata-rata selisih skor", value: "0,11", icon: "target", chip: { tone: "warn", text: "petunjuknya" } },
    { label: "Pasangan kembar", value: "3", icon: "layers", chip: { tone: "flat", text: "look-alike" } },
  ],
  phase3: [
    { label: "Aturan disimpan", value: "18", icon: "layers", chip: { tone: "flat", text: "dari 81.710" } },
    { label: "Risiko terkuat", value: "2,3×", icon: "alert", chip: { tone: "down", text: "kedua skor rendah" } },
    { label: "Segmen teraman", value: "97,7%", icon: "check", chip: { tone: "up", text: "~38.000 lunas" } },
    { label: "Aturan perilaku", value: "6", icon: "chart", chip: { tone: "flat", text: "ide produk" } },
  ],
  phase4: [
    { label: "Terflag (jaring terluas)", value: "31%", icon: "alert", chip: { tone: "warn", text: "lensa IQR" } },
    { label: "Keyakinan tinggi", value: "30,122", icon: "target", chip: { tone: "warn", text: "≥2 lensa sepakat" } },
    { label: "Sinyal risiko", value: "3,983", icon: "alert", chip: { tone: "down", text: "review manual" } },
    { label: "Data error", value: "0", icon: "check", chip: { tone: "up", text: "semua cek lolos" } },
  ],
  dictionary: [
    { label: "Total Fitur", value: "11", icon: "layers", chip: { tone: "flat", text: "fitur utama" } },
    { label: "Aturan Disimpan", value: "18", icon: "chart", chip: { tone: "flat", text: "dari 81.710" } },
    { label: "Aturan Risiko", value: "8", icon: "alert", chip: { tone: "down", text: "prediksi gagal" } },
    { label: "Aturan Aman", value: "4", icon: "check", chip: { tone: "up", text: "prediksi lunas" } },
  ],
};

const DATASET_FILES = [
  { file: "application_train.csv", rows: "307.511", role: "Tabel inti — 1 baris/nasabah, punya TARGET" },
  { file: "application_test.csv", rows: "48.744", role: "Tabel inti tanpa TARGET (untuk submission Kaggle)" },
  { file: "bureau.csv", rows: "1.716.428", role: "Kredit nasabah di lembaga lain (biro kredit)" },
  { file: "bureau_balance.csv", rows: "27.299.925", role: "Saldo bulanan tiap kredit di bureau" },
  { file: "previous_application.csv", rows: "1.670.214", role: "Aplikasi pinjaman sebelumnya di Home Credit" },
  { file: "POS_CASH_balance.csv", rows: "10.001.358", role: "Saldo bulanan pinjaman POS/cash Home Credit" },
  { file: "credit_card_balance.csv", rows: "3.840.312", role: "Saldo bulanan kartu kredit Home Credit" },
  { file: "installments_payments.csv", rows: "13.605.401", role: "Riwayat pembayaran angsuran Home Credit" },
];

const RELATION_KEYS = [
  { key: "SK_ID_CURR", color: "#16A34A", desc: "ID nasabah/aplikasi saat ini — kunci utama tabel inti (application).", files: ["application_train.csv", "application_test.csv", "bureau.csv", "previous_application.csv", "POS_CASH_balance.csv", "credit_card_balance.csv", "installments_payments.csv"] },
  { key: "SK_ID_BUREAU", color: "#9B5DE5", desc: "ID satu kredit di biro kredit eksternal — penghubung bureau ↔ bureau_balance.", files: ["bureau.csv", "bureau_balance.csv"] },
  { key: "SK_ID_PREV", color: "#F5A524", desc: "ID satu aplikasi/kredit Home Credit sebelumnya — penghubung previous_application ↔ POS/CC/installments.", files: ["previous_application.csv", "POS_CASH_balance.csv", "credit_card_balance.csv", "installments_payments.csv"] },
];

const REL_NODES: Record<string, { x: number; y: number; w: number; h: number; label: string }> = {
  app: { x: 280, y: 18, w: 210, h: 42, label: "application_{train|test}" },
  bureau: { x: 84, y: 114, w: 160, h: 42, label: "bureau" },
  prev: { x: 386, y: 114, w: 200, h: 42, label: "previous_application" },
  bbal: { x: 54, y: 212, w: 190, h: 42, label: "bureau_balance" },
  pos: { x: 288, y: 212, w: 138, h: 42, label: "POS_CASH_balance" },
  cc: { x: 448, y: 212, w: 148, h: 42, label: "credit_card_balance" },
  inst: { x: 618, y: 212, w: 158, h: 42, label: "installments_payments" },
};
const REL_EDGES: { from: string; to: string; key: string }[] = [
  { from: "app", to: "bureau", key: "SK_ID_CURR" },
  { from: "app", to: "prev", key: "SK_ID_CURR" },
  { from: "bureau", to: "bbal", key: "SK_ID_BUREAU" },
  { from: "prev", to: "pos", key: "SK_ID_PREV" },
  { from: "prev", to: "cc", key: "SK_ID_PREV" },
  { from: "prev", to: "inst", key: "SK_ID_PREV" },
];
const KEYCOLOR: Record<string, string> = { SK_ID_CURR: "#16A34A", SK_ID_BUREAU: "#9B5DE5", SK_ID_PREV: "#F5A524" };

const RELATION_CARDINALITY = [
  { rel: "application → bureau", card: "1 nasabah : rata-rata 5,6 kredit eksternal (maks 116)", proof: "1,72 jt baris untuk 305.811 nasabah" },
  { rel: "bureau → bureau_balance", card: "1 kredit : banyak bulan", proof: "27,3 jt baris (tabel terbesar)" },
  { rel: "application → previous_application", card: "1 nasabah : 0, 1, 2, … aplikasi lampau", proof: "1,67 jt baris" },
  { rel: "previous_application → POS/CC/installments", card: "1 kredit lampau : banyak bulan/angsuran", proof: "10 jt / 3,8 jt / 13,6 jt baris" },
];

const CONVENTIONS = [
  { title: "Kolom DAYS_* bernilai negatif", desc: "Dihitung relatif ke hari aplikasi. Contoh: DAYS_BIRTH = −12000 → berumur ~32,9 th; DAYS_EMPLOYED = −365 → mulai kerja 1 th lalu." },
  { title: "Sentinel 365243 pada DAYS_EMPLOYED", desc: "Nilai positif ~1000 tahun yang mustahil — kode 'tidak bekerja' (mayoritas pensiunan). Ditangani khusus di Fase 1 (jadi NaN + flag)." },
  { title: "MONTHS_BALANCE (tabel bulanan)", desc: "Bulan relatif: −1 = snapshot terbaru, −2 = dua bulan lalu, dan seterusnya." },
  { title: "SK_DPD / STATUS", desc: "DPD = Days Past Due (hari keterlambatan). Makin besar makin parah." },
  { title: "Kolom moneter (AMT_*)", desc: "Sangat right-skewed (ekor panjang) → di Fase 1 di-winsorize." },
  { title: "Kolom FLAG_*", desc: "Biner 1/0 (Ya/Tidak)." },
];

const PIPELINE_STEPS = [
  { n: "1", title: "Cleaning", desc: "Imputasi missing, tangani anomali (365243, XNA), buang kolom >50% kosong, winsorize kolom moneter." },
  { n: "2", title: "Feature Engineering", desc: "Tiap tabel pendukung diagregasi ke level SK_ID_CURR (count/mean/max/sum; one-hot → mean/sum) lalu di-left join → train_master (307.511 × 573). Prefix BURO_/PREV_/POS_/CC_/INST_ menandai sumbernya." },
  { n: "3", title: "Encoding + Feature Selection", desc: "Menghasilkan 185 fitur terpilih dari 573 kandidat." },
  { n: "4", title: "Output", desc: "Dua dataset akhir: numerik (untuk clustering) dan kategorikal (untuk Apriori / association rules)." },
];

/* ============================ HELPERS ============================ */

const fmt = (n: number) => n.toLocaleString("en-US");

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    users: <><circle cx="6" cy="6" r="2.4" /><path d="M2 13c0-2.2 1.8-3.4 4-3.4S10 10.8 10 13" /><path d="M11 5.7a2.2 2.2 0 010 4.2M11.5 13c0-1.8-1-2.9-2.3-3.3" /></>,
    check: <><path d="M2.5 8.3l3 3 8-8" /></>,
    alert: <><path d="M8 2.2l6 10.6H2z" /><path d="M8 6.4v3M8 11.2v.1" /></>,
    target: <><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.4" /></>,
    layers: <><path d="M8 2.2l6 3.2-6 3.2-6-3.2z" /><path d="M2 9.2l6 3.2 6-3.2" /></>,
    chart: <><path d="M2.4 13.6V7.6M6.2 13.6V3.4M10 13.6V9M13.6 13.6V5.6" /></>,
    grid: <><rect x="2" y="2" width="4.6" height="4.6" rx="1.1" /><rect x="9.4" y="2" width="4.6" height="4.6" rx="1.1" /><rect x="2" y="9.4" width="4.6" height="4.6" rx="1.1" /><rect x="9.4" y="9.4" width="4.6" height="4.6" rx="1.1" /></>,
    info: <><circle cx="8" cy="8" r="5.6" /><path d="M8 7.3v4M8 5.1v.15" /></>,
    filter: <><path d="M2.2 3.2h11.6M4.6 8h6.8M6.7 12.8h2.6" /></>,
    cluster: <><circle cx="6" cy="6.4" r="3.1" /><circle cx="10.3" cy="9.7" r="3.1" /></>,
    link: <><path d="M6.3 9.7L9.7 6.3" /><path d="M6.9 4.5l.9-.9a2.6 2.6 0 013.6 3.6l-.9.9" /><path d="M9.1 11.5l-.9.9a2.6 2.6 0 01-3.6-3.6l.9-.9" /></>,
    search: <><circle cx="6.9" cy="6.9" r="4.3" /><path d="M10.2 10.2L14 14" /></>,
    book: <><path d="M2.4 3.6c1.6-.8 3.7-.8 5.6.2v8.8c-1.9-1-4-1-5.6-.2z" /><path d="M13.6 3.6c-1.6-.8-3.7-.8-5.6.2v8.8c1.9-1 4-1 5.6-.2z" /></>,
    bell: <><path d="M8 2.4c-1.9 0-3 1.6-3 3.6 0 3.5-1.3 4.1-1.3 4.7h8.6c0-.6-1.3-1.2-1.3-4.7 0-2-1.1-3.6-3-3.6z" /><path d="M6.6 13a1.5 1.5 0 002.8 0" /></>,
    chevronDown: <path d="M4 6.2l4 4 4-4" />,
    plus: <path d="M8 2.6v10.8M2.6 8h10.8" />,
  };
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function DeltaChip({ chip }: { chip: Chip }) {
  const arrow = chip.tone === "up" ? "" : chip.tone === "down" ? "" : "";
  return <span className={`cx-chip cx-chip-${chip.tone}`}>{arrow && <b>{arrow}</b>}{chip.text}</span>;
}

const SPARK: Record<Chip["tone"], number[]> = {
  up: [28, 38, 34, 48, 42, 58, 52, 72, 64, 86],
  down: [82, 70, 76, 58, 64, 46, 50, 32, 38, 20],
  warn: [46, 60, 40, 56, 38, 62, 42, 66, 36, 54],
  flat: [50, 55, 47, 52, 46, 54, 48, 52, 47, 51],
};

function Spark({ tone }: { tone: Chip["tone"] }) {
  return (
    <div className={`cx-spark cx-spark-${tone}`} aria-hidden="true">
      {SPARK[tone].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
    </div>
  );
}

function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="cx-kpis">
      {items.map((k, i) => (
        <div key={k.label} className={`cx-kpi ${i === 0 ? "cx-kpi-feature" : ""}`}>
          <div className="cx-kpi-top"><span className="cx-kpi-label">{k.label}</span><span className="cx-kpi-icon"><Icon name={k.icon} /></span></div>
          <div className="cx-kpi-body">
            <div className="cx-kpi-val">{k.value}</div>
            <Spark tone={k.chip.tone} />
          </div>
          <DeltaChip chip={k.chip} />
        </div>
      ))}
    </div>
  );
}

/* ============================ CHARTS ============================ */

type Seg = { label: string; value: number; color: string };
function Donut({ segments, center, sub }: { segments: Seg[]; center: string; sub: string }) {
  const [h, setH] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 54, SW = 15, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = segments.map((s, i) => { const len = (s.value / total) * C; const startDeg = -90 + (acc / C) * 360; acc += len; return { s, i, len, startDeg }; });
  const big = h === null ? center : fmt(segments[h].value);
  const small = h === null ? sub : segments[h].label;
  return (
    <div className="cx-donutwrap">
      <div className="cx-donut">
        <svg viewBox="0 0 140 140" width="150" height="150">
          {arcs.map((a) => (
            <g key={a.i} transform={`rotate(${a.startDeg} 70 70)`}>
              <circle cx="70" cy="70" r={R} fill="none" stroke={a.s.color} strokeWidth={SW}
                strokeDasharray={`${a.len} ${C - a.len}`}
                style={{ opacity: h === null || h === a.i ? 1 : 0.28, transition: "opacity .2s", cursor: "pointer" }}
                onMouseEnter={() => setH(a.i)} onMouseLeave={() => setH(null)} />
            </g>
          ))}
        </svg>
        <div className="cx-donut-center"><div className="cx-donut-big">{big}</div><div className="cx-donut-sub">{small}</div></div>
      </div>
      <div className="cx-legend">
        {segments.map((s, i) => (
          <div key={s.label} className="cx-legrow" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} style={{ opacity: h === null || h === i ? 1 : 0.5 }}>
            <span className="cx-legdot" style={{ background: s.color }} />
            <span className="cx-leglabel">{s.label}</span>
            <span className="cx-legval">{fmt(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VBars({ items }: { items: { label: string; value: number; sub: string }[] }) {
  const [h, setH] = useState<number>(0);
  const max = Math.max(...items.map((i) => i.value)) * 1.12;
  const a = items[h];
  return (
    <div className="cx-vbars">
      <div className="cx-vtip" style={{ left: `${((h + 0.5) / items.length) * 100}%` }}>
        <div className="cx-vtip-t">{a.label} · <b>{a.value}%</b></div>
        <div className="cx-vtip-s">{a.sub}</div>
      </div>
      <div className="cx-vplot">
        {items.map((it, i) => (
          <div key={it.label} className="cx-vcol" onMouseEnter={() => setH(i)}>
            <div className={`cx-vbar ${i === h ? "cx-vbar-on" : ""}`} style={{ height: `${(it.value / max) * 100}%` }} />
            <div className="cx-vlabel">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureFunnel() {
  const [h, setH] = useState<number | null>(null);
  return (
    <div className="cx-funnel">
      {FUNNEL.map((f, i) => (
        <div key={f.stage} className="cx-frow" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <div className="cx-fhead"><span>{f.stage}</span><span className="cx-fnum">{f.n}</span></div>
          <div className="cx-track"><span className="cx-fill cx-fill-grad" style={{ width: `${(f.n / 680) * 100}%`, opacity: h === null || h === i ? 1 : 0.45 }} /></div>
          <div className="cx-fnote" style={{ opacity: h === i ? 1 : 0.6 }}>{f.note}</div>
        </div>
      ))}
    </div>
  );
}

function Dumbbell() {
  const [h, setH] = useState<number | null>(null);
  const W = 860, AX0 = 210, AX1 = 720, VMIN = 0.3, VMAX = 0.6;
  const xOf = (v: number) => AX0 + ((v - VMIN) / (VMAX - VMIN)) * (AX1 - AX0);
  const rows = [64, 118, 172];
  const ticks = [0.3, 0.4, 0.5, 0.6];
  const active = h === null ? null : PAIRS[h];
  return (
    <div>
      <svg viewBox={`0 0 ${W} 236`} className="cx-dumbbell" role="img" aria-label="Selisih skor kredit pada tiga pasangan kembar; yang gagal bayar selalu berskor lebih rendah.">
        <circle cx={AX0} cy="22" r="6" fill="#1FB894" />
        <text x={AX0 + 12} y="26" className="cx-svg-leg">Kembaran yang lunas</text>
        <circle cx={AX0 + 155} cy="22" r="6" fill="#FF6B6B" />
        <text x={AX0 + 167} y="26" className="cx-svg-leg">Gagal bayar</text>
        <line x1={AX0} y1="198" x2={AX1} y2="198" className="cx-svg-axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} y1="198" x2={xOf(t)} y2="204" className="cx-svg-axis" />
            <text x={xOf(t)} y="218" className="cx-svg-tick" textAnchor="middle">{t.toFixed(2)}</text>
          </g>
        ))}
        <text x={AX0} y="232" className="cx-svg-axlab">SKOR KREDIT EKSTERNAL — MAKIN TINGGI MAKIN AMAN →</text>
        {PAIRS.map((p, i) => {
          const y = rows[i], xd = xOf(p.def.v), xp = xOf(p.paid.v), on = h === i;
          return (
            <g key={p.key} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} style={{ cursor: "pointer" }}>
              <rect x="0" y={y - 26} width={W} height="52" fill="transparent" />
              <text x={AX0 - 16} y={y - 3} className="cx-svg-prof" textAnchor="end" style={{ opacity: on || h === null ? 1 : 0.5 }}>{p.profile}</text>
              <text x={AX0 - 16} y={y + 12} className="cx-svg-profsub" textAnchor="end">{p.ratio} · {p.paid.id} vs {p.def.id}</text>
              <line x1={xd} y1={y} x2={xp} y2={y} stroke={on ? "#7C8AA8" : "#333A52"} strokeWidth={on ? 3 : 2} />
              <circle cx={xd} cy={y} r={on ? 9 : 8} fill="#FF6B6B" stroke="#fff" strokeWidth="2.5" />
              <circle cx={xp} cy={y} r={on ? 9 : 8} fill="#1FB894" stroke="#fff" strokeWidth="2.5" />
              <text x={xd - 14} y={y + 4} className="cx-svg-val" textAnchor="end" fill="#FF6B6B">{p.def.v.toFixed(2)}</text>
              <text x={xp + 14} y={y + 4} className="cx-svg-val" textAnchor="start" fill="#1FB894">{p.paid.v.toFixed(2)}</text>
              <text x={W - 6} y={y - 3} className="cx-svg-delta" textAnchor="end">{p.dScore} skor</text>
              <text x={W - 6} y={y + 12} className="cx-svg-deltasub" textAnchor="end">{p.dAge} usia</text>
            </g>
          );
        })}
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: active ? "#FF6B6B" : "#5B8DEF" }}>
        {active ? active.plain : "Titik merah (gagal bayar) selalu di kiri titik hijau (lunas), pinjaman sama, skor lebih rendah."}
      </div>
    </div>
  );
}

function RuleColumn({ title, hint, rules, color }: { title: string; hint: string; rules: Rule[]; color: string }) {
  const [h, setH] = useState<number | null>(null);
  return (
    <div className="cx-card">
      <div className="cx-card-head"><span className="cx-card-title">{title}</span><span className="cx-note">{hint}</span></div>
      <ul className="cx-rules">
        {rules.map((r, i) => (
          <li key={r.label} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
            <div className="cx-rhead"><span className="cx-rlabel">{r.label}</span><span className="cx-rval" style={{ color }}>{r.value}%</span></div>
            <div className="cx-track"><span className="cx-fill" style={{ width: `${r.value}%`, background: color, opacity: h === null || h === i ? 1 : 0.4 }} /></div>
            <div className="cx-raction" style={{ opacity: h === i ? 1 : 0.6 }}><span style={{ color, fontWeight: 700 }}>{r.tag}</span> · {r.action}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MethodFunnel() {
  const [h, setH] = useState<number | null>(null);
  return (
    <div className="cx-methods">
      {METHODS.map((m, i) => (
        <div key={m.name} className="cx-mrow" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <div className="cx-fhead"><span>{m.name}</span><span className="cx-mnum">{m.pct}% · {fmt(m.n)}</span></div>
          <div className="cx-track"><span className="cx-fill cx-fill-warm" style={{ width: `${m.pct}%`, opacity: h === null || h === i ? 1 : 0.4 }} /></div>
          <div className="cx-fnote" style={{ opacity: h === i ? 1 : 0.6 }}>{m.note}</div>
        </div>
      ))}
    </div>
  );
}

function PersonaList({ personas, color, of }: { personas: Persona[]; color: string; of: string }) {
  const [h, setH] = useState<number | null>(null);
  return (
    <ul className="cx-personas">
      {personas.map((p, i) => (
        <li key={p.id} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <span className="cx-pdot" style={{ background: color }} />
          <div className="cx-pname">{p.name}<span className="cx-ptrait" style={{ opacity: h === i ? 1 : 0.6 }}>{p.trait}</span></div>
          <div className="cx-pnums"><span className="cx-num">{p.share}%</span><span className="cx-num" style={{ color }}>{p.score.toFixed(2)}</span></div>
          <div className="cx-pcap"><span>dari {of}</span><span>skor</span></div>
        </li>
      ))}
    </ul>
  );
}

/* ============================ EXTRA DATA ============================ */

const fmtK = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(0) + "k" : `${n}`);

type FKey = "INCOME" | "CREDIT" | "CI" | "AGE" | "EMP" | "EXT2" | "EXT3" | "ANN";
type Prof = { id: string; book: "paid" | "default"; count: number; color: string } & Record<FKey, number>;
const PROFILES: Prof[] = [
  { id: "P0", book: "paid", count: 81860, color: "#5B8DEF", INCOME: 126754, CREDIT: 840601, CI: 6.92, AGE: 48.0, EMP: 7.1, EXT2: 0.519, EXT3: 0.580, ANN: 0.276 },
  { id: "P1", book: "paid", count: 104585, color: "#4FD1C5", INCOME: 133511, CREDIT: 239976, CI: 2.04, AGE: 43.5, EMP: 5.6, EXT2: 0.496, EXT3: 0.526, ANN: 0.129 },
  { id: "P2", book: "paid", count: 96241, color: "#9B5DE5", INCOME: 236969, CREDIT: 786131, CI: 3.52, AGE: 41.8, EMP: 6.3, EXT2: 0.558, EXT3: 0.473, ANN: 0.155 },
  { id: "D0", book: "default", count: 8739, color: "#FF6B6B", INCOME: 136818, CREDIT: 256964, CI: 2.10, AGE: 38.4, EMP: 4.1, EXT2: 0.367, EXT3: 0.432, ANN: 0.132 },
  { id: "D1", book: "default", count: 7572, color: "#F5A524", INCOME: 125972, CREDIT: 753129, CI: 6.38, AGE: 43.7, EMP: 5.4, EXT2: 0.408, EXT3: 0.528, ANN: 0.273 },
  { id: "D2", book: "default", count: 8514, color: "#E15B9E", INCOME: 212967, CREDIT: 689377, CI: 3.48, AGE: 40.7, EMP: 5.3, EXT2: 0.460, EXT3: 0.322, ANN: 0.162 },
];
const FEATS: { key: FKey; label: string; short: string; kind: "money" | "x" | "yr" | "score" }[] = [
  { key: "EXT2", label: "Skor kredit eksternal", short: "Skor", kind: "score" },
  { key: "EXT3", label: "Skor kredit eksternal (2)", short: "Skor 3", kind: "score" },
  { key: "INCOME", label: "Penghasilan", short: "Gaji", kind: "money" },
  { key: "CREDIT", label: "Ukuran pinjaman", short: "Pinjaman", kind: "money" },
  { key: "CI", label: "Kredit ÷ penghasilan (leverage)", short: "Leverage", kind: "x" },
  { key: "ANN", label: "Anuitas ÷ penghasilan", short: "Beban", kind: "x" },
  { key: "AGE", label: "Umur", short: "Umur", kind: "yr" },
  { key: "EMP", label: "Masa kerja", short: "Kerja", kind: "yr" },
];
const PAIR_IDX: [number, number][] = [[1, 3], [0, 4], [2, 5]]; // [paid, default] indexes into PROFILES
const fRange = (k: FKey) => { const xs = PROFILES.map((p) => p[k]); return [Math.min(...xs), Math.max(...xs)] as const; };
const fmtFeat = (kind: string, v: number) => kind === "money" ? fmtK(v) : kind === "x" ? v.toFixed(1) + "×" : kind === "yr" ? v.toFixed(0) : v.toFixed(2);

const MI_ITEMS = [
  { label: "Skor eksternal · EXT_SOURCE_2", value: 0.0154, color: "#9B5DE5" },
  { label: "Skor eksternal · EXT_SOURCE_3", value: 0.0127, color: "#9B5DE5" },
  { label: "Jumlah anuitas", value: 0.0095, color: "#5B8DEF" },
  { label: "Harga barang", value: 0.0065, color: "#5B8DEF" },
  { label: "Jumlah kredit", value: 0.0063, color: "#5B8DEF" },
  { label: "Masa kerja", value: 0.0051, color: "#5B8DEF" },
  { label: "Umur", value: 0.0035, color: "#5B8DEF" },
  { label: "Pendidikan", value: 0.0022, color: "#5B8DEF" },
  { label: "Pekerjaan", value: 0.0021, color: "#5B8DEF" },
  { label: "Jenis penghasilan", value: 0.0020, color: "#5B8DEF" },
];
const SOURCES: Seg[] = [
  { label: "Formulir aplikasi", value: 86, color: "#5B8DEF" },
  { label: "Aplikasi sebelumnya", value: 45, color: "#9B5DE5" },
  { label: "Biro kredit", value: 21, color: "#4FD1C5" },
  { label: "Kartu kredit", value: 12, color: "#F5A524" },
  { label: "Angsuran", value: 11, color: "#E15B9E" },
  { label: "POS", value: 10, color: "#8A90A6" },
];
const LIFT_ITEMS = [
  { label: "Dua skor rendah", value: 2.28, color: "#FF6B6B" },
  { label: "Kerja baru + skor rendah", value: 2.12, color: "#FF6B6B" },
  { label: "Pria + skor rendah", value: 2.03, color: "#FF6B6B" },
  { label: "Skor rendah + barang menengah", value: 1.99, color: "#FF6B6B" },
  { label: "Muda + skor rendah", value: 1.98, color: "#FF6B6B" },
  { label: "Pinjaman menengah + skor rendah", value: 1.95, color: "#FF6B6B" },
];
const ANOM_ITEMS = [
  { label: "P0 · Mapan", value: 15.0, color: "#5B8DEF" },
  { label: "P2 · Prima", value: 12.63, color: "#5B8DEF" },
  { label: "D1 · Terlampau terungkit", value: 10.59, color: "#FF6B6B" },
  { label: "D2 · Menengah", value: 8.16, color: "#FF6B6B" },
  { label: "P1 · Konservatif", value: 3.81, color: "#5B8DEF" },
  { label: "D0 · Muda", value: 2.38, color: "#FF6B6B" },
];
const AGREE_ITEMS = [
  { label: "Terflag oleh 1 lensa", value: 65333, color: "#F5A524" },
  { label: "Terflag oleh 2 lensa", value: 27133, color: "#F5A524" },
  { label: "Terflag oleh ketiganya", value: 2989, color: "#FF6B6B" },
];
const OUTLIER_METRICS = [
  { m: "Umur (th)", out: 48.7, norm: 43.9 },
  { m: "Masa kerja (th)", out: 12.9, norm: 6.1 },
  { m: "Kredit ÷ penghasilan", out: 5.7, norm: 3.9 },
  { m: "Anuitas ÷ penghasilan", out: 0.27, norm: 0.18 },
];
const VERDICT_SEG: Seg[] = [
  { label: "Normal", value: 277389, color: "#5B8DEF" },
  { label: "Bernilai tinggi, simpan", value: 26139, color: "#1FB894" },
  { label: "Sinyal risiko", value: 3983, color: "#F5A524" },
];
const ELBOW: Record<"default" | "paid", { k: number; inertia: number; sil: number }[]> = {
  default: [
    { k: 2, inertia: 278594, sil: 0.112 }, { k: 3, inertia: 260945, sil: 0.089 }, { k: 4, inertia: 248260, sil: 0.083 },
    { k: 5, inertia: 238334, sil: 0.080 }, { k: 6, inertia: 231842, sil: 0.071 }, { k: 7, inertia: 225915, sil: 0.071 }, { k: 8, inertia: 220604, sil: 0.072 },
  ],
  paid: [
    { k: 2, inertia: 290178, sil: 0.128 }, { k: 3, inertia: 272776, sil: 0.091 }, { k: 4, inertia: 259953, sil: 0.085 },
    { k: 5, inertia: 249923, sil: 0.080 }, { k: 6, inertia: 242172, sil: 0.083 }, { k: 7, inertia: 235567, sil: 0.080 }, { k: 8, inertia: 230003, sil: 0.079 },
  ],
};
type SRule = { sup: number; conf: number; lift: number; cat: "risk" | "safe" | "behaviour"; label: string };
const SRULES: SRule[] = [
  { sup: 0.0232, conf: 0.9495, lift: 4.75, cat: "behaviour", label: "Penghasilan rendah + Revolving → anuitas kecil" },
  { sup: 0.0195, conf: 0.8923, lift: 4.46, cat: "behaviour", label: "Muda + Revolving → anuitas kecil" },
  { sup: 0.0114, conf: 0.5688, lift: 3.89, cat: "behaviour", label: "Skor rendah + tinggal dgn ortu → muda" },
  { sup: 0.0107, conf: 0.8152, lift: 3.86, cat: "behaviour", label: "Utang rendah + SMA → pinjaman kecil" },
  { sup: 0.0174, conf: 0.5646, lift: 3.86, cat: "behaviour", label: "Tanpa anak + tinggal dgn ortu → muda" },
  { sup: 0.0105, conf: 0.813, lift: 3.85, cat: "behaviour", label: "Utang rendah + tanpa mobil → pinjaman kecil" },
  { sup: 0.0319, conf: 0.9779, lift: 1.06, cat: "safe", label: "Skor tinggi + wilayah teratas → lunas" },
  { sup: 0.123, conf: 0.9772, lift: 1.06, cat: "safe", label: "Kedua skor tinggi → lunas" },
  { sup: 0.0319, conf: 0.9755, lift: 1.06, cat: "safe", label: "Kerja 15+ th + skor tinggi → lunas" },
  { sup: 0.0318, conf: 0.9748, lift: 1.06, cat: "safe", label: "Skor tinggi + Revolving → lunas" },
  { sup: 0.0224, conf: 0.184, lift: 2.28, cat: "risk", label: "Kedua skor rendah → gagal bayar" },
  { sup: 0.0128, conf: 0.1708, lift: 2.12, cat: "risk", label: "Kerja 1–3 th + skor rendah → gagal bayar" },
  { sup: 0.0191, conf: 0.1635, lift: 2.03, cat: "risk", label: "Pria + skor rendah → gagal bayar" },
  { sup: 0.0113, conf: 0.1608, lift: 1.99, cat: "risk", label: "Skor rendah + barang menengah → gagal bayar" },
  { sup: 0.0105, conf: 0.1602, lift: 1.98, cat: "risk", label: "Muda + skor rendah → gagal bayar" },
  { sup: 0.011, conf: 0.1574, lift: 1.95, cat: "risk", label: "Pinjaman menengah + skor rendah → gagal bayar" },
  { sup: 0.0112, conf: 0.1523, lift: 1.89, cat: "risk", label: "Skor3 rendah + barang menengah → gagal bayar" },
  { sup: 0.012, conf: 0.1514, lift: 1.88, cat: "risk", label: "Kerja 1–3 th + skor3 rendah → gagal bayar" },
];
const CATCOL: Record<string, string> = { risk: "#FF6B6B", safe: "#1FB894", behaviour: "#9B5DE5" };

/* ============================ EXTRA CHARTS ============================ */

function HBars({ items, max, fmtVal }: { items: { label: string; value: number; color: string }[]; max: number; fmtVal: (v: number) => string }) {
  const [h, setH] = useState<number | null>(null);
  return (
    <ul className="cx-hbars">
      {items.map((it, i) => (
        <li key={it.label} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <div className="cx-hb-head"><span>{it.label}</span><span className="cx-hb-val">{fmtVal(it.value)}</span></div>
          <div className="cx-track"><span className="cx-fill" style={{ width: `${(it.value / max) * 100}%`, background: it.color, opacity: h === null || h === i ? 1 : 0.4 }} /></div>
        </li>
      ))}
    </ul>
  );
}

function FeatureExplorer() {
  const [k, setK] = useState<FKey>("EXT2");
  const meta = FEATS.find((f) => f.key === k)!;
  const max = Math.max(...PROFILES.map((p) => p[k]));
  const rows = [...PROFILES].sort((a, b) => b[k] - a[k]);
  return (
    <div className="cx-explorer">
      <div className="cx-fpills">
        {FEATS.map((f) => (
          <button key={f.key} className={`cx-fpill ${f.key === k ? "cx-fpill-on" : ""}`} onClick={() => setK(f.key)}>{f.label}</button>
        ))}
      </div>
      <ul className="cx-hbars">
        {rows.map((p) => (
          <li key={p.id}>
            <div className="cx-hb-head"><span><b style={{ color: p.color }}>{p.id}</b> · {p.book === "paid" ? "lunas" : "gagal"}</span><span className="cx-hb-val">{fmtFeat(meta.kind, p[k])}</span></div>
            <div className="cx-track"><span className="cx-fill" style={{ width: `${(p[k] / max) * 100}%`, background: p.color }} /></div>
          </li>
        ))}
      </ul>
      <p className="cx-subtle">Rata-rata <b>{meta.label.toLowerCase()}</b> untuk keenam tipe nasabah (rata-rata segmen asli). Ganti feature untuk melihat mana yang memisahkan tipe berisiko dari yang aman.</p>
    </div>
  );
}

function ClusterMap() {
  const [h, setH] = useState<number | null>(null);
  const W = 540, HT = 320, X0 = 62, X1 = 508, Y0 = 40, Y1 = 262;
  const xr = [1.6, 7.2], yr = [0.34, 0.60];
  const px = (v: number) => X0 + ((v - xr[0]) / (xr[1] - xr[0])) * (X1 - X0);
  const py = (v: number) => Y1 - ((v - yr[0]) / (yr[1] - yr[0])) * (Y1 - Y0);
  const rOf = (c: number) => Math.max(7, Math.sqrt(c) / 15);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${HT}`} className="cx-cmap" role="img" aria-label="Peta cluster keenam segmen pada leverage versus skor kredit.">
        {[0.4, 0.5, 0.6].map((g) => <line key={g} x1={X0} y1={py(g)} x2={X1} y2={py(g)} className="cx-svg-axis" />)}
        {[2, 4, 6].map((g) => <line key={g} x1={px(g)} y1={Y0} x2={px(g)} y2={Y1} className="cx-svg-axis" opacity={0.5} />)}
        {[0.4, 0.5, 0.6].map((g) => <text key={g} x={X0 - 8} y={py(g) + 3} className="cx-svg-tick" textAnchor="end">{g.toFixed(1)}</text>)}
        {[2, 4, 6].map((g) => <text key={g} x={px(g)} y={Y1 + 16} className="cx-svg-tick" textAnchor="middle">{g}×</text>)}
        {PAIR_IDX.map(([p, d]) => (
          <line key={p} x1={px(PROFILES[p].CI)} y1={py(PROFILES[p].EXT2)} x2={px(PROFILES[d].CI)} y2={py(PROFILES[d].EXT2)} stroke="#D8DFCE" strokeWidth="1.4" strokeDasharray="3 4" />
        ))}
        {PROFILES.map((p, i) => (
          <g key={p.id} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} style={{ cursor: "pointer" }}>
            <circle cx={px(p.CI)} cy={py(p.EXT2)} r={rOf(p.count)} fill={p.book === "default" ? "#FF6B6B" : "#1FB894"} opacity={h === null || h === i ? 0.9 : 0.45} stroke="#fff" strokeWidth="2" />
            <text x={px(p.CI)} y={py(p.EXT2) + 4} className="cx-cmap-id" textAnchor="middle">{p.id}</text>
          </g>
        ))}
        <text x={(X0 + X1) / 2} y={HT - 6} className="cx-svg-axlab" textAnchor="middle">KREDIT ÷ PENGHASILAN (LEVERAGE) →</text>
        <text x={16} y={(Y0 + Y1) / 2} className="cx-svg-axlab" textAnchor="middle" transform={`rotate(-90 16 ${(Y0 + Y1) / 2})`}>SKOR EKSTERNAL (AMAN)</text>
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: "#5B8DEF" }}>
        {h === null ? "Gelembung = pusat keenam segmen (ukuran = jumlah nasabah). Garis putus menghubungkan tiap tipe berisiko dengan kembaran amannya, gelembung merah selalu lebih rendah (skor lebih lemah) pada leverage yang sama." : `${PROFILES[h].id} · ${PROFILES[h].book === "paid" ? "lunas" : "gagal bayar"} — ${fmt(PROFILES[h].count)} nasabah, skor ${PROFILES[h].EXT2.toFixed(2)}, leverage ${PROFILES[h].CI.toFixed(1)}×`}
      </div>
    </div>
  );
}

function Radar() {
  const [pi, setPi] = useState(0);
  const [paid, def] = PAIR_IDX[pi];
  const cx = 180, cy = 158, RAD = 116;
  const ang = (i: number) => (-90 + i * (360 / FEATS.length)) * (Math.PI / 180);
  const norm = (k: FKey, v: number) => { const [mn, mx] = fRange(k); return mx === mn ? 0.5 : (v - mn) / (mx - mn); };
  const poly = (idx: number) => "M " + FEATS.map((f, i) => { const r = (0.12 + 0.88 * norm(f.key, PROFILES[idx][f.key])) * RAD; return `${cx + r * Math.cos(ang(i))},${cy + r * Math.sin(ang(i))}`; }).join(" L ") + " Z";
  return (
    <div>
      <div className="cx-toggle">
        {PAIR_IDX.map(([p, d], i) => (
          <button key={i} className={`cx-toggle-btn ${i === pi ? "cx-toggle-on" : ""}`} onClick={() => setPi(i)}>{PROFILES[p].id} vs {PROFILES[d].id}</button>
        ))}
      </div>
      <svg viewBox="0 0 360 300" className="cx-radar" role="img" aria-label="Radar membandingkan sepasang kembar antar-feature.">
        {[0.33, 0.66, 1].map((g) => (
          <path key={g} d={"M " + FEATS.map((_, i) => `${cx + g * RAD * Math.cos(ang(i))},${cy + g * RAD * Math.sin(ang(i))}`).join(" L ") + " Z"} fill="none" stroke="#D8DFCE" strokeWidth="1" />
        ))}
        {FEATS.map((f, i) => <line key={f.key} x1={cx} y1={cy} x2={cx + RAD * Math.cos(ang(i))} y2={cy + RAD * Math.sin(ang(i))} stroke="#D8DFCE" strokeWidth="1" />)}
        <path d={poly(def)} fill="#FF6B6B" fillOpacity="0.18" stroke="#FF6B6B" strokeWidth="2" />
        <path d={poly(paid)} fill="#1FB894" fillOpacity="0.16" stroke="#1FB894" strokeWidth="2" />
        {FEATS.map((f, i) => {
          const lx = cx + (RAD + 16) * Math.cos(ang(i)), ly = cy + (RAD + 16) * Math.sin(ang(i));
          return <text key={f.key} x={lx} y={ly + 3} className="cx-radar-lab" textAnchor={Math.abs(Math.cos(ang(i))) < 0.3 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end"}>{f.short}</text>;
        })}
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: "#5B8DEF" }}>
        <b style={{ color: "#1FB894" }}>{PROFILES[paid].id}</b> (lunas) vs <b style={{ color: "#FF6B6B" }}>{PROFILES[def].id}</b> (gagal bayar): bentuknya nyaris berimpit — selisih paling jelas ada di jari-jari skor kredit.
      </div>
    </div>
  );
}

function ElbowChart() {
  const [tbl, setTbl] = useState<"default" | "paid">("paid");
  const d = ELBOW[tbl];
  const W = 470, HT = 250, X0 = 46, X1 = 440, Y0 = 26, Y1 = 190;
  const px = (k: number) => X0 + ((k - 2) / 6) * (X1 - X0);
  const inr = d.map((r) => r.inertia), sr = d.map((r) => r.sil);
  const pyI = (v: number) => Y1 - ((v - Math.min(...inr)) / (Math.max(...inr) - Math.min(...inr))) * (Y1 - Y0);
  const pyS = (v: number) => Y1 - ((v - Math.min(...sr)) / (Math.max(...sr) - Math.min(...sr))) * (Y1 - Y0);
  return (
    <div>
      <div className="cx-toggle">
        <button className={`cx-toggle-btn ${tbl === "paid" ? "cx-toggle-on" : ""}`} onClick={() => setTbl("paid")}>Tabel lunas</button>
        <button className={`cx-toggle-btn ${tbl === "default" ? "cx-toggle-on" : ""}`} onClick={() => setTbl("default")}>Tabel gagal bayar</button>
      </div>
      <svg viewBox={`0 0 ${W} ${HT}`} className="cx-elbow" role="img" aria-label="Elbow dan silhouette menurut jumlah cluster.">
        <line x1={px(3)} y1={Y0} x2={px(3)} y2={Y1} stroke="#5B8DEF" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
        <text x={px(3)} y={Y0 - 8} className="cx-svg-tick" textAnchor="middle" fill="#0F7A3D">K terpilih = 3</text>
        <path d={"M " + d.map((r) => `${px(r.k)},${pyI(r.inertia)}`).join(" L ")} fill="none" stroke="#8A90A6" strokeWidth="2" />
        <path d={"M " + d.map((r) => `${px(r.k)},${pyS(r.sil)}`).join(" L ")} fill="none" stroke="#9B5DE5" strokeWidth="2.5" />
        {d.map((r) => <circle key={r.k} cx={px(r.k)} cy={pyS(r.sil)} r={r.k === 3 ? 5 : 3.2} fill={r.k === 3 ? "#9B5DE5" : "#6E5AA8"} />)}
        {d.map((r) => <text key={r.k} x={px(r.k)} y={Y1 + 18} className="cx-svg-tick" textAnchor="middle">{r.k}</text>)}
        <text x={(X0 + X1) / 2} y={HT - 4} className="cx-svg-axlab" textAnchor="middle">JUMLAH CLUSTER (K)</text>
        <text x={X1 - 2} y={pyS(sr[1]) - 8} className="cx-svg-tick" textAnchor="end" fill="#7C5CBF">silhouette</text>
        <text x={X1 - 2} y={pyI(inr[3]) + 14} className="cx-svg-tick" textAnchor="end">inertia</text>
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: "#9B5DE5" }}>Inertia terus turun (abu-abu); silhouette (ungu) tertinggi di antara opsi bermakna pada K = 3 — jadi tiap tabel dibagi jadi 3 tipe.</div>
    </div>
  );
}

function RuleScatter() {
  const [h, setH] = useState<number | null>(null);
  const W = 500, HT = 320, X0 = 54, X1 = 476, Y0 = 26, Y1 = 258;
  const px = (s: number) => X0 + (s / 0.13) * (X1 - X0);
  const py = (c: number) => Y1 - c * (Y1 - Y0);
  const rOf = (l: number) => 4 + ((l - 1) / 3.75) * 11;
  const a = h === null ? null : SRULES[h];
  return (
    <div className="cx-scatterwrap">
      <svg viewBox={`0 0 ${W} ${HT}`} className="cx-scatter" role="img" aria-label="Aturan asosiasi menurut support & confidence, ukuran = lift.">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={X0} y1={py(g)} x2={X1} y2={py(g)} className="cx-svg-axis" opacity="0.5" />)}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <text key={g} x={X0 - 8} y={py(g) + 3} className="cx-svg-tick" textAnchor="end">{g * 100}%</text>)}
        {[0.03, 0.06, 0.09, 0.12].map((g) => <text key={g} x={px(g)} y={Y1 + 16} className="cx-svg-tick" textAnchor="middle">{g}</text>)}
        {SRULES.map((r, i) => (
          <circle key={i} cx={px(r.sup)} cy={py(r.conf)} r={rOf(r.lift)} fill={CATCOL[r.cat]} opacity={h === null || h === i ? 0.72 : 0.28} stroke="#fff" strokeWidth="1"
            onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} style={{ cursor: "pointer" }} />
        ))}
        <text x={(X0 + X1) / 2} y={HT - 4} className="cx-svg-axlab" textAnchor="middle">SUPPORT (SEBERAPA UMUM) →</text>
        <text x={14} y={(Y0 + Y1) / 2} className="cx-svg-axlab" textAnchor="middle" transform={`rotate(-90 14 ${(Y0 + Y1) / 2})`}>CONFIDENCE (SEBERAPA ANDAL) </text>
      </svg>
      <div className="cx-scatter-legend">
        <span><i style={{ background: CATCOL.risk }} /> Risiko</span>
        <span><i style={{ background: CATCOL.safe }} /> Proteksi</span>
        <span><i style={{ background: CATCOL.behaviour }} /> Perilaku</span>
        <span className="cx-note">gelembung = lift</span>
      </div>
      <div className="cx-caption" style={{ borderLeftColor: a ? CATCOL[a.cat] : "#5B8DEF" }}>
        {a ? `${a.label} — support ${(a.sup * 100).toFixed(1)}%, confidence ${(a.conf * 100).toFixed(0)}%, lift ${a.lift.toFixed(2)}×` : "Arahkan cursor untuk melihat lebih detail"}
      </div>
    </div>
  );
}

function OutlierProfile() {
  const [h, setH] = useState<number | null>(null);
  return (
    <div className="cx-op">
      {OUTLIER_METRICS.map((m, i) => {
        const mx = Math.max(m.out, m.norm);
        return (
          <div key={m.m} className="cx-op-row" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
            <div className="cx-op-m">{m.m}</div>
            <div className="cx-op-bars">
              <div className="cx-op-bar"><div className="cx-op-track"><span className="cx-op-fill" style={{ width: `${(m.norm / mx) * 100}%`, background: "#5B8DEF", opacity: h === null || h === i ? 1 : 0.4 }} /></div><span className="cx-op-v">{m.norm}</span></div>
              <div className="cx-op-bar"><div className="cx-op-track"><span className="cx-op-fill" style={{ width: `${(m.out / mx) * 100}%`, background: "#F5A524", opacity: h === null || h === i ? 1 : 0.4 }} /></div><span className="cx-op-v">{m.out}</span></div>
            </div>
          </div>
        );
      })}
      <div className="cx-op-leg"><span><i style={{ background: "#5B8DEF" }} /> Nasabah tipikal</span><span><i style={{ background: "#F5A524" }} /> Outlier DBSCAN</span></div>
    </div>
  );
}

/* ============================ PER-RECORD CHARTS (load dashboard_data.json) ============================ */

type DPoint = { x: number; y: number; t: number; c: string; o: number };
type DHist = { edges: number[]; repaid: number[]; default: number[] };
type DData = { scatter: DPoint[]; hist: Record<string, DHist> };
const CLUSTERCOL: Record<string, string> = { P0: "#5B8DEF", P1: "#4FD1C5", P2: "#9B5DE5", D0: "#FF6B6B", D1: "#F5A524", D2: "#E15B9E" };
const HISTFEATS: { key: string; label: string }[] = [
  { key: "EXT_SOURCE_2", label: "Skor kredit" },
  { key: "EXT_SOURCE_3", label: "Skor kredit (2)" },
  { key: "AMT_INCOME_TOTAL", label: "Penghasilan" },
  { key: "AMT_CREDIT", label: "Ukuran pinjaman" },
  { key: "AGE_YEARS", label: "Umur" },
  { key: "EMPLOYMENT_YEARS", label: "Masa kerja" },
  { key: "CREDIT_INCOME_RATIO", label: "Leverage" },
  { key: "ANNUITY_INCOME_RATIO", label: "Beban anuitas" },
];

function useSampleData() {
  const [d, setD] = useState<DData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/dashboard_data.json")
      .then((r) => { if (!r.ok) throw new Error("missing"); return r.json(); })
      .then((j) => { if (on) setD(j as DData); })
      .catch(() => { if (on) setErr(true); });
    return () => { on = false; };
  }, []);
  return { d, err };
}

function DataPlaceholder({ err }: { err: boolean }) {
  return (
    <div className="cx-ph">
      <div className="cx-ph-title">{err ? "Data per-record belum dimuat" : "Memuat…"}</div>
      <p className="cx-ph-txt">
        Grafik ini memakai data per-kredit asli. Jalankan <code>export_dashboard_data.py</code> pada
        dataset penuh, lalu taruh <code>dashboard_data.json</code> hasilnya ke{" "}
        <code>dashboard/public/</code> — grafik muncul otomatis.
      </p>
    </div>
  );
}

function PcaScatter() {
  const { d, err } = useSampleData();
  const [mode, setMode] = useState<"outcome" | "cluster_all" | "cluster_paid" | "cluster_def">("outcome");
  const [h, setH] = useState<string | null>(null);
  if (!d) return <DataPlaceholder err={err} />;
  const pts = d.scatter;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const xmn = Math.min(...xs), xmx = Math.max(...xs), ymn = Math.min(...ys), ymx = Math.max(...ys);
  const W = 560, HT = 360, pad = 16;
  const px = (v: number) => pad + ((v - xmn) / (xmx - xmn || 1)) * (W - 2 * pad);
  const py = (v: number) => HT - pad - ((v - ymn) / (ymx - ymn || 1)) * (HT - 2 * pad);
  return (
    <div>
      <div className="cx-toggle">
        <button className={`cx-toggle-btn ${mode === "outcome" ? "cx-toggle-on" : ""}`} onClick={() => setMode("outcome")}>Per hasil</button>
        <button className={`cx-toggle-btn ${mode === "cluster_all" ? "cx-toggle-on" : ""}`} onClick={() => setMode("cluster_all")}>Semua Segmen</button>
        <button className={`cx-toggle-btn ${mode === "cluster_paid" ? "cx-toggle-on" : ""}`} onClick={() => setMode("cluster_paid")}>Segmen Lunas</button>
        <button className={`cx-toggle-btn ${mode === "cluster_def" ? "cx-toggle-on" : ""}`} onClick={() => setMode("cluster_def")}>Segmen Gagal</button>
      </div>
      <svg viewBox={`0 0 ${W} ${HT}`} className="cx-scatter" role="img" aria-label="Scatter PCA dari sampel nasabah yang di-stratifikasi.">
        {pts.filter((p) => !p.o).map((p, i) => {
          let visible = true;
          if (mode === "cluster_paid" && p.t === 1) visible = false;
          if (mode === "cluster_def" && p.t === 0) visible = false;
          
          let isH = false;
          if (mode === "outcome") {
            isH = h === null || (h === "def" ? p.t === 1 : h === "paid" ? p.t === 0 : false);
          } else {
            isH = h === null || p.c === h;
          }
          return (
            <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.1" fill={mode === "outcome" ? (p.t === 1 ? "#FF6B6B" : "#1FB894") : (CLUSTERCOL[p.c] || "#8A90A6")} opacity={!visible ? "0" : isH ? "0.6" : "0.05"} />
          );
        })}
        {pts.filter((p) => p.o).map((p, i) => (
          <circle key={`o${i}`} cx={px(p.x)} cy={py(p.y)} r="3.6" fill="#F5A524" stroke="#fff" strokeWidth="1" opacity={h === null || h === "outlier" ? "1" : "0.05"} />
        ))}
      </svg>
      <div className="cx-scatter-legend">
        {mode === "outcome" ? (
          <>
            <span onMouseEnter={() => setH("paid")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "paid" ? 1 : 0.4 }}><i style={{ background: "#1FB894" }} /> Lunas</span>
            <span onMouseEnter={() => setH("def")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "def" ? 1 : 0.4 }}><i style={{ background: "#FF6B6B" }} /> Gagal bayar</span>
          </>
        ) : (
          Object.entries(CLUSTERCOL)
            .filter(([id]) => mode === "cluster_all" || (mode === "cluster_paid" && id.startsWith("P")) || (mode === "cluster_def" && id.startsWith("D")))
            .map(([id, c]) => (
            <span key={id} onMouseEnter={() => setH(id)} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === id ? 1 : 0.4 }}><i style={{ background: c }} /> {id}</span>
          ))
        )}
        <span onMouseEnter={() => setH("outlier")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "outlier" ? 1 : 0.4 }}><i style={{ background: "#F5A524" }} /> Outlier DBSCAN</span>
        <span className="cx-note">{pts.length} titik sampel</span>
      </div>
    </div>
  );
}

function HistExplorer() {
  const { d, err } = useSampleData();
  const [k, setK] = useState("EXT_SOURCE_2");
  if (!d) return <DataPlaceholder err={err} />;
  const keys = Object.keys(d.hist);
  const key = keys.includes(k) ? k : keys[0];
  const h = d.hist[key];
  const n = h.repaid.length;
  const W = 520, HT = 190, pad = 16;
  const bx = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const maxR = Math.max(...h.repaid, 1), maxD = Math.max(...h.default, 1);
  const area = (arr: number[], max: number) => {
    const ry = (v: number) => HT - pad - (v / max) * (HT - 2 * pad);
    return `M ${pad},${HT - pad} ` + arr.map((v, i) => `L ${bx(i).toFixed(1)},${ry(v).toFixed(1)}`).join(" ") + ` L ${W - pad},${HT - pad} Z`;
  };
  return (
    <div>
      <div className="cx-fpills">
        {HISTFEATS.filter((f) => keys.includes(f.key)).map((f) => (
          <button key={f.key} className={`cx-fpill ${f.key === key ? "cx-fpill-on" : ""}`} onClick={() => setK(f.key)}>{f.label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${HT}`} className="cx-scatter" role="img" aria-label="Distribusi feature terpilih, lunas vs gagal bayar.">
        <path d={area(h.repaid, maxR)} fill="#1FB894" fillOpacity="0.22" stroke="#1FB894" strokeWidth="2" />
        <path d={area(h.default, maxD)} fill="#FF6B6B" fillOpacity="0.2" stroke="#FF6B6B" strokeWidth="2" />
      </svg>
      <div className="cx-scatter-legend"><span><i style={{ background: "#1FB894" }} /> Lunas</span><span><i style={{ background: "#FF6B6B" }} /> Gagal bayar</span><span className="cx-note">tiap kurva diskala ke puncaknya sendiri</span></div>
      <p className="cx-subtle">Bentuk asli dari seluruh 307.511 kredit. Geser antar-feature pada skor kredit, kurva gagal bayar jelas bergeser ke kiri.</p>
    </div>
  );
}

/* ============================ PANELS ============================ */

function Overview() {
  const outcome: Seg[] = [
    { label: "Repaid", value: BOOK.repaid, color: "#1FB894" },
    { label: "Defaulted", value: BOOK.defaulters, color: "#FF6B6B" },
  ];
  return (
    <>
      <KpiRow items={KPIS.overview} />
      <div className="cx-grid cx-grid-3-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Pemicu risiko teratas</span><span className="cx-note">peluang gagal bayar saat muncul</span></div>
          <VBars items={RISK_BARS} />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Hasil portofolio</span><span className="cx-note">tingkat gagal bayar 8,07%</span></div>
          <Donut segments={outcome} center="8,07%" sub="tingkat gagal bayar" />
        </div>
      </div>
    </>
  );
}

const ABOUT_SECTIONS = [
  { id: "ringkasan", label: "Ringkasan & Tabel" },
  { id: "relasi", label: "Skema Relasi" },
  { id: "konvensi", label: "Konvensi Nilai" },
  { id: "pipeline", label: "Alur Pipeline" },
] as const;
type AboutSection = (typeof ABOUT_SECTIONS)[number]["id"];

function RelationDiagram({ hoverKey, onHover }: { hoverKey: string | null; onHover: (k: string | null) => void }) {
  return (
    <svg viewBox="0 0 780 274" className="cx-reldiagram" role="img" aria-label="Diagram skema relasi antar-tabel Home Credit.">
      {REL_EDGES.map((e) => {
        const a = REL_NODES[e.from], b = REL_NODES[e.to];
        const on = hoverKey === null || hoverKey === e.key;
        const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
        const my = (y1 + y2) / 2;
        return (
          <path key={e.from + e.to} d={`M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none"
            stroke={hoverKey === e.key ? KEYCOLOR[e.key] : "#D8DFCE"} strokeWidth={hoverKey === e.key ? 2.6 : 1.6}
            opacity={on ? 1 : 0.3} style={{ cursor: "pointer", transition: "all .2s" }}
            onMouseEnter={() => onHover(e.key)} onMouseLeave={() => onHover(null)} />
        );
      })}
      {Object.entries(REL_NODES).map(([id, n]) => {
        const touching = REL_EDGES.filter((e) => e.from === id || e.to === id).map((e) => e.key);
        const on = hoverKey === null || touching.includes(hoverKey);
        const strokeCol = hoverKey && touching.includes(hoverKey) ? KEYCOLOR[hoverKey] : "#D8DFCE";
        return (
          <g key={id} opacity={on ? 1 : 0.4} style={{ transition: "opacity .2s" }}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="11" fill="var(--card)" stroke={strokeCol} strokeWidth={hoverKey && touching.includes(hoverKey) ? 2.2 : 1.3} />
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" className="cx-reldiagram-label">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function About() {
  const [section, setSection] = useState<AboutSection>("ringkasan");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [openConv, setOpenConv] = useState<string | null>(CONVENTIONS[0].title);
  const [activeStep, setActiveStep] = useState<string>("1");

  const toNum = (s: string) => Number(s.replace(/\./g, ""));
  const rows = sortDir
    ? [...DATASET_FILES].sort((a, b) => (sortDir === "asc" ? toNum(a.rows) - toNum(b.rows) : toNum(b.rows) - toNum(a.rows)))
    : DATASET_FILES;
  const activeFiles = hoverKey ? RELATION_KEYS.find((k) => k.key === hoverKey)?.files ?? [] : null;

  return (
    <>
      <KpiRow items={KPIS.about} />

      <div className="cx-card" style={{ padding: "10px" }}>
        <div className="cx-segmented" role="tablist" aria-label="Bagian Tentang Proyek">
          {ABOUT_SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={section === s.id} className={`cx-segbtn ${section === s.id ? "cx-segbtn-on" : ""}`} onClick={() => setSection(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      {section === "ringkasan" && (
        <div className="cx-rise" key="ringkasan">
          <div className="cx-card">
            <div className="cx-card-head"><span className="cx-card-title">Gambaran Umum</span><span className="cx-note">Home Credit Default Risk</span></div>
            <p className="cx-lead" style={{ maxWidth: "none" }}>
              <b>Home Credit</b> adalah penyedia kredit untuk nasabah dengan riwayat kredit tipis atau tanpa riwayat sama sekali.
              Tujuan dataset ini adalah memprediksi <b>kemampuan bayar</b> nasabah. Label target berada di tabel <code>application_train</code>:
              {" "}<b style={{ color: "#FF6B6B" }}>TARGET = 1</b> berarti nasabah gagal bayar (telat lebih dari X hari pada minimal satu dari Y angsuran pertama),
              sedangkan <b style={{ color: "#1FB894" }}>TARGET = 0</b> berarti nasabah membayar normal.
            </p>
            <p className="cx-subtle" style={{ marginTop: "12px" }}>
              Dataset terdiri dari <b>8 file</b> yang saling terhubung secara relasional: satu tabel inti ditambah beberapa tabel riwayat pendukung.
              Arahkan kursor ke salah satu kunci di bawah untuk menyorot file yang memakainya.
            </p>
            <div className="cx-keypills">
              {RELATION_KEYS.map((k) => (
                <span key={k.key} className="cx-keypill" style={{ borderColor: hoverKey === k.key ? k.color : undefined, color: hoverKey === k.key ? k.color : undefined }}
                  onMouseEnter={() => setHoverKey(k.key)} onMouseLeave={() => setHoverKey(null)}>
                  <i style={{ background: k.color }} />{k.key}
                </span>
              ))}
            </div>
          </div>

          <div className="cx-card">
            <div className="cx-card-head"><span className="cx-card-title">8 Tabel Sumber Data</span><span className="cx-note">klik &ldquo;Baris&rdquo; untuk urutkan</span></div>
            <div className="cx-tablewrap">
              <table className="cx-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th className="cx-th-sort" onClick={() => setSortDir(sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc")}>
                      Baris {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : "↕"}
                    </th>
                    <th>Peran</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const dim = activeFiles !== null && !activeFiles.includes(f.file);
                    const hit = activeFiles !== null && activeFiles.includes(f.file);
                    return (
                      <tr key={f.file} style={{ opacity: dim ? 0.35 : 1, background: hit ? "var(--card2)" : undefined, transition: "all .15s" }}>
                        <td><code>{f.file}</code></td>
                        <td>{f.rows}</td>
                        <td>{f.role}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === "relasi" && (
        <div className="cx-rise" key="relasi">
          <div className="cx-card">
            <div className="cx-card-head"><span className="cx-card-title">Diagram Skema Relasi</span><span className="cx-note">arahkan kursor ke node/garis</span></div>
            <RelationDiagram hoverKey={hoverKey} onHover={setHoverKey} />
            <div className="cx-caption" style={{ borderLeftColor: hoverKey ? KEYCOLOR[hoverKey] : "#16A34A" }}>
              {hoverKey ? <><b>{hoverKey}</b> — {RELATION_KEYS.find((k) => k.key === hoverKey)?.desc}</> : "Tiga kunci menghubungkan tujuh tabel: hover node atau garis untuk menelusuri jalur relasinya."}
            </div>
          </div>

          <div className="cx-grid cx-grid-2">
            <div className="cx-card">
              <div className="cx-card-head"><span className="cx-card-title">Kunci Penghubung Antar-Tabel</span><span className="cx-note">hover untuk sorot diagram</span></div>
              <div className="cx-dict-list">
                {RELATION_KEYS.map((k) => (
                  <div className={`cx-dict-item ${hoverKey === k.key ? "cx-dict-item-on" : ""}`} key={k.key}
                    style={{ borderColor: hoverKey === k.key ? k.color : undefined }}
                    onMouseEnter={() => setHoverKey(k.key)} onMouseLeave={() => setHoverKey(null)}>
                    <b><i className="cx-keydot" style={{ background: k.color }} />{k.key}</b>
                    <p>{k.desc}</p>
                  </div>
                ))}
              </div>
              <p className="cx-subtle" style={{ marginTop: "14px" }}>
                Semua relasi bersifat <b>one-to-many</b> (1 nasabah → banyak baris riwayat), sehingga tabel pendukung
                tidak bisa langsung digabung ke tabel inti tanpa menggandakan baris — tiap tabel harus diagregasi
                ke level <code>SK_ID_CURR</code> terlebih dulu.
              </p>
            </div>
            <div className="cx-card">
              <div className="cx-card-head"><span className="cx-card-title">Kardinalitas Relasi</span><span className="cx-note">bukti dari data</span></div>
              <div className="cx-dict-list">
                {RELATION_CARDINALITY.map((r) => (
                  <div className="cx-dict-item" key={r.rel}><b>{r.rel}</b><p>{r.card}<br /><span style={{ color: "var(--dim)" }}>{r.proof}</span></p></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === "konvensi" && (
        <div className="cx-card cx-rise" key="konvensi">
          <div className="cx-card-head"><span className="cx-card-title">Konvensi Nilai Penting</span><span className="cx-note">klik untuk buka/tutup</span></div>
          <div className="cx-accordion">
            {CONVENTIONS.map((c) => {
              const open = openConv === c.title;
              return (
                <div key={c.title} className={`cx-accitem ${open ? "cx-accitem-on" : ""}`}>
                  <button className="cx-acchead" onClick={() => setOpenConv(open ? null : c.title)} aria-expanded={open}>
                    <span>{c.title}</span>
                    <span className="cx-accchev" style={{ transform: open ? "rotate(180deg)" : "none" }}><Icon name="chevronDown" /></span>
                  </button>
                  {open && <p className="cx-accbody">{c.desc}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === "pipeline" && (
        <div className="cx-card cx-rise" key="pipeline">
          <div className="cx-card-head"><span className="cx-card-title">Bagaimana Dataset Ini Dipakai</span><span className="cx-note">alur Fase 1 · klik tiap langkah</span></div>
          <div className="cx-steps">
            {PIPELINE_STEPS.map((s, i) => {
              const open = activeStep === s.n;
              return (
                <div key={s.n} className="cx-step">
                  <button className={`cx-stepbtn ${open ? "cx-stepbtn-on" : ""}`} onClick={() => setActiveStep(s.n)}>
                    <span className="cx-stepnum">{s.n}</span>
                    <span className="cx-steptitle">{s.title}</span>
                  </button>
                  {open && <p className="cx-stepbody">{s.desc}</p>}
                  {i < PIPELINE_STEPS.length - 1 && <span className="cx-stepline" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Phase1() {
  const outcome: Seg[] = [
    { label: "Repaid", value: BOOK.repaid, color: "#1FB894" },
    { label: "Defaulted", value: BOOK.defaulters, color: "#FF6B6B" },
  ];
  return (
    <>
      <KpiRow items={KPIS.phase1} />
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Dari 680 kolom jadi 185</span></div>
          <FeatureFunnel />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Lunas vs gagal bayar</span><span className="cx-note">ketimpangan kelas</span></div>
          <Donut segments={outcome} center="8,1%" sub="gagal bayar" />
        </div>
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Asal 185 feature</span></div>
          <Donut segments={SOURCES} center="185" sub="feature disimpan" />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Apa yang memprediksi gagal bayar</span><span className="cx-note">mutual information</span></div>
          <HBars items={MI_ITEMS} max={0.0154} fmtVal={(v) => v.toFixed(4)} />
        </div>
      </div>
    </>
  );
}

function PersonaDonuts() {
  const [tgt, setTgt] = useState<"all" | "paid" | "def">("all");
  const all: Seg[] = [...PAID_PERSONAS, ...DEF_PERSONAS].map((p) => ({ label: `${p.id} · ${p.name}`, value: p.count, color: p.color }));
  const paid: Seg[] = PAID_PERSONAS.map((p) => ({ label: `${p.id} · ${p.name}`, value: p.count, color: p.color }));
  const def: Seg[] = DEF_PERSONAS.map((p) => ({ label: `${p.id} · ${p.name}`, value: p.count, color: p.color }));
  
  const segments = tgt === "all" ? all : tgt === "paid" ? paid : def;
  const center = tgt === "all" ? "307.511" : tgt === "paid" ? "282.686" : "24.825";
  const sub = tgt === "all" ? "nasabah" : tgt === "paid" ? "lunas" : "gagal bayar";

  return (
    <div className="cx-card">
      <div className="cx-card-head" style={{ marginBottom: "10px" }}><span className="cx-card-title">Enam tipe nasabah</span><span className="cx-note">Tampilan per target</span></div>
      <div className="cx-toggle" style={{ marginBottom: "20px" }}>
        <button className={`cx-toggle-btn ${tgt === "all" ? "cx-toggle-on" : ""}`} onClick={() => setTgt("all")}>Semua</button>
        <button className={`cx-toggle-btn ${tgt === "paid" ? "cx-toggle-on" : ""}`} onClick={() => setTgt("paid")}>Lunas (3)</button>
        <button className={`cx-toggle-btn ${tgt === "def" ? "cx-toggle-on" : ""}`} onClick={() => setTgt("def")}>Gagal (3)</button>
      </div>
      <Donut segments={segments} center={center} sub={sub} />
    </div>
  );
}

function Phase2() {
  const personas: Seg[] = [...PAID_PERSONAS, ...DEF_PERSONAS].map((p) => ({ label: `${p.id} · ${p.name}`, value: p.count, color: p.color }));
  return (
    <>
      <KpiRow items={KPIS.phase2} />
      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Selisih skor kredit</span><span className="cx-note">tiga pasangan kembar · hover</span></div>
        <Dumbbell />
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Peta cluster</span><span className="cx-note">leverage × skor kredit</span></div>
          <ClusterMap />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Menentukan jumlah cluster</span><span className="cx-note">elbow + silhouette</span></div>
          <ElbowChart />
        </div>
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Perbandingan kembar</span><span className="cx-note">radar · pilih pasangan</span></div>
          <Radar />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Penjelajah feature</span><span className="cx-note">rata-rata per segmen</span></div>
          <FeatureExplorer />
        </div>
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Peta nasabah (per-record)</span><span className="cx-note">PCA · sampel stratified</span></div>
          <PcaScatter />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Distribusi feature (per-record)</span><span className="cx-note">seluruh 307.511 kredit</span></div>
          <HistExplorer />
        </div>
      </div>
      <div className="cx-grid cx-grid-2-3">
        <PersonaDonuts />
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title" style={{ color: "#1FB894" }}>Tipe lunas</span><span className="cx-card-title" style={{ color: "#FF6B6B" }}>Tipe gagal bayar</span></div>
          <div className="cx-personas-2">
            <PersonaList personas={PAID_PERSONAS} color="#1FB894" of="pelunas" />
            <PersonaList personas={DEF_PERSONAS} color="#FF6B6B" of="gagal bayar" />
          </div>
        </div>
      </div>
    </>
  );
}

function Phase3() {
  return (
    <>
      <KpiRow items={KPIS.phase3} />
      <div className="cx-grid cx-grid-2">
        <RuleColumn title="Apa yang memicu gagal bayar" hint="peluang gagal bayar" rules={RISK_RULES} color="#FF6B6B" />
        <RuleColumn title="Apa yang menandakan aman" hint="peluang lunas" rules={SAFE_RULES} color="#1FB894" />
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Lanskap aturan</span><span className="cx-note">support × confidence × lift</span></div>
          <RuleScatter />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Aturan risiko terkuat menurut lift</span><span className="cx-note">× di atas rata-rata</span></div>
          <HBars items={LIFT_ITEMS} max={2.28} fmtVal={(v) => v.toFixed(2) + "×"} />
        </div>
      </div>
    </>
  );
}

function Phase4() {
  return (
    <>
      <KpiRow items={KPIS.phase4} />
      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Tiga Lensa Anomaly Detection</span><span className="cx-note">arahkan kursor ke tiap lensa</span></div>
        <p className="cx-lead" style={{ marginBottom: "22px", fontSize: "13.5px" }}>Istilah <b>"Lensa"</b> di sini mengacu pada <b>tiga algoritma pendeteksi anomali (outlier)</b> yang berbeda. Karena tidak ada satu algoritma yang selalu benar, kami menggunakan pendekatan berlapis (ensemble) mulai dari statistik matematis dasar (IQR & Z-Score) hingga algoritma AI modern (Isolation Forest) untuk menyaring data.</p>
        <MethodFunnel />
        <p className="cx-subtle" style={{ marginTop: "20px" }}>Di mana minimal dua algoritma di atas sepakat terhadap baris yang sama, kami mendapatkan <b>30.122</b> kredit yang kami jadikan target <i>flagging</i> dengan keyakinan tinggi.</p>
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Berapa lensa yang sepakat</span><span className="cx-note">212.056 tanpa flag dikecualikan</span></div>
          <HBars items={AGREE_ITEMS} max={65333} fmtVal={fmt} />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Di mana anomaly menumpuk</span><span className="cx-note">% keyakinan tinggi per segmen</span></div>
          <HBars items={ANOM_ITEMS} max={15} fmtVal={(v) => v.toFixed(1) + "%"} />
        </div>
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Outlier vs nasabah tipikal</span><span className="cx-note">outlier DBSCAN</span></div>
          <OutlierProfile />
          <p className="cx-subtle" style={{ marginTop: "14px", lineHeight: 1.55, fontSize: "12.5px" }}>
            <b>Apa artinya?</b> Nasabah outlier (anomali) menunjukkan rasio utang yang sangat ekstrem. 
            Nilai <b>Kredit ÷ Penghasilan</b> mereka mencapai 5.7× gaji (dibandingkan nasabah tipikal yang hanya 3.9×). 
            Selain itu, <b>Anuitas ÷ Penghasilan</b> mereka adalah 0.27, yang berarti 27% dari total pendapatan mereka habis murni untuk membayar cicilan bulanan (berbanding 18% pada nasabah wajar). 
            Rasio hutang yang terlalu mencekik inilah yang membuat algoritma menandai mereka sebagai sangat tidak wajar (risiko tinggi).
          </p>
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Vonisnya</span><span className="cx-note">tiap kredit diklasifikasi</span></div>
          <Donut segments={VERDICT_SEG} center="30.122" sub="diflag untuk review" />
        </div>
      </div>
    </>
  );
}

function Dictionary() {
  return (
    <>
      <KpiRow items={KPIS.dictionary} />
      <div className="cx-grid cx-grid-2">
        {/* KOLOM KIRI: KAMUS FITUR */}
        <div className="cx-card" style={{ alignSelf: "start" }}>
          <div className="cx-card-head"><span className="cx-card-title">Kamus Fitur Utama</span><span className="cx-note">Data Dictionary</span></div>
          <div className="cx-dict-list">
            <div className="cx-dict-item"><b>EXT_SOURCE_2 & EXT_SOURCE_3</b><p>Skor kredit historis dari pihak ketiga (Biro Kredit Eksternal). Nilai dinormalisasi dari 0 (sangat buruk) ke 1 (sangat baik). Ini adalah prediktor terkuat; nasabah dengan skor ini tinggi jarang sekali gagal bayar.</p></div>
            <div className="cx-dict-item"><b>AMT_INCOME_TOTAL (Penghasilan)</b><p>Total pendapatan nasabah per tahun. Merupakan tolok ukur utama untuk menghitung batas rasio kredit dan beban finansial.</p></div>
            <div className="cx-dict-item"><b>AMT_CREDIT (Ukuran Pinjaman)</b><p>Total plafon pinjaman yang dicairkan. Nilai ini seringkali lebih besar dari harga barang murni karena memperhitungkan asuransi, biaya admin, dan bunga.</p></div>
            <div className="cx-dict-item"><b>AMT_ANNUITY (Anuitas / Cicilan)</b><p>Kewajiban bayar per periode (cicilan bulanan tetap) yang harus dilunasi oleh nasabah.</p></div>
            <div className="cx-dict-item"><b>AMT_GOODS_PRICE (Harga Barang)</b><p>Harga ritel sebenarnya dari barang yang dibiayai oleh pinjaman konsumen ini (misalnya harga tunai kendaraan atau elektronik).</p></div>
            <div className="cx-dict-item"><b>DAYS_BIRTH / AGE (Umur)</b><p>Umur nasabah saat mengajukan kredit. Data mentah berbentuk hari negatif (-15000) namun di dashboard ini langsung dikonversi ke satuan Tahun (misal: 41 th) agar intuitif.</p></div>
            <div className="cx-dict-item"><b>DAYS_EMPLOYED / EMP (Masa Kerja)</b><p>Lama nasabah bekerja di perusahaan saat ini. Nasabah baru bekerja (1-3 tahun) sering belum memiliki tabungan kuat, sehingga berisiko tinggi.</p></div>
            <div className="cx-dict-item"><b>CREDIT_TO_INCOME_RATIO (Leverage / CI)</b><p>Rasio Total Pinjaman dibagi Pendapatan Tahunan. Menunjukkan berapa kali lipat utang membebani gaji. Nasabah anomali sering memiliki leverage di atas 5×.</p></div>
            <div className="cx-dict-item"><b>ANNUITY_TO_INCOME_RATIO (Beban Finansial / ANN)</b><p>Rasio Cicilan Bulanan dibagi Pendapatan. Menggambarkan kesempitan ruang finansial. Di atas 25% (0.25) biasanya sangat berisiko macet jika ada krisis.</p></div>
            <div className="cx-dict-item"><b>NAME_EDUCATION_TYPE (Pendidikan)</b><p>Tingkat pendidikan tertinggi nasabah (SMA, Sarjana, dll). Sangat berkorelasi dengan kestabilan pekerjaan dan kedewasaan finansial.</p></div>
            <div className="cx-dict-item"><b>NAME_INCOME_TYPE (Sumber Penghasilan)</b><p>Kategori pekerjaan utama (misal: Pegawai Swasta, Pensiunan, Wirausaha). Memengaruhi bobot penilaian risiko dasar.</p></div>
            <div className="cx-dict-item"><b>REGION_RATING_CLIENT (Wilayah)</b><p>Peringkat demografis domisili nasabah. Tinggal di wilayah rating teratas terbukti sangat aman dan lancar dalam pelunasan.</p></div>
          </div>
        </div>

        {/* KOLOM KANAN: ATURAN ASOSIASI */}
        <div className="cx-card" style={{ alignSelf: "start" }}>
          <div className="cx-card-head"><span className="cx-card-title">Daftar Lengkap 18 Aturan Asosiasi</span><span className="cx-note">Association Rules</span></div>
          <div className="cx-dict-list">
            
            <h4 style={{ color: "#1FB894", margin: "0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Keamanan (Pasti Lunas)</h4>
            <div className="cx-dict-item"><b>1. Kedua skor (EXT2 & EXT3) tinggi → Lunas</b><p>Kombinasi paling sakti. Jika kedua biro kredit memberi skor tinggi, nasabah memiliki probabilitas pelunasan di atas 97%.</p></div>
            <div className="cx-dict-item"><b>2. Skor tinggi + Wilayah teratas → Lunas</b><p>Skor baik ditambah domisili di lingkungan elit/rating baik adalah garansi keamanan portofolio.</p></div>
            <div className="cx-dict-item"><b>3. Kerja 15+ tahun + Skor tinggi → Lunas</b><p>Kestabilan karier (di atas 15 tahun di satu tempat) memberikan bantalan ekonomi yang kebal goncangan.</p></div>
            <div className="cx-dict-item"><b>4. Skor tinggi + Pinjaman Revolving → Lunas</b><p>Nasabah unggul sangat pandai mengelola kartu kredit atau revolving loan tanpa menunggak.</p></div>

            <h4 style={{ color: "#FF6B6B", margin: "16px 0 0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Risiko (Sinyal Gagal Bayar)</h4>
            <div className="cx-dict-item"><b>5. Kedua skor eksternal rendah → Gagal bayar</b><p>Aturan terkuat (Lift 2.28×). Peluang macet meroket lebih dari dua kali lipat rata-rata portofolio.</p></div>
            <div className="cx-dict-item"><b>6. Kerja 1–3 tahun + Skor rendah → Gagal bayar</b><p>Tenaga kerja baru tanpa tabungan darurat, ditambah histori kredit buruk, berakibat fatal pada pelunasan.</p></div>
            <div className="cx-dict-item"><b>7. Pria + Skor rendah → Gagal bayar</b><p>Data demografis historis membuktikan pria dengan skor rendah secara konsisten lebih sering menunggak dibanding demografi lain.</p></div>
            <div className="cx-dict-item"><b>8. Skor rendah + Harga barang menengah → Gagal bayar</b><p>Overkonsumsi: Memaksakan mencicil barang sekunder kelas menengah meski track record kredit sedang hancur.</p></div>
            <div className="cx-dict-item"><b>9. Umur muda + Skor rendah → Gagal bayar</b><p>Nasabah di bawah 30 tahun seringkali masih labil secara emosional dan belum stabil secara finansial.</p></div>
            <div className="cx-dict-item"><b>10. Ukuran pinjaman menengah + Skor rendah → Gagal bayar</b><p>Kredit jumlah tanggung sangat sering macet di pertengahan masa tenor pada nasabah berprofil lemah.</p></div>
            <div className="cx-dict-item"><b>11 & 12. Kombinasi Spesifik EXT_SOURCE_3</b><p>Skor 3 secara terpisah dipadukan dengan <i>Barang Menengah</i> atau <i>Pekerja Baru</i> sudah cukup untuk memicu lonjakan probabilitas gagal bayar.</p></div>

            <h4 style={{ color: "#9B5DE5", margin: "16px 0 0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Perilaku (Wawasan Produk)</h4>
            <div className="cx-dict-item"><b>13 & 14. (Gaji rendah / Muda) + Revolving → Anuitas kecil</b><p>Nasabah muda atau bergaji pas-pasan menjadikan kartu kredit (revolving) sebagai tameng transaksi karena cicilan minimalnya (anuitas) sangat rendah dibanding kredit tunai.</p></div>
            <div className="cx-dict-item"><b>15 & 16. Utang rendah + (SMA / Tanpa Mobil) → Pinjaman kecil</b><p>Nasabah tanpa aset besar dan pendidikan SMA cenderung sadar diri dan sangat konservatif; mereka selalu menghindari pinjaman berjumlah besar.</p></div>
            <div className="cx-dict-item"><b>17 & 18. (Skor rendah / Tanpa anak) + Tinggal dgn ortu → Umur muda</b><p>Korelasi sosiologis yang sangat kuat: Mereka yang masih numpang di rumah orang tua dan belum punya anak didominasi secara absolut oleh demografi usia muda.</p></div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ MAIN ============================ */

const TAB_ICON: Record<TabId, string> = {
  overview: "grid",
  about: "info",
  phase1: "filter",
  phase2: "cluster",
  phase3: "link",
  phase4: "search",
  dictionary: "book",
};

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [query, setQuery] = useState("");
  const meta = TABS.find((t) => t.id === tab)!;
  const visibleTabs = TABS.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="cx">
      <style>{styles}</style>
      <div className="cx-app">
        {/* sidebar */}
        <aside className="cx-sidebar">
          <div className="cx-sidebar-top">
            <div className="cx-brand"><span className="cx-logo" /> Group 1</div>
            <div className="cx-workspace">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home-credit-logo.png" alt="Home Credit" className="cx-workspace-logo" />
              <div className="cx-workspace-txt"><span>Default Risk Analytics</span></div>
            </div>
          </div>

          <nav className="cx-navlinks-v" role="tablist" aria-label="Phases">
            <span className="cx-navgroup-label">Navigasi</span>
            {visibleTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`cx-navlink-v ${tab === t.id ? "cx-navlink-v-on" : ""}`} onClick={() => setTab(t.id)}>
                <span className="cx-navlink-icon"><Icon name={TAB_ICON[t.id]} /></span>
                {t.label}
              </button>
            ))}
            {visibleTabs.length === 0 && <span className="cx-navempty">Tidak ada yang cocok</span>}
          </nav>

          <div className="cx-sidebar-bottom">
            <div className="cx-user">
              <span className="cx-avatar" />
              <div className="cx-user-txt"><b>Group 1</b><span>Bioline · Lidya · Matthew · Hazel · Timotheus</span></div>
            </div>
          </div>
        </aside>

        {/* main */}
        <div className="cx-main">
          <header className="cx-topbar">
            <div>
              <h1 className="cx-title">{meta.title}</h1>
              <p className="cx-kicker">{meta.kicker}</p>
            </div>
            <div className="cx-controls">
              <span className="cx-gradbtn"><Icon name="chart" /> 307.511 kredit</span>
            </div>
          </header>

          <main key={tab} className="cx-content cx-rise">
            {tab === "overview" && <Overview />}
            {tab === "about" && <About />}
            {tab === "phase1" && <Phase1 />}
            {tab === "phase2" && <Phase2 />}
            {tab === "phase3" && <Phase3 />}
            {tab === "phase4" && <Phase4 />}
            {tab === "dictionary" && <Dictionary />}
          </main>

          <footer className="cx-foot">Group 1 | Created by Bioline - Lidya - Matthew - Hazel - Timotheus</footer>
        </div>
      </div>
    </div>
  );
}

/* ============================ STYLES ============================ */

const styles = `
.cx{
  --page:#F2F4EC; --sidebar-a:#0C1712; --sidebar-b:#132A20; --card:#FFFFFF; --card2:#EEF1E7; --line:#E4E8DC;
  --ink:#141A14; --muted:#6E7768; --dim:#9AA391;
  --blue:#16A34A; --purple:#9B5DE5; --grad:#16A34A;
  --up:#1FB894; --down:#FF6B6B; --warn:#F5A524;
  --body:var(--font-geist-sans),system-ui,sans-serif;
  min-height:100vh; background:var(--page); font-family:var(--body); color:var(--ink);
  padding:0; -webkit-font-smoothing:antialiased;
}
.cx *{box-sizing:border-box;}
.cx-app{display:flex; align-items:stretch; min-height:100vh;}

/* sidebar */
.cx-sidebar{width:264px; flex:none; display:flex; flex-direction:column; gap:24px; padding:22px 16px 18px; color:#EAF2EC; background:linear-gradient(175deg, var(--sidebar-a), var(--sidebar-b)); position:sticky; top:0; height:100vh; overflow-y:auto;}
.cx-sidebar-top{display:flex; flex-direction:column; gap:14px;}
.cx-brand{display:flex; align-items:center; gap:9px; font-weight:700; font-size:16px; letter-spacing:-.01em; color:#fff; padding:0 2px;}
.cx-logo{width:20px; height:20px; border-radius:7px; background:var(--blue);}
.cx-workspace{display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.09); border-radius:13px; padding:9px 11px; cursor:pointer; color:#EAF2EC;}
.cx-workspace-logo{height:22px; width:auto; flex:none; display:block;}
.cx-workspace-txt{display:flex; flex-direction:column; justify-content:center; line-height:1.2; flex:1; min-width:0;}
.cx-workspace-txt span{font-size:10.5px; color:rgba(234,242,236,.55);}
.cx-search{display:flex; align-items:center; gap:9px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.09); border-radius:11px; padding:9px 11px; color:rgba(234,242,236,.5);}
.cx-search input{appearance:none; background:none; border:none; outline:none; color:#EAF2EC; font-family:var(--body); font-size:12.5px; width:100%;}
.cx-search input::placeholder{color:rgba(234,242,236,.4);}

.cx-navlinks-v{display:flex; flex-direction:column; gap:2px; flex:1;}
.cx-navgroup-label{font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:rgba(234,242,236,.35); padding:6px 12px 8px;}
.cx-navlink-v{display:flex; align-items:center; gap:11px; appearance:none; background:none; border:none; cursor:pointer; color:rgba(234,242,236,.65); font-family:var(--body); font-size:13.5px; font-weight:500; padding:10px 12px; border-radius:11px; transition:all .15s; text-align:left; width:100%;}
.cx-navlink-icon{display:grid; place-items:center; width:20px; height:20px; flex:none;}
.cx-navlink-v:hover{color:#fff; background:rgba(255,255,255,.07);}
.cx-navlink-v-on{color:var(--sidebar-a); background:#EAF2EC; font-weight:600;}
.cx-navempty{padding:8px 12px; font-size:12px; color:rgba(234,242,236,.4);}

.cx-sidebar-bottom{border-top:1px solid rgba(255,255,255,.09); padding-top:16px;}
.cx-user{display:flex; align-items:center; gap:10px;}
.cx-avatar{width:34px; height:34px; border-radius:50%; background:var(--grad); flex:none;}
.cx-user-txt{display:flex; flex-direction:column; line-height:1.25; min-width:0;}
.cx-user-txt b{font-size:12.5px; font-weight:600; color:#fff;}
.cx-user-txt span{font-size:10px; color:rgba(234,242,236,.5); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;}

/* main / topbar */
.cx-main{flex:1; min-width:0; padding:26px 32px 48px;}
.cx-topbar{display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:2px 2px 20px;}
.cx-title{margin:0; font-size:25px; font-weight:700; letter-spacing:-.02em; color:var(--ink);}
.cx-kicker{margin:5px 0 0; font-size:13.5px; color:var(--muted);}
.cx-controls{display:flex; align-items:center; gap:10px;}
.cx-pill{font-size:12.5px; color:var(--muted); background:var(--card); border:1px solid var(--line); padding:8px 14px; border-radius:10px;}
.cx-iconbtn{display:grid; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--card); border:1px solid var(--line); color:var(--muted); cursor:pointer;}
.cx-iconbtn:hover{color:var(--ink); border-color:var(--dim);}
.cx-gradbtn{display:inline-flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:#fff; background:var(--ink); padding:10px 16px; border-radius:11px;}

.cx-content{display:flex; flex-direction:column; gap:16px;}
.cx-rise{animation:cx-rise .45s cubic-bezier(.22,.61,.36,1) both;}
@keyframes cx-rise{from{opacity:0; transform:translateY(9px);} to{opacity:1; transform:none;}}
@media (prefers-reduced-motion:reduce){.cx-rise{animation:none;}}

/* kpis */
.cx-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:16px;}
.cx-kpi{background:var(--card); border:1px solid var(--line); border-radius:18px; padding:18px 19px;}
.cx-kpi-feature{background:linear-gradient(160deg, var(--sidebar-a), var(--sidebar-b)); border-color:transparent;}
.cx-kpi-feature .cx-kpi-label{color:rgba(234,242,236,.6);}
.cx-kpi-feature .cx-kpi-icon{background:rgba(255,255,255,.12); color:#EAF2EC;}
.cx-kpi-feature .cx-kpi-val{color:#fff;}
.cx-kpi-feature .cx-chip-flat{color:rgba(234,242,236,.75); background:rgba(255,255,255,.12);}
.cx-kpi-top{display:flex; align-items:center; justify-content:space-between; gap:8px;}
.cx-kpi-label{font-size:12.5px; color:var(--muted);}
.cx-kpi-icon{display:grid; place-items:center; width:28px; height:28px; border-radius:9px; background:var(--card2); color:var(--muted);}
.cx-kpi-body{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px;}
.cx-kpi-val{font-size:26px; font-weight:700; letter-spacing:-.02em;}
.cx-chip{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; padding:4px 9px; border-radius:999px; margin-top:10px; max-width:100%; white-space:normal; line-height:1.35;}
.cx-chip b{font-size:11px;}
.cx-chip-up{color:var(--up); background:rgba(31,184,148,.12);}
.cx-chip-down{color:var(--down); background:rgba(255,107,107,.12);}
.cx-chip-warn{color:var(--warn); background:rgba(245,165,36,.12);}
.cx-chip-flat{color:var(--muted); background:var(--card2);}

/* sparkline motif */
.cx-spark{display:flex; align-items:flex-end; gap:2.5px; height:34px; width:58px; flex:none;}
.cx-spark span{flex:1; min-height:3px; border-radius:2px; background:currentColor; opacity:.9;}
.cx-spark-up{color:var(--up);}
.cx-spark-down{color:var(--down);}
.cx-spark-warn{color:var(--warn);}
.cx-spark-flat{color:var(--dim);}
.cx-kpi-feature .cx-spark{color:rgba(234,242,236,.55) !important;}

/* cards / grid */
.cx-card{background:var(--card); border:1px solid var(--line); border-radius:18px; padding:20px 22px;}
.cx-card-head{display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px;}
.cx-card-title{font-size:15px; font-weight:600;}
.cx-note{font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--dim);}
.cx-eyebrow{font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--blue);}
.cx-lead{margin:0; font-size:14px; color:var(--muted); line-height:1.6; max-width:78ch;}
.cx-grid{display:grid; gap:16px;}
.cx-grid-2{grid-template-columns:1fr 1fr;}
.cx-grid-3-2{grid-template-columns:1.35fr 1fr;}
.cx-grid-2-3{grid-template-columns:.9fr 1.1fr;}

/* takeaway */
.cx-takeaway{background:var(--card2); border:1px solid var(--line); border-radius:16px; padding:20px 22px;}
.cx-takeaway p{margin:10px 0 0; font-size:clamp(16px,2vw,20px); line-height:1.5; max-width:80ch;}
.cx-takeaway em{font-style:normal; color:var(--blue); font-weight:600;}
.cx-takeaway strong{color:var(--ink); font-weight:700;}

/* donut */
.cx-donutwrap{display:flex; gap:22px; align-items:center; flex-wrap:wrap;}
.cx-donut{position:relative; width:150px; height:150px; flex:none;}
.cx-donut-center{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none;}
.cx-donut-big{font-size:24px; font-weight:700; letter-spacing:-.02em;}
.cx-donut-sub{font-size:10.5px; color:var(--muted); margin-top:2px; max-width:120px; text-align:center;}
.cx-legend{flex:1; min-width:190px; display:flex; flex-direction:column; gap:9px;}
.cx-legrow{display:flex; align-items:center; gap:9px; font-size:12.5px; transition:opacity .2s; cursor:default;}
.cx-legdot{width:10px; height:10px; border-radius:3px; flex:none;}
.cx-leglabel{color:var(--muted); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.cx-legval{font-weight:700;}

/* vertical bars + tooltip */
.cx-vbars{position:relative; padding-top:58px;}
.cx-vplot{display:flex; align-items:flex-end; gap:16px; height:150px;}
.cx-vcol{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; cursor:pointer;}
.cx-vbar{width:100%; max-width:54px; border-radius:8px 8px 4px 4px; background:var(--card2); min-height:6px; transition:all .4s ease;}
.cx-vbar-on{background:var(--blue);}
.cx-vlabel{margin-top:9px; font-size:11.5px; color:var(--muted);}
.cx-vtip{position:absolute; top:0; transform:translateX(-50%); background:var(--card2); border:1px solid var(--line); border-radius:11px; padding:9px 13px; min-width:150px; text-align:center; transition:left .18s;}
.cx-vtip-t{font-size:13px; font-weight:600;}
.cx-vtip-s{font-size:11px; color:var(--muted); margin-top:2px;}

/* tracks / bars shared */
.cx-track{height:9px; margin-top:7px; background:var(--card2); border-radius:999px; overflow:hidden;}
.cx-fill{display:block; height:100%; border-radius:999px; transition:all .4s ease;}
.cx-fill-grad{background:var(--blue);}
.cx-fill-warm{background:var(--warn);}

/* feature funnel + methods share */
.cx-funnel,.cx-methods{display:flex; flex-direction:column; gap:15px;}
.cx-fhead{display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size:13.5px;}
.cx-fnum{font-weight:700; font-size:15px;}
.cx-mnum{font-weight:700; font-size:13px; color:var(--muted);}
.cx-fnote{font-size:11.5px; color:var(--muted); margin-top:6px; transition:opacity .2s;}
.cx-subtle{font-size:13px; color:var(--muted); margin:16px 0 0;}
.cx-subtle b{color:var(--ink);}

/* dumbbell */
.cx-dumbbell{width:100%; height:auto; display:block; overflow:visible;}
.cx-svg-leg{font-family:var(--body); font-size:12px; font-weight:600; fill:var(--ink);}
.cx-svg-axis{stroke:var(--line); stroke-width:1.4;}
.cx-svg-tick{font-family:var(--body); font-size:11px; fill:var(--muted);}
.cx-svg-axlab{font-family:var(--body); font-size:10.5px; font-weight:600; letter-spacing:.04em; fill:var(--muted);}
.cx-svg-prof{font-family:var(--body); font-size:14px; font-weight:600; fill:var(--ink); transition:all .4s ease;}
.cx-svg-profsub{font-family:var(--body); font-size:10.5px; fill:var(--dim);}
.cx-svg-val{font-family:var(--body); font-size:13.5px; font-weight:700;}
.cx-svg-delta{font-family:var(--body); font-size:12.5px; font-weight:700; fill:var(--muted);}
.cx-svg-deltasub{font-family:var(--body); font-size:10.5px; fill:var(--dim);}
.cx-caption{margin-top:14px; padding:13px 16px; border:1px solid var(--line); border-left-width:4px; border-radius:12px; background:var(--card2); font-size:13.5px; line-height:1.5; min-height:44px; transition:border-left-color .2s;}

/* rules */
.cx-rules{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:17px;}
.cx-rhead{display:flex; justify-content:space-between; align-items:baseline; gap:10px;}
.cx-rlabel{font-size:13.5px;}
.cx-rval{font-size:15px; font-weight:700;}
.cx-raction{font-size:11.5px; color:var(--muted); margin-top:7px; line-height:1.45; transition:opacity .2s;}

/* personas */
.cx-personas-2{display:grid; grid-template-columns:1fr 1fr; gap:0 22px;}
.cx-personas{list-style:none; margin:0; padding:0; display:flex; flex-direction:column;}
.cx-personas li{display:grid; grid-template-columns:11px 1fr auto; grid-template-rows:auto auto; gap:2px 12px; align-items:start; padding:12px 0; border-top:1px solid var(--line);}
.cx-personas li:first-child{border-top:none;}
.cx-pdot{width:11px; height:11px; border-radius:50%; margin-top:4px; grid-row:1;}
.cx-pname{font-size:13px; font-weight:600; grid-column:2; grid-row:1;}
.cx-ptrait{display:block; font-size:11px; font-weight:400; color:var(--muted); margin-top:3px; transition:opacity .2s;}
.cx-pnums{grid-column:3; grid-row:1; display:flex; gap:14px; text-align:right;}
.cx-pnums .cx-num{font-size:13.5px; font-weight:700; min-width:40px; display:inline-block;}
.cx-pcap{grid-column:3; grid-row:2; display:flex; gap:14px; justify-content:flex-end;}
.cx-pcap span{font-size:8.5px; letter-spacing:.05em; text-transform:uppercase; color:var(--dim); min-width:40px; text-align:right;}

/* verdict */
.cx-verdict{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
.cx-vcard{padding:20px;}
.cx-vnum{font-size:27px; font-weight:700; letter-spacing:-.02em;}
.cx-vlabel{font-size:14px; font-weight:600; margin-top:3px;}
.cx-vnote{font-size:12px; color:var(--muted); margin-top:8px; line-height:1.5;}

.cx-foot{font-size:11px; color:var(--dim); margin-top:22px; line-height:1.6; max-width:92ch;}

/* horizontal bars (MI, lift, agreement, anomalies) */
.cx-hbars{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px;}
.cx-hb-head{display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size:13px;}
.cx-hb-head span:first-child{color:var(--ink);}
.cx-hb-val{font-weight:700; font-size:13.5px;}

/* feature explorer */
.cx-fpills{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;}
.cx-fpill{appearance:none; cursor:pointer; font-family:var(--body); font-size:11.5px; font-weight:500; color:var(--muted); background:var(--card2); border:1px solid var(--line); border-radius:999px; padding:6px 11px; transition:all .15s;}
.cx-fpill:hover{color:var(--ink);}
.cx-fpill-on{color:#fff; background:var(--blue); border-color:transparent;}

/* toggle (radar pair, elbow table) */
.cx-toggle{display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;}
.cx-toggle-btn{appearance:none; cursor:pointer; font-family:var(--body); font-size:12px; font-weight:600; color:var(--muted); background:var(--card2); border:1px solid var(--line); border-radius:9px; padding:7px 12px; transition:all .15s;}
.cx-toggle-btn:hover{color:var(--ink);}
.cx-toggle-on{color:#fff; background:var(--blue); border-color:transparent;}

/* svg charts shared */
.cx-cmap,.cx-radar,.cx-elbow,.cx-scatter,.cx-dumbbell{width:100%; height:auto; display:block; overflow:visible;}
.cx-cmap circle, .cx-radar path, .cx-radar text, .cx-radar line, .cx-elbow path, .cx-elbow circle, .cx-scatter circle, .cx-scatter path, .cx-dumbbell circle, .cx-dumbbell line { transition: all .4s ease; }
.cx-cmap-id{font-family:var(--body); font-size:11px; font-weight:700; fill:#fff;}
.cx-radar-lab{font-family:var(--body); font-size:10px; fill:var(--muted);}
.cx-scatter-legend{display:flex; flex-wrap:wrap; gap:14px; align-items:center; margin-top:8px; font-size:11.5px; color:var(--muted);}
.cx-scatter-legend span{display:inline-flex; align-items:center; gap:6px;}
.cx-scatter-legend i{width:10px; height:10px; border-radius:50%; display:inline-block;}

/* outlier profile */
.cx-op{display:flex; flex-direction:column; gap:14px;}
.cx-op-m{font-size:13px; margin-bottom:8px;}
.cx-op-bars{display:flex; flex-direction:column; gap:7px;}
.cx-op-bar{display:flex; align-items:center; gap:10px;}
.cx-op-track{flex:1; height:9px; background:var(--card2); border-radius:999px; overflow:hidden;}
.cx-op-fill{display:block; height:100%; border-radius:999px; transition:all .4s ease;}
.cx-op-v{min-width:42px; text-align:right; font-size:12px; font-weight:700; color:var(--muted);}
.cx-op-leg{display:flex; gap:16px; font-size:11.5px; color:var(--muted); margin-top:2px;}
.cx-op-leg span{display:inline-flex; align-items:center; gap:6px;}
.cx-op-leg i{width:10px; height:10px; border-radius:3px; display:inline-block;}

/* per-record placeholder */
.cx-ph{display:flex; flex-direction:column; justify-content:center; min-height:150px; padding:6px 2px;}
.cx-ph-title{font-size:14px; font-weight:600; color:var(--muted);}
.cx-ph-txt{font-size:12.5px; color:var(--dim); line-height:1.65; margin:9px 0 0;}
.cx code{background:var(--card2); border:1px solid var(--line); border-radius:5px; padding:1px 5px; font-size:11.5px; color:var(--ink); font-family:var(--mono,ui-monospace,monospace);}

/* about — dataset table */
.cx-tablewrap{overflow-x:auto;}
.cx-table{width:100%; border-collapse:collapse; font-size:13px;}
.cx-table th{text-align:left; font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--dim); padding:0 12px 10px; border-bottom:1px solid var(--line);}
.cx-table td{padding:11px 12px; border-bottom:1px solid var(--line); color:var(--muted); vertical-align:top;}
.cx-table tr:last-child td{border-bottom:none;}
.cx-table td:first-child{color:var(--ink); white-space:nowrap;}
.cx-table td:nth-child(2){font-weight:700; color:var(--ink); white-space:nowrap;}
.cx-th-sort{cursor:pointer; user-select:none;}
.cx-th-sort:hover{color:var(--ink);}

/* about — segmented control */
.cx-segmented{display:flex; gap:4px; flex-wrap:wrap;}
.cx-segbtn{appearance:none; cursor:pointer; font-family:var(--body); font-size:12.5px; font-weight:600; color:var(--muted); background:none; border:none; border-radius:11px; padding:10px 14px; transition:all .15s;}
.cx-segbtn:hover{color:var(--ink); background:var(--card2);}
.cx-segbtn-on{color:#fff; background:var(--ink);}

/* about — key pills */
.cx-keypills{display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;}
.cx-keypill{display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:var(--muted); background:var(--card2); border:1px solid var(--line); border-radius:999px; padding:6px 12px; cursor:default; transition:all .15s;}
.cx-keypill i{width:8px; height:8px; border-radius:50%; flex:none;}
.cx-keydot{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px;}

/* about — relation diagram */
.cx-reldiagram{width:100%; height:auto; display:block; overflow:visible;}
.cx-reldiagram-label{font-family:var(--body); font-size:11.5px; font-weight:600; fill:var(--ink);}
.cx-dict-item-on{background:var(--card);}

/* about — accordion (conventions) */
.cx-accordion{display:flex; flex-direction:column; gap:8px;}
.cx-accitem{background:var(--card2); border:1px solid var(--line); border-radius:12px; overflow:hidden; transition:border-color .2s;}
.cx-accitem-on{border-color:var(--blue);}
.cx-acchead{appearance:none; width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; background:none; border:none; cursor:pointer; padding:14px 16px; font-family:var(--body); font-size:13.5px; font-weight:600; color:var(--ink); text-align:left;}
.cx-accchev{display:grid; place-items:center; color:var(--muted); transition:transform .2s;}
.cx-accbody{margin:0; padding:0 16px 16px; font-size:13px; color:var(--muted); line-height:1.55;}

/* about — pipeline steps */
.cx-steps{display:flex; flex-direction:column;}
.cx-step{position:relative; padding-left:2px;}
.cx-stepline{position:absolute; left:15px; top:36px; bottom:-8px; width:1px; background:var(--line);}
.cx-stepbtn{appearance:none; width:100%; display:flex; align-items:center; gap:12px; background:none; border:none; cursor:pointer; padding:9px 4px; font-family:var(--body); text-align:left;}
.cx-stepnum{display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:var(--card2); border:1px solid var(--line); color:var(--muted); font-size:13px; font-weight:700; flex:none; z-index:1;}
.cx-stepbtn-on .cx-stepnum{background:var(--blue); border-color:transparent; color:#fff;}
.cx-steptitle{font-size:14px; font-weight:600; color:var(--ink);}
.cx-stepbody{margin:2px 0 14px 46px; font-size:13px; color:var(--muted); line-height:1.6; max-width:70ch;}

/* dictionary */
.cx-dict-list{display:flex; flex-direction:column; gap:16px;}
.cx-dict-item{background:var(--card2); border:1px solid var(--line); border-radius:12px; padding:16px; transition:border-color .2s;}
.cx-dict-item:hover{border-color:var(--blue);}
.cx-dict-item b{font-size:14px; color:var(--ink); display:block; margin-bottom:6px;}
.cx-dict-item p{font-size:13px; color:var(--muted); margin:0; line-height:1.55;}

@media (max-width:900px){
  .cx-kpis{grid-template-columns:1fr 1fr;}
  .cx-grid-2,.cx-grid-3-2,.cx-grid-2-3{grid-template-columns:1fr;}
  .cx-verdict{grid-template-columns:1fr;}
  .cx-personas-2{grid-template-columns:1fr;}
  .cx-sidebar{display:none;}
  .cx-main{padding:20px 18px 40px;}
}
`;

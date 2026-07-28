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

/* ============================ COLOR SYSTEM ============================ */
/**
 * One palette for the whole page, anchored on the Home Credit green.
 * The two populations get two harmonised hue families so colour itself carries meaning:
 *   PAID / lunas  → greens (teal → green → olive)
 *   DEFAULT/gagal → warms  (rose → orange → deep rose)
 * Semantic tokens sit on the same scale so charts, chips and text never drift apart.
 */
const C = {
  safe: "#15803D",   // lunas / proteksi
  risk: "#E11D48",   // gagal bayar / risiko
  warn: "#D97706",   // anomali / perlu review
  info: "#0F766E",   // metodologi / netral
  ink: "#12211A",
  muted: "#6B7666",
  dim: "#9AA48F",
  line: "#DFE5D4",
  grid: "#D7DECB",
  card: "#FFFFFF",
  // paid personas — green family
  P0: "#0F766E", P1: "#15803D", P2: "#4D7C0F",
  // default personas — warm family
  D0: "#E11D48", D1: "#EA580C", D2: "#9F1239",
} as const;

/* ============================ DATA ============================ */

const BOOK = { customers: 307511, defaulters: 24825, repaid: 282686, defaultRate: 8.07 };

const FUNNEL = [
  { stage: "Semua feature hasil agregasi + encoding", n: 680, note: "Gabungan 8 tabel mentah setelah feature engineering." },
  { stage: "Variance Threshold (var < 0,01)", n: 493, note: "−187 kolom nyaris konstan — tak punya daya pisah, dibuang duluan karena murah." },
  { stage: "Correlation Pruning (|r| > 0,9)", n: 311, note: "−182 kolom redundan — dua fitur ber-r>0,9 membawa info hampir identik." },
  { stage: "Hierarchical Clustering korelasi (t = 0,4)", n: 185, note: "Redundansi berkelompok; tiap kelompok diwakili fitur paling sentral secara statistik." },
];

/* Stage 1 — data quality & cleaning audit (phase1.md §3) */
const CLEANING_STEPS = [
  { id: "dup", title: "Hapus duplikat", metric: "0", unit: "baris duplikat", detail: "Dedupe pada SK_ID_CURR — 1 nasabah harus 1 baris. Hasil: nol duplikat, kunci sudah unik.", why: "SK_ID_CURR adalah primary key; duplikat akan menggandakan bobot nasabah yang sama." },
  { id: "sentinel", title: "Sentinel DAYS_EMPLOYED = 365243", metric: "~55.000", unit: "baris (~18%)", detail: "Nilai positif setara ≈1.000 tahun — kode 'tidak bekerja' (mayoritas pensiunan). Ditangani 2 langkah: simpan flag biner DAYS_EMPLOYED_ANOM, lalu nilai → NaN + imputasi median.", why: "Dibiarkan: outlier ekstrem merusak mean/varians & jarak clustering. Diisi 0: salah makna ('mulai kerja hari ini'). Dihapus: buang 55k nasabah nyata. NaN + flag menjaga makna tanpa kehilangan data." },
  { id: "xna", title: "CODE_GENDER = 'XNA'", metric: "4", unit: "baris → modus", detail: "XNA = tidak diketahui (bukan gender ketiga). Diisi modus (F), dihitung tanpa menyertakan XNA sendiri.", why: "Kategorikal tak punya rata-rata; modus = tebakan paling mungkin. Hanya 4 dari 356k baris, dampak distribusi nyaris nol." },
  { id: "miss50", title: "Drop kolom missing > 50%", metric: "37", unit: "kolom dibuang", detail: "Seluruh blok atribut properti (APARTMENTS/…_AVG/_MODE/_MEDI), OWN_CAR_AGE, dan EXT_SOURCE_1 (~56% kosong). SK_ID_CURR & TARGET dilindungi eksplisit.", why: "Di atas 50% kosong, imputasi lebih banyak 'tebakan' daripada data nyata." },
  { id: "impute", title: "Imputasi sisa missing", metric: "0", unit: "nilai kosong tersisa", detail: "Numerik → median; kategorikal → modus. Diterapkan pada gabungan train+test agar skala & set kolom konsisten.", why: "Median tahan outlier (mean tertarik ekor panjang kolom finansial); modus = nilai paling mungkin untuk kategori." },
  { id: "winsor", title: "Winsorize kolom moneter", metric: "p1 / p99", unit: "clipping", detail: "AMT_INCOME_TOTAL, AMT_CREDIT, AMT_ANNUITY, AMT_GOODS_PRICE di-clip ke persentil 1–99. Contoh: income di-cap ke rentang 45.000–486.000 (5.211 nilai tersentuh).", why: "Income ekstrem membajak skala MinMax & jarak clustering. Clip menahan 1% ekor tanpa membuang satu baris pun." },
];

/* Stage 1 — transformation & the two output pipelines (phase1.md §5, §8-9) */
const TRANSFORM_STEPS = [
  { title: "Label encoding (biner)", detail: "Kolom kategorikal dengan tepat 2 nilai di-map ke 0/1 langsung — tak perlu menambah dimensi.", tag: "Encoding" },
  { title: "One-Hot encoding (sisanya)", detail: "Kategorikal multi-nilai diperluas jadi kolom dummy. Inilah sumber utama membengkaknya fitur ke 680.", tag: "Encoding" },
  { title: "Agregasi ke level nasabah", detail: "Tiap tabel riwayat diringkas count/mean/max/sum ke SK_ID_CURR, lalu left-join → train_master (307.511 × 573). Prefix BURO_/PREV_/POS_/CC_/INST_ menandai asalnya.", tag: "Feature Engineering" },
  { title: "Pipeline A — scaling untuk clustering", detail: "Kolom kontinu di-skala; kolom One-Hot dibiarkan apa adanya. Menghasilkan clustering_dataset.csv (185 fitur numerik).", tag: "Output" },
  { title: "Pipeline B — binning untuk Apriori", detail: "19 atribut interpretable didiskretisasi jadi kategori bernama (quintile/tertile/ambang domain) → apriori_dataset.csv.", tag: "Output" },
];

/* Stage 2 — the three clustering algorithms, their parameters and justification (phase2.md §5–7) */
type Algo = {
  id: string; name: string; kind: string; scope: string; color: string;
  params: { k: string; v: string; why: string }[];
  result: string;
  interpret: string;
};
const ALGOS: Algo[] = [
  {
    id: "kmeans", name: "K-Means", kind: "Partitional", scope: "Per tabel — DEFAULT & PAID di-cluster terpisah", color: C.safe,
    params: [
      { k: "K", v: "3 (dipilih independen tiap tabel)", why: "Silhouette tertinggi di antara solusi non-trivial (K ≥ 3), diselaraskan dengan siku inertia. Kedua tabel kebetulan sama-sama memilih 3." },
      { k: "Input", v: "17 fitur → log1p → StandardScaler", why: "Fitur finansial sangat skewed; signed log1p menormalkan sebelum penskalaan." },
      { k: "Scaler", v: "satu scaler untuk kedua tabel", why: "Di-fit pada seluruh populasi SEBELUM split, supaya DEFAULT & PAID berada di skala identik — prasyarat agar kontras lintas-populasi bermakna, bukan artefak skala." },
    ],
    result: "6 persona: D0/D1/D2 (gagal bayar) + P0/P1/P2 (lunas)",
    interpret: "Silhouette rendah (≈0,09) adalah sinyal jujur bahwa data finansial berbentuk continuum, bukan gugus terpisah — konsisten dengan temuan DBSCAN & Hierarchical di bawah.",
  },
  {
    id: "dbscan", name: "DBSCAN", kind: "Density-based", scope: "Sekali pada sampel 20k baris gabungan", color: C.warn,
    params: [
      { k: "Ruang", v: "17 fitur ter-PCA", why: "PCA mendekorelasi sumbu supaya jarak kepadatan tidak didominasi fitur yang saling berkorelasi." },
      { k: "Sampel", v: "20.000 baris gabungan", why: "DBSCAN berskala kuadratik terhadap jumlah baris; sampel gabungan menjaga komputasi wajar tanpa memihak salah satu populasi." },
      { k: "Penafsiran", v: "lewat label K-Means + TARGET", why: "DBSCAN meng-cluster vektor fitur, bukan label. Hasilnya dibaca ulang per populasi memakai label K-Means sebagai lensa." },
    ],
    result: "1 klaster padat + 199 noise (~1,0%)",
    interpret: "Hanya satu klaster padat = data membentuk satu kontinum, bukan gumpalan terpisah. Noise rate DEFAULT 1,20% vs PAID 0,98% — outlier struktural sedikit lebih pekat di populasi gagal bayar, tapi selisihnya kecil.",
  },
  {
    id: "hier", name: "Hierarchical (Agglomerative)", kind: "Hierarchical", scope: "Sekali pada sampel gabungan", color: C.P2,
    params: [
      { k: "Linkage", v: "4 dibandingkan → Ward dipakai", why: "Ward paling seimbang; single & average membentuk 'rantai' — ciri khas data kontinum, bukan gugus." },
      { k: "Validasi", v: "Adjusted Rand Index (ARI)", why: "Mengukur kesepakatan partisi terhadap partisi lain, sudah dikoreksi terhadap kebetulan." },
    ],
    result: "ARI Ward(K=2) vs TARGET = −0,001",
    interpret: "Nyaris nol: default & paid BUKAN dua gumpalan geometris terpisah — mereka tumpang tindih. Justru inilah pembenaran memisahkan tabel lebih dulu secara supervised; clustering unsupervised tak akan pernah memulihkan pemisahan itu sendiri. ARI Ward vs K-Means: DEFAULT 0,22 / PAID 0,25 (kesepakatan moderat, wajar untuk continuum).",
  },
];

/* Stage 5 — Knowledge synthesis: "What knowledge did we discover?" (rubrik 5.2 Excellent) */
type Knowledge = {
  id: string; headline: string; claim: string; kind: "risk" | "safe" | "method";
  evidence: { phase: string; text: string }[];
  action: string;
  value: string;
};
const KNOWLEDGE: Knowledge[] = [
  {
    id: "ext", kind: "risk",
    headline: "Skor kredit eksternal — bukan besarnya pinjaman — yang memisahkan gagal bayar dari lunas",
    claim: "Di setiap pasangan segmen yang profil pinjamannya setara, pembedanya selalu skor EXT_SOURCE yang lebih rendah. Besar pinjaman dan penghasilan hampir tidak membedakan apa-apa ketika dibandingkan secara adil.",
    evidence: [
      { phase: "Fase 1", text: "Mutual Information menempatkan EXT_SOURCE_2 (0,0154) dan EXT_SOURCE_3 (0,0127) di puncak, terpaut jelas dari fitur berikutnya (anuitas 0,0095)." },
      { phase: "Fase 2", text: "Ketiga pasangan kembar lintas-populasi berbeda konsisten pada skor: D0↔P1 −0,13 · D1↔P0 −0,11 · D2↔P2 −0,10 — pada leverage yang setara." },
      { phase: "Fase 3", text: "Kedelapan aturan risiko berporos pada EXT_SOURCE=Low; kombinasi kedua skor rendah memberi lift tertinggi 2,28×." },
    ],
    action: "Prioritaskan verifikasi skor pihak-ketiga di underwriting, dan beri bobot terbesar pada fitur ini beserta interaksinya di model scoring.",
    value: "Pembeda paling tajam yang tersedia — berlaku lintas semua segmen, bukan hanya sebagian.",
  },
  {
    id: "interaction", kind: "risk",
    headline: "Risiko lahir dari interaksi, bukan dari satu atribut mana pun",
    claim: "Tidak satu pun atribut tunggal cukup untuk menaikkan risiko secara berarti. Default melonjak hanya ketika skor rendah berpasangan dengan faktor kerentanan kedua — masa kerja pendek, usia muda, atau leverage menengah.",
    evidence: [
      { phase: "Fase 3", text: "Semua aturan risiko yang lolos ambang adalah kombinasi 2 item. Skor rendah sendirian tidak masuk daftar; berpasangan, liftnya 1,88–2,28×." },
      { phase: "Fase 3", text: "EXT_SOURCE_2 dan EXT_SOURCE_3 adalah dua skor independen yang menghasilkan pola risiko sama — saling memvalidasi, bukan artefak satu sumber." },
      { phase: "Fase 2", text: "Persona D0 (muda + skor terendah) memang punya kedua faktor sekaligus — konsisten dengan aturan #15 di Fase 3." },
    ],
    action: "Rancang credit scoring berbasis interaksi (kombinasi fitur), bukan ambang per-atribut yang dievaluasi sendiri-sendiri.",
    value: "Menjelaskan kenapa scorecard sederhana per-atribut gagal menangkap segmen berisiko ini.",
  },
  {
    id: "twins", kind: "risk",
    headline: "Ada “kembaran berisiko”: profil pinjaman identik dengan nasabah baik, tapi skor lebih rendah",
    claim: "Untuk tiap persona gagal bayar, ada persona lunas dengan profil pinjaman nyaris identik. Mereka tak bisa dibedakan lewat besar pinjaman, penghasilan, atau leverage — hanya lewat skor dan usia/masa kerja.",
    evidence: [
      { phase: "Fase 2", text: "D0↔P1 sama-sama pinjaman kecil (rasio ~2); D1↔P0 sama-sama over-leveraged (rasio ~6,4–6,9); D2↔P2 sama-sama berpenghasilan tinggi dengan pinjaman terjangkau." },
      { phase: "Fase 2", text: "Yang gagal bayar konsisten 1–5 tahun lebih muda dan masa kerjanya lebih pendek." },
    ],
    action: "Fokuskan underwriting pada nasabah yang mirip profil segmen aman tetapi ber-EXT_SOURCE rendah — inilah titik di mana keputusan paling sering salah.",
    value: "Jauh lebih tajam daripada “segmen ini default rate-nya tinggi”, karena membandingkan yang setara.",
  },
  {
    id: "notgeom", kind: "method",
    headline: "Gagal bayar dan lunas bukan dua gumpalan terpisah di ruang fitur — mereka tumpang tindih",
    claim: "Struktur geometris data sama sekali tidak sejajar dengan label pelunasan. Clustering unsupervised tidak akan pernah menemukan pemisahan default/paid dengan sendirinya.",
    evidence: [
      { phase: "Fase 2", text: "ARI Ward (K=2) terhadap TARGET = −0,001 — praktis nol, artinya tak ada kesepakatan sama sekali." },
      { phase: "Fase 2", text: "DBSCAN menemukan hanya 1 klaster padat + 199 noise (~1,0%): data membentuk satu kontinum, bukan gugus terpisah." },
      { phase: "Fase 2", text: "Silhouette K-Means rendah (≈0,09) di kedua tabel — konsisten dengan sifat continuum, bukan kegagalan model." },
    ],
    action: "Inilah pembenaran memisahkan tabel lebih dulu secara supervised (DEFAULT vs PAID), lalu meng-cluster masing-masing. Jangan berharap segmentasi murni unsupervised memulihkan risiko.",
    value: "Keputusan metodologis yang bisa dipertahankan dengan angka, bukan selera.",
  },
  {
    id: "anomaly", kind: "method",
    headline: "Anomali statistik bukan sinyal gagal bayar — keduanya mengukur hal berbeda",
    claim: "Anomali justru menumpuk di persona berpinjaman besar, dan lebih pekat di populasi yang LUNAS. Deteksi anomali menangkap magnitude finansial; risiko gagal bayar ditentukan skor yang “biasa-biasa tapi buruk”.",
    evidence: [
      { phase: "Fase 4", text: "High-confidence anomaly: populasi paid 10,05% vs default 6,87% — terbalik dari dugaan intuitif." },
      { phase: "Fase 4", text: "Menumpuk di P0 (15,0%), P2 (12,6%), D1 (10,6%) — semuanya persona leverage/pinjaman besar; persona pinjaman kecil D0 (2,4%) dan P1 (3,8%) justru bersih." },
      { phase: "Fase 4", text: "RARE_LEGITIMATE (26.139 nasabah) punya default 5,20% — di BAWAH base rate 8,07%." },
    ],
    action: "Pisahkan pipeline anomaly review dari credit risk scoring. Anomali dipakai untuk audit & manual review, bukan sebagai proxy risiko.",
    value: "Mencegah kesalahan mahal: menolak nasabah kaya yang sah karena angkanya terlihat ekstrem.",
  },
  {
    id: "safeseg", kind: "safe",
    headline: "Segmen aman besar dan mudah dikenali: 12,3% nasabah dengan pelunasan 97,7%",
    claim: "Kombinasi kedua skor eksternal tinggi menandai sekitar 38.000 nasabah yang hampir pasti lunas — segmen tunggal terbesar sekaligus paling andal dalam seluruh analisis.",
    evidence: [
      { phase: "Fase 3", text: "Aturan proteksi #8: EXT_SOURCE_2=High + EXT_SOURCE_3=High → Repaid, confidence 97,7% pada support 12,3%." },
      { phase: "Fase 3", text: "Tiga aturan proteksi lain (wilayah rating atas, masa kerja 15+ th, revolving) semuanya di atas 97,5% confidence." },
      { phase: "Fase 2", text: "Persona P2 (prima, penghasilan tinggi) punya skor EXT_2 tertinggi 0,56 — konsisten dengan segmen ini." },
    ],
    action: "Fast-track approval dan upsell premium untuk segmen ini; alokasikan kapasitas review manual ke tempat lain.",
    value: "Sisi pertumbuhan dari analisis yang sama — bukan cuma menolak risiko, tapi mempercepat yang aman.",
  },
  {
    id: "revolving", kind: "safe",
    headline: "Revolving adalah produk cicilan-ringan yang dipilih segmen muda & berpenghasilan rendah",
    claim: "Pola perilaku yang tak terlihat lewat agregasi sederhana: nasabah muda atau bergaji rendah memilih revolving karena anuitasnya sangat kecil, bukan karena limitnya besar.",
    evidence: [
      { phase: "Fase 3", text: "INCOME=VeryLow + Revolving → ANNUITY=VeryLow: confidence 94,9%, lift 4,75× (tertinggi di seluruh aturan perilaku)." },
      { phase: "Fase 3", text: "AGE_GROUP=Young + Revolving → ANNUITY=VeryLow: confidence 89,2%, lift 4,46×." },
      { phase: "Fase 3", text: "“Tinggal dengan orang tua” andal menandai nasabah muda thin-file (lift 3,86–3,89×) — proxy berguna saat riwayat kredit minim." },
    ],
    action: "Kembangkan produk mikro berbasis revolving sebagai kanal akuisisi anak muda, dengan plafon starter yang naik bertahap.",
    value: "Peluang produk yang muncul dari data, bukan dari asumsi pemasaran.",
  },
];
const KIND_META: Record<Knowledge["kind"], { label: string; color: string }> = {
  risk: { label: "Sinyal risiko", color: C.risk },
  safe: { label: "Peluang bisnis", color: C.safe },
  method: { label: "Temuan metodologis", color: C.info },
};

/* Stage 4 — per-feature IQR rates + skew evidence why Z-score under-flags (phase4.md §2–3) */
const IQR_BY_FEATURE = [
  { feat: "BURO_AMT_CREDIT_SUM_DEBT_MEAN", iqr: 10.69, z: 1.10, skew: 22.34, note: "Utang eksternal berekor sangat panjang." },
  { feat: "EMPLOYMENT_YEARS", iqr: 7.43, z: null, skew: null, note: "Sebagian nasabah masa kerja sangat panjang." },
  { feat: "INST_PAYMENT_DELAY_MEAN", iqr: 5.67, z: 0.93, skew: 24.10, note: "Keterlambatan bayar (dua arah)." },
  { feat: "AMT_INCOME_TOTAL", iqr: 4.56, z: null, skew: null, note: "Income tinggi." },
  { feat: "AGE_YEARS / EXT_SOURCE_2", iqr: 0, z: null, skew: null, note: "Terdistribusi rapat — tak ada ekor ekstrem sama sekali." },
];

/* Stage 4 — DBSCAN cross-reference convergence (phase4.md §6) */
const DBSCAN_XREF = [
  { label: "Juga terflag IQR", pct: 97.0, n: 193, color: C.info },
  { label: "Juga high-confidence (≥2 metode)", pct: 93.0, n: 185, color: C.safe },
  { label: "Juga terflag Isolation Forest", pct: 15.6, n: 31, color: C.warn },
];

/* Stage 4 — anomaly classification with default-rate validation (phase4.md §7) */
const ANOM_CLASSES = [
  {
    id: "risk", name: "RISK_SIGNAL", count: 3983, rate: 8.69, ci: "10,53", ext: "0,538", color: C.risk,
    rule: "kredit/income > 15 · anuitas/income > 0,5 · kedua EXT_SOURCE < 0,2 · rata-rata telat > 30 hari",
    verdict: "Default 8,69% — di ATAS base rate 8,07%, dan median kredit/income 10,5 (vs 3,3 populasi). Leverage ekstrem nyata → layak eskalasi ke manual underwriting review.",
    example: "SK_ID_CURR 124157 — income 45k tapi kredit 1,86 jt → rasio 41,3; beban anuitas 1,07 (cicilan melebihi penghasilan!); EXT_2 0,18 → TARGET = 1.",
  },
  {
    id: "rare", name: "RARE_LEGITIMATE", count: 26139, rate: 5.20, ci: "3,82", ext: "0,612", color: C.safe,
    rule: "ekstrem pada magnitude, tapi kombinasinya tetap konsisten",
    verdict: "Default 5,20% — di BAWAH base rate, dan skor eksternal median lebih tinggi (0,61). Ini membuktikan klasifikasinya bekerja: yang kita sebut 'sah' memang lebih aman dari rata-rata. Jangan tolak otomatis.",
    example: "SK_ID_CURR 403769 — income 486k (maksimum) + kredit 1,86 jt tapi rasio hanya 3,82 (wajar), skor tinggi, masa kerja 34 th → TARGET = 0. Nasabah kaya sungguhan.",
  },
  {
    id: "err", name: "DATA_ERROR", count: 0, rate: null, ci: "—", ext: "—", color: C.dim,
    rule: "11 kondisi mustahil diuji eksplisit",
    verdict: "Nol menyeluruh. Ini hasil positif, bukan absennya pencarian — 11 kondisi diuji eksplisit, termasuk cek konsistensi antar-kolom (kerja > umur, cicilan > kredit) yang tak mungkin nol secara kebetulan. Mengonfirmasi pipeline cleaning Fase 1 sudah tuntas.",
    example: "Kategori tetap didefinisikan di classify() agar lengkap — hanya saja kosong pada dataset yang sudah bersih ini.",
  },
];
const INTEGRITY_CHECKS = [
  "EMPLOYMENT_YEARS > 60 th", "Sisa sentinel DAYS_EMPLOYED = 365243", "AMT_INCOME_TOTAL ≤ 0",
  "AMT_CREDIT ≤ 0", "AMT_ANNUITY ≤ 0", "AGE_YEARS < 18 atau > 100",
  "EMPLOYMENT_YEARS > AGE_YEARS", "AMT_ANNUITY > AMT_CREDIT", "CREDIT_INCOME_RATIO > 50",
  "EXT_SOURCE_2/3 di luar [0,1]", "NaN tersisa di fitur deteksi",
];

/* Stage 3 — discretization: bin boundaries + domain rationale (phase3.md §2) */
const BINS = [
  { attr: "AGE_GROUP", cats: "Young / Adult / MiddleAged / Senior", rule: "<30 / 30–45 / 45–60 / 60+ th", basis: "domain", why: "Tahap siklus hidup finansial punya profil risiko berbeda." },
  { attr: "INCOME_LEVEL", cats: "VeryLow … VeryHigh", rule: "Quintile pendapatan", basis: "quintile", why: "Kelas relatif terhadap populasi, bukan ambang absolut yang bias mata uang." },
  { attr: "CREDIT_LEVEL", cats: "VerySmall … VeryLarge", rule: "Quintile AMT_CREDIT", basis: "quintile", why: "Skala pinjaman relatif." },
  { attr: "ANNUITY_LEVEL", cats: "VeryLow … VeryHigh", rule: "Quintile cicilan", basis: "quintile", why: "Beban cicilan periodik." },
  { attr: "GOODS_PRICE_LEVEL", cats: "VerySmall … VeryLarge", rule: "Quintile harga barang", basis: "quintile", why: "Nilai objek yang dibiayai." },
  { attr: "DEBT_BURDEN", cats: "VeryLow … VeryHigh", rule: "anuitas/income: <5 / 5–10 / 10–20 / 20–35 / >35%", basis: "domain", why: "Debt-service ratio klasik — punya makna finansial baku lintas populasi." },
  { attr: "EMPLOYMENT_YEARS", cats: "<1 / 1–3 / 3–7 / 7–15 / 15+ th", rule: "ambang masa kerja", basis: "domain", why: "Stabilitas penghasilan naik bertahap, bukan linear." },
  { attr: "EXT_SOURCE_2/3_LEVEL", cats: "Low / Medium / High", rule: "Tertile skor", basis: "tertile", why: "Kualitas kredit eksternal dibagi tiga agar tiap kategori cukup besar." },
  { attr: "CHILDREN", cats: "Zero / 1–2 / 3+", rule: "jumlah anak", basis: "domain", why: "Beban tanggungan." },
];
const BASIS_COL: Record<string, string> = { quintile: C.info, tertile: C.P2, domain: C.warn };

/* Stage 3 — Apriori funnel with parameters (phase3.md §3–6) */
const APRIORI_FUNNEL = [
  { stage: "Item unik (one-hot)", n: 81, of: 81, note: "20 atribut kategorikal × beberapa nilai → 81 item. Ini 'kosakata' yang bisa muncul di aturan.", param: "prefix_sep '='" },
  { stage: "Frequent itemsets", n: 25228, of: 81710, note: "73 len-1 · 2.021 len-2 · 23.134 len-3.", param: "min_support = 0,01 · max_len = 3" },
  { stage: "Aturan mentah", n: 81710, of: 81710, note: "Terlalu banyak & banyak yang sepele — filter longgar hanya membuang asosiasi negatif.", param: "lift ≥ 1,0" },
  { stage: "Aturan non-trivial", n: 33131, of: 81710, note: "Setelah membuang consequent ganda, 10 pasangan tautologi/definisional, dan support < 1%.", param: "n_con = 1 · anti-tautologi" },
  { stage: "Deliverable final", n: 18, of: 81710, note: "8 risiko + 4 proteksi + 6 perilaku, ter-ranking & dedupe per kombinasi atribut antecedent.", param: "lift ≥ 1,5 (risiko) · conf tinggi (proteksi)" },
];
const APRIORI_PARAMS = [
  { k: "min_support", v: "0,01 (1%)", why: "Pola harus muncul pada ≥ 3.075 nasabah. Sengaja rendah: kelas Default hanya ~8%, jadi kombinasi berisiko secara alami ber-support kecil. Kalau dipasang 0,05, semua pola risiko terbuang sebelum sempat dianalisis." },
  { k: "max_len", v: "3", why: "Antecedent maksimal 2 item. Aturan {A,B} → C masih mudah dijelaskan ke tim bisnis; aturan 5-item tidak. Sekaligus mencegah ledakan kombinatorik." },
  { k: "Metrik seleksi", v: "Lift", why: "Membuang bias base-rate: aturan bisa punya confidence tinggi hanya karena consequent-nya memang umum." },
  { k: "Ambang → Default", v: "lift ≥ 1,5", why: "Naik ≥ 50% di atas base rate 8%. Confidence tidak dipakai karena confidence menuju Default secara natural rendah — memakai conf ≥ 0,3 akan membunuh SEMUA aturan risiko." },
  { k: "Ambang → Repaid", v: "conf tinggi + support ≥ 3%", why: "Karena Repaid ≈ 92%, lift maksimum teoretis hanya 1/0,92 ≈ 1,09. Aturan proteksi karena itu dinilai lewat confidence, bukan lift." },
  { k: "Anti-tautologi", v: "10 pasangan atribut", why: "DEBT_BURDEN dihitung dari anuitas/income, jadi {ANNUITY=High, INCOME=Low} → DEBT_BURDEN=VeryHigh itu aritmetika, bukan temuan. Sama untuk CREDIT ↔ GOODS_PRICE (r ≈ 0,99) dan Pensioner ≡ Senior." },
];
const METRICS_DEF = [
  { name: "Support", formula: "P(X)", reads: "Seberapa umum pola itu", example: "Support 0,0224 = pola muncul pada 2,24% nasabah (≈ 6.900 orang).", color: C.info },
  { name: "Confidence", formula: "P(Y|X) = Support(X∪Y) / Support(X)", reads: "Seberapa andal aturannya", example: "Confidence 18,4% = dari semua nasabah dengan kedua skor rendah, 18,4% benar-benar gagal bayar.", color: C.P2 },
  { name: "Lift", formula: "Confidence / Support(Y)", reads: "Lebih sering dari kebetulan?", example: "Lift 2,28 = kombinasi itu menaikkan peluang gagal bayar 2,28× di atas base rate 8,07%.", color: C.risk },
];

/* Stage 2 — segmentation feature selection (phase2.md §1–2) */
const SEG_FS = [
  { rule: "Density", detail: "Buang fitur dengan > 40% nilai 0", why: "Fitur sparse tak membedakan mayoritas nasabah." },
  { rule: "Variance", detail: "Buang near-constant (std ≈ 0 setelah skala)", why: "Tanpa dispersi tak ada yang bisa di-cluster." },
  { rule: "Redundancy", detail: "Correlation pruning |r| > 0,8", why: "Jarak tak boleh menghitung ganda sinyal yang sama." },
];
const ZERO_INFLATION = [
  { thr: "≥ 50%", n: 125 }, { thr: "≥ 80%", n: 100 }, { thr: "≥ 90%", n: 75 }, { thr: "≥ 95%", n: 53 }, { thr: "≥ 99%", n: 7 },
];

/* Stage 1 — feature-selection methods, named (rubrik minta metode disebut + interpretasi) */
const FS_METHODS = [
  { n: "1", name: "Variance Threshold", param: "var < 0,01", drop: "−187", keep: 493, unsup: true, note: "Fitur nyaris konstan (dummy One-Hot yang hampir selalu 0) tak memberi daya pisah." },
  { n: "2", name: "Correlation Pruning", param: "|r| > 0,9", drop: "−182", keep: 311, unsup: true, note: "Mengurangi multikolinearitas & ketidakstabilan jarak antar-record." },
  { n: "3", name: "Hierarchical Clustering korelasi", param: "jarak 1−|r|, potong t = 0,4", drop: "−126", keep: 185, unsup: true, note: "Menangkap redundansi berkelompok, bukan hanya pasangan. Wakil tiap kelompok = fitur paling sentral." },
  { n: "4", name: "Mutual Information", param: "sampel 40k, ke TARGET", drop: "0", keep: 185, unsup: false, note: "Hanya untuk ranking kepentingan — tidak membuang fitur, supaya tidak terjadi circularity dengan label." },
];

type Pair = { key: string; profile: string; ratio: string; paid: { id: string; v: number }; def: { id: string; v: number }; dScore: string; dAge: string; plain: string };
const PAIRS: Pair[] = [
  { key: "small", profile: "Pinjaman kecil & hati-hati", ratio: "≈2× penghasilan", paid: { id: "P1", v: 0.496 }, def: { id: "D0", v: 0.367 }, dScore: "−0.13", dAge: "−5 th", plain: "Pinjaman kecil yang serupa — tapi yang gagal bayar skornya 0,13 lebih rendah dan 5 tahun lebih muda." },
  { key: "levered", profile: "Pinjaman ketat", ratio: "≈6–7× penghasilan", paid: { id: "P0", v: 0.519 }, def: { id: "D1", v: 0.408 }, dScore: "−0.11", dAge: "−4 th", plain: "Sama-sama meminjam besar. Yang gagal bayar skornya 0,11 lebih rendah dan 4 tahun lebih muda." },
  { key: "affluent", profile: "Mapan, pinjaman besar", ratio: "≈3,5× penghasilan", paid: { id: "P2", v: 0.558 }, def: { id: "D2", v: 0.460 }, dScore: "−0.10", dAge: "−1 th", plain: "Profil nyaris identik. Satu-satunya beda nyata: skor kredit 0,10 lebih rendah." },
];
type Persona = { id: string; name: string; share: number; score: number; count: number; color: string; trait: string };
const PAID_PERSONAS: Persona[] = [
  { id: "P0", name: "Mapan, skor kuat", share: 29.0, score: 0.52, count: 81860, color: C.P0, trait: "Tertua, masa kerja terpanjang, leverage tinggi — tapi skor kuat." },
  { id: "P1", name: "Konservatif, pinjaman kecil", share: 37.0, score: 0.5, count: 104585, color: C.P1, trait: "Pinjaman terkecil; skor kredit solid." },
  { id: "P2", name: "Prima, penghasilan tinggi", share: 34.0, score: 0.56, count: 96241, color: C.P2, trait: "Penghasilan tertinggi, kredit besar terjangkau, skor teratas." },
];
const DEF_PERSONAS: Persona[] = [
  { id: "D0", name: "Muda, pinjaman kecil, skor lemah", share: 35.2, score: 0.37, count: 8739, color: C.D0, trait: "Termuda; pinjaman terkecil; skor terendah." },
  { id: "D1", name: "Terlampau terungkit", share: 30.5, score: 0.41, count: 7572, color: C.D1, trait: "Penghasilan rendah, kredit besar — paling ketat." },
  { id: "D2", name: "Menengah, skor rendah", share: 34.3, score: 0.46, count: 8514, color: C.D2, trait: "Penghasilan lebih tinggi, pinjaman terjangkau, tapi skor lemah." },
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
  { id: "knowledge", label: "Knowledge", title: "What Knowledge Did We Discover?", kicker: "Sintesis empat fase menjadi pengetahuan yang bisa ditindaklanjuti" },
  { id: "dictionary", label: "Rules & Directory", title: "Rules & Features Directory", kicker: "Glosarium fitur dan penjelasan lengkap aturan asosiasi" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Tone drives both the chip colour and its sparkline.
 * up/down/warn carry judgement (baik / berisiko / perlu perhatian);
 * info/olive/flat are descriptive accents for panels where nothing is good or bad.
 */
type Chip = { tone: "up" | "down" | "warn" | "flat" | "info" | "olive"; text: string };
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
    { label: "Kunci penghubung", value: "3", icon: "target", chip: { tone: "info", text: "SK_ID_CURR / BUREAU / PREV" } },
    { label: "Kolom dideskripsikan", value: "219", icon: "chart", chip: { tone: "olive", text: "HomeCredit_columns_description" } },
    { label: "Baris tabel inti", value: "307,511", icon: "users", chip: { tone: "up", text: "application_train" } },
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
  knowledge: [
    { label: "Pengetahuan utama", value: "7", icon: "target", chip: { tone: "flat", text: "lintas 4 fase" } },
    { label: "Pembeda terkuat", value: "EXT_SOURCE", icon: "chart", chip: { tone: "down", text: "konsisten di 3 fase" } },
    { label: "Segmen aman terbesar", value: "12,3%", icon: "check", chip: { tone: "up", text: "97,7% lunas" } },
    { label: "Perlu review manual", value: "3,983", icon: "alert", chip: { tone: "warn", text: "risk signal" } },
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
  { key: "SK_ID_CURR", color: "#15803D", desc: "ID nasabah/aplikasi saat ini — kunci utama tabel inti (application).", files: ["application_train.csv", "application_test.csv", "bureau.csv", "previous_application.csv", "POS_CASH_balance.csv", "credit_card_balance.csv", "installments_payments.csv"] },
  { key: "SK_ID_BUREAU", color: "#4D7C0F", desc: "ID satu kredit di biro kredit eksternal — penghubung bureau ↔ bureau_balance.", files: ["bureau.csv", "bureau_balance.csv"] },
  { key: "SK_ID_PREV", color: "#D97706", desc: "ID satu aplikasi/kredit Home Credit sebelumnya — penghubung previous_application ↔ POS/CC/installments.", files: ["previous_application.csv", "POS_CASH_balance.csv", "credit_card_balance.csv", "installments_payments.csv"] },
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
const KEYCOLOR: Record<string, string> = { SK_ID_CURR: "#15803D", SK_ID_BUREAU: "#4D7C0F", SK_ID_PREV: "#D97706" };

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
  info: [36, 52, 44, 66, 50, 74, 58, 62, 70, 54],
  olive: [64, 48, 70, 54, 78, 46, 66, 58, 74, 50],
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
  // CIRC, not C — C is the global colour-token object
  const R = 54, SW = 15, CIRC = 2 * Math.PI * R;
  const arcs = segments.reduce<{ s: Seg; i: number; len: number; startDeg: number }[]>((acc, s, i) => {
    const used = acc.reduce((t, a) => t + a.len, 0);
    acc.push({ s, i, len: (s.value / total) * CIRC, startDeg: -90 + (used / CIRC) * 360 });
    return acc;
  }, []);
  const big = h === null ? center : fmt(segments[h].value);
  const small = h === null ? sub : segments[h].label;
  return (
    <div className="cx-donutwrap">
      <div className="cx-donut">
        <svg viewBox="0 0 140 140" width="150" height="150">
          {arcs.map((a) => (
            <g key={a.i} transform={`rotate(${a.startDeg} 70 70)`}>
              <circle cx="70" cy="70" r={R} fill="none" stroke={a.s.color} strokeWidth={SW}
                strokeDasharray={`${a.len} ${CIRC - a.len}`}
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
        <circle cx={AX0} cy="22" r="6" fill="#15803D" />
        <text x={AX0 + 12} y="26" className="cx-svg-leg">Kembaran yang lunas</text>
        <circle cx={AX0 + 155} cy="22" r="6" fill="#E11D48" />
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
              <line x1={xd} y1={y} x2={xp} y2={y} stroke={on ? "#6B7666" : "#DFE5D4"} strokeWidth={on ? 3 : 2} />
              <circle cx={xd} cy={y} r={on ? 9 : 8} fill="#E11D48" stroke="#fff" strokeWidth="2.5" />
              <circle cx={xp} cy={y} r={on ? 9 : 8} fill="#15803D" stroke="#fff" strokeWidth="2.5" />
              <text x={xd - 14} y={y + 4} className="cx-svg-val" textAnchor="end" fill="#E11D48">{p.def.v.toFixed(2)}</text>
              <text x={xp + 14} y={y + 4} className="cx-svg-val" textAnchor="start" fill="#15803D">{p.paid.v.toFixed(2)}</text>
              <text x={W - 6} y={y - 3} className="cx-svg-delta" textAnchor="end">{p.dScore} skor</text>
              <text x={W - 6} y={y + 12} className="cx-svg-deltasub" textAnchor="end">{p.dAge} usia</text>
            </g>
          );
        })}
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: active ? "#E11D48" : "#0F766E" }}>
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
  { id: "P0", book: "paid", count: 81860, color: C.P0, INCOME: 126754, CREDIT: 840601, CI: 6.92, AGE: 48.0, EMP: 7.1, EXT2: 0.519, EXT3: 0.580, ANN: 0.276 },
  { id: "P1", book: "paid", count: 104585, color: C.P1, INCOME: 133511, CREDIT: 239976, CI: 2.04, AGE: 43.5, EMP: 5.6, EXT2: 0.496, EXT3: 0.526, ANN: 0.129 },
  { id: "P2", book: "paid", count: 96241, color: C.P2, INCOME: 236969, CREDIT: 786131, CI: 3.52, AGE: 41.8, EMP: 6.3, EXT2: 0.558, EXT3: 0.473, ANN: 0.155 },
  { id: "D0", book: "default", count: 8739, color: C.D0, INCOME: 136818, CREDIT: 256964, CI: 2.10, AGE: 38.4, EMP: 4.1, EXT2: 0.367, EXT3: 0.432, ANN: 0.132 },
  { id: "D1", book: "default", count: 7572, color: C.D1, INCOME: 125972, CREDIT: 753129, CI: 6.38, AGE: 43.7, EMP: 5.4, EXT2: 0.408, EXT3: 0.528, ANN: 0.273 },
  { id: "D2", book: "default", count: 8514, color: C.D2, INCOME: 212967, CREDIT: 689377, CI: 3.48, AGE: 40.7, EMP: 5.3, EXT2: 0.460, EXT3: 0.322, ANN: 0.162 },
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
  { label: "Skor eksternal · EXT_SOURCE_2", value: 0.0154, color: "#4D7C0F" },
  { label: "Skor eksternal · EXT_SOURCE_3", value: 0.0127, color: "#4D7C0F" },
  { label: "Jumlah anuitas", value: 0.0095, color: "#0F766E" },
  { label: "Harga barang", value: 0.0065, color: "#0F766E" },
  { label: "Jumlah kredit", value: 0.0063, color: "#0F766E" },
  { label: "Masa kerja", value: 0.0051, color: "#0F766E" },
  { label: "Umur", value: 0.0035, color: "#0F766E" },
  { label: "Pendidikan", value: 0.0022, color: "#0F766E" },
  { label: "Pekerjaan", value: 0.0021, color: "#0F766E" },
  { label: "Jenis penghasilan", value: 0.0020, color: "#0F766E" },
];
const SOURCES: Seg[] = [
  { label: "Formulir aplikasi", value: 86, color: "#0F766E" },
  { label: "Aplikasi sebelumnya", value: 45, color: "#4D7C0F" },
  { label: "Biro kredit", value: 21, color: "#15803D" },
  { label: "Kartu kredit", value: 12, color: "#D97706" },
  { label: "Angsuran", value: 11, color: "#9F1239" },
  { label: "POS", value: 10, color: "#9AA48F" },
];
const LIFT_ITEMS = [
  { label: "Dua skor rendah", value: 2.28, color: "#E11D48" },
  { label: "Kerja baru + skor rendah", value: 2.12, color: "#E11D48" },
  { label: "Pria + skor rendah", value: 2.03, color: "#E11D48" },
  { label: "Skor rendah + barang menengah", value: 1.99, color: "#E11D48" },
  { label: "Muda + skor rendah", value: 1.98, color: "#E11D48" },
  { label: "Pinjaman menengah + skor rendah", value: 1.95, color: "#E11D48" },
];
const ANOM_ITEMS = [
  { label: "P0 · Mapan", value: 15.0, color: "#0F766E" },
  { label: "P2 · Prima", value: 12.63, color: "#0F766E" },
  { label: "D1 · Terlampau terungkit", value: 10.59, color: "#E11D48" },
  { label: "D2 · Menengah", value: 8.16, color: "#E11D48" },
  { label: "P1 · Konservatif", value: 3.81, color: "#0F766E" },
  { label: "D0 · Muda", value: 2.38, color: "#E11D48" },
];
const AGREE_ITEMS = [
  { label: "Terflag oleh 1 lensa", value: 65333, color: "#D97706" },
  { label: "Terflag oleh 2 lensa", value: 27133, color: "#D97706" },
  { label: "Terflag oleh ketiganya", value: 2989, color: "#E11D48" },
];
const OUTLIER_METRICS = [
  { m: "Umur (th)", out: 48.7, norm: 43.9 },
  { m: "Masa kerja (th)", out: 12.9, norm: 6.1 },
  { m: "Kredit ÷ penghasilan", out: 5.7, norm: 3.9 },
  { m: "Anuitas ÷ penghasilan", out: 0.27, norm: 0.18 },
];
const VERDICT_SEG: Seg[] = [
  { label: "Normal", value: 277389, color: "#0F766E" },
  { label: "Bernilai tinggi, simpan", value: 26139, color: "#15803D" },
  { label: "Sinyal risiko", value: 3983, color: "#D97706" },
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
const CATCOL: Record<string, string> = { risk: "#E11D48", safe: "#15803D", behaviour: "#4D7C0F" };

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
            <circle cx={px(p.CI)} cy={py(p.EXT2)} r={rOf(p.count)} fill={p.book === "default" ? "#E11D48" : "#15803D"} opacity={h === null || h === i ? 0.9 : 0.45} stroke="#fff" strokeWidth="2" />
            <text x={px(p.CI)} y={py(p.EXT2) + 4} className="cx-cmap-id" textAnchor="middle">{p.id}</text>
          </g>
        ))}
        <text x={(X0 + X1) / 2} y={HT - 6} className="cx-svg-axlab" textAnchor="middle">KREDIT ÷ PENGHASILAN (LEVERAGE) →</text>
        <text x={16} y={(Y0 + Y1) / 2} className="cx-svg-axlab" textAnchor="middle" transform={`rotate(-90 16 ${(Y0 + Y1) / 2})`}>SKOR EKSTERNAL (AMAN)</text>
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: "#0F766E" }}>
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
        <path d={poly(def)} fill="#E11D48" fillOpacity="0.18" stroke="#E11D48" strokeWidth="2" />
        <path d={poly(paid)} fill="#15803D" fillOpacity="0.16" stroke="#15803D" strokeWidth="2" />
        {FEATS.map((f, i) => {
          const lx = cx + (RAD + 16) * Math.cos(ang(i)), ly = cy + (RAD + 16) * Math.sin(ang(i));
          return <text key={f.key} x={lx} y={ly + 3} className="cx-radar-lab" textAnchor={Math.abs(Math.cos(ang(i))) < 0.3 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end"}>{f.short}</text>;
        })}
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: "#0F766E" }}>
        <b style={{ color: "#15803D" }}>{PROFILES[paid].id}</b> (lunas) vs <b style={{ color: "#E11D48" }}>{PROFILES[def].id}</b> (gagal bayar): bentuknya nyaris berimpit — selisih paling jelas ada di jari-jari skor kredit.
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
        <line x1={px(3)} y1={Y0} x2={px(3)} y2={Y1} stroke="#0F766E" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
        <text x={px(3)} y={Y0 - 8} className="cx-svg-tick" textAnchor="middle" fill="#15803D">K terpilih = 3</text>
        <path d={"M " + d.map((r) => `${px(r.k)},${pyI(r.inertia)}`).join(" L ")} fill="none" stroke="#9AA48F" strokeWidth="2" />
        <path d={"M " + d.map((r) => `${px(r.k)},${pyS(r.sil)}`).join(" L ")} fill="none" stroke="#4D7C0F" strokeWidth="2.5" />
        {d.map((r) => <circle key={r.k} cx={px(r.k)} cy={pyS(r.sil)} r={r.k === 3 ? 5 : 3.2} fill={r.k === 3 ? "#4D7C0F" : "#65A30D"} />)}
        {d.map((r) => <text key={r.k} x={px(r.k)} y={Y1 + 18} className="cx-svg-tick" textAnchor="middle">{r.k}</text>)}
        <text x={(X0 + X1) / 2} y={HT - 4} className="cx-svg-axlab" textAnchor="middle">JUMLAH CLUSTER (K)</text>
        <text x={X1 - 2} y={pyS(sr[1]) - 8} className="cx-svg-tick" textAnchor="end" fill="#4D7C0F">silhouette</text>
        <text x={X1 - 2} y={pyI(inr[3]) + 14} className="cx-svg-tick" textAnchor="end">inertia</text>
      </svg>
      <div className="cx-caption" style={{ borderLeftColor: C.P2 }}>Inertia terus turun (abu-abu); silhouette (olive) tertinggi di antara opsi bermakna pada K = 3 — jadi tiap tabel dibagi jadi 3 tipe.</div>
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
      <div className="cx-caption" style={{ borderLeftColor: a ? CATCOL[a.cat] : "#0F766E" }}>
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
              <div className="cx-op-bar"><div className="cx-op-track"><span className="cx-op-fill" style={{ width: `${(m.norm / mx) * 100}%`, background: "#0F766E", opacity: h === null || h === i ? 1 : 0.4 }} /></div><span className="cx-op-v">{m.norm}</span></div>
              <div className="cx-op-bar"><div className="cx-op-track"><span className="cx-op-fill" style={{ width: `${(m.out / mx) * 100}%`, background: "#D97706", opacity: h === null || h === i ? 1 : 0.4 }} /></div><span className="cx-op-v">{m.out}</span></div>
            </div>
          </div>
        );
      })}
      <div className="cx-op-leg"><span><i style={{ background: "#0F766E" }} /> Nasabah tipikal</span><span><i style={{ background: "#D97706" }} /> Outlier DBSCAN</span></div>
    </div>
  );
}

/* ============================ PER-RECORD CHARTS (load dashboard_data.json) ============================ */

type DPoint = { x: number; y: number; t: number; c: string; o: number };
type DHist = { edges: number[]; repaid: number[]; default: number[] };
type DData = { scatter: DPoint[]; hist: Record<string, DHist> };
const CLUSTERCOL: Record<string, string> = { P0: C.P0, P1: C.P1, P2: C.P2, D0: C.D0, D1: C.D1, D2: C.D2 };
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
            <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.1" fill={mode === "outcome" ? (p.t === 1 ? "#E11D48" : "#15803D") : (CLUSTERCOL[p.c] || "#9AA48F")} opacity={!visible ? "0" : isH ? "0.6" : "0.05"} />
          );
        })}
        {pts.filter((p) => p.o).map((p, i) => (
          <circle key={`o${i}`} cx={px(p.x)} cy={py(p.y)} r="3.6" fill="#D97706" stroke="#fff" strokeWidth="1" opacity={h === null || h === "outlier" ? "1" : "0.05"} />
        ))}
      </svg>
      <div className="cx-scatter-legend">
        {mode === "outcome" ? (
          <>
            <span onMouseEnter={() => setH("paid")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "paid" ? 1 : 0.4 }}><i style={{ background: "#15803D" }} /> Lunas</span>
            <span onMouseEnter={() => setH("def")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "def" ? 1 : 0.4 }}><i style={{ background: "#E11D48" }} /> Gagal bayar</span>
          </>
        ) : (
          Object.entries(CLUSTERCOL)
            .filter(([id]) => mode === "cluster_all" || (mode === "cluster_paid" && id.startsWith("P")) || (mode === "cluster_def" && id.startsWith("D")))
            .map(([id, c]) => (
            <span key={id} onMouseEnter={() => setH(id)} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === id ? 1 : 0.4 }}><i style={{ background: c }} /> {id}</span>
          ))
        )}
        <span onMouseEnter={() => setH("outlier")} onMouseLeave={() => setH(null)} style={{ cursor: "pointer", opacity: h === null || h === "outlier" ? 1 : 0.4 }}><i style={{ background: "#D97706" }} /> Outlier DBSCAN</span>
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
        <path d={area(h.repaid, maxR)} fill="#15803D" fillOpacity="0.22" stroke="#15803D" strokeWidth="2" />
        <path d={area(h.default, maxD)} fill="#E11D48" fillOpacity="0.2" stroke="#E11D48" strokeWidth="2" />
      </svg>
      <div className="cx-scatter-legend"><span><i style={{ background: "#15803D" }} /> Lunas</span><span><i style={{ background: "#E11D48" }} /> Gagal bayar</span><span className="cx-note">tiap kurva diskala ke puncaknya sendiri</span></div>
      <p className="cx-subtle">Bentuk asli dari seluruh 307.511 kredit. Geser antar-feature pada skor kredit, kurva gagal bayar jelas bergeser ke kiri.</p>
    </div>
  );
}

/* ============================ PANELS ============================ */

function Overview() {
  const outcome: Seg[] = [
    { label: "Repaid", value: BOOK.repaid, color: "#15803D" },
    { label: "Defaulted", value: BOOK.defaulters, color: "#E11D48" },
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
              {" "}<b style={{ color: "#E11D48" }}>TARGET = 1</b> berarti nasabah gagal bayar (telat lebih dari X hari pada minimal satu dari Y angsuran pertama),
              sedangkan <b style={{ color: "#15803D" }}>TARGET = 0</b> berarti nasabah membayar normal.
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
            <div className="cx-caption" style={{ borderLeftColor: hoverKey ? KEYCOLOR[hoverKey] : "#15803D" }}>
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

function CleaningAudit() {
  const [sel, setSel] = useState(CLEANING_STEPS[1].id);
  const s = CLEANING_STEPS.find((x) => x.id === sel)!;
  return (
    <div>
      <div className="cx-fpills">
        {CLEANING_STEPS.map((x) => (
          <button key={x.id} className={`cx-fpill ${x.id === sel ? "cx-fpill-on" : ""}`} onClick={() => setSel(x.id)}>{x.title}</button>
        ))}
      </div>
      <div className="cx-auditbox">
        <div className="cx-auditmetric">
          <span className="cx-auditnum">{s.metric}</span>
          <span className="cx-auditunit">{s.unit}</span>
        </div>
        <div className="cx-auditbody">
          <p className="cx-auditdetail">{s.detail}</p>
          <p className="cx-auditwhy"><b>Kenapa begitu:</b> {s.why}</p>
        </div>
      </div>
    </div>
  );
}

function FeatureSelectionTable() {
  const [h, setH] = useState<string | null>(null);
  return (
    <div>
      <div className="cx-tablewrap">
        <table className="cx-table cx-table-compact">
          <thead><tr><th>Metode</th><th>Parameter</th><th>Dibuang</th><th>Sisa</th></tr></thead>
          <tbody>
            {FS_METHODS.map((m) => (
              <tr key={m.n} onMouseEnter={() => setH(m.n)} onMouseLeave={() => setH(null)}
                style={{ background: h === m.n ? "var(--card2)" : undefined, cursor: "default" }}>
                <td>
                  <b>{m.n}. {m.name}</b>
                  <span className={`cx-tag ${m.unsup ? "cx-tag-info" : "cx-tag-warn"}`}>{m.unsup ? "unsupervised" : "ranking saja"}</span>
                </td>
                <td className="cx-mono">{m.param}</td>
                <td style={{ color: m.drop === "0" ? "var(--dim)" : "var(--risk)", fontWeight: 700 }}>{m.drop}</td>
                <td>{m.keep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cx-caption" style={{ borderLeftColor: h ? C.info : C.safe }}>
        {h ? FS_METHODS.find((m) => m.n === h)!.note
           : "Tiga filter pertama unsupervised (tak melihat TARGET) supaya seleksi tidak bocor dari label; Mutual Information hanya dipakai untuk mengurutkan kepentingan, bukan membuang fitur."}
      </div>
    </div>
  );
}

function TransformList() {
  const [h, setH] = useState<number | null>(null);
  const tagCol: Record<string, string> = { Encoding: C.info, "Feature Engineering": C.P2, Output: C.safe };
  return (
    <ul className="cx-translist">
      {TRANSFORM_STEPS.map((t, i) => (
        <li key={t.title} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <div className="cx-transhead">
            <span className="cx-transtitle">{t.title}</span>
            <span className="cx-tag" style={{ color: tagCol[t.tag], borderColor: tagCol[t.tag] }}>{t.tag}</span>
          </div>
          <p className="cx-transdetail" style={{ opacity: h === i ? 1 : 0.72 }}>{t.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function Phase1() {
  const outcome: Seg[] = [
    { label: "Repaid", value: BOOK.repaid, color: C.safe },
    { label: "Defaulted", value: BOOK.defaulters, color: C.risk },
  ];
  return (
    <>
      <KpiRow items={KPIS.phase1} />

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Kualitas Data & Penanganannya</span><span className="cx-note">pilih langkah · tiap keputusan dijustifikasi</span></div>
        <CleaningAudit />
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Dari 680 kolom jadi 185</span><span className="cx-note">4 metode berurutan</span></div>
          <FeatureFunnel />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Lunas vs gagal bayar</span><span className="cx-note">ketimpangan kelas</span></div>
          <Donut segments={outcome} center="8,1%" sub="gagal bayar" />
          <p className="cx-subtle">Kelas <b>sangat timpang (8,1% : 91,9%)</b>. Ini yang membuat <code>min_support</code> Apriori harus rendah dan aturan proteksi tak bisa dinilai lewat lift (Fase 3).</p>
        </div>
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Metode Feature Selection</span><span className="cx-note">arahkan kursor ke tiap baris</span></div>
        <FeatureSelectionTable />
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Encoding & Transformasi</span><span className="cx-note">menuju dua pipeline</span></div>
          <TransformList />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Asal 185 feature</span><span className="cx-note">per tabel sumber</span></div>
          <Donut segments={SOURCES} center="185" sub="feature disimpan" />
        </div>
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Apa yang memprediksi gagal bayar</span><span className="cx-note">mutual information · ranking</span></div>
        <HBars items={MI_ITEMS} max={0.0154} fmtVal={(v) => v.toFixed(4)} />
        <p className="cx-subtle">Dua <b>skor kredit eksternal</b> memimpin dengan selisih jelas dari fitur berikutnya — temuan ini yang nanti muncul lagi sebagai pembeda utama di Fase 2 dan pemicu dominan di Fase 3.</p>
      </div>
    </>
  );
}

function AlgoPanel() {
  const [sel, setSel] = useState(ALGOS[0].id);
  const a = ALGOS.find((x) => x.id === sel)!;
  return (
    <div>
      <div className="cx-algotabs">
        {ALGOS.map((x) => (
          <button key={x.id} className={`cx-algotab ${x.id === sel ? "cx-algotab-on" : ""}`} onClick={() => setSel(x.id)}
            style={x.id === sel ? { borderColor: x.color, color: x.color } : undefined}>
            <span className="cx-algodot" style={{ background: x.color }} />
            <span>
              <b>{x.name}</b>
              <em>{x.kind}</em>
            </span>
          </button>
        ))}
      </div>

      <div className="cx-algobody">
        <p className="cx-algoscope"><b>Ruang lingkup:</b> {a.scope}</p>
        <ul className="cx-paramlist">
          {a.params.map((p) => (
            <li key={p.k}>
              <div className="cx-paramhead"><span className="cx-paramk">{p.k}</span><span className="cx-paramv">{p.v}</span></div>
              <p className="cx-paramwhy">{p.why}</p>
            </li>
          ))}
        </ul>
        <div className="cx-algoresult" style={{ borderLeftColor: a.color }}>
          <span className="cx-note">Hasil</span>
          <b>{a.result}</b>
          <p>{a.interpret}</p>
        </div>
      </div>
    </div>
  );
}

function SegFeatureSelect() {
  const max = Math.max(...ZERO_INFLATION.map((z) => z.n));
  return (
    <div>
      <p className="cx-lead" style={{ maxWidth: "none", fontSize: "13px" }}>
        185 fitur Fase 1 dipilih untuk <b>prediksi risiko</b>, bukan segmentasi. Pemeriksaan <i>zero-inflation</i> menunjukkan
        kenapa mereka tak bisa dipakai langsung untuk clustering berbasis jarak:
      </p>
      <ul className="cx-hbars" style={{ marginTop: "14px" }}>
        {ZERO_INFLATION.map((z) => (
          <li key={z.thr}>
            <div className="cx-hb-head"><span>Fitur dengan nilai 0 {z.thr}</span><span className="cx-hb-val">{z.n} / 185</span></div>
            <div className="cx-track"><span className="cx-fill" style={{ width: `${(z.n / max) * 100}%`, background: C.warn }} /></div>
          </li>
        ))}
      </ul>
      <p className="cx-subtle">
        Nilai 0 ini <b>benar secara semantik</b> (&ldquo;tidak ada riwayat&rdquo;), bukan data rusak — tapi jarak Euclidean jadi
        didominasi segelintir fitur padat. Maka Fase 2 menyeleksi ulang subset padat &amp; interpretable:
      </p>
      <ul className="cx-critlist">
        {SEG_FS.map((f, i) => (
          <li key={f.rule}>
            <span className="cx-critnum">{i + 1}</span>
            <div>
              <b>{f.rule}</b> — <span className="cx-mono">{f.detail}</span>
              <p>{f.why}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="cx-caption" style={{ borderLeftColor: C.safe }}>
        18 kandidat lolos Density; correlation pruning membuang <span className="cx-mono">AMT_GOODS_PRICE</span> (≈ <span className="cx-mono">AMT_CREDIT</span>)
        dan <span className="cx-mono">CREDIT_TERM</span> → <b>17 fitur final</b> untuk segmentasi.
      </div>
    </div>
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
  return (
    <>
      <KpiRow items={KPIS.phase2} />

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Tiga Algoritma Clustering</span><span className="cx-note">pilih algoritma · parameter &amp; justifikasinya</span></div>
        <AlgoPanel />
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Feature Selection untuk Segmentasi</span><span className="cx-note">kenapa 185 fitur Fase 1 tidak dipakai langsung</span></div>
        <SegFeatureSelect />
      </div>

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
          <div className="cx-card-head"><span className="cx-card-title" style={{ color: "#15803D" }}>Tipe lunas</span><span className="cx-card-title" style={{ color: "#E11D48" }}>Tipe gagal bayar</span></div>
          <div className="cx-personas-2">
            <PersonaList personas={PAID_PERSONAS} color="#15803D" of="pelunas" />
            <PersonaList personas={DEF_PERSONAS} color="#E11D48" of="gagal bayar" />
          </div>
        </div>
      </div>
    </>
  );
}

function MetricExplainer() {
  const [sel, setSel] = useState(0);
  const m = METRICS_DEF[sel];
  return (
    <div>
      <div className="cx-metricrow">
        {METRICS_DEF.map((x, i) => (
          <button key={x.name} className={`cx-metricbtn ${i === sel ? "cx-metricbtn-on" : ""}`} onClick={() => setSel(i)}
            style={i === sel ? { borderColor: x.color, color: x.color } : undefined}>
            <b>{x.name}</b>
            <em>{x.reads}</em>
          </button>
        ))}
      </div>
      <div className="cx-metricbody" style={{ borderLeftColor: m.color }}>
        <div className="cx-metricformula"><span className="cx-note">Rumus</span><code>{m.formula}</code></div>
        <p>{m.example}</p>
      </div>
      <p className="cx-subtle">
        <b>Lift &gt; 1</b> = asosiasi positif · <b>= 1</b> independen · <b>&lt; 1</b> saling menghindar.
        Lift jadi metrik keputusan utama karena membuang bias base-rate.
      </p>
    </div>
  );
}

function DiscretizationTable() {
  const [h, setH] = useState<string | null>(null);
  const active = BINS.find((b) => b.attr === h);
  return (
    <div>
      <div className="cx-tablewrap">
        <table className="cx-table cx-table-compact">
          <thead><tr><th>Atribut</th><th>Kategori</th><th>Batas / aturan</th></tr></thead>
          <tbody>
            {BINS.map((b) => (
              <tr key={b.attr} onMouseEnter={() => setH(b.attr)} onMouseLeave={() => setH(null)}
                style={{ background: h === b.attr ? "var(--card2)" : undefined }}>
                <td>
                  <code>{b.attr}</code>
                  <span className="cx-tag" style={{ color: BASIS_COL[b.basis], borderColor: BASIS_COL[b.basis] }}>{b.basis}</span>
                </td>
                <td style={{ fontWeight: 400, color: "var(--muted)", whiteSpace: "normal" }}>{b.cats}</td>
                <td className="cx-mono">{b.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cx-caption" style={{ borderLeftColor: active ? BASIS_COL[active.basis] : C.info }}>
        {active ? <><b>{active.attr}</b> — {active.why}</>
          : <><b>Kenapa quintile/tertile, bukan ambang tetap?</b> Dua alasan terukur: (1) tiap kategori otomatis berisi ~20% atau ~33% populasi, jadi tak ada kategori terlalu langka untuk lolos <span className="cx-mono">min_support</span>; (2) batas ditentukan distribusi nyata, bukan angka arbitrer. <span className="cx-mono">DEBT_BURDEN</span> justru pakai ambang domain karena debt-service ratio punya makna baku.</>}
      </div>
    </div>
  );
}

function AprioriFunnel() {
  const [h, setH] = useState<number | null>(null);
  return (
    <div className="cx-methods">
      {APRIORI_FUNNEL.map((f, i) => (
        <div key={f.stage} className="cx-mrow" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <div className="cx-fhead">
            <span>{f.stage}</span>
            <span className="cx-mnum">{fmt(f.n)}</span>
          </div>
          <div className="cx-track">
            <span className="cx-fill" style={{ width: `${Math.max(1.5, (f.n / f.of) * 100)}%`, background: i === APRIORI_FUNNEL.length - 1 ? C.safe : C.info, opacity: h === null || h === i ? 1 : 0.4 }} />
          </div>
          <div className="cx-fnote" style={{ opacity: h === i ? 1 : 0.65 }}>
            <span className="cx-mono" style={{ color: "var(--warn)" }}>{f.param}</span> — {f.note}
          </div>
        </div>
      ))}
    </div>
  );
}

function AprioriParams() {
  const [open, setOpen] = useState<string | null>(APRIORI_PARAMS[0].k);
  return (
    <div className="cx-accordion">
      {APRIORI_PARAMS.map((p) => {
        const isOpen = open === p.k;
        return (
          <div key={p.k} className={`cx-accitem ${isOpen ? "cx-accitem-on" : ""}`}>
            <button className="cx-acchead" onClick={() => setOpen(isOpen ? null : p.k)} aria-expanded={isOpen}>
              <span><span className="cx-mono" style={{ color: "var(--info)" }}>{p.k}</span> = <b>{p.v}</b></span>
              <span className="cx-accchev" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}><Icon name="chevronDown" /></span>
            </button>
            {isOpen && <p className="cx-accbody">{p.why}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Phase3() {
  return (
    <>
      <KpiRow items={KPIS.phase3} />

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Tiga Metrik Inti</span><span className="cx-note">klik untuk penjelasan</span></div>
          <MetricExplainer />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Dari 81.710 aturan jadi 18</span><span className="cx-note">hover tiap tahap</span></div>
          <AprioriFunnel />
        </div>
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Diskretisasi Variabel Kontinu</span><span className="cx-note">hover tiap atribut untuk rasionalnya</span></div>
        <DiscretizationTable />
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Parameter Apriori &amp; Justifikasinya</span><span className="cx-note">klik untuk buka</span></div>
        <AprioriParams />
      </div>

      <div className="cx-grid cx-grid-2">
        <RuleColumn title="Apa yang memicu gagal bayar" hint="peluang gagal bayar" rules={RISK_RULES} color={C.risk} />
        <RuleColumn title="Apa yang menandakan aman" hint="peluang lunas" rules={SAFE_RULES} color={C.safe} />
      </div>
      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Lanskap aturan</span><span className="cx-note">support × confidence × lift</span></div>
          <RuleScatter />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Aturan risiko terkuat menurut lift</span><span className="cx-note">× di atas rata-rata</span></div>
          <HBars items={LIFT_ITEMS} max={2.28} fmtVal={(v) => v.toFixed(2) + "×"} />
          <p className="cx-subtle">Tak satu pun atribut tunggal cukup — risiko melonjak hanya saat <b>skor rendah berpasangan</b> dengan faktor kerentanan. Ini membenarkan credit scoring berbasis <b>interaksi</b>, bukan ambang per-atribut.</p>
        </div>
      </div>
    </>
  );
}

function SkewEvidence() {
  const [h, setH] = useState<number | null>(null);
  const max = Math.max(...IQR_BY_FEATURE.map((f) => f.iqr));
  return (
    <div>
      <ul className="cx-hbars">
        {IQR_BY_FEATURE.map((f, i) => (
          <li key={f.feat} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
            <div className="cx-hb-head">
              <span className="cx-mono" style={{ fontSize: "11.5px" }}>{f.feat}</span>
              <span className="cx-hb-val">{f.iqr.toFixed(2)}%</span>
            </div>
            <div className="cx-track">
              <span className="cx-fill" style={{ width: `${max ? (f.iqr / max) * 100 : 0}%`, background: C.warn, opacity: h === null || h === i ? 1 : 0.4 }} />
              {f.z !== null && <span className="cx-fill cx-fill-over" style={{ width: `${max ? (f.z / max) * 100 : 0}%`, background: C.info }} />}
            </div>
          </li>
        ))}
      </ul>
      <div className="cx-scatter-legend" style={{ marginTop: "12px" }}>
        <span><i style={{ background: C.warn }} /> Terflag IQR</span>
        <span><i style={{ background: C.info }} /> Terflag Z-score</span>
      </div>
      <div className="cx-caption" style={{ borderLeftColor: C.warn }}>
        <b>Bukti empiris kenapa dua metode univariate diperlukan.</b> Pada fitur ber-skew ekstrem,
        Z-score menandai jauh lebih sedikit outlier daripada IQR — persis konsekuensi asumsi normalitas yang gugur:
        <span className="cx-mono"> BURO_..._DEBT_MEAN</span> (skew <b>22,34</b>) → IQR 10,69% vs Z 1,10%;
        <span className="cx-mono"> INST_PAYMENT_DELAY_MEAN</span> (skew <b>24,10</b>) → 5,67% vs 0,93%.
        Mean &amp; std tertarik ekor, jadi Z-score <b>under-flag</b>.
      </div>
    </div>
  );
}

function DbscanConvergence() {
  return (
    <div>
      <p className="cx-lead" style={{ maxWidth: "none", fontSize: "13px" }}>
        DBSCAN (Fase 2, density-based, ruang 17-fitur ter-PCA) dan metode statistik Fase 4 (11 fitur mentah)
        adalah pendekatan <b>independen</b>. Dari <b>199 outlier DBSCAN</b>:
      </p>
      <ul className="cx-hbars" style={{ marginTop: "14px" }}>
        {DBSCAN_XREF.map((x) => (
          <li key={x.label}>
            <div className="cx-hb-head"><span>{x.label}</span><span className="cx-hb-val">{x.pct}% <span style={{ color: "var(--dim)", fontWeight: 400 }}>({x.n})</span></span></div>
            <div className="cx-track"><span className="cx-fill" style={{ width: `${x.pct}%`, background: x.color }} /></div>
          </li>
        ))}
      </ul>
      <div className="cx-caption" style={{ borderLeftColor: C.safe }}>
        <b>Konvergensi kuat.</b> 93,0% outlier DBSCAN dikonfirmasi ≥2 metode statistik yang sama sekali berbeda asumsinya —
        keduanya menunjuk record menyimpang yang sama dari sudut berbeda. Tingkat Isolation Forest 15,6% adalah
        <b> 15,6× lipat</b> tingkat populasi (1,0%).
      </div>
    </div>
  );
}

function AnomalyClasses() {
  const [sel, setSel] = useState(ANOM_CLASSES[0].id);
  const a = ANOM_CLASSES.find((x) => x.id === sel)!;
  return (
    <div>
      <div className="cx-classrow">
        {ANOM_CLASSES.map((x) => (
          <button key={x.id} className={`cx-classbtn ${x.id === sel ? "cx-classbtn-on" : ""}`} onClick={() => setSel(x.id)}
            style={x.id === sel ? { borderColor: x.color } : undefined}>
            <span className="cx-classname" style={{ color: x.color }}>{x.name}</span>
            <span className="cx-classcount">{fmt(x.count)}</span>
            <span className="cx-classrate">{x.rate === null ? "—" : `default ${x.rate.toFixed(2).replace(".", ",")}%`}</span>
          </button>
        ))}
      </div>

      <div className="cx-ratebar">
        <div className="cx-ratebar-track">
          {ANOM_CLASSES.filter((x) => x.rate !== null).map((x) => (
            <div key={x.id} className="cx-ratebar-mark" style={{ left: `${((x.rate as number) / 12) * 100}%`, background: x.color }} title={x.name}>
              <span>{(x.rate as number).toFixed(2).replace(".", ",")}%</span>
            </div>
          ))}
          <div className="cx-ratebar-base" style={{ left: `${(8.07 / 12) * 100}%` }}><span>base 8,07%</span></div>
        </div>
        <p className="cx-subtle" style={{ marginTop: "26px" }}>
          <b>Validasi lewat default rate.</b> RISK_SIGNAL (8,69%) berada di atas base rate, RARE_LEGITIMATE (5,20%) di bawahnya.
          Urutan <b>RISK &gt; base &gt; RARE</b> inilah bukti bahwa klasifikasinya benar-benar memisahkan risiko, bukan sekadar melabeli.
        </p>
      </div>

      <div className="cx-classdetail" style={{ borderLeftColor: a.color }}>
        <div className="cx-classmeta">
          <div><span className="cx-note">Aturan</span><p className="cx-mono">{a.rule}</p></div>
          <div><span className="cx-note">Median kredit/income</span><p><b>{a.ci}</b></p></div>
          <div><span className="cx-note">Median EXT_2</span><p><b>{a.ext}</b></p></div>
        </div>
        <p className="cx-classverdict">{a.verdict}</p>
        <div className="cx-classexample"><span className="cx-note">Bukti record konkret</span><p>{a.example}</p></div>
      </div>

      {a.id === "err" && (
        <div className="cx-checkgrid">
          {INTEGRITY_CHECKS.map((c) => (
            <div key={c} className="cx-checkitem"><span className="cx-checkmark" style={{ color: C.safe }}><Icon name="check" /></span>{c}<b>0</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

function Phase4() {
  return (
    <>
      <KpiRow items={KPIS.phase4} />
      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Tiga Lensa Anomaly Detection</span><span className="cx-note">arahkan kursor ke tiap lensa</span></div>
        <p className="cx-lead" style={{ marginBottom: "22px", fontSize: "13.5px" }}>Istilah <b>&ldquo;Lensa&rdquo;</b> di sini mengacu pada <b>tiga algoritma pendeteksi anomali (outlier)</b> yang berbeda. Karena tidak ada satu algoritma yang selalu benar, kami menggunakan pendekatan berlapis (ensemble) mulai dari statistik matematis dasar (IQR &amp; Z-Score) hingga algoritma AI modern (Isolation Forest) untuk menyaring data.</p>
        <MethodFunnel />
        <p className="cx-subtle" style={{ marginTop: "20px" }}>Di mana minimal dua algoritma di atas sepakat terhadap baris yang sama, kami mendapatkan <b>30.122</b> kredit yang kami jadikan target <i>flagging</i> dengan keyakinan tinggi.</p>
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Kenapa IQR &amp; Z-score keduanya perlu</span><span className="cx-note">outlier per fitur</span></div>
          <SkewEvidence />
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Cross-reference dengan DBSCAN Fase 2</span><span className="cx-note">validasi silang</span></div>
          <DbscanConvergence />
        </div>
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Berapa lensa yang sepakat</span><span className="cx-note">212.056 tanpa flag dikecualikan</span></div>
          <HBars items={AGREE_ITEMS} max={65333} fmtVal={fmt} />
          <p className="cx-subtle">Hampir semua anomali Z-score dan Isolation Forest adalah <b>subset dari IQR</b> (masing-masing 100%). IQR = jaring terluas; metode lebih ketat menyaring di dalamnya.</p>
        </div>
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Di mana anomaly menumpuk</span><span className="cx-note">% keyakinan tinggi per segmen</span></div>
          <HBars items={ANOM_ITEMS} max={15} fmtVal={(v) => v.toFixed(1) + "%"} />
          <p className="cx-subtle">Anomali menumpuk di persona <b>berpinjaman besar / leverage tinggi</b> (P0, P2, D1, D2) — bukan di persona pinjaman kecil, dan <b>tidak</b> lebih pekat di populasi gagal bayar (default 6,87% &lt; paid 10,05%). <b>Anomali statistik ≠ risiko default</b>: keduanya menangkap dimensi berbeda.</p>
        </div>
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Klasifikasi Tiap Anomali</span><span className="cx-note">data error · rare event · risk indicator</span></div>
        <AnomalyClasses />
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Outlier vs nasabah tipikal</span><span className="cx-note">outlier DBSCAN</span></div>
          <OutlierProfile />
          <p className="cx-subtle" style={{ marginTop: "14px", lineHeight: 1.55, fontSize: "12.5px" }}>
            <b>Apa artinya?</b> Nasabah outlier (anomali) menunjukkan rasio utang yang sangat ekstrem.
            Nilai <b>Kredit ÷ Penghasilan</b> mereka mencapai 5,7× gaji (dibandingkan nasabah tipikal yang hanya 3,9×).
            Selain itu, <b>Anuitas ÷ Penghasilan</b> mereka adalah 0,27, yang berarti 27% dari total pendapatan mereka habis murni untuk membayar cicilan bulanan (berbanding 18% pada nasabah wajar).
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

function KnowledgePanel() {
  const [open, setOpen] = useState<string>(KNOWLEDGE[0].id);
  const [filter, setFilter] = useState<"all" | Knowledge["kind"]>("all");
  const list = filter === "all" ? KNOWLEDGE : KNOWLEDGE.filter((k) => k.kind === filter);
  return (
    <div>
      <div className="cx-toggle" style={{ marginBottom: "16px" }}>
        <button className={`cx-toggle-btn ${filter === "all" ? "cx-toggle-on" : ""}`} onClick={() => setFilter("all")}>Semua ({KNOWLEDGE.length})</button>
        {(Object.keys(KIND_META) as Knowledge["kind"][]).map((k) => (
          <button key={k} className={`cx-toggle-btn ${filter === k ? "cx-toggle-on" : ""}`} onClick={() => setFilter(k)}
            style={filter === k ? { background: KIND_META[k].color, borderColor: "transparent" } : undefined}>
            {KIND_META[k].label} ({KNOWLEDGE.filter((x) => x.kind === k).length})
          </button>
        ))}
      </div>

      <div className="cx-klist">
        {list.map((k, i) => {
          const isOpen = open === k.id;
          const meta = KIND_META[k.kind];
          return (
            <div key={k.id} className={`cx-kitem ${isOpen ? "cx-kitem-on" : ""}`} style={isOpen ? { borderColor: meta.color } : undefined}>
              <button className="cx-khead" onClick={() => setOpen(isOpen ? "" : k.id)} aria-expanded={isOpen}>
                <span className="cx-knum" style={{ background: isOpen ? meta.color : undefined, color: isOpen ? "#fff" : undefined }}>{i + 1}</span>
                <span className="cx-ktexts">
                  <span className="cx-ktag" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="cx-kheadline">{k.headline}</span>
                </span>
                <span className="cx-accchev" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}><Icon name="chevronDown" /></span>
              </button>

              {isOpen && (
                <div className="cx-kbody">
                  <p className="cx-kclaim">{k.claim}</p>

                  <div className="cx-kevidence">
                    <span className="cx-note">Rantai bukti</span>
                    <ul>
                      {k.evidence.map((e, j) => (
                        <li key={j}>
                          <span className="cx-kphase" style={{ borderColor: meta.color, color: meta.color }}>{e.phase}</span>
                          <span>{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="cx-kfoot">
                    <div className="cx-kaction" style={{ borderLeftColor: meta.color }}>
                      <span className="cx-note">Tindakan bisnis</span>
                      <p>{k.action}</p>
                    </div>
                    <div className="cx-kvalue">
                      <span className="cx-note">Kenapa ini bernilai</span>
                      <p>{k.value}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Knowledge() {
  return (
    <>
      <KpiRow items={KPIS.knowledge} />

      <div className="cx-card cx-hero">
        <span className="cx-eyebrow">Jawaban ringkas</span>
        <p className="cx-heroline">
          Yang membedakan nasabah gagal bayar dari yang lunas <strong>bukan seberapa besar mereka meminjam</strong> —
          melainkan <strong>skor kredit eksternal yang lebih rendah</strong>, dan hanya ketika skor itu
          <strong> berpasangan</strong> dengan faktor kerentanan kedua.
        </p>
        <p className="cx-herosub">
          Temuan ini muncul secara independen di tiga fase yang memakai metode berbeda — mutual information (Fase 1),
          kontras lintas-populasi (Fase 2), dan association rules (Fase 3) — sehingga saling memvalidasi, bukan artefak satu metode.
        </p>
      </div>

      <div className="cx-card">
        <div className="cx-card-head"><span className="cx-card-title">Tujuh Pengetahuan yang Ditemukan</span><span className="cx-note">klik untuk rantai bukti &amp; tindakannya</span></div>
        <KnowledgePanel />
      </div>

      <div className="cx-grid cx-grid-2">
        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Dari analisis ke keputusan</span><span className="cx-note">tiga jalur nasabah</span></div>
          <ul className="cx-routelist">
            <li>
              <span className="cx-routedot" style={{ background: C.safe }} />
              <div>
                <b>Fast-track &amp; upsell</b>
                <span className="cx-routenum">~38.000 nasabah · 97,7% lunas</span>
                <p>Kedua skor eksternal tinggi. Percepat persetujuan, tawarkan produk premium, dan bebaskan kapasitas review manual.</p>
              </div>
            </li>
            <li>
              <span className="cx-routedot" style={{ background: C.warn }} />
              <div>
                <b>Jalur persetujuan khusus</b>
                <span className="cx-routenum">26.139 nasabah · default 5,20%</span>
                <p>RARE_LEGITIMATE — ekstrem pada angka tapi konsisten, dan lebih aman dari rata-rata. Jangan tolak otomatis hanya karena terlihat sebagai outlier.</p>
              </div>
            </li>
            <li>
              <span className="cx-routedot" style={{ background: C.risk }} />
              <div>
                <b>Manual underwriting review</b>
                <span className="cx-routenum">3.983 nasabah · default 8,69%</span>
                <p>RISK_SIGNAL — leverage ekstrem dan/atau kedua skor rendah. Verifikasi slip gaji, minta uang muka lebih besar, atau batasi plafon.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="cx-card">
          <div className="cx-card-head"><span className="cx-card-title">Batasan yang kami akui</span><span className="cx-note">kejujuran metodologis</span></div>
          <ul className="cx-limitlist">
            <li><b>Silhouette rendah (≈0,09).</b> Data finansial berbentuk continuum, jadi batas antar-segmen memang kabur. Persona tetap berguna sebagai lensa, bukan sebagai kotak yang tegas.</li>
            <li><b>DBSCAN dijalankan pada sampel 20k</b>, bukan seluruh populasi — jadi angka overlap dihitung atas 199 outlier itu saja. IQR, Z-score, dan Isolation Forest tetap dihitung pada seluruh 307.511 nasabah.</li>
            <li><b>Nol DATA_ERROR bukan berarti tidak mencari.</b> Sebelas kondisi mustahil diuji eksplisit, termasuk konsistensi antar-kolom; semuanya nol karena Fase 1 sudah menuntaskannya.</li>
            <li><b>Aturan proteksi tak bisa dinilai lewat lift.</b> Karena Repaid ≈ 92%, lift maksimum teoretisnya hanya ~1,09 — itu matematika, bukan kelemahan aturan.</li>
            <li><b>Gender muncul sebagai penanda, bukan penyebab.</b> Aturan #13 dipakai sebagai flag tambahan saja; menjadikannya dasar keputusan kredit berisiko secara etis dan regulatif.</li>
          </ul>
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
            
            <h4 style={{ color: "#15803D", margin: "0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Keamanan (Pasti Lunas)</h4>
            <div className="cx-dict-item"><b>1. Kedua skor (EXT2 & EXT3) tinggi → Lunas</b><p>Kombinasi paling sakti. Jika kedua biro kredit memberi skor tinggi, nasabah memiliki probabilitas pelunasan di atas 97%.</p></div>
            <div className="cx-dict-item"><b>2. Skor tinggi + Wilayah teratas → Lunas</b><p>Skor baik ditambah domisili di lingkungan elit/rating baik adalah garansi keamanan portofolio.</p></div>
            <div className="cx-dict-item"><b>3. Kerja 15+ tahun + Skor tinggi → Lunas</b><p>Kestabilan karier (di atas 15 tahun di satu tempat) memberikan bantalan ekonomi yang kebal goncangan.</p></div>
            <div className="cx-dict-item"><b>4. Skor tinggi + Pinjaman Revolving → Lunas</b><p>Nasabah unggul sangat pandai mengelola kartu kredit atau revolving loan tanpa menunggak.</p></div>

            <h4 style={{ color: "#E11D48", margin: "16px 0 0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Risiko (Sinyal Gagal Bayar)</h4>
            <div className="cx-dict-item"><b>5. Kedua skor eksternal rendah → Gagal bayar</b><p>Aturan terkuat (Lift 2.28×). Peluang macet meroket lebih dari dua kali lipat rata-rata portofolio.</p></div>
            <div className="cx-dict-item"><b>6. Kerja 1–3 tahun + Skor rendah → Gagal bayar</b><p>Tenaga kerja baru tanpa tabungan darurat, ditambah histori kredit buruk, berakibat fatal pada pelunasan.</p></div>
            <div className="cx-dict-item"><b>7. Pria + Skor rendah → Gagal bayar</b><p>Data demografis historis membuktikan pria dengan skor rendah secara konsisten lebih sering menunggak dibanding demografi lain.</p></div>
            <div className="cx-dict-item"><b>8. Skor rendah + Harga barang menengah → Gagal bayar</b><p>Overkonsumsi: Memaksakan mencicil barang sekunder kelas menengah meski track record kredit sedang hancur.</p></div>
            <div className="cx-dict-item"><b>9. Umur muda + Skor rendah → Gagal bayar</b><p>Nasabah di bawah 30 tahun seringkali masih labil secara emosional dan belum stabil secara finansial.</p></div>
            <div className="cx-dict-item"><b>10. Ukuran pinjaman menengah + Skor rendah → Gagal bayar</b><p>Kredit jumlah tanggung sangat sering macet di pertengahan masa tenor pada nasabah berprofil lemah.</p></div>
            <div className="cx-dict-item"><b>11 & 12. Kombinasi Spesifik EXT_SOURCE_3</b><p>Skor 3 secara terpisah dipadukan dengan <i>Barang Menengah</i> atau <i>Pekerja Baru</i> sudah cukup untuk memicu lonjakan probabilitas gagal bayar.</p></div>

            <h4 style={{ color: "#4D7C0F", margin: "16px 0 0", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Aturan Perilaku (Wawasan Produk)</h4>
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
  knowledge: "target",
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
            {tab === "knowledge" && <Knowledge />}
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
  /* one palette, green-anchored — mirrors the C token object in TS */
  --page:#F3F5EE; --sidebar-a:#0C1712; --sidebar-b:#142C21; --card:#FFFFFF; --card2:#EDF1E6; --line:#DFE5D4;
  --ink:#12211A; --muted:#6B7666; --dim:#9AA48F;
  --safe:#15803D; --risk:#E11D48; --warn:#D97706; --info:#0F766E; --olive:#4D7C0F;
  /* legacy aliases kept so existing rules keep resolving */
  --blue:var(--safe); --purple:var(--olive); --grad:var(--safe);
  --up:var(--safe); --down:var(--risk);
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
.cx-chip-up{color:var(--safe); background:rgba(21,128,61,.11);}
.cx-chip-down{color:var(--risk); background:rgba(225,29,72,.10);}
.cx-chip-warn{color:var(--warn); background:rgba(217,119,6,.11);}
.cx-chip-info{color:var(--info); background:rgba(15,118,110,.11);}
.cx-chip-olive{color:var(--olive); background:rgba(77,124,15,.12);}
.cx-chip-flat{color:var(--muted); background:var(--card2);}

/* sparkline motif */
.cx-spark{display:flex; align-items:flex-end; gap:2.5px; height:34px; width:58px; flex:none;}
.cx-spark span{flex:1; min-height:3px; border-radius:2px; background:currentColor; opacity:.9;}
.cx-spark-up{color:var(--up);}
.cx-spark-down{color:var(--down);}
.cx-spark-warn{color:var(--warn);}
.cx-spark-flat{color:var(--dim);}
.cx-spark-info{color:var(--info);}
.cx-spark-olive{color:var(--olive);}
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
.cx-table-compact td{padding:10px 12px;}
.cx-mono{font-family:var(--mono,ui-monospace,monospace); font-size:12px;}
.cx-tag{display:inline-block; font-size:10px; font-weight:600; letter-spacing:.02em; text-transform:uppercase; border:1px solid var(--line); border-radius:999px; padding:2px 8px; margin-left:8px; color:var(--muted); white-space:nowrap;}
.cx-tag-info{color:var(--info); border-color:var(--info);}
.cx-tag-warn{color:var(--warn); border-color:var(--warn);}

/* stage 1 — cleaning audit */
.cx-auditbox{display:flex; gap:20px; align-items:flex-start; background:var(--card2); border:1px solid var(--line); border-radius:14px; padding:18px 20px;}
.cx-auditmetric{display:flex; flex-direction:column; align-items:flex-start; min-width:120px; flex:none; padding-right:20px; border-right:1px solid var(--line);}
.cx-auditnum{font-size:28px; font-weight:700; letter-spacing:-.02em; color:var(--ink); line-height:1.1;}
.cx-auditunit{font-size:11px; color:var(--muted); margin-top:5px; line-height:1.35;}
.cx-auditbody{flex:1; min-width:0;}
.cx-auditdetail{margin:0; font-size:13px; color:var(--ink); line-height:1.6;}
.cx-auditwhy{margin:10px 0 0; font-size:12.5px; color:var(--muted); line-height:1.6;}
.cx-auditwhy b{color:var(--safe);}

/* stage 2 — algorithm panel */
.cx-algotabs{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px;}
.cx-algotab{display:flex; align-items:center; gap:10px; appearance:none; cursor:pointer; text-align:left; font-family:var(--body); background:var(--card2); border:1.5px solid var(--line); border-radius:13px; padding:12px 14px; color:var(--muted); transition:all .15s;}
.cx-algotab:hover{border-color:var(--dim);}
.cx-algotab-on{background:var(--card);}
.cx-algodot{width:10px; height:10px; border-radius:50%; flex:none;}
.cx-algotab b{display:block; font-size:13.5px; font-weight:600; color:inherit;}
.cx-algotab em{display:block; font-style:normal; font-size:10.5px; color:var(--dim); margin-top:2px;}
.cx-algobody{display:flex; flex-direction:column; gap:16px;}
.cx-algoscope{margin:0; font-size:13px; color:var(--muted);}
.cx-algoscope b{color:var(--ink);}
.cx-paramlist{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px;}
.cx-paramlist li{background:var(--card2); border:1px solid var(--line); border-radius:12px; padding:13px 15px;}
.cx-paramhead{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;}
.cx-paramk{font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--dim); min-width:74px;}
.cx-paramv{font-size:13.5px; font-weight:600; color:var(--ink);}
.cx-paramwhy{margin:7px 0 0; font-size:12.5px; color:var(--muted); line-height:1.55;}
.cx-algoresult{border:1px solid var(--line); border-left-width:4px; border-radius:12px; padding:14px 16px; background:var(--card2);}
.cx-algoresult b{display:block; font-size:15px; margin:5px 0 8px;}
.cx-algoresult p{margin:0; font-size:13px; color:var(--muted); line-height:1.6;}

/* stage 5 — knowledge synthesis */
.cx-hero{background:linear-gradient(158deg, var(--sidebar-a), var(--sidebar-b)); border-color:transparent; padding:26px 28px;}
.cx-hero .cx-eyebrow{color:#7FD8A4;}
.cx-heroline{margin:12px 0 0; font-size:clamp(17px,2.1vw,23px); line-height:1.5; color:#EAF2EC; max-width:62ch; font-weight:500;}
.cx-heroline strong{color:#fff; font-weight:700;}
.cx-herosub{margin:14px 0 0; font-size:13px; line-height:1.65; color:rgba(234,242,236,.62); max-width:74ch;}

.cx-klist{display:flex; flex-direction:column; gap:10px;}
.cx-kitem{background:var(--card2); border:1.5px solid var(--line); border-radius:14px; overflow:hidden; transition:border-color .2s;}
.cx-kitem-on{background:var(--card);}
.cx-khead{appearance:none; width:100%; display:flex; align-items:flex-start; gap:13px; background:none; border:none; cursor:pointer; padding:15px 17px; font-family:var(--body); text-align:left;}
.cx-knum{display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--line); color:var(--muted); font-size:12px; font-weight:700; flex:none; transition:all .2s;}
.cx-ktexts{flex:1; min-width:0;}
.cx-ktag{display:block; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-bottom:5px;}
.cx-kheadline{display:block; font-size:14.5px; font-weight:600; color:var(--ink); line-height:1.45;}
.cx-kbody{padding:0 17px 18px 56px;}
.cx-kclaim{margin:0 0 16px; font-size:13.5px; color:var(--muted); line-height:1.65;}
.cx-kevidence ul{list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:9px;}
.cx-kevidence li{display:flex; gap:11px; align-items:flex-start; font-size:12.5px; color:var(--muted); line-height:1.55;}
.cx-kphase{flex:none; font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; border:1px solid; border-radius:999px; padding:2px 9px; margin-top:1px;}
.cx-kfoot{display:grid; grid-template-columns:1.35fr 1fr; gap:14px; margin-top:18px;}
.cx-kaction{border-left:4px solid; padding-left:13px;}
.cx-kaction p,.cx-kvalue p{margin:6px 0 0; font-size:12.5px; line-height:1.6;}
.cx-kaction p{color:var(--ink);}
.cx-kvalue p{color:var(--muted);}

/* stage 5 — routes & limitations */
.cx-routelist{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:16px;}
.cx-routelist li{display:flex; gap:12px; align-items:flex-start;}
.cx-routedot{width:11px; height:11px; border-radius:50%; flex:none; margin-top:5px;}
.cx-routelist b{font-size:13.5px;}
.cx-routenum{display:block; font-size:11px; color:var(--dim); margin-top:3px; font-weight:600;}
.cx-routelist p{margin:6px 0 0; font-size:12.5px; color:var(--muted); line-height:1.55;}
.cx-limitlist{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px;}
.cx-limitlist li{font-size:12.5px; color:var(--muted); line-height:1.6; padding-left:15px; position:relative;}
.cx-limitlist li:before{content:""; position:absolute; left:0; top:8px; width:5px; height:5px; border-radius:50%; background:var(--dim);}
.cx-limitlist b{color:var(--ink);}

/* stage 4 — skew evidence overlay bar */
.cx-track{position:relative;}
.cx-fill-over{position:absolute; left:0; top:0; height:100%;}

/* stage 4 — anomaly classes */
.cx-classrow{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;}
.cx-classbtn{appearance:none; cursor:pointer; text-align:left; font-family:var(--body); background:var(--card2); border:1.5px solid var(--line); border-radius:13px; padding:13px 15px; transition:all .15s;}
.cx-classbtn:hover{border-color:var(--dim);}
.cx-classbtn-on{background:var(--card);}
.cx-classname{display:block; font-size:12px; font-weight:700; letter-spacing:.03em;}
.cx-classcount{display:block; font-size:22px; font-weight:700; color:var(--ink); margin-top:6px; letter-spacing:-.02em;}
.cx-classrate{display:block; font-size:11px; color:var(--muted); margin-top:3px;}
.cx-ratebar{margin-bottom:20px;}
.cx-ratebar-track{position:relative; height:8px; background:var(--card2); border:1px solid var(--line); border-radius:999px; margin-top:26px;}
.cx-ratebar-mark{position:absolute; top:-4px; width:3px; height:16px; border-radius:2px; transform:translateX(-50%);}
.cx-ratebar-mark span{position:absolute; top:-20px; left:50%; transform:translateX(-50%); font-size:10.5px; font-weight:700; white-space:nowrap; color:inherit;}
.cx-ratebar-base{position:absolute; top:-9px; width:1px; height:26px; background:var(--dim); transform:translateX(-50%);}
.cx-ratebar-base span{position:absolute; top:28px; left:50%; transform:translateX(-50%); font-size:10px; color:var(--dim); white-space:nowrap;}
.cx-classdetail{border:1px solid var(--line); border-left-width:4px; border-radius:12px; background:var(--card2); padding:15px 17px;}
.cx-classmeta{display:grid; grid-template-columns:2fr 1fr 1fr; gap:16px; padding-bottom:13px; border-bottom:1px solid var(--line);}
.cx-classmeta p{margin:5px 0 0; font-size:12.5px; color:var(--ink); line-height:1.5;}
.cx-classverdict{margin:13px 0 0; font-size:13px; color:var(--muted); line-height:1.6;}
.cx-classexample{margin-top:13px; padding-top:13px; border-top:1px solid var(--line);}
.cx-classexample p{margin:5px 0 0; font-size:12.5px; color:var(--muted); line-height:1.55;}
.cx-checkgrid{display:grid; grid-template-columns:repeat(2,1fr); gap:7px; margin-top:14px;}
.cx-checkitem{display:flex; align-items:center; gap:9px; font-size:12px; color:var(--muted); background:var(--card2); border:1px solid var(--line); border-radius:9px; padding:8px 11px;}
.cx-checkitem b{margin-left:auto; color:var(--safe); font-size:12.5px;}
.cx-checkmark{display:grid; place-items:center; flex:none;}

/* stage 3 — metric explainer */
.cx-metricrow{display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-bottom:16px;}
.cx-metricbtn{appearance:none; cursor:pointer; text-align:left; font-family:var(--body); background:var(--card2); border:1.5px solid var(--line); border-radius:12px; padding:11px 13px; color:var(--muted); transition:all .15s;}
.cx-metricbtn:hover{border-color:var(--dim);}
.cx-metricbtn-on{background:var(--card);}
.cx-metricbtn b{display:block; font-size:13.5px; font-weight:700; color:inherit;}
.cx-metricbtn em{display:block; font-style:normal; font-size:10.5px; color:var(--dim); margin-top:3px; line-height:1.35;}
.cx-metricbody{border:1px solid var(--line); border-left-width:4px; border-radius:12px; background:var(--card2); padding:14px 16px;}
.cx-metricformula{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:9px;}
.cx-metricbody p{margin:0; font-size:13px; color:var(--muted); line-height:1.6;}

/* stage 2 — segmentation criteria list */
.cx-critlist{list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:12px;}
.cx-critlist li{display:flex; gap:12px; align-items:flex-start;}
.cx-critnum{display:grid; place-items:center; width:22px; height:22px; border-radius:50%; background:var(--safe); color:#fff; font-size:11.5px; font-weight:700; flex:none; margin-top:1px;}
.cx-critlist b{font-size:13px;}
.cx-critlist p{margin:4px 0 0; font-size:12.5px; color:var(--muted); line-height:1.5;}

/* stage 1 — transformation list */
.cx-translist{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px;}
.cx-translist li{padding-bottom:14px; border-bottom:1px solid var(--line);}
.cx-translist li:last-child{border-bottom:none; padding-bottom:0;}
.cx-transhead{display:flex; align-items:center; justify-content:space-between; gap:10px;}
.cx-transtitle{font-size:13.5px; font-weight:600;}
.cx-transdetail{margin:7px 0 0; font-size:12.5px; color:var(--muted); line-height:1.55; transition:opacity .2s;}

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
  .cx-algotabs,.cx-metricrow,.cx-classrow{grid-template-columns:1fr;}
  .cx-classmeta,.cx-kfoot,.cx-checkgrid{grid-template-columns:1fr;}
  .cx-kbody{padding-left:17px;}
  .cx-auditbox{flex-direction:column; gap:14px;}
  .cx-auditmetric{border-right:none; border-bottom:1px solid var(--line); padding:0 0 12px; min-width:0;}
}
`;

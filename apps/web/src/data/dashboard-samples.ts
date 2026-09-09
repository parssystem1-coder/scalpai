// Patient sample data and trichoscopy images for ClinicalDashboard

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt?: string;
  lastVisit?: string;
  scalpCondition?: string;
  hairDensity?: number;
  anagenRatio?: number;
  keratinHealth?: number;
  sebumBalance?: number;
  microcirculation?: number;
  stemCellVitality?: number;
}

export interface TrichoscopyImage {
  id: string;
  patientId: string;
  url: string;
  area: "vertex" | "temple" | "frontal" | "occiput";
  date: string;
  density: number;
  thickness: string;
  qualityScore: number;
  tags?: string[];
  notes?: string;
}

export const SAMPLE_PATIENTS: Patient[] = [
  {
    id: "pat-101",
    firstName: "دکتر سارا",
    lastName: "رادمنش",
    phone: "09123456789",
    lastVisit: "۱۴۰۳/۰۶/۱۰",
    scalpCondition: "آلوپسی آندروژنتیک (Grade II)",
    hairDensity: 148,
    anagenRatio: 86,
    keratinHealth: 92,
    sebumBalance: 78,
    microcirculation: 84,
    stemCellVitality: 89,
  },
  {
    id: "pat-102",
    firstName: "مهسا",
    lastName: "کریمی",
    phone: "09129998877",
    lastVisit: "۱۴۰۳/۰۶/۰۸",
    scalpCondition: "تلوژن افلوویوم (استرس بیوشیمیایی)",
    hairDensity: 165,
    anagenRatio: 74,
    keratinHealth: 88,
    sebumBalance: 65,
    microcirculation: 72,
    stemCellVitality: 79,
  },
  {
    id: "pat-103",
    firstName: "نگین",
    lastName: "فرهمند",
    phone: "09351112233",
    lastVisit: "۱۴۰۳/۰۵/۲۸",
    scalpCondition: "درماتیت سبورئیک و میکروالتهاب فولیکولی",
    hairDensity: 122,
    anagenRatio: 79,
    keratinHealth: 81,
    sebumBalance: 42,
    microcirculation: 68,
    stemCellVitality: 73,
  },
];

export const SAMPLE_IMAGES: Record<string, TrichoscopyImage[]> = {
  "pat-101": [
    {
      id: "img-01",
      patientId: "pat-101",
      url: "/trichoscopy/vertex.jpg",
      area: "vertex",
      date: "۱۴۰۳/۰۶/۱۰",
      density: 148,
      thickness: "72 µm",
      qualityScore: 98,
    },
    {
      id: "img-02",
      patientId: "pat-101",
      url: "/trichoscopy/frontal.jpg",
      area: "frontal",
      date: "۱۴۰۳/۰۶/۱۰",
      density: 142,
      thickness: "66 µm",
      qualityScore: 97,
    },
    {
      id: "img-03",
      patientId: "pat-101",
      url: "/trichoscopy/temporal.jpg",
      area: "temple",
      date: "۱۴۰۳/۰۵/۱۰",
      density: 134,
      thickness: "64 µm",
      qualityScore: 95,
    },
    {
      id: "img-04",
      patientId: "pat-101",
      url: "/trichoscopy/occiput.jpg",
      area: "occiput",
      date: "۱۴۰۳/۰۴/۱۵",
      density: 195,
      thickness: "85 µm",
      qualityScore: 99,
    },
  ],
  "pat-102": [
    {
      id: "img-102-1",
      patientId: "pat-102",
      url: "/trichoscopy/vertex.jpg",
      area: "vertex",
      date: "۱۴۰۳/۰۶/۰۸",
      density: 165,
      thickness: "78 µm",
      qualityScore: 97,
    },
    {
      id: "img-102-2",
      patientId: "pat-102",
      url: "/trichoscopy/temporal.jpg",
      area: "temple",
      date: "۱۴۰۳/۰۵/۲۰",
      density: 158,
      thickness: "74 µm",
      qualityScore: 94,
    },
    {
      id: "img-102-3",
      patientId: "pat-102",
      url: "/trichoscopy/occiput.jpg",
      area: "occiput",
      date: "۱۴۰۳/۰۴/۱۰",
      density: 210,
      thickness: "88 µm",
      qualityScore: 99,
    },
  ],
  "pat-103": [
    {
      id: "img-103-1",
      patientId: "pat-103",
      url: "/trichoscopy/temporal.jpg",
      area: "temple",
      date: "۱۴۰۳/۰۶/۰۱",
      density: 122,
      thickness: "58 µm",
      qualityScore: 92,
    },
    {
      id: "img-103-2",
      patientId: "pat-103",
      url: "/trichoscopy/frontal.jpg",
      area: "frontal",
      date: "۱۴۰۳/۰۵/۱۵",
      density: 118,
      thickness: "55 µm",
      qualityScore: 91,
    },
    {
      id: "img-103-3",
      patientId: "pat-103",
      url: "/trichoscopy/vertex.jpg",
      area: "vertex",
      date: "۱۴۰۳/۰۴/۲۰",
      density: 130,
      thickness: "62 µm",
      qualityScore: 94,
    },
  ],
};

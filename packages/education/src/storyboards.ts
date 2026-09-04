import type { ConditionKey, StoryboardDefinition } from "./types.js";

const DEFAULT_DISCLAIMER = {
  fa: "این پویانمایی صرفاً جنبه آموزشی بالینی داشته و جایگزین تشخیص و تجویز قطعی پزشک یا تریکولوژیست معالج نیست.",
  en: "This clinical animation is for educational visualization only and does not replace medical diagnosis or prescription.",
};

const DEFAULT_REVIEWER = "Dr. S. Rad, MD, Board-Certified Dermatologist & Senior Trichology Consultant — 2026-08";

export const CLINICAL_STORYBOARDS: Record<ConditionKey, StoryboardDefinition> = {
  androgenetic_alopecia: {
    id: "androgenetic_alopecia",
    title: { fa: "ریزش موی الگویی (آندروژنتیک)", en: "Androgenetic Alopecia (Pattern Hair Loss)" },
    scene: "follicle-cross-section",
    cameraPath: ["zoom_epidermis", "cross_section_dermis", "focus_dermal_papilla"],
    highlight: "miniaturization",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 15,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "در مرحله خفیف، کاهش جزئی در قطر ساقه مو (نازک‌شدگی اولیه) و تنوع قطری حدود ۲۰٪ در ناحیه ورتکس مشاهده می‌شود.",
          en: "In mild stage, initial hair shaft miniaturization begins with approximately 20% diameter diversity in vertex area.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "در مرحله متوسط، مینیاتوریزه شدن پیشرونده فولیکول‌ها با کاهش زمان فاز آناژن و افزایش موهای ولوس قابل مشاهده است.",
          en: "In moderate stage, progressive follicular miniaturization accelerates with shortened anagen phase and increased vellus hairs.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "در مرحله شدید، آتروفی محسوس پاپیلا و جایگزینی عمده واحدهای فولیکولی با موهای بسیار ظریف یا منافذ خالی رویت می‌گردد.",
          en: "In severe stage, pronounced dermal papilla atrophy is visible with predominant replacement by vellus fibers and empty ostia.",
        },
      },
    },
  },

  telogen_effluvium: {
    id: "telogen_effluvium",
    title: { fa: "ریزش تلوژن افلوویوم (ریزش واکنشی)", en: "Telogen Effluvium (Reactive Hair Shedding)" },
    scene: "follicle-shedding-phase",
    cameraPath: ["wide_scalp", "zoom_hair_bulb", "club_hair_release"],
    highlight: "synchronized_telogen_shedding",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 20,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "ورود زودهنگام بخش محدودی از فولیکول‌ها به فاز تلوژن (استراحت) ناشی از استرس یا تغییرات بیوشیمیایی.",
          en: "Premature transition of limited follicles into the resting telogen phase prompted by systemic triggers.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "افزایش محسوس موهای گرزی (Club Hairs) و جدا شدن همزمان از ریشه همراه با ریزش منتشر روزانه.",
          en: "Noticeable elevation of club hairs detaching from root bed causing synchronized diffuse hair shedding.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "انتقال گسترده بیش از ۳۰٪ کل فولیکول‌ها به فاز تلوژن با کاهش چشمگیر تراکم عمومی موها.",
          en: "Extensive shift of over 30% of total follicles into telogen phase resulting in acute overall density loss.",
        },
      },
    },
  },

  seborrheic_dermatitis: {
    id: "seborrheic_dermatitis",
    title: { fa: "شوره و درماتیت سبورئیک", en: "Seborrheic Dermatitis & Dandruff" },
    scene: "stratum-corneum-scaling",
    cameraPath: ["surface_scan", "zoom_corneum_crusts", "microbial_colony"],
    highlight: "parakeratotic_scales_malassezia",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 15,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "پوسته‌ریزی ملایم اپیدرم با پوسته‌های سفید متمایل به زرد بدون التهاب عمیق بافتی.",
          en: "Mild epidermal desquamation with fine white-to-yellow scales without deep dermal inflammation.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "تجمع صفحات پوسته‌ای چرب در اطراف دهانه فولیکول‌ها همراه با تحریک ملایم عروقی.",
          en: "Accumulation of greasy adherent plaques around follicular openings accompanied by vascular irritation.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "تشکیل دلمه‌های ضخیم به هم چسبیده، چربی اکسیدشده و پرخونی وسیع اریتماتوز در بستر پوست سر.",
          en: "Dense confluent crusts, oxidized lipid crusting, and extensive erythematous hyperemia across the scalp surface.",
        },
      },
    },
  },

  folliculitis: {
    id: "folliculitis",
    title: { fa: "فولیکولیت و التهاب پری‌فولیکولار", en: "Folliculitis & Perifollicular Inflammation" },
    scene: "perifollicular-infiltrate",
    cameraPath: ["zoom_ostium", "infiltrate_dermis", "pustule_formation"],
    highlight: "erythematous_halo_leukocytes",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 20,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "هاله قرمزی موضعی در مجاورت دهانه یک یا چند فولیکول بدون تشکیل چرک واضح.",
          en: "Localized erythematous halos adjacent to follicular ostia without distinct purulent exudate.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "نفوذ سلول‌های التهابی و تشکیل پاپول‌های کوچک ملتهب در اطراف ساقه مو.",
          en: "Infiltration of inflammatory cells with tender erythematous papules surrounding hair shafts.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "پوسچول‌های چرکی برجسته، تخریب اپیتلیوم فولیکولی و خطر آسیب پایدار به ماتریکس مو.",
          en: "Prominent pustular lesions with follicular epithelial degradation posing risk to follicular matrix integrity.",
        },
      },
    },
  },

  hyperseborrhea: {
    id: "hyperseborrhea",
    title: { fa: "ترشح بیش‌ازحد سبوم (هایپرسبوره)", en: "Hyperseborrhea (Excess Sebum Production)" },
    scene: "sebaceous-gland-hypertrophy",
    cameraPath: ["sebaceous_lobule", "duct_discharge", "follicular_lake"],
    highlight: "sebum_overproduction",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 25,
        thresholdMax: 44,
        visualState: 1,
        narration: {
          fa: "لایه نازک سبوم در سطح پوست و دهانه فولیکول‌ها که ظاهر درخشنده خفیف ایجاد می‌کند.",
          en: "Thin lipid film across scalp surface imparting a mild sheen around follicular openings.",
        },
      },
      moderate: {
        thresholdMin: 45,
        thresholdMax: 74,
        visualState: 2,
        narration: {
          fa: "تجمع مایع چربی در حفره‌های فولیکولی (دریاچه سبوم) و تسریع در اکسیداسیون چربی سطحی.",
          en: "Lipid pooling within follicular infundibulum ('sebum lake') and heightened lipid peroxidation.",
        },
      },
      severe: {
        thresholdMin: 75,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "هایپرتروفی غدد سباسه، غوطه‌وری کامل منافذ در چربی غلیظ و ایجاد محیط مستعد رشد بیوفیلم‌های باکتریایی.",
          en: "Sebaceous gland hypertrophy with heavy lipid encasement of ostia fostering bacterial biofilm colonization.",
        },
      },
    },
  },

  scalp_dryness: {
    id: "scalp_dryness",
    title: { fa: "خشکی و اختلال سد دفاعی پوست سر", en: "Scalp Dryness & Barrier Disruption" },
    scene: "lipid-barrier-depletion",
    cameraPath: ["stratum_corneum_cracks", "intercellular_cement", "water_evaporation"],
    highlight: "trans_epidermal_water_loss",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 20,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "کاهش رطوبت سطحی و ترک‌های میکروسکوپی ابتدایی در سیمان بین سلولی اپیدرم.",
          en: "Reduced surface moisture and early microscopic fissuring in epidermal intercellular lipids.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "افزایش تبخیر ترنس‌اپیدرمال آب (TEWL) و ورقه شدن لایه‌های شاخی پوست با احساس کشیدگی.",
          en: "Heightened transepidermal water loss (TEWL) with flaky peeling sheets of the stratum corneum.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "شکستگی عمیق سد پوستی، ایجاد میکروفیشورها و حساسیت بیش‌ازحد انتهای اعصاب حسی پوست سر.",
          en: "Severe barrier breakdown with painful micro-fissures and cutaneous nerve ending hypersensitivity.",
        },
      },
    },
  },

  erythema: {
    id: "erythema",
    title: { fa: "اریتم و احتقان عروقی پوست سر", en: "Scalp Erythema & Vascular Congestion" },
    scene: "microvascular-network",
    cameraPath: ["zoom_capillaries", "vascular_dilation", "perivascular_edema"],
    highlight: "dilated_arborizing_capillaries",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 15,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "اتساع جزئی حلقه‌های مویرگی اینترفولیکولار با رنگ صورتی کم‌رنگ بدون گرما یا تپش موضعی.",
          en: "Minor dilation of interfollicular capillary loops presenting faint pink blush without warmth.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "احتقان عروقی واضح، پترن‌های شاخه‌ای مویرگی (Arborizing Vessels) و افزایش جریان خون التهابی.",
          en: "Evident vascular congestion, arborizing capillary patterns, and elevated inflammatory microcirculation.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "قرمزی یکپارچه شدید، نشت مایع پلاسما به فضای بینابینی و هیپرمی واکنشی در بافت درم.",
          en: "Confluent intense rubor, microvascular plasma extravasation, and acute dermal reactive hyperemia.",
        },
      },
    },
  },

  follicular_plugging: {
    id: "follicular_plugging",
    title: { fa: "انسداد منفذ فولیکول (پلاگ کراتینی-سبوم)", en: "Follicular Plugging (Keratotic Plugs)" },
    scene: "infundibular-obstruction",
    cameraPath: ["zoom_infundibulum", "keratin_accretion", "follicular_asphyxia"],
    highlight: "compact_keratin_plugs",
    reviewedBy: DEFAULT_REVIEWER,
    disclaimer: DEFAULT_DISCLAIMER,
    severityRules: {
      mild: {
        thresholdMin: 20,
        thresholdMax: 39,
        visualState: 1,
        narration: {
          fa: "تجمع لایه‌ای از باقیمانده سلول‌های مرده در ورودی منفذ بدون ممانعت کامل از خروج مو.",
          en: "Layered cellular debris at the ostial rim without complete restriction of hair emergence.",
        },
      },
      moderate: {
        thresholdMin: 40,
        thresholdMax: 69,
        visualState: 2,
        narration: {
          fa: "تشکیل کلاهک متراکم کراتینی-چربی که دهانه فولیکول را تنگ کرده و رشد ساقه را تحت فشار می‌گذارد.",
          en: "Compact keratotic-lipid plug constricting the follicular ostium and compressing growing fibers.",
        },
      },
      severe: {
        thresholdMin: 70,
        thresholdMax: 100,
        visualState: 3,
        narration: {
          fa: "انسداد کامل مجرای فولیکول با پلاگ‌های سخت اکسیدشده و ممانعت فیزیکی از تهویه و چرخه طبیعی مو.",
          en: "Total obstruction of the infundibulum by hardened oxidized plugs, halting normal follicular respiration.",
        },
      },
    },
  },
};

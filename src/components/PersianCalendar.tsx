import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import {
  toEnglishDigits,
  getDaysInPersianMonth,
  gregorianToPersian,
  persianToGregorian,
  persianToGregorianDate,
  formatDateForDisplay,
  BIRTH_YEAR_LOOKBACK,
  SESSION_YEAR_LOOKAHEAD,
} from '../lib/jalaliDate';


interface PersianCalendarProps {
  value: string;
  onChange: (date: string) => void;
  isRtl?: boolean;
  /** session: امسال تا چند سال بعد | birth: مناسب تاریخ تولد */
  variant?: 'session' | 'birth';
}

export default function PersianCalendar({ value, onChange, isRtl = true, variant = 'session' }: PersianCalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dayInput, setDayInput] = useState('');
  const [monthInput, setMonthInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const isAutoFocusing = useRef(false);
  const [calendarCoordinates, setCalendarCoordinates] = useState({ top: 0, left: 0 });

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    const persianDate = gregorianToPersian(now);
    return { year: persianDate.year, month: persianDate.month };
  });

  const persianMonths = [
    'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
    'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand',
  ];

  // Jalali week: Saturday → Friday
  const persianDays = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];
  const today = new Date();
  const todayPersian = gregorianToPersian(today);
  const currentPersianYear = todayPersian.year;
  const minYear = variant === 'birth' ? currentPersianYear - BIRTH_YEAR_LOOKBACK : currentPersianYear;
  const maxYear = variant === 'birth' ? currentPersianYear : currentPersianYear + SESSION_YEAR_LOOKAHEAD;
  const yearRange = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  // همگام‌سازی فیلدها با مقدار
  useEffect(() => {
    if (value) {
      const date = parse(value, 'yyyy-MM-dd', new Date());
      if (isValid(date)) {
        const persianDate = gregorianToPersian(date);
        setDayInput(persianDate.day.toString().padStart(2, '0'));
        setMonthInput((persianDate.month + 1).toString().padStart(2, '0'));
        setYearInput(persianDate.year.toString());
        setInputError('');
      }
    } else {
      setDayInput('');
      setMonthInput('');
      setYearInput('');
    }
  }, [value]);

  // اعتبارسنجی و تبدیل تاریخ
  // با useCallback ارجاعش پایدار می‌شود تا بتواند بدون ساختن حلقه به آرایهٔ
  // وابستگی handleDateComplete اضافه شود (رفع ریشه‌ای هشدار exhaustive-deps).
  const validateAndConvert = useCallback((day: string, month: string, year: string) => {
    const d = parseInt(toEnglishDigits(day));
    const m = parseInt(toEnglishDigits(month));
    const y = parseInt(toEnglishDigits(year));

    if (isNaN(d) || isNaN(m) || isNaN(y)) return;
    if (y < minYear || y > maxYear) {
      setInputError(`Year must be between ${minYear} and ${maxYear}`);
      return;
    }
    if (m < 1 || m > 12) {
      setInputError('Month must be between 1 and 12');
      return;
    }
    const maxDay = getDaysInPersianMonth(y, m - 1);
    if (d < 1 || d > maxDay) {
      setInputError(`Day must be between 1 and ${maxDay}`);
      return;
    }

    setInputError('');
    const persianDate = `${y}/${m.toString().padStart(2, '0')}/${d.toString().padStart(2, '0')}`;
    const gregorianDate = persianToGregorian(persianDate);
    if (gregorianDate) {
      onChange(gregorianDate);
      setCurrentMonth({ year: y, month: m - 1 });
    }
  }, [minYear, maxYear, onChange]);

  // پردازش ورودی روز با auto-focus
  const handleDayChange = (val: string) => {
    const clean = toEnglishDigits(val).replace(/\D/g, '').slice(0, 2);
    setDayInput(clean);

    // اگر ۲ رقم وارد شد، به ماه برو
    if (clean.length === 2) {
      isAutoFocusing.current = true;
      monthRef.current?.focus();
      monthRef.current?.select();
      setTimeout(() => { isAutoFocusing.current = false; }, 100);
    }
  };

  // اعتبارسنجی کامل تاریخ - فقط وقتی از کل کامپوننت خارج شویم
  const handleDateComplete = useCallback((e: React.FocusEvent) => {
    // اگر در حال انتقال بین فیلدها هستیم، کاری نکن
    if (isAutoFocusing.current) return;

    // بررسی اینکه آیا فوکوس به فیلد دیگری در همین کامپوننت منتقل شده
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (containerRef.current && relatedTarget && containerRef.current.contains(relatedTarget)) {
      return; // فوکوس هنوز در داخل کامپوننت است
    }

    if (dayInput.length >= 1 && monthInput.length >= 1 && yearInput.length >= 4) {
      validateAndConvert(dayInput, monthInput, yearInput);
    }
  }, [dayInput, monthInput, yearInput, validateAndConvert]);

  // پردازش ورودی ماه با auto-focus
  const handleMonthChange = (val: string) => {
    const clean = toEnglishDigits(val).replace(/\D/g, '').slice(0, 2);
    setMonthInput(clean);

    // اگر ۲ رقم وارد شد، به سال برو
    if (clean.length === 2) {
      isAutoFocusing.current = true;
      yearRef.current?.focus();
      yearRef.current?.select();
      setTimeout(() => { isAutoFocusing.current = false; }, 100);
    }
  };

  // پردازش ورودی سال
  const handleYearChange = (val: string) => {
    const clean = toEnglishDigits(val).replace(/\D/g, '').slice(0, 4);
    setYearInput(clean);
  };

  // تولید روزهای ماه - اصلاح شده برای روز هفته صحیح
  const generateDays = () => {
    // تبدیل اولین روز ماه شمسی به میلادی
    const firstDayOfMonth = persianToGregorianDate(currentMonth.year, currentMonth.month, 1);

    // دریافت روز هفته میلادی (0=یکشنبه, 1=دوشنبه, ..., 6=شنبه در JavaScript)
    const jsDay = firstDayOfMonth.getDay();

    // تبدیل به روز هفته شمسی (0=شنبه, 1=یکشنبه, ..., 6=جمعه)
    // JavaScript: Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6
    // Persian:    Saturday=0, Sunday=1, Monday=2, Tuesday=3, Wednesday=4, Thursday=5, Friday=6
    const persianFirstDay = (jsDay + 1) % 7;

    const days: (number | null)[] = [];

    // اضافه کردن روزهای خالی تا اولین روز ماه
    for (let i = 0; i < persianFirstDay; i++) {
      days.push(null);
    }

    const daysCount = getDaysInPersianMonth(currentMonth.year, currentMonth.month);
    for (let day = 1; day <= daysCount; day++) {
      days.push(day);
    }

    return days;
  };

  const handleDateSelect = (day: number) => {
    const finalDate = persianToGregorianDate(currentMonth.year, currentMonth.month, day);
    const gregorianDate = format(finalDate, 'yyyy-MM-dd');
    onChange(gregorianDate);
    setIsOpen(false);
    closeDropdowns();
  };

  const handleCalendarMonthChange = (monthIndex: number) => {
    setCurrentMonth(prev => ({ ...prev, month: monthIndex }));
    setShowMonthDropdown(false);
  };

  const handleCalendarYearChange = (year: number) => {
    setCurrentMonth(prev => ({ ...prev, year }));
    setShowYearDropdown(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      if (direction === 'prev') {
        return prev.month === 0
          ? { year: prev.year - 1, month: 11 }
          : { year: prev.year, month: prev.month - 1 };
      } else {
        return prev.month === 11
          ? { year: prev.year + 1, month: 0 }
          : { year: prev.year, month: prev.month + 1 };
      }
    });
  };

  const closeDropdowns = () => {
    setShowMonthDropdown(false);
    setShowYearDropdown(false);
  };

  // محاسبه موقعیت بهینه تقویم
  const calculateCalendarPosition = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // تقویم به‌صورت fixed نمایش داده می‌شود تا زیر sidebar یا والدهای
    // دارای overflow مخفی نشود. مختصات را داخل viewport محدود می‌کنیم.
    const calendarWidth = 390;
    const calendarHeight = 500;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - calendarWidth - 8));
    if (spaceBelow >= calendarHeight || spaceBelow > spaceAbove) {
      setCalendarCoordinates({ top: Math.max(8, Math.min(window.innerHeight - calendarHeight - 8, rect.bottom + 8)), left });
    } else {
      setCalendarCoordinates({ top: Math.max(8, rect.top - calendarHeight - 8), left });
    }
  }, []);

  const handleOpenCalendar = () => {
    if (!isOpen && !value) {
      // فیلد خالی همیشه تقویم را از ماه جاری باز می‌کند تا «امروز»
      // در هر دو تقویم (از تاریخ/تا تاریخ) با نشان سبز قابل مشاهده باشد.
      setCurrentMonth({ year: todayPersian.year, month: todayPersian.month });
    }
    calculateCalendarPosition();
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={containerRef} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* سه فیلد جداگانه برای روز/ماه/سال */}
      <div className={`flex items-center w-full rounded-xl bg-white/5 border ${inputError ? 'border-red-500' : 'border-white/10'} focus-within:border-blue-500 transition-colors`}>

        {/* فیلد روز */}
        <input
          ref={dayRef}
          type="text"
          value={dayInput}
          onChange={(e) => handleDayChange(e.target.value)}
          onBlur={(e) => handleDateComplete(e)}
          placeholder="Day"
          className="w-14 px-2 py-3 bg-transparent focus:outline-none text-center"
          maxLength={2}
        />

        <span className="text-gray-500">/</span>

        {/* فیلد ماه */}
        <input
          ref={monthRef}
          type="text"
          value={monthInput}
          onChange={(e) => handleMonthChange(e.target.value)}
          onBlur={(e) => handleDateComplete(e)}
          placeholder="Month"
          className="w-14 px-2 py-3 bg-transparent focus:outline-none text-center"
          maxLength={2}
        />

        <span className="text-gray-500">/</span>

        {/* فیلد سال */}
        <input
          ref={yearRef}
          type="text"
          value={yearInput}
          onChange={(e) => handleYearChange(e.target.value)}
          onBlur={(e) => handleDateComplete(e)}
          placeholder="Year"
          className="w-20 px-2 py-3 bg-transparent focus:outline-none text-center"
          maxLength={4}
        />

        {/* آیکون تقویم آبی */}
        <button
          type="button"
          onClick={handleOpenCalendar}
          tabIndex={-1}
          className="p-3 rounded-lg transition-colors text-blue-400 hover:bg-blue-500/10"
          title="Select from calendar"
        >
          <Calendar size={18} />
        </button>
      </div>

      {inputError && (
        <div className="absolute top-full right-0 mt-1 text-xs text-red-400">{inputError}</div>
      )}

      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[2147483646] bg-black/20 backdrop-blur-sm"
            onClick={() => {
              setIsOpen(false);
              closeDropdowns();
            }}
          />

          {/* تقویم - موقعیت داینامیک */}
          <div
            ref={calendarRef}
            className="fixed bg-gray-900 border border-white/20 rounded-xl p-5 shadow-2xl z-[2147483647] min-w-[390px]"
            style={{
              top: calendarCoordinates.top,
              left: calendarCoordinates.left,
              overflow: 'visible',
              maxHeight: 'none',
              overflowY: 'visible',
            }}>
            {/* هدر تقویم */}
            <div className="flex items-center justify-between mb-4 gap-2">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 rounded-lg hover:bg-white/10 flex-shrink-0 transition-colors"
              >
                <ChevronRight size={18} />
              </button>

              {/* انتخابگر ماه و سال */}
              <div className="flex items-center gap-3 flex-1 justify-center relative">
                {/* انتخابگر سال */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowYearDropdown(!showYearDropdown);
                      setShowMonthDropdown(false);
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 font-semibold border border-white/10 transition-colors"
                  >
                    {currentMonth.year}
                    <ChevronDown size={14} className={`transition-transform ${showYearDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showYearDropdown && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-2xl max-h-48 overflow-y-auto min-w-[100px]"
                      style={{top: '100%', zIndex: 9999, position: 'absolute'}}
                    >
                        {yearRange.map(year => (
                          <button
                            key={year}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCalendarYearChange(year);
                            }}
                            className={`w-full px-4 py-2.5 text-center hover:bg-white/10 transition-colors ${currentMonth.year === year ? 'bg-blue-500/30 text-blue-300 font-semibold' : ''}`}
                          >
                            {year}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* انتخابگر ماه */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMonthDropdown(!showMonthDropdown);
                      setShowYearDropdown(false);
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 font-semibold border border-white/10 transition-colors"
                  >
                    {persianMonths[currentMonth.month]}
                    <ChevronDown size={14} className={`transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showMonthDropdown && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-2xl max-h-48 overflow-y-auto min-w-[120px]"
                      style={{top: '100%', zIndex: 9999, position: 'absolute'}}
                    >
                        {persianMonths.map((month, index) => (
                          <button
                            key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCalendarMonthChange(index);
                            }}
                            className={`w-full px-4 py-2.5 text-center hover:bg-white/10 transition-colors ${currentMonth.month === index ? 'bg-blue-500/30 text-blue-300 font-semibold' : ''}`}
                          >
                            {month}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => navigateMonth('next')}
                className="p-2 rounded-lg hover:bg-white/10 flex-shrink-0 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            {/* روزهای هفته */}
            <div className="grid grid-cols-7 gap-1 mb-2 border-b border-white/10 pb-2">
              {persianDays.map((day, index) => (
                <div key={index} className="text-center text-sm text-gray-400 py-2 font-medium">
                  {day}
                </div>
              ))}
            </div>

            {/* روزهای ماه */}
            <div className="grid grid-cols-7 gap-1">
              {generateDays().map((day, index) => {
                if (day === null) {
                  return <div key={index} className="h-9"></div>;
                }

                const isToday =
                  day === todayPersian.day &&
                  currentMonth.month === todayPersian.month &&
                  currentMonth.year === todayPersian.year;

                const isSelected = value && (() => {
                  const displayDate = formatDateForDisplay(value);
                  const cleanDisplay = toEnglishDigits(displayDate);
                  const parts = cleanDisplay.split('/');
                  if (parts.length === 3) {
                    return parseInt(parts[0]) === currentMonth.year &&
                      parseInt(parts[1]) === (currentMonth.month + 1) &&
                      parseInt(parts[2]) === day;
                  }
                  return false;
                })();

                return (
                  <button
                    key={index}
                    onClick={() => handleDateSelect(day)}
                    className={`h-9 w-9 rounded-lg text-sm transition-all relative flex items-center justify-center ${
                      isToday
                        ? 'bg-green-500/25 text-green-300 border-2 border-green-400 font-semibold shadow-[0_0_12px_rgba(74,222,128,0.35)]'
                        : isSelected
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                          : 'hover:bg-white/10'
                    }`}
                    title={isToday ? 'Today' : ''}
                  >
                    {day}
                    {isToday && (
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-300 rounded-full shadow-[0_0_6px_rgba(134,239,172,0.9)]"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* دکمه امروز */}
            <div className="mt-3 pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  const gregorianDate = format(today, 'yyyy-MM-dd');
                  onChange(gregorianDate);
                  setCurrentMonth({ year: todayPersian.year, month: todayPersian.month });
                  setIsOpen(false);
                }}
                className="w-full py-2 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
              >
                Go to today ({`${todayPersian.year}/${(todayPersian.month + 1).toString().padStart(2, '0')}/${todayPersian.day.toString().padStart(2, '0')}`})
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

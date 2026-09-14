import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DialogPrimitive from "./DialogPrimitive";

export interface AddPatientForm { firstName: string; lastName: string; phone: string; condition: string; }
export interface AddPatientModalProps { isOpen: boolean; onClose: () => void; onAddPatient: (form: AddPatientForm) => void; }

export default function AddPatientModal({ isOpen, onClose, onAddPatient }: AddPatientModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddPatientForm>({ firstName: "", lastName: "", phone: "", condition: "" });
  const firstRef = useRef<HTMLInputElement>(null);
  if (!isOpen) return null;
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onAddPatient(form); };
  return (
    <DialogPrimitive
      isOpen={isOpen}
      onClose={onClose}
      aria-label={t("dashboard.addPatient.title")}
      className="rounded-[32px] p-6 md:p-8 max-w-md w-full bg-[oklch(98%_0.008_28/0.85)] border border-white/90 shadow-[0_24px_60px_oklch(30%_0.04_15/0.18)] backdrop-blur-2xl animate-fadeIn"
      backdropClassName="bg-stone-900/40 backdrop-blur-md"
    >
      <h3 className="text-xl font-serif font-bold text-[oklch(20%_0.02_20)] mb-1">
        {t("dashboard.addPatient.title")}
      </h3>
      <p className="text-xs text-[oklch(45%_0.02_20)] mb-6">{t("dashboard.addPatient.subtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="patient-firstName" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
            {t("dashboard.addPatient.firstName")}
          </label>
          <input
            id="patient-firstName"
            type="text"
            required
            value={form.firstName}
            ref={firstRef}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder={t("dashboard.addPatient.firstNamePh")}
            className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
          />
        </div>

        <div>
          <label htmlFor="patient-lastName" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
            {t("dashboard.addPatient.lastName")}
          </label>
          <input
            id="patient-lastName"
            type="text"
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            placeholder={t("dashboard.addPatient.lastNamePh")}
            className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
          />
        </div>

        <div>
          <label htmlFor="patient-phone" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
            {t("dashboard.addPatient.phone")}
          </label>
          <input
            id="patient-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder={t("dashboard.addPatient.phonePh")}
            className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
          />
        </div>

        <div>
          <label htmlFor="patient-condition" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
            {t("dashboard.addPatient.condition")}
          </label>
          <input
            id="patient-condition"
            type="text"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
            placeholder={t("dashboard.addPatient.conditionPh")}
            className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
          />
        </div>

        <div className="flex items-center gap-3 pt-3">
          <button
            type="submit"
            className="flex-1 h-12 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
          >
            {t("dashboard.addPatient.submit")}
          </button>
          <button
            type="button"
            onClick={() => onClose()}
            className="px-5 h-12 rounded-2xl bg-white/80 hover:bg-white border border-stone-200 text-xs font-bold text-[oklch(40%_0.02_20)] transition-all"
          >
            {t("dashboard.addPatient.cancel")}
          </button>
        </div>
      </form>
    </DialogPrimitive>
  );
}

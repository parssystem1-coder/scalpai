import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PatientCreate, type PatientCreate as PatientDto } from "@scalpai/shared";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";
import AutoLock from "../components/AutoLock.js";
import PendingBadge from "../components/PendingBadge.js";
import DigitalConsentModal from "../components/DigitalConsentModal.js";
import { useSync } from "../offline/SyncProvider.js";
import { toggleLang } from "../i18n.js";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

function ErrorBox({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : "ERROR";
  const message = error instanceof Error ? error.message : t("common.unknownError");
  return (
    <p role="alert" data-testid="patients-error" style={{ color: "crimson" }}>
      [{code}] {message}
    </p>
  );
}

function AddPatientForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isOnline, enqueue } = useSync();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientDto>({ resolver: zodResolver(PatientCreate) });

  const mutation = useMutation({
    mutationFn: async (dto: PatientDto) => {
      if (!isOnline) {
        await enqueue("patients", "create", dto);
        return { id: "pending", firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone } as PatientRow;
      }
      return apiFetch<PatientRow>("/patients", { method: "POST", body: JSON.stringify(dto) });
    },
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((dto) => mutation.mutate(dto))}
      noValidate
      data-testid="patient-form"
      aria-label={t("patients.formAria")}
    >
      <input data-testid="patient-first-name" placeholder={t("patients.name")} {...register("firstName")} />
      <input data-testid="patient-last-name" placeholder={t("patients.family")} {...register("lastName")} />
      <input data-testid="patient-phone" placeholder={t("patients.phonePh")} {...register("phone")} />
      <button data-testid="patient-add" type="submit" disabled={mutation.isPending}>
        {t("patients.add")}
      </button>
      <ErrorBox error={mutation.error} />
      {(errors.firstName || errors.lastName || errors.phone) && <p>{t("patients.checkInput")}</p>}
    </form>
  );
}

export default function PatientsPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { t, i18n } = useTranslation();
  const { isOnline } = useSync();
  const [selectedPatientForConsent, setSelectedPatientForConsent] = useState<PatientRow | null>(null);
  const query = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiFetch<PatientRow[]>("/patients?limit=50"),
    retry: false,
  });

  // Session expired mid-use -> drop token so login page returns.
  if (query.error instanceof ApiError && query.error.status === 401) {
    clearAccessToken();
    onLoggedOut();
  }

  return (
    <main style={{ maxWidth: 780, margin: "8vh auto", padding: "0 16px" }}>
      <AutoLock minutes={10} onLock={() => { clearAccessToken(); onLoggedOut(); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h1 data-testid="patients-title" style={{ margin: 0 }}>{t("patients.title")}</h1>
        <PendingBadge />
        {!isOnline && (
          <span data-testid="offline-badge" style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
            {t("common.offline")}
          </span>
        )}
      </div>
      <button type="button" data-testid="toggle-lang" onClick={toggleLang}>{i18n.language === "fa" ? "EN" : "فا"}</button>
      <button type="button" data-testid="logout" onClick={() => { clearAccessToken(); onLoggedOut(); }}>
        {t("home.logout")}
      </button>
      <AddPatientForm />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <table data-testid="patients-table">
          <thead>
            <tr>
              <th>{t("patients.colName")}</th>
              <th>{t("patients.colPhone")}</th>
              <th>{t("patients.consentCol")}</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((p) => (
              <tr key={p.id} data-testid="patient-row">
                <td>
                  <Link data-testid="patient-gallery-link" to={`/patients/${p.id}/gallery`}>
                    {p.firstName} {p.lastName}
                  </Link>
                </td>
                <td data-testid="patient-phone-cell">{p.phone}</td>
                <td>
                  <button
                    id={`open-consent-btn-${p.id}`}
                    data-testid="open-consent"
                    type="button"
                    onClick={() => setSelectedPatientForConsent(p)}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      background: "#F2EBE4",
                      color: "#8B542E",
                      border: "1px solid #D6C2B2",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    {t("patients.consentBtn")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedPatientForConsent && (
        <DigitalConsentModal
          patientId={selectedPatientForConsent.id}
          patientName={`${selectedPatientForConsent.firstName} ${selectedPatientForConsent.lastName}`}
          patientPhone={selectedPatientForConsent.phone}
          isOpen={Boolean(selectedPatientForConsent)}
          onClose={() => setSelectedPatientForConsent(null)}
        />
      )}
    </main>
  );
}

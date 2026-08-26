import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PatientCreate, type PatientCreate as PatientDto } from "@scalpai/shared";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";
import AutoLock from "../components/AutoLock.js";
import { toggleLang } from "../i18n.js";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : "ERROR";
  const message = error instanceof Error ? error.message : "خطای نامشخص";
  return (
    <p role="alert" style={{ color: "crimson" }}>
      [{code}] {message}
    </p>
  );
}

function AddPatientForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientDto>({ resolver: zodResolver(PatientCreate) });

  const mutation = useMutation({
    mutationFn: (dto: PatientDto) =>
      apiFetch<PatientRow>("/patients", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((dto) => mutation.mutate(dto))}
      noValidate
      aria-label="فرم ایجاد بیمار"
    >
      <input placeholder={t("patients.name")} {...register("firstName")} />
      <input placeholder={t("patients.family")} {...register("lastName")} />
      <input placeholder={t("patients.phonePh")} {...register("phone")} />
      <button type="submit" disabled={mutation.isPending}>
        {t("patients.add")}
      </button>
      <ErrorBox error={mutation.error} />
      {(errors.firstName || errors.lastName || errors.phone) && <p>{t("patients.checkInput")}</p>}
    </form>
  );
}

export default function PatientsPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiFetch<PatientRow[]>("/patients?limit=50"),
    retry: false,
  });

  // Session expired mid-use → drop token so login page returns.
  if (query.error instanceof ApiError && query.error.status === 401) {
    clearAccessToken();
    onLoggedOut();
  }

  return (
    <main style={{ maxWidth: 720, margin: "8vh auto" }}>
      <AutoLock minutes={10} onLock={() => { clearAccessToken(); onLoggedOut(); }} />
      <h1>{t("patients.title")}</h1>
      <button type="button" onClick={toggleLang}>{i18n.language === "fa" ? "EN" : "فا"}</button>
      <button type="button" onClick={() => { clearAccessToken(); onLoggedOut(); }}>
        {t("home.logout")}
      </button>
      <AddPatientForm />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("patients.colName")}</th>
              <th>{t("patients.colPhone")}</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/patients/${p.id}/gallery`}>
                    {p.firstName} {p.lastName}
                  </Link>
                </td>
                <td>{p.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

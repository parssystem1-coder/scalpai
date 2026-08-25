import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { PatientCreate, type PatientCreate as PatientDto } from "@scalpai/shared";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";

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
    <form onSubmit={handleSubmit((dto) => mutation.mutate(dto))} noValidate aria-label="فرم ایجاد بیمار">
      <input placeholder="نام" {...register("firstName")} />
      <input placeholder="نام خانوادگی" {...register("lastName")} />
      <input placeholder="09xxxxxxxxx" {...register("phone")} />
      <button type="submit" disabled={mutation.isPending}>
        افزودن
      </button>
      <ErrorBox error={mutation.error} />
      {(errors.firstName || errors.lastName || errors.phone) && <p>ورودی را بررسی کنید</p>}
    </form>
  );
}

export default function PatientsPage({ onLoggedOut }: { onLoggedOut: () => void }) {
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
      <h1>بیماران</h1>
      <button
        onClick={() => {
          clearAccessToken();
          onLoggedOut();
        }}
      >
        خروج
      </button>
      <AddPatientForm />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <p>در حال بارگذاری…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>نام</th>
              <th>تلفن</th>
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

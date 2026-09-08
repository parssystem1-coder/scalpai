#!/usr/bin/env bash
#
# Phase 9 / C10 (ADR-0042) - provision the CI off-site target so it behaves like
# a real WORM target, i.e. so tools/ci/offsite-check.sh can actually fail.
#
# WHY THIS EXISTS
#
# Object locking alone does NOT stop `mc rm`. Per the S3 object-lock spec, which
# MinIO implements faithfully, a DELETE that does not name a version id on a
# versioned bucket only writes a *delete marker*: the locked object versions are
# untouched, but the call returns 200 OK. Delete markers are explicitly NOT
# eligible for WORM protection, so COMPLIANCE retention cannot refuse them - not
# in MinIO, not in S3, not at any retention duration.
#
# The other half of an immutable off-site copy is therefore the CREDENTIAL: the
# backup writer holds an append-only key (put + retention, never delete), which
# is how ops/prod.env.template tells an operator to provision BACKUP_OFFSITE_*.
# MinIO's root user bypasses IAM entirely, so CI must not hand root credentials
# to the backup and then claim the copy is undeletable.
#
# Wire-up in .github/workflows/ci.yml (job backup-restore):
#   BACKUP_OFFSITE_ACCESS_KEY: scalpai_offsite_dev_only
#   BACKUP_OFFSITE_SECRET_KEY: offsite-append-only-dev-only
# and, right after `mc mb --with-lock --ignore-existing local/scalpai-ci-offsite`
# (with MC_HOST_local exported for the root alias):
#   bash tools/ci/offsite-worm-setup.sh
#
# After that, `mc rm --force` on the off-site snapshot fails with AccessDenied
# and `mc rm --version-id` fails with the WORM error - both halves proven.
set -euo pipefail

BUCKET="${BACKUP_OFFSITE_BUCKET:?BACKUP_OFFSITE_BUCKET is required}"
ACCESS_KEY="${BACKUP_OFFSITE_ACCESS_KEY:?BACKUP_OFFSITE_ACCESS_KEY is required}"
SECRET_KEY="${BACKUP_OFFSITE_SECRET_KEY:?BACKUP_OFFSITE_SECRET_KEY is required}"
ADMIN_ALIAS="${MINIO_ADMIN_ALIAS:-local}"
POLICY_NAME="${OFFSITE_POLICY_NAME:-scalpai-offsite-append-only}"

command -v mc >/dev/null 2>&1 || { echo "::error::mc is not installed"; exit 1; }

POLICY_FILE="$(mktemp)"
trap 'rm -f "${POLICY_FILE}"' EXIT

cat > "${POLICY_FILE}" <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InspectAndListTheOffsiteBucket",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:GetBucketVersioning",
        "s3:GetBucketObjectLockConfiguration",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": ["arn:aws:s3:::${BUCKET}"]
    },
    {
      "Sid": "WriteOnceReadManyObjects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListMultipartUploadParts",
        "s3:AbortMultipartUpload",
        "s3:PutObjectRetention",
        "s3:GetObjectRetention",
        "s3:PutObjectLegalHold",
        "s3:GetObjectLegalHold",
        "s3:PutObjectTagging",
        "s3:GetObjectTagging",
        "s3:GetObjectVersionTagging"
      ],
      "Resource": ["arn:aws:s3:::${BUCKET}/*"]
    },
    {
      "Sid": "NeverDeleteAndNeverWeakenTheLock",
      "Effect": "Deny",
      "Action": [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:DeleteObjectTagging",
        "s3:BypassGovernanceRetention",
        "s3:PutBucketVersioning",
        "s3:PutBucketObjectLockConfiguration",
        "s3:PutLifecycleConfiguration"
      ],
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ]
    }
  ]
}
POLICY

# Idempotent: re-running must not fail the job.
mc admin user add "${ADMIN_ALIAS}" "${ACCESS_KEY}" "${SECRET_KEY}" >/dev/null 2>&1 \
  || mc admin user info "${ADMIN_ALIAS}" "${ACCESS_KEY}" >/dev/null \
  || { echo "::error::could not create the append-only off-site user"; exit 1; }

mc admin policy create "${ADMIN_ALIAS}" "${POLICY_NAME}" "${POLICY_FILE}" >/dev/null 2>&1 \
  || mc admin policy info "${ADMIN_ALIAS}" "${POLICY_NAME}" >/dev/null \
  || { echo "::error::could not install the ${POLICY_NAME} policy"; exit 1; }

# "already in effect" on a re-run is not a failure.
mc admin policy attach "${ADMIN_ALIAS}" "${POLICY_NAME}" --user "${ACCESS_KEY}" >/dev/null 2>&1 || true

mc admin user info "${ADMIN_ALIAS}" "${ACCESS_KEY}"
echo "off-site credential is append-only (${POLICY_NAME}): retention can be set, nothing can be deleted"

/**
 * Tax document persistence (Supabase). Server-only.
 *
 * Returns the same shapes the tax pages and routes already use, so they only need to swap the
 * data source. Files themselves live in Cloudflare R2; only metadata is stored here.
 */
import { createAdminClient } from "./admin";

export type TaxDocType = "W_9" | "W_8";
export type TaxW8Subtype = "W_8BEN" | "W_8BEN_E" | "OTHER";
export type TaxReviewStatus = "APPROVED" | "REJECTED" | "REPLACEMENT_REQUIRED" | "UNDER_REVIEW";

export interface TaxVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  documentType?: TaxDocType;
  w8Subtype?: TaxW8Subtype;
  s3StorageKey: string;
  originalFilename?: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  isSuperseded: boolean;
  confirmationChecked: boolean;
  quarantineStatus: string;
  submissionDate: string;
}

export interface TaxDocument {
  id: string;
  partnerId: string;
  status: string;
  adminNote?: string;
  internalNote?: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  currentVersion?: TaxVersion;
  versions: TaxVersion[];
}

export interface TaxAuditEntry {
  id: string;
  documentId?: string;
  versionId?: string;
  partnerId: string;
  action: string;
  performedByUserId?: string;
  performedByUserRole: string;
  details?: string;
  timestamp: string;
  ipAddress?: string;
}

function mapVersion(r: any): TaxVersion {
  return {
    id: r.id,
    documentId: r.document_id,
    versionNumber: r.version_number,
    documentType: r.document_type || undefined,
    w8Subtype: r.w8_subtype || undefined,
    s3StorageKey: r.r2_object_key,
    originalFilename: r.original_filename || undefined,
    fileHash: r.checksum_sha256,
    fileSize: Number(r.file_size_bytes || 0),
    mimeType: r.mime_type || "application/pdf",
    isSuperseded: Boolean(r.is_superseded),
    confirmationChecked: Boolean(r.confirmation_checked),
    quarantineStatus: r.quarantine_status || "PASSED",
    submissionDate: r.created_at,
  };
}

function mapDocument(r: any, versions: TaxVersion[]): TaxDocument {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const currentVersion = sorted.find(v => v.id === r.current_version_id) || sorted[0];
  return {
    id: r.id,
    partnerId: r.partner_id,
    status: r.status,
    adminNote: r.admin_note || undefined,
    internalNote: r.internal_note || undefined,
    currentVersionId: r.current_version_id || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    currentVersion,
    versions: sorted,
  };
}

export async function getTaxDocumentByPartner(partnerId: string): Promise<TaxDocument | null> {
  const supabase = createAdminClient();
  const { data: doc, error } = await supabase
    .from("creator_tax_documents")
    .select("*")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load tax document: ${error.message}`);
  if (!doc) return null;

  const { data: versions, error: vErr } = await supabase
    .from("tax_document_versions")
    .select("*")
    .eq("document_id", doc.id);
  if (vErr) throw new Error(`Failed to load tax document versions: ${vErr.message}`);

  return mapDocument(doc, (versions || []).map(mapVersion));
}

export async function getTaxDocumentById(documentId: string): Promise<TaxDocument | null> {
  const supabase = createAdminClient();
  const { data: doc, error } = await supabase
    .from("creator_tax_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load tax document: ${error.message}`);
  if (!doc) return null;

  const { data: versions } = await supabase.from("tax_document_versions").select("*").eq("document_id", doc.id);
  return mapDocument(doc, (versions || []).map(mapVersion));
}

/** One query for the admin list: every partner's tax document (if any), keyed by partner id. */
export async function getAllTaxDocumentsByPartner(): Promise<Map<string, TaxDocument>> {
  const supabase = createAdminClient();
  const [{ data: docs, error }, { data: versions, error: vErr }] = await Promise.all([
    supabase.from("creator_tax_documents").select("*"),
    supabase.from("tax_document_versions").select("*"),
  ]);
  if (error) throw new Error(`Failed to load tax documents: ${error.message}`);
  if (vErr) throw new Error(`Failed to load tax document versions: ${vErr.message}`);

  const byDoc = new Map<string, TaxVersion[]>();
  for (const v of (versions || []).map(mapVersion)) {
    byDoc.set(v.documentId, [...(byDoc.get(v.documentId) || []), v]);
  }
  const result = new Map<string, TaxDocument>();
  for (const d of docs || []) {
    result.set(d.partner_id, mapDocument(d, byDoc.get(d.id) || []));
  }
  return result;
}

export async function saveTaxSubmission(data: {
  partnerId: string;
  documentType: TaxDocType;
  w8Subtype?: TaxW8Subtype;
  s3StorageKey: string;
  originalFilename: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  confirmationChecked: boolean;
  quarantineStatus?: string;
  uploadedByUserId?: string;
}): Promise<{ doc: TaxDocument; version: TaxVersion; isReplacement: boolean }> {
  const supabase = createAdminClient();

  const { data: existingRow, error } = await supabase
    .from("creator_tax_documents")
    .select("*")
    .eq("partner_id", data.partnerId)
    .maybeSingle();
  let docRow = existingRow;
  if (error) throw new Error(`Failed to load tax document: ${error.message}`);

  if (!docRow) {
    const { data: created, error: insErr } = await supabase
      .from("creator_tax_documents")
      .insert({
        partner_id: data.partnerId,
        document_type: data.documentType,
        status: "SUBMITTED",
        r2_object_key: data.s3StorageKey,
        current_version: 1,
      })
      .select("*")
      .single();
    if (insErr || !created) throw new Error(`Failed to create tax document record: ${insErr?.message}`);
    docRow = created;
  }

  const { count } = await supabase
    .from("tax_document_versions")
    .select("id", { count: "exact", head: true })
    .eq("document_id", docRow!.id);
  const previousVersions = count || 0;
  const versionNumber = previousVersions + 1;

  const { data: verRow, error: verErr } = await supabase
    .from("tax_document_versions")
    .insert({
      document_id: docRow!.id,
      version_number: versionNumber,
      r2_object_key: data.s3StorageKey,
      file_size_bytes: data.fileSize,
      mime_type: data.mimeType || "application/pdf",
      checksum_sha256: data.fileHash,
      uploaded_by_user_id: data.uploadedByUserId || null,
      document_type: data.documentType,
      w8_subtype: data.w8Subtype || null,
      original_filename: data.originalFilename,
      confirmation_checked: data.confirmationChecked,
      quarantine_status: data.quarantineStatus || "PASSED",
      is_superseded: false,
    })
    .select("*")
    .single();
  if (verErr || !verRow) throw new Error(`Failed to save tax document version: ${verErr?.message}`);

  if (previousVersions > 0) {
    await supabase
      .from("tax_document_versions")
      .update({ is_superseded: true })
      .eq("document_id", docRow!.id)
      .neq("id", verRow.id);
  }

  const { error: updErr } = await supabase
    .from("creator_tax_documents")
    .update({
      document_type: data.documentType,
      status: "SUBMITTED",
      r2_object_key: data.s3StorageKey,
      current_version: versionNumber,
      current_version_id: verRow.id,
      reviewed_at: null,
      reviewed_by_user_id: null,
    })
    .eq("id", docRow!.id);
  if (updErr) throw new Error(`Failed to update tax document record: ${updErr.message}`);

  const doc = (await getTaxDocumentById(docRow!.id))!;
  return { doc, version: mapVersion(verRow), isReplacement: previousVersions > 0 };
}

export async function updateTaxReviewStatus(
  documentId: string,
  status: TaxReviewStatus,
  reviewerUserId: string,
  adminNote?: string,
  internalNote?: string
): Promise<TaxDocument> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by_user_id: reviewerUserId,
  };
  if (adminNote !== undefined) {
    patch.admin_note = adminNote;
    patch.rejection_reason = status === "REJECTED" || status === "REPLACEMENT_REQUIRED" ? adminNote : null;
  }
  if (internalNote !== undefined) patch.internal_note = internalNote;

  let { error } = await supabase.from("creator_tax_documents").update(patch).eq("id", documentId);
  if (error && /reviewed_by_user_id/.test(error.message)) {
    // The reviewer is not a row in public.users (FK): record the review without the reviewer link.
    delete patch.reviewed_by_user_id;
    ({ error } = await supabase.from("creator_tax_documents").update(patch).eq("id", documentId));
  }
  if (error) throw new Error(`Failed to update tax review status: ${error.message}`);

  const doc = await getTaxDocumentById(documentId);
  if (!doc) throw new Error("Tax document not found");
  return doc;
}

export async function logTaxAudit(params: {
  documentId?: string;
  versionId?: string;
  partnerId: string;
  action: "UPLOAD" | "REPLACE" | "REVIEW_UPDATE" | "DOWNLOAD" | "VIEW" | "DELETE";
  performedByUserId?: string;
  performedByUserRole: string;
  details?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const row = {
      document_id: params.documentId || null,
      version_id: params.versionId || null,
      partner_id: params.partnerId,
      action: params.action,
      performed_by_user_id: params.performedByUserId || null,
      performed_by_user_role: params.performedByUserRole,
      details: params.details ? { message: params.details } : null,
      ip_address: params.ipAddress || null,
    };
    let { error } = await supabase.from("tax_document_audit_logs").insert(row);
    if (error && /performed_by_user_id/.test(error.message)) {
      ({ error } = await supabase.from("tax_document_audit_logs").insert({ ...row, performed_by_user_id: null }));
    }
    if (error) console.error("[Tax Audit] Failed to write audit log:", error.message);
  } catch (err: any) {
    // Auditing must not break the user-facing operation, but must never fail silently.
    console.error("[Tax Audit] Failed to write audit log:", err?.message);
  }
}

export async function getTaxAuditLogs(filter: { documentId?: string | null; partnerId?: string | null }): Promise<TaxAuditEntry[]> {
  const supabase = createAdminClient();
  let query = supabase.from("tax_document_audit_logs").select("*").order("created_at", { ascending: false });
  if (filter.documentId) query = query.eq("document_id", filter.documentId);
  if (filter.partnerId) query = query.eq("partner_id", filter.partnerId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load tax audit logs: ${error.message}`);

  return (data || []).map((r: any) => ({
    id: r.id,
    documentId: r.document_id || undefined,
    versionId: r.version_id || undefined,
    partnerId: r.partner_id,
    action: r.action,
    performedByUserId: r.performed_by_user_id || undefined,
    performedByUserRole: r.performed_by_user_role,
    details: typeof r.details === "string" ? r.details : r.details?.message,
    timestamp: r.created_at,
    ipAddress: r.ip_address || undefined,
  }));
}
